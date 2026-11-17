-- HomePulse foundation: extensions, private schema, profiles, households, membership, invites,
-- spaces, settings, audit log, feedback, and reserved (inactive) Layer 2 tables.
--
-- Security model (see docs/03-architecture.md):
--   * Reads  → Row-Level Security policies on every table (household-scoped).
--   * Writes → SECURITY DEFINER functions in `public` with explicit authorization checks.
--     Direct INSERT/UPDATE/DELETE is only granted where noted (own profile, own preferences,
--     feedback). Everything else has no write policy and is therefore denied.
--   * Helpers used by policies live in the `private` schema, which PostgREST does not expose.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists btree_gist with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------------------------
create type public.member_role as enum ('owner', 'member');
create type public.space_kind as enum ('living', 'kitchen', 'dining', 'laundry', 'bathroom', 'study', 'outdoor', 'other');

-- ---------------------------------------------------------------------------------------------
-- Utility triggers
-- ---------------------------------------------------------------------------------------------
create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.is_valid_time_zone(tz text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from pg_catalog.pg_timezone_names where name = tz);
$$;

-- ---------------------------------------------------------------------------------------------
-- Profiles (public-within-household identity; email stays in auth.users)
-- ---------------------------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 40),
  color        text not null default 'ember'
               check (color in ('ember', 'saffron', 'sage', 'plum', 'teal', 'coral', 'dusk', 'slate')),
  time_zone    text not null default 'UTC' check (char_length(time_zone) <= 64),
  onboarded_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

-- Private per-user settings (never visible to housemates)
create table public.user_settings (
  user_id                uuid primary key references public.profiles (id) on delete cascade,
  status_sharing_enabled boolean not null default true,
  updated_at             timestamptz not null default now()
);
create trigger user_settings_touch before update on public.user_settings
  for each row execute function private.touch_updated_at();

create table public.notification_preferences (
  user_id           uuid primary key references public.profiles (id) on delete cascade,
  push_enabled      boolean not null default true,
  food              boolean not null default true,
  runs              boolean not null default true,
  spaces            boolean not null default true,
  sparks            boolean not null default true,
  resets            boolean not null default true,
  updates           boolean not null default true,  -- return + quiet signals
  chores            boolean not null default true,
  responses         boolean not null default true,  -- people responding to my signals
  quiet_hours_start time,
  quiet_hours_end   time,
  updated_at        timestamptz not null default now(),
  check ((quiet_hours_start is null) = (quiet_hours_end is null))
);
create trigger notification_preferences_touch before update on public.notification_preferences
  for each row execute function private.touch_updated_at();

create table public.push_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  token        text not null unique check (char_length(token) between 10 and 255),
  platform     text not null check (platform in ('ios', 'android', 'web')),
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index push_tokens_user_idx on public.push_tokens (user_id);

-- New auth user → profile + settings rows
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 40));
  insert into public.user_settings (user_id) values (new.id);
  insert into public.notification_preferences (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------------------------
-- Layer 2 (buildings / residence halls) — RESERVED. RLS enabled with no policies: no client
-- access until verification, moderation, blocking and reporting exist. Buildings have NO
-- reference into household data; staff roles can never satisfy household membership checks.
-- ---------------------------------------------------------------------------------------------
create table public.buildings (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 80),
  verified_at timestamptz,
  created_at  timestamptz not null default now()
);

create table public.building_memberships (
  building_id uuid not null references public.buildings (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role        text not null check (role in ('resident', 'staff')),
  verified_at timestamptz,
  created_at  timestamptz not null default now(),
  primary key (building_id, user_id)
);

-- ---------------------------------------------------------------------------------------------
-- Households & membership
-- ---------------------------------------------------------------------------------------------
create table public.households (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 40),
  icon       text not null default 'house'
             check (icon in ('house', 'apartment', 'dorm', 'cabin', 'loft', 'tree')),
  theme      text not null default 'porch' check (theme in ('porch', 'garden', 'harbor', 'dusk')),
  time_zone  text not null default 'UTC' check (char_length(time_zone) <= 64),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger households_touch before update on public.households
  for each row execute function private.touch_updated_at();

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  role         public.member_role not null default 'member',
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id)
);
create index household_members_user_idx on public.household_members (user_id);

create table public.household_invites (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  code         text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  created_by   uuid references public.profiles (id) on delete set null,
  expires_at   timestamptz not null,
  max_uses     integer not null default 16 check (max_uses between 1 and 50),  -- = household cap
  use_count    integer not null default 0 check (use_count >= 0),
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index household_invites_household_idx on public.household_invites (household_id);

-- Failed/successful join attempts, for brute-force throttling. Not exposed.
create table private.join_attempts (
  id           bigint generated always as identity primary key,
  user_id      uuid not null,
  succeeded    boolean not null,
  attempted_at timestamptz not null default now()
);
create index join_attempts_user_time_idx on private.join_attempts (user_id, attempted_at desc);

create table public.spaces (
  id                 uuid primary key default gen_random_uuid(),
  household_id       uuid not null references public.households (id) on delete cascade,
  name               text not null check (char_length(btrim(name)) between 1 and 30),
  kind               public.space_kind not null default 'other',
  is_reservable      boolean not null default true,
  requires_agreement boolean not null default true,
  created_by         uuid references public.profiles (id) on delete set null,
  archived_at        timestamptz,
  created_at         timestamptz not null default now()
);
create unique index spaces_household_name_idx on public.spaces (household_id, lower(name)) where archived_at is null;

create table public.household_audit_log (
  id             bigint generated always as identity primary key,
  household_id   uuid not null references public.households (id) on delete cascade,
  actor_id       uuid references public.profiles (id) on delete set null,
  action         text not null,
  target_user_id uuid references public.profiles (id) on delete set null,
  details        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index household_audit_log_household_idx on public.household_audit_log (household_id, created_at desc);

create table public.feedback (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references public.profiles (id) on delete set null default auth.uid(),
  household_id uuid references public.households (id) on delete set null,
  message      text not null check (char_length(btrim(message)) between 1 and 2000),
  app_version  text check (char_length(app_version) <= 40),
  platform     text check (platform in ('ios', 'android', 'web')),
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- Authorization helpers (used inside RLS policies and RPCs)
-- ---------------------------------------------------------------------------------------------
create or replace function private.is_member(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = (select auth.uid())
  );
$$;

create or replace function private.is_owner(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = (select auth.uid()) and m.role = 'owner'
  );
$$;

create or replace function private.is_member_of(hid uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m where m.household_id = hid and m.user_id = uid
  );
$$;

create or replace function private.shares_household(other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members mine
    join public.household_members theirs on theirs.household_id = mine.household_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = other
  );
$$;

-- Raises unless the caller is authenticated; returns the caller id.
create or replace function private.require_user()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  return uid;
end;
$$;

create or replace function private.require_member(hid uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
begin
  if not private.is_member(hid) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  return uid;
end;
$$;

create or replace function private.audit(hid uuid, action text, target uuid, details jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.household_audit_log (household_id, actor_id, action, target_user_id, details)
  values (hid, auth.uid(), action, target, coalesce(details, '{}'::jsonb));
$$;

grant execute on function private.is_member(uuid), private.is_owner(uuid), private.is_member_of(uuid, uuid),
  private.shares_household(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.push_tokens enable row level security;
alter table public.buildings enable row level security;
alter table public.building_memberships enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;
alter table public.spaces enable row level security;
alter table public.household_audit_log enable row level security;
alter table public.feedback enable row level security;

-- Profiles: yourself + people you share a household with.
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.shares_household(id));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke update on public.profiles from authenticated;
grant update (display_name, color, time_zone, onboarded_at) on public.profiles to authenticated;

create policy user_settings_select_own on public.user_settings for select to authenticated
  using (user_id = (select auth.uid()));

create policy notification_preferences_select_own on public.notification_preferences for select to authenticated
  using (user_id = (select auth.uid()));
create policy notification_preferences_update_own on public.notification_preferences for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke update on public.notification_preferences from authenticated;
grant update (push_enabled, food, runs, spaces, sparks, resets, updates, chores, responses,
  quiet_hours_start, quiet_hours_end) on public.notification_preferences to authenticated;

create policy push_tokens_select_own on public.push_tokens for select to authenticated
  using (user_id = (select auth.uid()));

create policy households_select on public.households for select to authenticated
  using (private.is_member(id));

create policy household_members_select on public.household_members for select to authenticated
  using (private.is_member(household_id));

create policy household_invites_select on public.household_invites for select to authenticated
  using (private.is_member(household_id));

create policy spaces_select on public.spaces for select to authenticated
  using (private.is_member(household_id));

create policy household_audit_log_select on public.household_audit_log for select to authenticated
  using (private.is_owner(household_id));

create policy feedback_insert_own on public.feedback for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (household_id is null or private.is_member(household_id))
  );

-- Remove default write privileges the platform grants on public tables, then re-grant the
-- narrow set above. (RLS already denies writes without policies; this is defense in depth.)
revoke insert, delete on public.profiles, public.user_settings, public.notification_preferences,
  public.push_tokens, public.households, public.household_members, public.household_invites,
  public.spaces, public.household_audit_log, public.buildings, public.building_memberships
  from anon, authenticated;
revoke update on public.user_settings, public.push_tokens, public.households, public.household_members,
  public.household_invites, public.spaces, public.household_audit_log, public.buildings,
  public.building_memberships from anon, authenticated;
revoke all on public.feedback from anon;
revoke select, update, delete on public.feedback from authenticated;
