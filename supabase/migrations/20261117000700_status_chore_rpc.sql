-- Status, responsibilities, notification and push-token RPCs.

-- ---------------------------------------------------------------------------------------------
-- Status (House Pulse)
-- ---------------------------------------------------------------------------------------------
create or replace function public.set_status(
  p_household uuid,
  p_status public.status_kind,
  p_label text default null,
  p_eta timestamptz default null,
  p_expires_at timestamptz default null,
  p_visibility public.status_visibility default 'household',
  p_viewers uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_member(p_household);
  v_expires timestamptz;
  v uuid;
begin
  if not coalesce((select status_sharing_enabled from public.user_settings where user_id = uid), true) then
    raise exception 'status_sharing_disabled' using errcode = '55000';
  end if;
  if p_eta is not null and (p_eta < now() - interval '1 hour' or p_eta > now() + interval '24 hours') then
    raise exception 'invalid_time' using errcode = '22023';
  end if;

  v_expires := coalesce(
    p_expires_at,
    case
      when p_status in ('on_my_way', 'home_later') and p_eta is not null then p_eta + interval '1 hour'
      when p_status in ('home', 'out') then now() + interval '8 hours'
      else now() + interval '4 hours'
    end
  );
  if v_expires <= now() or v_expires > now() + interval '24 hours' then
    raise exception 'invalid_time' using errcode = '22023';
  end if;

  if p_visibility = 'selected' then
    if array_length(p_viewers, 1) is null then
      raise exception 'viewers_required' using errcode = '22023';
    end if;
    foreach v in array p_viewers loop
      if v = uid or not private.is_member_of(p_household, v) then
        raise exception 'invalid_recipient' using errcode = '22023';
      end if;
    end loop;
  end if;

  insert into public.member_statuses (household_id, user_id, status, label, eta_at, expires_at, visibility, updated_at)
  values (p_household, uid, p_status, nullif(btrim(coalesce(p_label, '')), ''), p_eta, v_expires, p_visibility, now())
  on conflict (household_id, user_id) do update set
    status = excluded.status, label = excluded.label, eta_at = excluded.eta_at,
    expires_at = excluded.expires_at, visibility = excluded.visibility, updated_at = now();

  delete from public.status_viewers where household_id = p_household and user_id = uid;
  if p_visibility = 'selected' then
    insert into public.status_viewers (household_id, user_id, viewer_id)
    select distinct p_household, uid, x from unnest(p_viewers) as x;
  end if;

  return jsonb_build_object('status', p_status, 'expires_at', v_expires);
end;
$$;

-- "Hide" removes the status entirely; nothing remains for anyone to see.
create or replace function public.clear_status(p_household uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
begin
  delete from public.member_statuses where household_id = p_household and user_id = uid;
end;
$$;

create or replace function public.set_status_sharing(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
begin
  update public.user_settings set status_sharing_enabled = p_enabled where user_id = uid;
  if not p_enabled then
    delete from public.member_statuses where user_id = uid;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Responsibilities
-- ---------------------------------------------------------------------------------------------

-- Next due date: one cadence after the due date that was completed; if completion was so late
-- that this is already in the past, roll forward to the first occurrence on/after today.
-- Mirrored in src/lib/chores.ts (unit-tested there too).
create or replace function private.next_due_date(p_due date, p_cadence int, p_today date)
returns date
language sql
immutable
set search_path = ''
as $$
  select case
    when p_due + p_cadence >= p_today then p_due + p_cadence
    else p_due + p_cadence + (ceil((p_today - (p_due + p_cadence))::numeric / p_cadence)::int * p_cadence)
  end;
$$;

create or replace function private.household_today(hid uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone time_zone)::date from public.households where id = hid;
$$;

create or replace function public.create_chore(
  p_household uuid,
  p_title text,
  p_icon text default 'other',
  p_cadence_days int default 7,
  p_first_due date default null,
  p_rotation uuid[] default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_member(p_household);
  cid uuid;
  ordered uuid[];
  r uuid;
  first_due date := coalesce(p_first_due, private.household_today(p_household));
begin
  if (select count(*) from public.chores where household_id = p_household and archived_at is null) >= 30 then
    raise exception 'too_many_chores' using errcode = '54000';
  end if;
  if first_due < private.household_today(p_household) - 1 or first_due > private.household_today(p_household) + 60 then
    raise exception 'invalid_time' using errcode = '22023';
  end if;

  -- Dedupe while preserving the order people were picked in.
  select array_agg(u order by ord) into ordered
  from (
    select distinct on (u) u, ord
    from unnest(coalesce(nullif(p_rotation, '{}'::uuid[]), array[uid])) with ordinality as t(u, ord)
    order by u, ord
  ) x;

  foreach r in array ordered loop
    if not private.is_member_of(p_household, r) then
      raise exception 'invalid_recipient' using errcode = '22023';
    end if;
  end loop;

  insert into public.chores (household_id, title, icon, cadence_days, next_due_on, assignee_id, rotation_anchor_id, created_by)
  values (p_household, btrim(p_title), coalesce(p_icon, 'other'), p_cadence_days, first_due, ordered[1], ordered[1], uid)
  returning id into cid;

  insert into public.chore_rotation (chore_id, household_id, user_id, position)
  select cid, p_household, u, ord::smallint from unnest(ordered) with ordinality as t(u, ord);

  perform private.notify(ordered[1], p_household, 'chores',
    'You''re first up for ' || btrim(p_title), null, null, cid);
  return cid;
end;
$$;

-- Idempotent completion: the caller passes the due date they saw. If it no longer matches (a
-- housemate already completed it, or this is a double tap), nothing changes.
create or replace function public.complete_chore(p_chore uuid, p_due_on date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  c public.chores;
  nxt uuid;
  next_due date;
begin
  select * into c from public.chores where id = p_chore for update;
  if not found or not private.is_member(c.household_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if c.archived_at is not null then
    raise exception 'chore_archived' using errcode = '55000';
  end if;
  if c.next_due_on <> p_due_on then
    return jsonb_build_object('completed', false, 'reason', 'already_done',
                              'next_due_on', c.next_due_on, 'assignee_id', c.assignee_id);
  end if;

  insert into public.chore_completions (chore_id, household_id, completed_by, due_on)
  values (p_chore, c.household_id, uid, p_due_on);

  next_due := private.next_due_date(c.next_due_on, c.cadence_days, private.household_today(c.household_id));
  nxt := coalesce(private.next_in_rotation(p_chore, c.rotation_anchor_id), c.assignee_id);

  update public.chores
  set next_due_on = next_due, rotation_anchor_id = nxt, assignee_id = nxt, reminded_on = null
  where id = p_chore;

  update public.chore_swaps set status = 'canceled', decided_at = now()
  where chore_id = p_chore and due_on = p_due_on and status = 'pending';

  perform private.notify(nxt, c.household_id, 'chores',
    'You''re up next for ' || c.title, 'Due ' || to_char(next_due, 'FMDay'), null, p_chore);

  return jsonb_build_object('completed', true, 'next_due_on', next_due, 'assignee_id', nxt);
end;
$$;

create or replace function public.request_chore_swap(p_chore uuid, p_to_user uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  c public.chores;
  swap_id uuid;
begin
  select * into c from public.chores where id = p_chore for update;
  if not found or not private.is_member(c.household_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if c.assignee_id is distinct from uid then
    raise exception 'assignee_only' using errcode = '42501';
  end if;
  if p_to_user = uid or not private.is_member_of(c.household_id, p_to_user) then
    raise exception 'invalid_recipient' using errcode = '22023';
  end if;

  update public.chore_swaps set status = 'canceled', decided_at = now()
  where chore_id = p_chore and due_on = c.next_due_on and status = 'pending';

  insert into public.chore_swaps (chore_id, household_id, from_user, to_user, due_on)
  values (p_chore, c.household_id, uid, p_to_user, c.next_due_on)
  returning id into swap_id;

  perform private.notify(p_to_user, c.household_id, 'requests',
    private.display_name(uid) || ' asked if you can take ' || c.title,
    'For ' || to_char(c.next_due_on, 'FMDay'), null, p_chore, true);
  return swap_id;
end;
$$;

create or replace function public.respond_chore_swap(p_swap uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  sw public.chore_swaps;
  c public.chores;
begin
  select * into sw from public.chore_swaps where id = p_swap for update;
  if not found or sw.to_user <> uid then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if sw.status <> 'pending' then
    return jsonb_build_object('status', sw.status);
  end if;

  select * into c from public.chores where id = sw.chore_id for update;
  if p_accept and (c.assignee_id is distinct from sw.from_user or c.next_due_on <> sw.due_on or c.archived_at is not null) then
    update public.chore_swaps set status = 'canceled', decided_at = now() where id = p_swap;
    return jsonb_build_object('status', 'canceled', 'reason', 'swap_stale');
  end if;

  update public.chore_swaps set status = case when p_accept then 'accepted'::public.swap_status else 'declined'::public.swap_status end,
                                decided_at = now()
  where id = p_swap;
  if p_accept then
    if exists (select 1 from public.chore_rotation where chore_id = c.id and user_id = uid)
       and exists (select 1 from public.chore_rotation where chore_id = c.id and user_id = sw.from_user) then
      -- A true swap: exchange rotation positions, so the requester takes the helper's next turn.
      update public.chore_rotation r
      set position = case when r.user_id = uid then f.position else t.position end
      from public.chore_rotation f, public.chore_rotation t
      where r.chore_id = c.id and r.user_id in (uid, sw.from_user)
        and f.chore_id = c.id and f.user_id = sw.from_user
        and t.chore_id = c.id and t.user_id = uid;
      update public.chores set assignee_id = uid, rotation_anchor_id = uid where id = c.id;
    else
      -- Helper isn't in the rotation: they cover this turn; the rotation itself is unchanged.
      update public.chores set assignee_id = uid where id = c.id;
    end if;
  end if;

  perform private.notify(sw.from_user, sw.household_id, 'chores',
    case when p_accept then private.display_name(uid) || ' took ' || c.title || ' for you'
         else private.display_name(uid) || ' can''t swap ' || c.title || ' this time' end,
    null, null, c.id);
  return jsonb_build_object('status', case when p_accept then 'accepted' else 'declined' end);
end;
$$;

create or replace function public.archive_chore(p_chore uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  c public.chores;
begin
  select * into c from public.chores where id = p_chore;
  if not found or not private.is_member(c.household_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if c.created_by is distinct from uid and not private.is_owner(c.household_id) then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  update public.chores set archived_at = now() where id = p_chore;
  update public.chore_swaps set status = 'canceled', decided_at = now() where chore_id = p_chore and status = 'pending';
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Notifications & push tokens
-- ---------------------------------------------------------------------------------------------
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  n integer;
begin
  update public.notifications set read_at = now()
  where user_id = uid and read_at is null and (p_ids is null or id = any (p_ids));
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.register_push_token(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
begin
  insert into public.push_tokens (user_id, token, platform)
  values (uid, p_token, p_platform)
  on conflict (token) do update set user_id = uid, platform = excluded.platform, last_seen_at = now();
end;
$$;

create or replace function public.unregister_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
begin
  delete from public.push_tokens where token = p_token and user_id = uid;
end;
$$;
