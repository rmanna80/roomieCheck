-- House Pulse (voluntary status), Responsibilities (chores + rotation), Notifications.

-- ---------------------------------------------------------------------------------------------
-- Status: voluntary, approximate, always expiring. No location. "Hidden" = no row at all.
-- ---------------------------------------------------------------------------------------------
create type public.status_kind as enum (
  'home', 'out', 'on_my_way', 'home_later', 'busy', 'studying', 'available', 'dnd',
  'quiet_night', 'focus', 'custom'
);
create type public.status_visibility as enum ('household', 'selected');

create table public.member_statuses (
  household_id uuid not null,
  user_id      uuid not null,
  status       public.status_kind not null,
  label        text check (char_length(label) <= 40),
  eta_at       timestamptz,
  expires_at   timestamptz not null,
  visibility   public.status_visibility not null default 'household',
  updated_at   timestamptz not null default now(),
  primary key (household_id, user_id),
  foreign key (household_id, user_id)
    references public.household_members (household_id, user_id) on delete cascade,
  check (status <> 'custom' or char_length(btrim(coalesce(label, ''))) > 0)
);

create table public.status_viewers (
  household_id uuid not null,
  user_id      uuid not null,
  viewer_id    uuid not null references public.profiles (id) on delete cascade,
  primary key (household_id, user_id, viewer_id),
  foreign key (household_id, user_id)
    references public.member_statuses (household_id, user_id) on delete cascade
);

-- ---------------------------------------------------------------------------------------------
-- Responsibilities. Due dates are household-local calendar dates (households.time_zone).
-- rotation_anchor_id = whose turn it is in rotation order. assignee_id is who will actually do
-- it: usually the same person, but it differs when someone outside the rotation covers a turn
-- (the rotation then continues from the anchor, so nobody's place in line changes).
-- ---------------------------------------------------------------------------------------------
create table public.chores (
  id                 uuid primary key default gen_random_uuid(),
  household_id       uuid not null references public.households (id) on delete cascade,
  title              text not null check (char_length(btrim(title)) between 1 and 40),
  icon               text not null default 'trash'
                     check (icon in ('trash', 'recycle', 'dishes', 'bathroom', 'vacuum', 'kitchen',
                                     'supplies', 'pet', 'plants', 'laundry', 'other')),
  cadence_days       smallint not null check (cadence_days in (1, 2, 3, 7, 14, 30)),
  next_due_on        date not null,
  assignee_id        uuid references public.profiles (id) on delete set null,
  rotation_anchor_id uuid references public.profiles (id) on delete set null,
  reminded_on        date,
  created_by         uuid references public.profiles (id) on delete set null,
  archived_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index chores_household_idx on public.chores (household_id) where archived_at is null;
create index chores_assignee_idx on public.chores (assignee_id) where archived_at is null;
create trigger chores_touch before update on public.chores
  for each row execute function private.touch_updated_at();

create table public.chore_rotation (
  chore_id     uuid not null references public.chores (id) on delete cascade,
  household_id uuid not null,
  user_id      uuid not null,
  position     smallint not null,
  primary key (chore_id, user_id),
  foreign key (household_id, user_id)
    references public.household_members (household_id, user_id) on delete cascade
);
create index chore_rotation_order_idx on public.chore_rotation (chore_id, position);

create table public.chore_completions (
  id           uuid primary key default gen_random_uuid(),
  chore_id     uuid not null references public.chores (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  completed_by uuid references public.profiles (id) on delete set null,
  due_on       date not null,
  completed_at timestamptz not null default now(),
  unique (chore_id, due_on)
);
create index chore_completions_chore_idx on public.chore_completions (chore_id, completed_at desc);

create type public.swap_status as enum ('pending', 'accepted', 'declined', 'canceled');

create table public.chore_swaps (
  id           uuid primary key default gen_random_uuid(),
  chore_id     uuid not null references public.chores (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  from_user    uuid not null references public.profiles (id) on delete cascade,
  to_user      uuid not null references public.profiles (id) on delete cascade,
  due_on       date not null,
  status       public.swap_status not null default 'pending',
  created_at   timestamptz not null default now(),
  decided_at   timestamptz,
  check (from_user <> to_user)
);
create unique index chore_swaps_one_pending_idx on public.chore_swaps (chore_id, due_on) where status = 'pending';

-- ---------------------------------------------------------------------------------------------
-- Notifications (in-app inbox; `push` marks whether the push sender should deliver it)
-- ---------------------------------------------------------------------------------------------
create type public.notification_category as enum (
  'food', 'runs', 'spaces', 'sparks', 'resets', 'updates', 'chores', 'responses', 'requests', 'household'
);

create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  household_id uuid references public.households (id) on delete cascade,
  category     public.notification_category not null,
  signal_id    uuid references public.signals (id) on delete cascade,
  chore_id     uuid references public.chores (id) on delete cascade,
  title        text not null check (char_length(title) <= 120),
  body         text check (char_length(body) <= 240),
  actionable   boolean not null default false,
  push         boolean not null default false,
  created_at   timestamptz not null default now(),
  read_at      timestamptz,
  push_sent_at timestamptz
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_push_queue_idx on public.notifications (created_at) where push and push_sent_at is null;

-- Creates a notification for one user, honoring their preferences.
--   * Muted categories create nothing — except actionable requests (approvals, swaps), which
--     always reach the inbox because someone is waiting on an answer.
--   * Push is only flagged if push is enabled and the category is on; quiet hours are applied
--     by the push sender at delivery time (it knows the user's time zone).
create or replace function private.notify(
  p_user uuid,
  p_household uuid,
  p_category public.notification_category,
  p_title text,
  p_body text default null,
  p_signal uuid default null,
  p_chore uuid default null,
  p_actionable boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  prefs public.notification_preferences;
  category_on boolean;
begin
  if p_user is null or p_user = auth.uid() then
    return; -- never notify yourself about your own action
  end if;

  select * into prefs from public.notification_preferences where user_id = p_user;

  category_on := case p_category
    when 'food' then coalesce(prefs.food, true)
    when 'runs' then coalesce(prefs.runs, true)
    when 'spaces' then coalesce(prefs.spaces, true)
    when 'sparks' then coalesce(prefs.sparks, true)
    when 'resets' then coalesce(prefs.resets, true)
    when 'updates' then coalesce(prefs.updates, true)
    when 'chores' then coalesce(prefs.chores, true)
    when 'responses' then coalesce(prefs.responses, true)
    else true
  end;

  if not category_on and not p_actionable then
    return;
  end if;

  insert into public.notifications (user_id, household_id, category, signal_id, chore_id, title, body, actionable, push)
  values (
    p_user, p_household, p_category, p_signal, p_chore,
    left(p_title, 120), left(p_body, 240), p_actionable,
    coalesce(prefs.push_enabled, true) and category_on
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------------------------
alter table public.member_statuses enable row level security;
alter table public.status_viewers enable row level security;
alter table public.chores enable row level security;
alter table public.chore_rotation enable row level security;
alter table public.chore_completions enable row level security;
alter table public.chore_swaps enable row level security;
alter table public.notifications enable row level security;

-- Checked via a definer function so the viewer list itself stays private to the status owner.
create or replace function private.is_status_viewer(hid uuid, owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.status_viewers v
    where v.household_id = hid and v.user_id = owner and v.viewer_id = (select auth.uid())
  );
$$;
grant execute on function private.is_status_viewer(uuid, uuid) to authenticated;

-- A status is visible to its owner always; to others only while unexpired, only inside the
-- household, and only if shared with the whole household or with them specifically.
create policy member_statuses_select on public.member_statuses for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      expires_at > now()
      and private.is_member(household_id)
      and (visibility = 'household' or private.is_status_viewer(household_id, user_id))
    )
  );

-- Only the status owner sees who they shared with.
create policy status_viewers_select on public.status_viewers for select to authenticated
  using (user_id = (select auth.uid()));

create policy chores_select on public.chores for select to authenticated
  using (private.is_member(household_id));
create policy chore_rotation_select on public.chore_rotation for select to authenticated
  using (private.is_member(household_id));
create policy chore_completions_select on public.chore_completions for select to authenticated
  using (private.is_member(household_id));
-- Swaps are between two people; the rest of the house doesn't need to see the negotiation.
create policy chore_swaps_select on public.chore_swaps for select to authenticated
  using (
    private.is_member(household_id)
    and (from_user = (select auth.uid()) or to_user = (select auth.uid()))
  );

create policy notifications_select_own on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update, delete on public.member_statuses, public.status_viewers, public.chores,
  public.chore_rotation, public.chore_completions, public.chore_swaps, public.notifications
  from anon, authenticated;
