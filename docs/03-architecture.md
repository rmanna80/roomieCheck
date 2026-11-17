# HomePulse — Technical Architecture

## 1. Shape of the system

```
┌──────────────── Expo app (React Native, TypeScript) ────────────────┐
│ Expo Router screens → feature hooks (TanStack Query) → lib/api.ts    │
│ Session in SecureStore (chunked) · Realtime → query invalidation     │
└───────────────┬───────────────────────────────┬─────────────────────┘
                │ reads: PostgREST + RLS         │ writes: RPC (SECURITY DEFINER)
┌───────────────▼───────────────────────────────▼─────────────────────┐
│ Supabase Postgres                                                   │
│  public   tables (RLS on every one) + RPC functions                 │
│  private  policy helpers, triggers, jobs (not exposed by the API)   │
│  analytics aggregate-only functions (service role only)             │
│  pg_cron  expire_signals (1 min) · queue_chore_reminders (15 min)   │
└───────────────┬─────────────────────────────────────────────────────┘
                │ notifications rows with push = true
┌───────────────▼──────────────────┐   ┌──────────────────────────────┐
│ Edge Function: send-push          │   │ Edge Function: delete-account │
│ quiet hours → Expo Push API       │   │ verifies JWT → admin delete   │
└───────────────────────────────────┘   └──────────────────────────────┘
```

No microservices. One database, two small Edge Functions for the things that need the service role.

## 2. Authorization model

| Concern | Mechanism |
| --- | --- |
| Who can **read** a row | RLS policies. Household-scoped via `private.is_member(household_id)`. Signal children via `private.can_view_signal(signal_id)`, which also applies the audience (household or selected people). |
| Who can **write** | `SECURITY DEFINER` RPCs in `public`. Each one checks membership, role, ownership and state explicitly, then writes atomically. Direct `INSERT/UPDATE/DELETE` is revoked except: own profile (column-restricted), own notification preferences (column-restricted), and feedback insert. |
| Helpers | Live in `private`, which PostgREST doesn't expose. Only the five helpers that policies reference are executable by `authenticated`. |
| Anonymous | No policies and no function grants. Anonymous requests can see nothing and call nothing. |
| Service role | Used only by Edge Functions on the server. Never shipped in the app. |

Every boundary is tested in `supabase/tests/privacy.test.ts` (Scenario G): cross-household reads
on 17 tables, tampered RPC arguments, direct writes, anonymous access, private helpers, analytics,
the owner-only audit log, and closed Layer 2 tables.

### Critical boundary: institutions (Layer 2 and 3)

`buildings` and `building_memberships` exist but have RLS enabled and **no policies**. They have no
foreign keys into household data. Every household policy requires *household membership*, and a
staff role can't grant that, so a future landlord or RA role cannot read Signals, statuses,
availability or discussions. Institutional features (announcements, events) will live in their
own tables and be read *into* the app, never the other way round.

## 3. Data model

```
profiles ─┬─ user_settings (private)          households ─┬─ household_members (role)
          ├─ notification_preferences         │           ├─ household_invites (code, ttl, uses)
          └─ push_tokens                      │           ├─ spaces (shared rooms only)
                                              │           ├─ household_audit_log (owners)
signals (envelope: kind, status, audience, starts_at, expires_at)
  ├─ signal_recipients        (audience = selected)
  ├─ signal_responses         (PK signal+user → idempotent)
  ├─ signal_comments          (follow-up discussion)
  ├─ food_details             (food, leftovers: portions_total, location)
  ├─ runs ── run_items        (requested → accepted/declined → purchased/unavailable)
  ├─ space_windows ── space_window_approvals   (EXCLUDE agreed overlaps)
  ├─ resets ── reset_tasks    (atomic claim)
  └─ sparks ── events         (calendar; RSVPs = the Spark's responses)
member_statuses ── status_viewers   (expire; "hidden" = no row)
chores ─┬─ chore_rotation (position) ─ chore_completions (unique per due date) ─ chore_swaps
notifications (inbox; push flag; actionable)
buildings, building_memberships (reserved, closed)
analytics.* (functions only)
```

Conventions:
- All times are `timestamptz` (UTC). Chore due dates are **household-local** `date`s, computed
  from `households.time_zone`. The app shows times in the viewer's zone (`profiles.time_zone`).
- Child tables carry a denormalized `household_id` so Realtime can filter per household and RLS
  stays cheap. RPCs set it, so clients never supply it.
- Deleting an account cascades from `auth.users`. A trigger on `household_members` cleans up after
  any departure: it promotes a new owner, cancels the person's open Signals, releases their
  approvals (re-evaluating windows), rotates their chores to the next person, and deletes the
  household if they were the last member.

## 4. Concurrency

| Race | Guard |
| --- | --- |
| Two agreed windows overlapping | `EXCLUDE USING gist (space_id =, tstzrange &&) WHERE state = 'agreed'`. The losing approval gets `space_taken`. |
| Last leftover portion | `SELECT … FOR UPDATE` on `food_details`, then capacity check |
| Reset task claimed twice | Conditional `UPDATE … WHERE claimed_by IS NULL` |
| Double-tap responses | Primary key `(signal_id, user_id)` + upsert |
| Chore completed twice | Row lock + the caller's `p_due_on` must match. Otherwise returns `already_done` without changing anything. `UNIQUE (chore_id, due_on)` as a backstop. |
| Invite use count | Row lock on the invite during join |
| Spark threshold | Signal row lock, then a single event insert (`ON CONFLICT DO NOTHING`) |

Every case above has a test that fires the competing calls concurrently.

## 5. Signal lifecycle

```
            create                       respond / approve                  expiry job or creator
 spark ───► proposed ──(enough in)──► active (plan + event) ──► expired | resolved | canceled
 space ───► proposed ──(all approve)─► active (agreed)      ──► expired | canceled (withdrawn)
 others ──► active ─────────────────────────────────────────► expired | resolved | canceled
```

Every Signal has `expires_at` (its fuse). The `expire_signals` job flips status every minute. The
client also treats `expires_at < now` as expired, so the UI never depends on job timing.

## 6. Notifications pipeline

1. RPCs call `private.notify(user, …)`, which never notifies the actor and honors per-category
   mutes. *Actionable* requests (approvals, swaps) always reach the inbox.
2. The row's `push` flag is true only if push is enabled and the category is on.
3. The `send-push` Edge Function (Database Webhook on insert, or a cron sweep) applies the user's
   quiet hours in their time zone and sends through the Expo Push API.
4. Declines never notify. Chore reminders go only to the person whose turn it is. Nothing
   broadcasts who hasn't done something.

## 7. Client architecture

- **Routing:** Expo Router with `Stack.Protected` guards: `(auth)` → `(onboarding)` → `(app)`.
- **Server state:** TanStack Query. Query keys are household-scoped. A single Realtime channel per
  household invalidates the affected keys.
- **Optimistic updates:** responses, task claims and run-item decisions update instantly and roll
  back on error, with a toast. Space approvals and household changes are *not* optimistic because
  the server decides the outcome.
- **Session storage:** `expo-secure-store`, chunked so tokens over the 2 KB SecureStore limit still fit.
- **Errors:** server codes (`space_taken`, `run_closed`, …) map to friendly copy in `src/lib/errors.ts`.
- **Time:** `src/lib/time.ts` (formatting in the viewer's zone, smart time chips) and
  `src/lib/spaces.ts` (alternative-slot finder) are pure and unit-tested.

## 8. Architecture decisions (ADR summary)

| # | Decision | Alternatives | Why |
| --- | --- | --- | --- |
| 1 | RLS for reads, definer RPCs for writes | RLS write policies everywhere | Write rules depend on state (open? approver? cutoff passed?). Expressing them as policies is error-prone, while functions are explicit and testable. |
| 2 | Signal envelope + per-kind detail tables | One table with JSON `details` | Typed columns, constraints, and FKs (spaces, items). JSON only crosses the RPC boundary. |
| 3 | Fixed Signal kinds | User-defined templates | Responses can be validated per kind, cards can be purpose-built, and the analytics stay meaningful. |
| 4 | Exclusion constraint for agreed windows | App-level checks | Correct under any concurrency, with zero application locking. |
| 5 | Spark RSVPs = Signal responses | Separate `event_rsvps` | One source of truth; no sync bugs. Manual (non-Spark) events with RSVPs can be added later. |
| 6 | Email one-time code auth | Magic links, passwords, OAuth | No deep-link round trip, no passwords to leak. Apple and Google sign-in are planned before the store launch. |
| 7 | SQL aggregate analytics | Client analytics SDK | No third-party tracking and nothing per user. Pilot metrics come straight from product tables. |
| 8 | Plain-Postgres test harness with a Supabase shim | Supabase CLI (Docker) | Runs anywhere Postgres runs (including Windows without Docker). It exercises the real migrations and RLS as the `authenticated` role. |

**Conventions for future migrations:** create new `SECURITY DEFINER` functions with
`set search_path = ''` and fully qualified names. Revoke `execute` from `public` and `anon` (the
platform's default privileges grant it). Add a test to `privacy.test.ts` for any new table.
