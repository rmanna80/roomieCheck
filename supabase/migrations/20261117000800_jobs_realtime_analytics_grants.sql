-- Scheduled jobs, realtime publication, privacy-respecting aggregate analytics, and final grants.

-- ---------------------------------------------------------------------------------------------
-- Jobs
-- ---------------------------------------------------------------------------------------------
-- Every Signal has a fuse. This flips anything past its expiry to 'expired' and lapses space
-- requests nobody agreed to before they started. Clients also treat expires_at < now() as
-- expired, so correctness does not depend on job timing.
create or replace function private.expire_signals()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  update public.space_windows w set state = 'declined'
  from public.signals s
  where s.id = w.signal_id and w.state = 'pending' and w.starts_at <= now();

  update public.signals set status = 'expired', resolved_at = now()
  where status = 'proposed' and kind = 'space'
    and id in (select signal_id from public.space_windows where state = 'declined');

  -- Sparks that never gathered enough people by their planned time (15 minutes' grace).
  update public.signals set status = 'expired', resolved_at = now()
  where status = 'proposed' and kind = 'spark' and starts_at is not null
    and starts_at <= now() - interval '15 minutes';

  update public.signals set status = 'expired', resolved_at = now()
  where status in ('proposed', 'active') and expires_at <= now();
  get diagnostics n = row_count;

  delete from public.member_statuses where expires_at <= now() - interval '1 day';
  return n;
end;
$$;

-- Private, gentle reminders to the person whose turn it is — never broadcast to the house.
create or replace function private.queue_chore_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
  n integer := 0;
begin
  for c in
    select ch.id, ch.title, ch.assignee_id, ch.household_id, ch.next_due_on,
           (now() at time zone h.time_zone) as local_now
    from public.chores ch
    join public.households h on h.id = ch.household_id
    where ch.archived_at is null
      and ch.assignee_id is not null
      and ch.next_due_on <= (now() at time zone h.time_zone)::date
      and (ch.reminded_on is null or ch.reminded_on < ch.next_due_on)
      and extract(hour from (now() at time zone h.time_zone)) >= 9
    for update of ch skip locked
  loop
    perform private.notify(
      c.assignee_id, c.household_id, 'chores',
      case when c.next_due_on = c.local_now::date then c.title || ' is due today'
           else c.title || ' is waiting when you get a minute' end,
      null, null, c.id
    );
    update public.chores set reminded_on = c.next_due_on where id = c.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('homepulse-expire-signals', '* * * * *', 'select private.expire_signals()');
    perform cron.schedule('homepulse-chore-reminders', '*/15 * * * *', 'select private.queue_chore_reminders()');
  else
    raise notice 'pg_cron not available: schedule private.expire_signals() and private.queue_chore_reminders() externally';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Realtime: clients subscribe per household; Supabase Realtime enforces RLS per subscriber.
-- ---------------------------------------------------------------------------------------------
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array[
      'signals', 'signal_responses', 'signal_comments', 'run_items', 'space_windows',
      'space_window_approvals', 'reset_tasks', 'member_statuses', 'chores', 'events', 'notifications'
    ] loop
      execute format('alter publication supabase_realtime add table public.%I', t);
    end loop;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Analytics: aggregate-only, household-level, computed from product tables. No client event
-- tracking, no per-user output. Only the service role can execute these.
-- ---------------------------------------------------------------------------------------------
create schema if not exists analytics;
revoke all on schema analytics from public;
grant usage on schema analytics to service_role;

-- Households created since p_since that reached ≥ 2 members within 48 hours.
create or replace function analytics.household_activation(p_since timestamptz)
returns table (households_created bigint, activated_48h bigint, rate numeric)
language sql stable set search_path = '' as $$
  with h as (
    select hh.id,
           (select count(*) from public.household_members m
            where m.household_id = hh.id and m.joined_at <= hh.created_at + interval '48 hours') as early_members
    from public.households hh where hh.created_at >= p_since
  )
  select count(*), count(*) filter (where early_members >= 2),
         round(count(*) filter (where early_members >= 2)::numeric / nullif(count(*), 0), 3)
  from h;
$$;

-- Households where ≥ 2 distinct members did something in the week starting p_week_start.
create or replace function analytics.weekly_active_households(p_week_start date)
returns table (active_households bigint)
language sql stable set search_path = '' as $$
  with acts as (
    select household_id, created_by as user_id from public.signals
      where created_at >= p_week_start and created_at < p_week_start + 7
    union all
    select household_id, user_id from public.signal_responses
      where updated_at >= p_week_start and updated_at < p_week_start + 7
    union all
    select household_id, requested_by from public.run_items
      where created_at >= p_week_start and created_at < p_week_start + 7
    union all
    select household_id, approver_id from public.space_window_approvals
      where decided_at >= p_week_start and decided_at < p_week_start + 7
    union all
    select household_id, completed_by from public.chore_completions
      where completed_at >= p_week_start and completed_at < p_week_start + 7
  )
  select count(*) from (
    select household_id from acts group by household_id having count(distinct user_id) >= 2
  ) x;
$$;

create or replace function analytics.signal_response_rate(p_since timestamptz)
returns table (signals bigint, responded_2h bigint, rate numeric)
language sql stable set search_path = '' as $$
  with s as (
    select sg.id,
           exists (select 1 from public.signal_responses r
                   where r.signal_id = sg.id and r.created_at <= sg.created_at + interval '2 hours') as responded
    from public.signals sg
    where sg.created_at >= p_since and sg.kind not in ('space', 'return')
  )
  select count(*), count(*) filter (where responded),
         round(count(*) filter (where responded)::numeric / nullif(count(*), 0), 3)
  from s;
$$;

create or replace function analytics.run_completion(p_since timestamptz)
returns table (runs bigint, completed bigint, rate numeric)
language sql stable set search_path = '' as $$
  select count(*), count(*) filter (where r.completed_at is not null),
         round(count(*) filter (where r.completed_at is not null)::numeric / nullif(count(*), 0), 3)
  from public.runs r join public.signals s on s.id = r.signal_id
  where s.created_at >= p_since;
$$;

create or replace function analytics.space_resolution(p_since timestamptz)
returns table (requests bigint, agreed bigint, withdrawn bigint, lapsed bigint)
language sql stable set search_path = '' as $$
  select count(*),
         count(*) filter (where w.agreed_at is not null),
         count(*) filter (where w.state = 'withdrawn' and w.agreed_at is null),
         count(*) filter (where w.state = 'declined')
  from public.space_windows w join public.signals s on s.id = w.signal_id
  where s.created_at >= p_since;
$$;

create or replace function analytics.spark_conversion(p_since timestamptz)
returns table (sparks bigint, became_plans bigint, rate numeric)
language sql stable set search_path = '' as $$
  select count(*), count(*) filter (where sp.became_plan_at is not null),
         round(count(*) filter (where sp.became_plan_at is not null)::numeric / nullif(count(*), 0), 3)
  from public.sparks sp join public.signals s on s.id = sp.signal_id
  where s.created_at >= p_since;
$$;

create or replace function analytics.notification_opt_out()
returns table (members bigint, push_disabled bigint, rate numeric)
language sql stable set search_path = '' as $$
  select count(*), count(*) filter (where not np.push_enabled),
         round(count(*) filter (where not np.push_enabled)::numeric / nullif(count(*), 0), 3)
  from public.notification_preferences np
  where exists (select 1 from public.household_members m where m.user_id = np.user_id);
$$;

-- Of households created in the cohort week, how many still had ≥ 2 active members in week 4.
create or replace function analytics.four_week_retention(p_cohort_week date)
returns table (cohort bigint, retained bigint, rate numeric)
language sql stable set search_path = '' as $$
  with cohort as (
    select id from public.households where created_at >= p_cohort_week and created_at < p_cohort_week + 7
  ),
  week4 as (
    select household_id, created_by as user_id from public.signals
      where created_at >= p_cohort_week + 21 and created_at < p_cohort_week + 28
    union all
    select household_id, user_id from public.signal_responses
      where updated_at >= p_cohort_week + 21 and updated_at < p_cohort_week + 28
    union all
    select household_id, completed_by from public.chore_completions
      where completed_at >= p_cohort_week + 21 and completed_at < p_cohort_week + 28
  ),
  retained as (
    select household_id from week4 where household_id in (select id from cohort)
    group by household_id having count(distinct user_id) >= 2
  )
  select (select count(*) from cohort), (select count(*) from retained),
         round((select count(*) from retained)::numeric / nullif((select count(*) from cohort), 0), 3);
$$;

revoke all on all functions in schema analytics from public;
grant execute on all functions in schema analytics to service_role;

-- ---------------------------------------------------------------------------------------------
-- Function grants: public RPCs → authenticated only. Private helpers → only those referenced
-- by RLS policies are executable by authenticated users.
-- ---------------------------------------------------------------------------------------------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant execute on all functions in schema public to authenticated, service_role;

revoke execute on all functions in schema private from public;
revoke execute on all functions in schema private from anon;
revoke execute on all functions in schema private from authenticated;
grant execute on function
  private.is_member(uuid),
  private.is_owner(uuid),
  private.is_member_of(uuid, uuid),
  private.shares_household(uuid),
  private.can_view_signal(uuid),
  private.is_status_viewer(uuid, uuid)
to authenticated;
grant execute on all functions in schema private to service_role;
