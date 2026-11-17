-- Household lifecycle RPCs: create, invite, join, leave, remove, roles, spaces.
-- Convention: errors are raised with a stable machine code as the message (e.g. 'not_member');
-- the app maps codes to friendly copy (src/lib/errors.ts).

create or replace function private.new_invite_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  -- 32 unambiguous characters (no I, O, 0, 1). 256 % 32 = 0, so each byte maps uniformly.
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  raw bytea := extensions.gen_random_bytes(8);
  result text := '';
  i int;
begin
  for i in 0..7 loop
    result := result || substr(alphabet, (get_byte(raw, i) % 32) + 1, 1);
  end loop;
  return result;
end;
$$;

create or replace function private.issue_invite(hid uuid, ttl interval default interval '7 days')
returns public.household_invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.household_invites;
  attempt int := 0;
begin
  loop
    attempt := attempt + 1;
    begin
      insert into public.household_invites (household_id, code, created_by, expires_at)
      values (hid, private.new_invite_code(), auth.uid(), now() + ttl)
      returning * into inv;
      return inv;
    exception when unique_violation then
      if attempt >= 5 then
        raise;
      end if;
    end;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------------------------
create or replace function public.create_household(
  p_name text,
  p_icon text default 'house',
  p_theme text default 'porch',
  p_time_zone text default null,
  p_spaces jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  hid uuid;
  tz text;
  sp jsonb;
  n int := 0;
begin
  if (select count(*) from public.household_members where user_id = uid) >= 5 then
    raise exception 'too_many_households' using errcode = '54000';
  end if;

  tz := coalesce(nullif(p_time_zone, ''), (select time_zone from public.profiles where id = uid), 'UTC');
  if not private.is_valid_time_zone(tz) then
    raise exception 'invalid_time_zone' using errcode = '22023';
  end if;

  insert into public.households (name, icon, theme, time_zone, created_by)
  values (btrim(p_name), coalesce(p_icon, 'house'), coalesce(p_theme, 'porch'), tz, uid)
  returning id into hid;

  insert into public.household_members (household_id, user_id, role) values (hid, uid, 'owner');

  for sp in select * from jsonb_array_elements(coalesce(p_spaces, '[]'::jsonb)) loop
    n := n + 1;
    exit when n > 12;
    insert into public.spaces (household_id, name, kind, created_by)
    values (hid, btrim(sp ->> 'name'), coalesce((sp ->> 'kind')::public.space_kind, 'other'), uid)
    on conflict do nothing;
  end loop;

  perform private.issue_invite(hid);
  perform private.audit(hid, 'household_created', null);
  return hid;
end;
$$;

-- Any member can fetch (or lazily create) the current invite.
create or replace function public.get_or_create_invite(p_household uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.household_invites;
begin
  perform private.require_member(p_household);

  select * into inv from public.household_invites
  where household_id = p_household and revoked_at is null and expires_at > now() and use_count < max_uses
  order by created_at desc
  limit 1;

  if not found then
    inv := private.issue_invite(p_household);
    perform private.audit(p_household, 'invite_created', null);
  end if;

  return jsonb_build_object('code', inv.code, 'expires_at', inv.expires_at,
                            'uses_left', inv.max_uses - inv.use_count);
end;
$$;

-- Owners can revoke every active invite and issue a fresh one (e.g. a code leaked).
create or replace function public.regenerate_invite(p_household uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.household_invites;
begin
  perform private.require_member(p_household);
  if not private.is_owner(p_household) then
    raise exception 'owner_only' using errcode = '42501';
  end if;

  update public.household_invites set revoked_at = now()
  where household_id = p_household and revoked_at is null;

  inv := private.issue_invite(p_household);
  perform private.audit(p_household, 'invite_regenerated', null);
  return jsonb_build_object('code', inv.code, 'expires_at', inv.expires_at,
                            'uses_left', inv.max_uses - inv.use_count);
end;
$$;

-- Returns {ok, household_id?, error?}. Errors are returned (not raised) so that failed attempts
-- are committed and count toward the brute-force throttle.
create or replace function public.join_household(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  v_code text := regexp_replace(upper(coalesce(p_code, '')), '[^A-Z0-9]', '', 'g');
  inv public.household_invites;
  v_name text;
  m record;
begin
  if (select count(*) from private.join_attempts
      where user_id = uid and not succeeded and attempted_at > now() - interval '15 minutes') >= 10 then
    return jsonb_build_object('ok', false, 'error', 'too_many_attempts');
  end if;

  select * into inv from public.household_invites where code = v_code for update;

  if not found then
    insert into private.join_attempts (user_id, succeeded) values (uid, false);
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  if inv.revoked_at is not null or inv.expires_at <= now() or inv.use_count >= inv.max_uses then
    insert into private.join_attempts (user_id, succeeded) values (uid, false);
    return jsonb_build_object('ok', false, 'error', 'expired_code');
  end if;

  if private.is_member_of(inv.household_id, uid) then
    return jsonb_build_object('ok', true, 'household_id', inv.household_id, 'already_member', true);
  end if;

  if (select count(*) from public.household_members where household_id = inv.household_id) >= 16 then
    return jsonb_build_object('ok', false, 'error', 'household_full');
  end if;

  if (select count(*) from public.household_members where user_id = uid) >= 5 then
    return jsonb_build_object('ok', false, 'error', 'too_many_households');
  end if;

  insert into public.household_members (household_id, user_id, role) values (inv.household_id, uid, 'member');
  update public.household_invites set use_count = use_count + 1 where id = inv.id;
  insert into private.join_attempts (user_id, succeeded) values (uid, true);
  perform private.audit(inv.household_id, 'member_joined', uid);

  select coalesce(nullif(display_name, ''), 'Someone new') into v_name from public.profiles where id = uid;
  for m in select user_id from public.household_members where household_id = inv.household_id and user_id <> uid loop
    perform private.notify(m.user_id, inv.household_id, 'household', v_name || ' joined the house');
  end loop;

  return jsonb_build_object('ok', true, 'household_id', inv.household_id, 'already_member', false);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Departure cleanup. Runs for leave, removal, and account deletion (cascade) alike.
-- ---------------------------------------------------------------------------------------------
-- The member after p_after in rotation order (wrapping around). If p_after is no longer in the
-- rotation, starts from the top. p_exclude is never returned (used while someone is leaving).
create or replace function private.next_in_rotation(p_chore uuid, p_after uuid, p_exclude uuid default null)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  with r as (
    select user_id, position from public.chore_rotation where chore_id = p_chore
  ),
  anchor as (
    select position from r where user_id = p_after
  )
  select r.user_id
  from r
  where r.user_id is distinct from p_exclude
  order by (r.position <= coalesce((select position from anchor), -1)), r.position
  limit 1;
$$;

create or replace function private.evaluate_window(p_signal uuid)
returns public.window_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  w public.space_windows;
  v_space text;
  v_tz text;
begin
  select * into w from public.space_windows where signal_id = p_signal for update;
  if not found or w.state <> 'pending' then
    return w.state;
  end if;

  if exists (select 1 from public.space_window_approvals
             where signal_id = p_signal and decision <> 'approved') then
    return 'pending';
  end if;

  begin
    update public.space_windows set state = 'agreed', agreed_at = now() where signal_id = p_signal;
  exception when exclusion_violation then
    raise exception 'space_taken' using errcode = '23P01';
  end;
  update public.signals set status = 'active' where id = p_signal;

  select s.name, h.time_zone into v_space, v_tz
  from public.spaces s join public.households h on h.id = s.household_id
  where s.id = w.space_id;

  perform private.notify(
    w.requested_by, w.household_id, 'spaces',
    'Agreed: ' || v_space || ' ' ||
      to_char(w.starts_at at time zone v_tz, 'FMHH12:MI') || '–' ||
      to_char(w.ends_at at time zone v_tz, 'FMHH12:MI AM'),
    null, p_signal
  );
  return 'agreed';
end;
$$;

create or replace function private.on_member_removed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  hid uuid := old.household_id;
  gone uuid := old.user_id;
  c record;
  nxt uuid;
  sid uuid;
begin
  -- Household itself is being deleted → nothing to clean.
  if not exists (select 1 from public.households where id = hid) then
    return null;
  end if;

  -- Last person out turns off the lights.
  if not exists (select 1 from public.household_members where household_id = hid) then
    delete from public.households where id = hid;
    return null;
  end if;

  -- Always keep at least one owner: promote the longest-standing member.
  if not exists (select 1 from public.household_members where household_id = hid and role = 'owner') then
    update public.household_members set role = 'owner'
    where household_id = hid
      and user_id = (select user_id from public.household_members
                     where household_id = hid order by joined_at, user_id limit 1);
  end if;

  -- Their open signals end; their future space windows are withdrawn.
  update public.space_windows set state = 'withdrawn'
  where household_id = hid and requested_by = gone and state in ('pending', 'agreed') and ends_at > now();
  update public.signals set status = 'canceled', resolved_at = now()
  where household_id = hid and created_by = gone and status in ('proposed', 'active');

  -- Their participation in open signals is removed.
  delete from public.signal_responses r
  using public.signals s
  where r.signal_id = s.id and s.household_id = hid and r.user_id = gone and s.status in ('proposed', 'active');
  delete from public.signal_recipients where household_id = hid and user_id = gone;
  update public.run_items set status = 'withdrawn'
  where household_id = hid and requested_by = gone and status = 'requested';
  update public.reset_tasks set claimed_by = null
  where household_id = hid and claimed_by = gone and done_at is null;

  -- Approvals they owed no longer block anyone.
  for sid in
    delete from public.space_window_approvals where household_id = hid and approver_id = gone
    returning signal_id
  loop
    begin
      perform private.evaluate_window(sid);
    exception when others then
      null; -- a conflicting agreed window simply leaves this request pending
    end;
  end loop;

  -- Chores rotate past them. (On account deletion the profile FK may already have nulled the
  -- assignee/anchor, so null counts as "needs a new owner" too.)
  for c in
    select id, assignee_id, rotation_anchor_id from public.chores
    where household_id = hid and archived_at is null
      and (assignee_id = gone or rotation_anchor_id = gone or assignee_id is null or rotation_anchor_id is null)
  loop
    nxt := case
      when c.rotation_anchor_id is null or c.rotation_anchor_id = gone
        then private.next_in_rotation(c.id, coalesce(c.rotation_anchor_id, gone), gone)
      else c.rotation_anchor_id
    end;
    update public.chores
    set rotation_anchor_id = nxt,
        assignee_id = case when assignee_id = gone or assignee_id is null then nxt else assignee_id end
    where id = c.id;
  end loop;
  delete from public.chore_rotation where household_id = hid and user_id = gone;
  update public.chore_swaps set status = 'canceled', decided_at = now()
  where household_id = hid and status = 'pending' and (from_user = gone or to_user = gone);

  return null;
end;
$$;

create trigger on_member_removed
  after delete on public.household_members
  for each row execute function private.on_member_removed();

create or replace function public.leave_household(p_household uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_member(p_household);
begin
  perform private.audit(p_household, 'member_left', uid);
  delete from public.household_members where household_id = p_household and user_id = uid;
end;
$$;

create or replace function public.remove_member(p_household uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_member(p_household);
  v_house text;
begin
  if not private.is_owner(p_household) then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  if p_user = uid then
    raise exception 'use_leave_household' using errcode = '22023';
  end if;
  if not private.is_member_of(p_household, p_user) then
    raise exception 'not_member' using errcode = '22023';
  end if;

  select name into v_house from public.households where id = p_household;
  perform private.audit(p_household, 'member_removed', p_user);
  delete from public.household_members where household_id = p_household and user_id = p_user;
  perform private.notify(p_user, null, 'household', 'You were removed from ' || v_house);
end;
$$;

create or replace function public.set_member_role(p_household uuid, p_user uuid, p_role public.member_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_member(p_household);
  if not private.is_owner(p_household) then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  if not private.is_member_of(p_household, p_user) then
    raise exception 'not_member' using errcode = '22023';
  end if;
  if p_role = 'member'
     and (select count(*) from public.household_members where household_id = p_household and role = 'owner') <= 1
     and exists (select 1 from public.household_members
                 where household_id = p_household and user_id = p_user and role = 'owner') then
    raise exception 'last_owner' using errcode = '22023';
  end if;

  update public.household_members set role = p_role where household_id = p_household and user_id = p_user;
  perform private.audit(p_household, 'role_changed', p_user, jsonb_build_object('role', p_role));
end;
$$;

create or replace function public.update_household(
  p_household uuid,
  p_name text default null,
  p_icon text default null,
  p_theme text default null,
  p_time_zone text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_member(p_household);
  if not private.is_owner(p_household) then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  if p_time_zone is not null and not private.is_valid_time_zone(p_time_zone) then
    raise exception 'invalid_time_zone' using errcode = '22023';
  end if;

  update public.households set
    name = coalesce(nullif(btrim(p_name), ''), name),
    icon = coalesce(p_icon, icon),
    theme = coalesce(p_theme, theme),
    time_zone = coalesce(p_time_zone, time_zone)
  where id = p_household;
  perform private.audit(p_household, 'household_updated', null,
    jsonb_strip_nulls(jsonb_build_object('name', p_name, 'icon', p_icon, 'theme', p_theme, 'time_zone', p_time_zone)));
end;
$$;

-- Any member can add a shared space; only its creator or an owner can edit or archive it.
-- Private bedrooms are deliberately not a space kind: only spaces the household defines as
-- shared can ever be requested.
create or replace function public.save_space(
  p_household uuid,
  p_space uuid,
  p_name text,
  p_kind public.space_kind default 'other',
  p_is_reservable boolean default true,
  p_requires_agreement boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_member(p_household);
  sid uuid;
  sp public.spaces;
begin
  if p_space is null then
    if (select count(*) from public.spaces where household_id = p_household and archived_at is null) >= 20 then
      raise exception 'too_many_spaces' using errcode = '54000';
    end if;
    insert into public.spaces (household_id, name, kind, is_reservable, requires_agreement, created_by)
    values (p_household, btrim(p_name), coalesce(p_kind, 'other'), coalesce(p_is_reservable, true),
            coalesce(p_requires_agreement, true), uid)
    returning id into sid;
    return sid;
  end if;

  select * into sp from public.spaces where id = p_space and household_id = p_household;
  if not found then
    raise exception 'space_not_found' using errcode = 'P0002';
  end if;
  if sp.created_by is distinct from uid and not private.is_owner(p_household) then
    raise exception 'owner_only' using errcode = '42501';
  end if;

  update public.spaces set
    name = coalesce(nullif(btrim(p_name), ''), name),
    kind = coalesce(p_kind, kind),
    is_reservable = coalesce(p_is_reservable, is_reservable),
    requires_agreement = coalesce(p_requires_agreement, requires_agreement)
  where id = p_space;
  return p_space;
end;
$$;

create or replace function public.archive_space(p_space uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  sp public.spaces;
  uid uuid := private.require_user();
begin
  select * into sp from public.spaces where id = p_space;
  if not found or not private.is_member(sp.household_id) then
    raise exception 'space_not_found' using errcode = 'P0002';
  end if;
  if sp.created_by is distinct from uid and not private.is_owner(sp.household_id) then
    raise exception 'owner_only' using errcode = '42501';
  end if;

  update public.spaces set archived_at = now() where id = p_space;
  update public.signals s set status = 'canceled', resolved_at = now()
  from public.space_windows w
  where w.signal_id = s.id and w.space_id = p_space and w.state = 'pending' and s.status = 'proposed';
  update public.space_windows set state = 'withdrawn' where space_id = p_space and state = 'pending';
end;
$$;

-- Export everything that is *yours* (data-portability groundwork).
create or replace function public.export_my_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
begin
  return jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = uid),
    'settings', (select to_jsonb(s) from public.user_settings s where s.user_id = uid),
    'notification_preferences', (select to_jsonb(n) from public.notification_preferences n where n.user_id = uid),
    'memberships', coalesce((select jsonb_agg(jsonb_build_object('household', h.name, 'role', m.role, 'joined_at', m.joined_at))
                             from public.household_members m join public.households h on h.id = m.household_id
                             where m.user_id = uid), '[]'::jsonb),
    'signals', coalesce((select jsonb_agg(to_jsonb(s)) from public.signals s where s.created_by = uid), '[]'::jsonb),
    'responses', coalesce((select jsonb_agg(to_jsonb(r)) from public.signal_responses r where r.user_id = uid), '[]'::jsonb),
    'run_items', coalesce((select jsonb_agg(to_jsonb(i)) from public.run_items i where i.requested_by = uid), '[]'::jsonb),
    'statuses', coalesce((select jsonb_agg(to_jsonb(st)) from public.member_statuses st where st.user_id = uid), '[]'::jsonb),
    'chore_completions', coalesce((select jsonb_agg(to_jsonb(c)) from public.chore_completions c where c.completed_by = uid), '[]'::jsonb),
    'feedback', coalesce((select jsonb_agg(to_jsonb(f)) from public.feedback f where f.user_id = uid), '[]'::jsonb)
  );
end;
$$;
