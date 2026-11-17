-- Space Windows: consent-based shared-space coordination.
--
--   request → (approvers: approve | "I need it too" | counter-propose) → reschedule → agreed
--
-- A window is only *agreed* when every required approver has approved. Agreed windows on the
-- same space can never overlap (exclusion constraint in 0200). Pending requests may overlap —
-- that's a conflict the people involved resolve, and the app surfaces it.

create or replace function public.space_conflicts(
  p_space uuid,
  p_starts timestamptz,
  p_ends timestamptz,
  p_exclude uuid default null
)
returns table (signal_id uuid, requested_by uuid, starts_at timestamptz, ends_at timestamptz, state public.window_state)
language sql
stable
security invoker
set search_path = ''
as $$
  select w.signal_id, w.requested_by, w.starts_at, w.ends_at, w.state
  from public.space_windows w
  join public.signals s on s.id = w.signal_id
  where w.space_id = p_space
    and w.state in ('pending', 'agreed')
    and s.status in ('proposed', 'active')
    and tstzrange(w.starts_at, w.ends_at, '[)') && tstzrange(p_starts, p_ends, '[)')
    and (p_exclude is null or w.signal_id <> p_exclude)
  order by w.starts_at;
$$;

create or replace function private.validate_window_times(p_starts timestamptz, p_ends timestamptz)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_starts is null or p_ends is null or p_ends <= p_starts
     or p_ends - p_starts > interval '12 hours'
     or p_starts < now() - interval '15 minutes'
     or p_starts > now() + interval '14 days' then
    raise exception 'invalid_time' using errcode = '22023';
  end if;
end;
$$;

create or replace function private.window_label(p_space uuid, p_starts timestamptz, p_ends timestamptz)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.name || ' ' ||
         to_char(p_starts at time zone h.time_zone, 'FMHH12:MI') || '–' ||
         to_char(p_ends at time zone h.time_zone, 'FMHH12:MI AM')
  from public.spaces s join public.households h on h.id = s.household_id
  where s.id = p_space;
$$;

create or replace function public.request_space_window(
  p_household uuid,
  p_space uuid,
  p_starts timestamptz,
  p_ends timestamptz,
  p_reason public.space_reason default 'personal',
  p_title text default null,
  p_note text default null,
  p_approvers uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_member(p_household);
  sp public.spaces;
  approvers uuid[];
  a uuid;
  sid uuid;
  v_state public.window_state;
begin
  select * into sp from public.spaces
  where id = p_space and household_id = p_household and archived_at is null;
  if not found then
    raise exception 'space_not_found' using errcode = 'P0002';
  end if;
  if not sp.is_reservable then
    raise exception 'space_not_reservable' using errcode = '22023';
  end if;
  perform private.validate_window_times(p_starts, p_ends);
  if (select count(*) from public.signals where created_by = uid and created_at > now() - interval '1 hour') >= 40 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;

  if exists (
    select 1 from public.space_windows w
    where w.space_id = p_space and w.state = 'agreed'
      and tstzrange(w.starts_at, w.ends_at, '[)') && tstzrange(p_starts, p_ends, '[)')
  ) then
    raise exception 'space_taken' using errcode = '23P01';
  end if;

  if sp.requires_agreement then
    approvers := coalesce(
      p_approvers,
      array(select user_id from public.household_members where household_id = p_household and user_id <> uid)
    );
  else
    approvers := '{}'::uuid[];
  end if;

  foreach a in array approvers loop
    if a = uid or not private.is_member_of(p_household, a) then
      raise exception 'invalid_recipient' using errcode = '22023';
    end if;
  end loop;

  insert into public.signals (household_id, created_by, kind, title, body, status, audience, starts_at, expires_at)
  values (p_household, uid, 'space',
          coalesce(nullif(btrim(coalesce(p_title, '')), ''), 'Can I have the ' || lower(sp.name) || '?'),
          nullif(btrim(coalesce(p_note, '')), ''), 'proposed', 'household', p_starts, p_ends)
  returning id into sid;

  insert into public.space_windows (signal_id, household_id, space_id, requested_by, starts_at, ends_at, reason)
  values (sid, p_household, p_space, uid, p_starts, p_ends, coalesce(p_reason, 'personal'));

  insert into public.space_window_approvals (signal_id, household_id, approver_id)
  select distinct sid, p_household, x from unnest(approvers) as x;

  v_state := private.evaluate_window(sid);

  if v_state = 'pending' then
    foreach a in array approvers loop
      perform private.notify(a, p_household, 'requests',
        private.display_name(uid) || ' asks for the ' || private.window_label(p_space, p_starts, p_ends),
        null, sid, null, true);
    end loop;
  end if;

  return jsonb_build_object('signal_id', sid, 'state', v_state);
end;
$$;

create or replace function public.decide_space_window(
  p_signal uuid,
  p_decision public.approval_decision,
  p_counter_starts timestamptz default null,
  p_counter_ends timestamptz default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  s public.signals := private.visible_signal_for_update(p_signal);
  w public.space_windows;
  appr public.space_window_approvals;
  v_state public.window_state;
begin
  select * into appr from public.space_window_approvals
  where signal_id = p_signal and approver_id = uid for update;
  if not found then
    raise exception 'not_an_approver' using errcode = '42501';
  end if;

  select * into w from public.space_windows where signal_id = p_signal for update;
  if w.state <> 'pending' or s.status <> 'proposed' or s.expires_at <= now() then
    raise exception 'signal_closed' using errcode = '55000';
  end if;
  if p_decision = 'pending' then
    raise exception 'invalid_decision' using errcode = '22023';
  end if;
  if p_decision = 'counter' then
    perform private.validate_window_times(p_counter_starts, p_counter_ends);
  end if;

  update public.space_window_approvals set
    decision = p_decision,
    counter_starts_at = case when p_decision = 'counter' then p_counter_starts end,
    counter_ends_at = case when p_decision = 'counter' then p_counter_ends end,
    note = nullif(btrim(coalesce(p_note, '')), ''),
    decided_at = now()
  where signal_id = p_signal and approver_id = uid;

  if p_decision = 'approved' then
    v_state := private.evaluate_window(p_signal);
  else
    v_state := 'pending';
    perform private.notify(
      w.requested_by, w.household_id, 'spaces',
      case p_decision
        when 'needs_it_too' then private.display_name(uid) || ' needs the space then too'
        else private.display_name(uid) || ' suggested ' || private.window_label(w.space_id, p_counter_starts, p_counter_ends)
      end,
      'Tap to pick another time', p_signal, null, true
    );
  end if;

  return jsonb_build_object('signal_id', p_signal, 'state', v_state);
end;
$$;

-- Requester moves the window (to resolve a conflict or accept a counter-proposal).
-- Approvals reset to pending, except approvers who proposed exactly the new time.
create or replace function public.reschedule_space_window(p_signal uuid, p_starts timestamptz, p_ends timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  s public.signals := private.visible_signal_for_update(p_signal);
  w public.space_windows;
  v_state public.window_state;
  a record;
begin
  select * into w from public.space_windows where signal_id = p_signal for update;
  if not found or w.requested_by <> uid then
    raise exception 'creator_only' using errcode = '42501';
  end if;
  if w.state not in ('pending', 'agreed') or s.status not in ('proposed', 'active') then
    raise exception 'signal_closed' using errcode = '55000';
  end if;
  perform private.validate_window_times(p_starts, p_ends);

  if exists (
    select 1 from public.space_windows x
    where x.space_id = w.space_id and x.state = 'agreed' and x.signal_id <> p_signal
      and tstzrange(x.starts_at, x.ends_at, '[)') && tstzrange(p_starts, p_ends, '[)')
  ) then
    raise exception 'space_taken' using errcode = '23P01';
  end if;

  update public.space_windows set starts_at = p_starts, ends_at = p_ends, state = 'pending', agreed_at = null
  where signal_id = p_signal;
  update public.signals set starts_at = p_starts, expires_at = p_ends, status = 'proposed'
  where id = p_signal;

  update public.space_window_approvals set
    decision = case when decision = 'counter' and counter_starts_at = p_starts and counter_ends_at = p_ends
                    then 'approved'::public.approval_decision else 'pending'::public.approval_decision end,
    decided_at = case when decision = 'counter' and counter_starts_at = p_starts and counter_ends_at = p_ends
                      then now() end,
    counter_starts_at = null,
    counter_ends_at = null,
    note = null
  where signal_id = p_signal;

  v_state := private.evaluate_window(p_signal);

  if v_state = 'pending' then
    for a in select approver_id from public.space_window_approvals where signal_id = p_signal and decision = 'pending' loop
      perform private.notify(a.approver_id, s.household_id, 'requests',
        private.display_name(uid) || ' moved the request to ' || private.window_label(w.space_id, p_starts, p_ends),
        null, p_signal, null, true);
    end loop;
  end if;

  return jsonb_build_object('signal_id', p_signal, 'state', v_state);
end;
$$;
