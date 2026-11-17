-- Signal RPCs: create, respond, claim leftovers, cancel/resolve, comments, runs, resets.

create or replace function private.display_name(uid uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif((select display_name from public.profiles where id = uid), ''), 'A housemate');
$$;

create or replace function private.kind_category(k public.signal_kind)
returns public.notification_category
language sql
immutable
set search_path = ''
as $$
  select (case k
    when 'food' then 'food'
    when 'leftovers' then 'food'
    when 'run' then 'runs'
    when 'space' then 'spaces'
    when 'reset' then 'resets'
    when 'spark' then 'sparks'
    else 'updates'
  end)::public.notification_category;
$$;

-- Loads a signal the caller may see, locking it; raises otherwise.
create or replace function private.visible_signal_for_update(p_signal uuid)
returns public.signals
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.signals;
begin
  perform private.require_user();
  select * into s from public.signals where id = p_signal for update;
  if not found or not private.can_view_signal(p_signal) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return s;
end;
$$;

create or replace function private.require_open(s public.signals)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if s.status not in ('proposed', 'active') or s.expires_at <= now() then
    raise exception 'signal_closed' using errcode = '55000';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
create or replace function public.create_signal(
  p_household uuid,
  p_kind public.signal_kind,
  p_title text,
  p_body text default null,
  p_starts_at timestamptz default null,
  p_expires_at timestamptz default null,
  p_recipients uuid[] default null,
  p_details jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_member(p_household);
  sid uuid;
  d jsonb := coalesce(p_details, '{}'::jsonb);
  v_status public.signal_status := 'active';
  v_audience public.signal_audience := 'household';
  v_recipients uuid[] := coalesce(p_recipients, '{}'::uuid[]);
  v_starts timestamptz := p_starts_at;
  v_expires timestamptz;
  v_leaves timestamptz;
  v_task text;
  v_portions int;
  r uuid;
  i int := 0;
  m record;
begin
  if p_kind = 'space' then
    raise exception 'use_request_space_window' using errcode = '22023';
  end if;
  if (select count(*) from public.signals where created_by = uid and created_at > now() - interval '1 hour') >= 40 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;
  if v_starts is not null and (v_starts < now() - interval '1 hour' or v_starts > now() + interval '14 days') then
    raise exception 'invalid_time' using errcode = '22023';
  end if;

  case p_kind
    when 'food' then
      v_portions := nullif((d ->> 'portions_total')::int, 0);
      v_expires := coalesce(p_expires_at, coalesce(v_starts, now()) + interval '3 hours');
    when 'leftovers' then
      v_portions := (d ->> 'portions_total')::int;
      if coalesce(v_portions, 0) < 1 then
        raise exception 'portions_required' using errcode = '22023';
      end if;
      v_expires := coalesce(p_expires_at, now() + interval '2 days');
    when 'run' then
      v_leaves := coalesce((d ->> 'leaves_at')::timestamptz, v_starts, now() + interval '20 minutes');
      if v_leaves < now() - interval '5 minutes' then
        raise exception 'invalid_time' using errcode = '22023';
      end if;
      v_starts := v_leaves;
      v_expires := coalesce(p_expires_at, v_leaves + interval '3 hours');
    when 'reset' then
      v_expires := coalesce(p_expires_at, coalesce(v_starts, now()) + interval '4 hours');
    when 'spark' then
      v_status := 'proposed';
      v_starts := coalesce((d ->> 'plan_at')::timestamptz, v_starts);
      -- Spontaneous sparks (no plan time) stay open 2 hours; planned ones until 3 hours after.
      v_expires := coalesce(p_expires_at, case when v_starts is null then now() + interval '2 hours'
                                               else v_starts + interval '3 hours' end);
    when 'return' then
      if v_starts is null then
        raise exception 'eta_required' using errcode = '22023';
      end if;
      v_expires := coalesce(p_expires_at, v_starts + interval '90 minutes');
    when 'quiet' then
      v_starts := coalesce(v_starts, now());
      v_expires := coalesce(p_expires_at, v_starts + interval '8 hours');
      if v_expires - v_starts > interval '24 hours' then
        raise exception 'invalid_time' using errcode = '22023';
      end if;
  end case;

  if v_expires <= now() or v_expires > now() + interval '15 days' then
    raise exception 'invalid_time' using errcode = '22023';
  end if;

  if array_length(v_recipients, 1) is not null then
    v_audience := 'selected';
    foreach r in array v_recipients loop
      if r = uid or not private.is_member_of(p_household, r) then
        raise exception 'invalid_recipient' using errcode = '22023';
      end if;
    end loop;
  end if;

  insert into public.signals (household_id, created_by, kind, title, body, status, audience, starts_at, expires_at)
  values (p_household, uid, p_kind, btrim(p_title), nullif(btrim(coalesce(p_body, '')), ''),
          v_status, v_audience, v_starts, v_expires)
  returning id into sid;

  if v_audience = 'selected' then
    insert into public.signal_recipients (signal_id, household_id, user_id)
    select distinct sid, p_household, x from unnest(v_recipients) as x;
  end if;

  case p_kind
    when 'food', 'leftovers' then
      insert into public.food_details (signal_id, household_id, portions_total, location)
      values (sid, p_household, v_portions::smallint, nullif(btrim(coalesce(d ->> 'location', '')), ''));
    when 'run' then
      insert into public.runs (signal_id, household_id, run_type, destination, leaves_at)
      values (sid, p_household, coalesce((d ->> 'run_type')::public.run_type, 'groceries'),
              nullif(btrim(coalesce(d ->> 'destination', '')), ''), v_leaves);
    when 'reset' then
      insert into public.resets (signal_id, household_id, minutes)
      values (sid, p_household, coalesce((d ->> 'minutes')::smallint, 10));
      for v_task in select jsonb_array_elements_text(coalesce(d -> 'tasks', '[]'::jsonb)) loop
        continue when btrim(v_task) = '';
        i := i + 1;
        exit when i > 12;
        insert into public.reset_tasks (signal_id, household_id, label, position)
        values (sid, p_household, btrim(v_task), i);
      end loop;
    when 'spark' then
      insert into public.sparks (signal_id, household_id, plan_at, min_people)
      values (sid, p_household, v_starts, coalesce((d ->> 'min_people')::smallint, 2));
    else
      null;
  end case;

  for m in
    select hm.user_id from public.household_members hm
    where hm.household_id = p_household and hm.user_id <> uid
      and (v_audience = 'household' or hm.user_id = any (v_recipients))
  loop
    perform private.notify(m.user_id, p_household, private.kind_category(p_kind),
                           private.display_name(uid) || ': ' || btrim(p_title), null, sid);
  end loop;

  return sid;
end;
$$;

-- ---------------------------------------------------------------------------------------------
create or replace function public.respond_to_signal(
  p_signal uuid,
  p_response text,
  p_portions int default null,
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
  prior text;
  v_portions smallint;
  cap smallint;
  used int;
  sp public.sparks;
  joined int;
  became_plan boolean := false;
  m record;
begin
  perform private.require_open(s);
  if s.created_by = uid then
    raise exception 'own_signal' using errcode = '22023';
  end if;
  if s.kind = 'leftovers' then
    raise exception 'use_claim_portions' using errcode = '22023';
  end if;
  if not (p_response = any (private.allowed_responses(s.kind))) then
    raise exception 'invalid_response' using errcode = '22023';
  end if;

  if s.kind = 'food' and p_response in ('in', 'save_me') then
    v_portions := least(greatest(coalesce(p_portions, 1), 1), 6);
    select portions_total into cap from public.food_details where signal_id = p_signal;
    if cap is not null then
      select coalesce(sum(portions), 0) into used from public.signal_responses
      where signal_id = p_signal and user_id <> uid and response in ('in', 'save_me');
      if used + v_portions > cap then
        raise exception 'not_enough_portions' using errcode = '55000';
      end if;
    end if;
  end if;

  select response into prior from public.signal_responses where signal_id = p_signal and user_id = uid;

  insert into public.signal_responses (signal_id, household_id, user_id, response, portions, note)
  values (p_signal, s.household_id, uid, p_response, v_portions, nullif(btrim(coalesce(p_note, '')), ''))
  on conflict (signal_id, user_id) do update
    set response = excluded.response, portions = excluded.portions, note = excluded.note;

  -- Spark → plan once enough people are in (creator counts).
  if s.kind = 'spark' and s.status = 'proposed' and p_response = 'in' then
    select * into sp from public.sparks where signal_id = p_signal for update;
    select 1 + count(*) into joined from public.signal_responses where signal_id = p_signal and response = 'in';
    if joined >= sp.min_people then
      became_plan := true;
      update public.signals set status = 'active' where id = p_signal;
      update public.sparks set became_plan_at = now() where signal_id = p_signal;
      insert into public.events (household_id, signal_id, title, starts_at, created_by)
      values (s.household_id, p_signal, s.title, coalesce(sp.plan_at, s.starts_at, now()), s.created_by)
      on conflict (signal_id) do nothing;

      perform private.notify(s.created_by, s.household_id, 'sparks', 'It''s on: ' || s.title,
                             joined || ' people are in', p_signal);
      for m in select user_id from public.signal_responses where signal_id = p_signal and response = 'in' loop
        perform private.notify(m.user_id, s.household_id, 'sparks', 'It''s on: ' || s.title,
                               joined || ' people are in', p_signal);
      end loop;
    end if;
  end if;

  -- Only positive responses notify the creator. Declines never generate a notification.
  if not became_plan and prior is distinct from p_response
     and p_response in ('in', 'save_me', 'coming', 'grab_me', 'handle_it', 'together', 'adjust', 'discuss') then
    perform private.notify(
      s.created_by, s.household_id, 'responses',
      private.display_name(uid) || ' ' || case p_response
        when 'in' then 'is in'
        when 'save_me' then 'asked you to save some'
        when 'coming' then 'is coming along'
        when 'grab_me' then 'would like something'
        when 'handle_it' then 'will handle it'
        when 'together' then 'is joining'
        when 'adjust' then 'asked to adjust the time'
        when 'discuss' then 'would like to talk it through'
      end,
      s.title, p_signal
    );
  end if;

  return jsonb_build_object(
    'signal_id', p_signal,
    'response', p_response,
    'status', (select status from public.signals where id = p_signal),
    'became_plan', became_plan
  );
end;
$$;

create or replace function public.clear_response(p_signal uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  s public.signals := private.visible_signal_for_update(p_signal);
begin
  perform private.require_open(s);
  delete from public.signal_responses where signal_id = p_signal and user_id = uid;
end;
$$;

-- Claim leftover portions. The detail row is locked so two people can't take the last portion.
create or replace function public.claim_portions(p_signal uuid, p_portions int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  s public.signals := private.visible_signal_for_update(p_signal);
  fd public.food_details;
  others int;
begin
  perform private.require_open(s);
  if s.kind <> 'leftovers' then
    raise exception 'invalid_response' using errcode = '22023';
  end if;
  if s.created_by = uid then
    raise exception 'own_signal' using errcode = '22023';
  end if;

  select * into fd from public.food_details where signal_id = p_signal for update;
  select coalesce(sum(portions), 0) into others from public.signal_responses
  where signal_id = p_signal and user_id <> uid and response = 'claimed';

  if coalesce(p_portions, 0) <= 0 then
    delete from public.signal_responses where signal_id = p_signal and user_id = uid;
  else
    if others + p_portions > fd.portions_total then
      raise exception 'not_enough_portions' using errcode = '55000',
        detail = 'remaining=' || greatest(fd.portions_total - others, 0);
    end if;
    insert into public.signal_responses (signal_id, household_id, user_id, response, portions)
    values (p_signal, s.household_id, uid, 'claimed', p_portions)
    on conflict (signal_id, user_id) do update set response = 'claimed', portions = excluded.portions;
    perform private.notify(s.created_by, s.household_id, 'responses',
      private.display_name(uid) || ' claimed ' || p_portions || case when p_portions = 1 then ' portion' else ' portions' end,
      s.title, p_signal);
  end if;

  return jsonb_build_object(
    'claimed', greatest(coalesce(p_portions, 0), 0),
    'remaining', fd.portions_total - others - greatest(coalesce(p_portions, 0), 0)
  );
end;
$$;

create or replace function public.cancel_signal(p_signal uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  s public.signals := private.visible_signal_for_update(p_signal);
  m record;
begin
  if s.created_by <> uid then
    raise exception 'creator_only' using errcode = '42501';
  end if;
  if s.status not in ('proposed', 'active') then
    return; -- already closed: idempotent
  end if;

  update public.signals set status = 'canceled', resolved_at = now() where id = p_signal;
  update public.space_windows set state = 'withdrawn' where signal_id = p_signal and state in ('pending', 'agreed');
  update public.events set canceled_at = now() where signal_id = p_signal and canceled_at is null;

  for m in
    select user_id from public.signal_responses
    where signal_id = p_signal and response in ('in', 'save_me', 'coming', 'grab_me', 'together', 'claimed', 'handle_it')
    union
    select requested_by from public.run_items where signal_id = p_signal and status in ('requested', 'accepted')
    union
    select approver_id from public.space_window_approvals where signal_id = p_signal
  loop
    perform private.notify(m.user_id, s.household_id, private.kind_category(s.kind), 'Canceled: ' || s.title, null, p_signal);
  end loop;
end;
$$;

-- Creator marks a signal done (dinner served, leftovers gone, quiet ended, "I'm home").
-- For resets, whoever said "I'll handle it" can also close it.
create or replace function public.resolve_signal(p_signal uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  s public.signals := private.visible_signal_for_update(p_signal);
begin
  if s.status not in ('proposed', 'active') then
    return;
  end if;
  if s.kind = 'run' then
    raise exception 'use_complete_run' using errcode = '22023';
  end if;
  if s.kind = 'space' then
    raise exception 'use_cancel_signal' using errcode = '22023';
  end if;
  if s.created_by <> uid and not (
    s.kind = 'reset' and exists (
      select 1 from public.signal_responses where signal_id = p_signal and user_id = uid and response = 'handle_it'
    )
  ) then
    raise exception 'creator_only' using errcode = '42501';
  end if;

  update public.signals set status = 'resolved', resolved_at = now() where id = p_signal;
end;
$$;

create or replace function public.add_signal_comment(p_signal uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  s public.signals := private.visible_signal_for_update(p_signal);
  cid uuid;
begin
  if (select count(*) from public.signal_comments where user_id = uid and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;
  insert into public.signal_comments (signal_id, household_id, user_id, body)
  values (p_signal, s.household_id, uid, btrim(p_body))
  returning id into cid;
  perform private.notify(s.created_by, s.household_id, 'responses',
                         private.display_name(uid) || ' replied', left(btrim(p_body), 120), p_signal);
  return cid;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Runs
-- ---------------------------------------------------------------------------------------------
create or replace function public.add_run_item(p_signal uuid, p_name text, p_quantity text default null, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  s public.signals := private.visible_signal_for_update(p_signal);
  run public.runs;
  iid uuid;
begin
  perform private.require_open(s);
  if s.kind <> 'run' then
    raise exception 'not_a_run' using errcode = '22023';
  end if;
  select * into run from public.runs where signal_id = p_signal;
  if run.started_at is not null or run.leaves_at <= now() then
    raise exception 'run_closed' using errcode = '55000';
  end if;
  if (select count(*) from public.run_items where signal_id = p_signal and requested_by = uid and status <> 'withdrawn') >= 15 then
    raise exception 'too_many_items' using errcode = '54000';
  end if;

  insert into public.run_items (signal_id, household_id, requested_by, name, quantity, note)
  values (p_signal, s.household_id, uid, btrim(p_name), nullif(btrim(coalesce(p_quantity, '')), ''),
          nullif(btrim(coalesce(p_note, '')), ''))
  returning id into iid;

  if uid <> s.created_by then
    insert into public.signal_responses (signal_id, household_id, user_id, response)
    values (p_signal, s.household_id, uid, 'grab_me')
    on conflict (signal_id, user_id) do update set response = 'grab_me'
      where public.signal_responses.response = 'all_good';
    perform private.notify(s.created_by, s.household_id, 'runs',
                           private.display_name(uid) || ' added ' || btrim(p_name), s.title, p_signal);
  end if;
  return iid;
end;
$$;

create or replace function public.withdraw_run_item(p_item uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  it public.run_items;
begin
  select * into it from public.run_items where id = p_item for update;
  if not found or it.requested_by <> uid then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if it.status in ('requested', 'accepted') then
    update public.run_items set status = 'withdrawn', decided_at = now() where id = p_item;
  end if;
end;
$$;

-- The runner decides on each item. Nothing is assumed accepted.
create or replace function public.decide_run_item(p_item uuid, p_decision public.run_item_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  it public.run_items;
  s public.signals;
begin
  if p_decision not in ('accepted', 'declined', 'purchased', 'unavailable') then
    raise exception 'invalid_decision' using errcode = '22023';
  end if;
  select * into it from public.run_items where id = p_item for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  s := private.visible_signal_for_update(it.signal_id);
  if s.created_by <> uid then
    raise exception 'runner_only' using errcode = '42501';
  end if;
  if s.status = 'canceled' or it.status = 'withdrawn' then
    raise exception 'signal_closed' using errcode = '55000';
  end if;
  if it.status = p_decision then
    return; -- duplicate tap
  end if;

  update public.run_items set status = p_decision, decided_at = now() where id = p_item;
  perform private.notify(
    it.requested_by, it.household_id, 'runs',
    case p_decision
      when 'accepted' then private.display_name(uid) || ' will grab ' || it.name
      when 'declined' then private.display_name(uid) || ' can''t grab ' || it.name || ' this time'
      when 'purchased' then private.display_name(uid) || ' got ' || it.name
      when 'unavailable' then it.name || ' was unavailable'
    end,
    s.title, s.id
  );
end;
$$;

-- Runner heads out: closes new requests immediately.
create or replace function public.start_run(p_signal uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  s public.signals := private.visible_signal_for_update(p_signal);
begin
  if s.kind <> 'run' or s.created_by <> uid then
    raise exception 'runner_only' using errcode = '42501';
  end if;
  perform private.require_open(s);
  update public.runs set started_at = coalesce(started_at, now()), leaves_at = least(leaves_at, now())
  where signal_id = p_signal;
end;
$$;

create or replace function public.complete_run(p_signal uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  s public.signals := private.visible_signal_for_update(p_signal);
  m record;
begin
  if s.kind <> 'run' or s.created_by <> uid then
    raise exception 'runner_only' using errcode = '42501';
  end if;
  if s.status = 'resolved' then
    return jsonb_build_object('status', 'resolved', 'already', true);
  end if;
  perform private.require_open(s);

  update public.runs set started_at = coalesce(started_at, now()), completed_at = now(),
                         leaves_at = least(leaves_at, now())
  where signal_id = p_signal;
  update public.signals set status = 'resolved', resolved_at = now() where id = p_signal;

  for m in
    select requested_by, count(*) filter (where status in ('accepted', 'purchased')) as got
    from public.run_items where signal_id = p_signal and status <> 'withdrawn'
    group by requested_by
  loop
    perform private.notify(m.requested_by, s.household_id, 'runs',
      private.display_name(uid) || ' is back from the run',
      case when m.got > 0 then 'Your items are in' else 'Check what made it' end,
      p_signal);
  end loop;

  return jsonb_build_object('status', 'resolved', 'already', false);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Resets (collaborative cleaning)
-- ---------------------------------------------------------------------------------------------
create or replace function public.add_reset_task(p_signal uuid, p_label text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.signals := private.visible_signal_for_update(p_signal);
  tid uuid;
begin
  perform private.require_open(s);
  if s.kind <> 'reset' then
    raise exception 'not_a_reset' using errcode = '22023';
  end if;
  if (select count(*) from public.reset_tasks where signal_id = p_signal) >= 12 then
    raise exception 'too_many_items' using errcode = '54000';
  end if;
  insert into public.reset_tasks (signal_id, household_id, label, position)
  values (p_signal, s.household_id, btrim(p_label),
          coalesce((select max(position) + 1 from public.reset_tasks where signal_id = p_signal), 1))
  returning id into tid;
  return tid;
end;
$$;

-- Atomic claim: the conditional UPDATE means two people can never claim the same task.
create or replace function public.claim_reset_task(p_task uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  t public.reset_tasks;
  s public.signals;
begin
  select * into t from public.reset_tasks where id = p_task;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  s := private.visible_signal_for_update(t.signal_id);
  perform private.require_open(s);

  update public.reset_tasks set claimed_by = uid
  where id = p_task and (claimed_by is null or claimed_by = uid) and done_at is null;
  if not found then
    raise exception 'already_claimed' using errcode = '55000';
  end if;

  if uid <> s.created_by then
    insert into public.signal_responses (signal_id, household_id, user_id, response)
    values (s.id, s.household_id, uid, 'together')
    on conflict (signal_id, user_id) do nothing;
  end if;
end;
$$;

create or replace function public.release_reset_task(p_task uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
begin
  update public.reset_tasks set claimed_by = null
  where id = p_task and claimed_by = uid and done_at is null;
end;
$$;

create or replace function public.set_reset_task_done(p_task uuid, p_done boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  t public.reset_tasks;
  s public.signals;
begin
  select * into t from public.reset_tasks where id = p_task for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  s := private.visible_signal_for_update(t.signal_id);
  if s.status not in ('proposed', 'active') then
    raise exception 'signal_closed' using errcode = '55000';
  end if;
  if t.claimed_by is not null and t.claimed_by <> uid and s.created_by <> uid then
    raise exception 'already_claimed' using errcode = '55000';
  end if;

  update public.reset_tasks
  set done_at = case when p_done then coalesce(done_at, now()) else null end,
      claimed_by = coalesce(claimed_by, uid)
  where id = p_task;
end;
$$;
