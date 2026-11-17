-- Signals: the central interaction. One envelope table + small per-kind detail tables.

create type public.signal_kind as enum ('food', 'leftovers', 'run', 'space', 'reset', 'spark', 'return', 'quiet');
create type public.signal_status as enum ('proposed', 'active', 'resolved', 'expired', 'canceled');
create type public.signal_audience as enum ('household', 'selected');
create type public.run_type as enum ('groceries', 'takeout', 'pharmacy', 'convenience', 'supplies', 'other');
create type public.run_item_status as enum ('requested', 'accepted', 'declined', 'purchased', 'unavailable', 'withdrawn');
create type public.space_reason as enum ('personal', 'call', 'guests', 'study', 'event', 'cooking', 'other');
create type public.window_state as enum ('pending', 'agreed', 'declined', 'withdrawn');
create type public.approval_decision as enum ('pending', 'approved', 'needs_it_too', 'counter');

create table public.signals (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  created_by   uuid not null references public.profiles (id) on delete cascade,
  kind         public.signal_kind not null,
  title        text not null check (char_length(btrim(title)) between 1 and 120),
  body         text check (char_length(body) <= 500),
  status       public.signal_status not null default 'active',
  audience     public.signal_audience not null default 'household',
  starts_at    timestamptz,
  expires_at   timestamptz not null,
  resolved_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (starts_at is null or expires_at >= starts_at)
);
create index signals_feed_idx on public.signals (household_id, status, expires_at desc);
create index signals_creator_idx on public.signals (created_by);
create trigger signals_touch before update on public.signals
  for each row execute function private.touch_updated_at();

create table public.signal_recipients (
  signal_id    uuid not null references public.signals (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  primary key (signal_id, user_id)
);
create index signal_recipients_user_idx on public.signal_recipients (user_id);

-- One response per person per signal (PK) → duplicate taps are idempotent upserts.
create table public.signal_responses (
  signal_id    uuid not null references public.signals (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  response     text not null check (response ~ '^[a-z_]{2,24}$'),
  portions     smallint check (portions between 0 and 20),
  note         text check (char_length(note) <= 200),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (signal_id, user_id)
);
create index signal_responses_household_idx on public.signal_responses (household_id);
create trigger signal_responses_touch before update on public.signal_responses
  for each row execute function private.touch_updated_at();

create table public.signal_comments (
  id           uuid primary key default gen_random_uuid(),
  signal_id    uuid not null references public.signals (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  body         text not null check (char_length(btrim(body)) between 1 and 500),
  created_at   timestamptz not null default now()
);
create index signal_comments_signal_idx on public.signal_comments (signal_id, created_at);

-- Food (cooking) and Leftovers. portions_total = null → no cap (cooking for "whoever's in").
create table public.food_details (
  signal_id      uuid primary key references public.signals (id) on delete cascade,
  household_id   uuid not null references public.households (id) on delete cascade,
  portions_total smallint check (portions_total between 1 and 20),
  location       text check (char_length(location) <= 60)
);

-- Runs (food runs, groceries, pharmacy …). No payment is assumed or processed.
create table public.runs (
  signal_id    uuid primary key references public.signals (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  run_type     public.run_type not null default 'groceries',
  destination  text check (char_length(destination) <= 60),
  leaves_at    timestamptz not null,
  started_at   timestamptz,
  completed_at timestamptz
);

create table public.run_items (
  id           uuid primary key default gen_random_uuid(),
  signal_id    uuid not null references public.signals (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  requested_by uuid not null references public.profiles (id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 80),
  quantity     text check (char_length(quantity) <= 30),
  note         text check (char_length(note) <= 200),
  status       public.run_item_status not null default 'requested',
  decided_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index run_items_signal_idx on public.run_items (signal_id);
create trigger run_items_touch before update on public.run_items
  for each row execute function private.touch_updated_at();

-- Space Windows. Agreed windows on the same space can never overlap (exclusion constraint),
-- which makes concurrent approvals safe without application-level locking.
create table public.space_windows (
  signal_id    uuid primary key references public.signals (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  space_id     uuid not null references public.spaces (id) on delete cascade,
  requested_by uuid not null references public.profiles (id) on delete cascade,
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  reason       public.space_reason not null default 'personal',
  state        public.window_state not null default 'pending',
  agreed_at    timestamptz,
  check (ends_at > starts_at),
  check (ends_at - starts_at <= interval '12 hours'),
  constraint space_windows_no_overlap exclude using gist (
    space_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (state = 'agreed')
);
create index space_windows_space_time_idx on public.space_windows (space_id, starts_at);

create table public.space_window_approvals (
  signal_id         uuid not null references public.signals (id) on delete cascade,
  household_id      uuid not null references public.households (id) on delete cascade,
  approver_id       uuid not null references public.profiles (id) on delete cascade,
  decision          public.approval_decision not null default 'pending',
  counter_starts_at timestamptz,
  counter_ends_at   timestamptz,
  note              text check (char_length(note) <= 200),
  decided_at        timestamptz,
  primary key (signal_id, approver_id),
  check ((decision = 'counter') = (counter_starts_at is not null and counter_ends_at is not null)),
  check (counter_ends_at is null or counter_ends_at > counter_starts_at)
);
create index space_window_approvals_approver_idx on public.space_window_approvals (approver_id);

-- Resets: short, joinable, positive cleaning sessions with claimable tasks.
create table public.resets (
  signal_id    uuid primary key references public.signals (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  minutes      smallint not null default 10 check (minutes between 5 and 120)
);

create table public.reset_tasks (
  id           uuid primary key default gen_random_uuid(),
  signal_id    uuid not null references public.signals (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  label        text not null check (char_length(btrim(label)) between 1 and 40),
  position     smallint not null default 0,
  claimed_by   uuid references public.profiles (id) on delete set null,
  done_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index reset_tasks_signal_idx on public.reset_tasks (signal_id, position);

-- Sparks: spontaneous plans that become calendar events once enough people join.
create table public.sparks (
  signal_id      uuid primary key references public.signals (id) on delete cascade,
  household_id   uuid not null references public.households (id) on delete cascade,
  plan_at        timestamptz,
  min_people     smallint not null default 2 check (min_people between 2 and 20),
  became_plan_at timestamptz
);

-- Shared calendar entries. Attendance for Spark-born events is the Spark's responses.
create table public.events (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  signal_id    uuid unique references public.signals (id) on delete cascade,
  title        text not null check (char_length(btrim(title)) between 1 and 120),
  starts_at    timestamptz not null,
  ends_at      timestamptz,
  created_by   uuid references public.profiles (id) on delete set null,
  canceled_at  timestamptz,
  created_at   timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
create index events_household_time_idx on public.events (household_id, starts_at);

-- ---------------------------------------------------------------------------------------------
-- Visibility helper: member of the household AND (household audience OR creator OR recipient)
-- ---------------------------------------------------------------------------------------------
create or replace function private.can_view_signal(sid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.signals s
    where s.id = sid
      and private.is_member(s.household_id)
      and (
        s.audience = 'household'
        or s.created_by = (select auth.uid())
        or exists (
          select 1 from public.signal_recipients r
          where r.signal_id = s.id and r.user_id = (select auth.uid())
        )
      )
  );
$$;
grant execute on function private.can_view_signal(uuid) to authenticated;

-- Allowed one-tap responses per kind (validated server-side).
create or replace function private.allowed_responses(k public.signal_kind)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case k
    when 'food'      then array['in', 'save_me', 'not_tonight']
    when 'leftovers' then array['claimed']
    when 'run'       then array['coming', 'grab_me', 'all_good']
    when 'reset'     then array['handle_it', 'together', 'later']
    when 'spark'     then array['in', 'maybe', 'cant']
    when 'return'    then array['got_it']
    when 'quiet'     then array['sounds_good', 'adjust', 'discuss']
    else array[]::text[]
  end;
$$;

-- ---------------------------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------------------------
alter table public.signals enable row level security;
alter table public.signal_recipients enable row level security;
alter table public.signal_responses enable row level security;
alter table public.signal_comments enable row level security;
alter table public.food_details enable row level security;
alter table public.runs enable row level security;
alter table public.run_items enable row level security;
alter table public.space_windows enable row level security;
alter table public.space_window_approvals enable row level security;
alter table public.resets enable row level security;
alter table public.reset_tasks enable row level security;
alter table public.sparks enable row level security;
alter table public.events enable row level security;

create policy signals_select on public.signals for select to authenticated
  using (
    private.is_member(household_id)
    and (
      audience = 'household'
      or created_by = (select auth.uid())
      or exists (
        select 1 from public.signal_recipients r
        where r.signal_id = signals.id and r.user_id = (select auth.uid())
      )
    )
  );

create policy signal_recipients_select on public.signal_recipients for select to authenticated
  using (private.can_view_signal(signal_id));
create policy signal_responses_select on public.signal_responses for select to authenticated
  using (private.can_view_signal(signal_id));
create policy signal_comments_select on public.signal_comments for select to authenticated
  using (private.can_view_signal(signal_id));
create policy food_details_select on public.food_details for select to authenticated
  using (private.can_view_signal(signal_id));
create policy runs_select on public.runs for select to authenticated
  using (private.can_view_signal(signal_id));
create policy run_items_select on public.run_items for select to authenticated
  using (private.can_view_signal(signal_id));
create policy space_windows_select on public.space_windows for select to authenticated
  using (private.can_view_signal(signal_id));
create policy space_window_approvals_select on public.space_window_approvals for select to authenticated
  using (private.can_view_signal(signal_id));
create policy resets_select on public.resets for select to authenticated
  using (private.can_view_signal(signal_id));
create policy reset_tasks_select on public.reset_tasks for select to authenticated
  using (private.can_view_signal(signal_id));
create policy sparks_select on public.sparks for select to authenticated
  using (private.can_view_signal(signal_id));
create policy events_select on public.events for select to authenticated
  using (
    private.is_member(household_id)
    and (signal_id is null or private.can_view_signal(signal_id))
  );

revoke insert, update, delete on public.signals, public.signal_recipients, public.signal_responses,
  public.signal_comments, public.food_details, public.runs, public.run_items, public.space_windows,
  public.space_window_approvals, public.resets, public.reset_tasks, public.sparks, public.events
  from anon, authenticated;
