# HomePulse — Product Architecture (Phase 1)

> Working name. Trademark and name availability must be verified before launch.
> Tagline: *Living together, made easier.*

## 1. Concept

HomePulse is a private coordination layer for a shared home. Its core unit is the **Signal**: a short,
structured update ("I'm making tacos at 7", "Can I have the living room 7–8?") with a purpose, a
time, one-tap responses, and a lifecycle that ends on its own. A Signal replaces the group-chat
message thread that usually follows such updates.

### What makes it different

| Differentiator | Why it matters |
| --- | --- |
| **Signals, not messages.** Each Signal kind has its own response vocabulary (*I'm in / Save me some / Not tonight*) and its own end state. | Common situations are settled in one or two taps, with no thread to scroll back through. |
| **The fuse.** Every Signal card shows a thin line that burns down until the Signal expires. | Stale items clear themselves. A dashboard of "now" never fills up with history. |
| **Consent-first spaces.** A Space Window only becomes *agreed* after every required housemate approves it. The database enforces that agreed windows can't overlap. | Nobody can book someone out of the living room. Conflicts show up before they turn into arguments. |
| **Positive-first cleaning.** A cleaning Signal is a short, joinable *Reset* with claimable tasks. Rotations are private and have no rankings. | Cleaning becomes something people do together, not a scoreboard. |
| **Lit windows, not location.** Housemates appear as "windows" that light up only when they choose to share a status. A dim window gives nothing away. | Presence without surveillance, and no GPS. |
| **Sparks.** Spontaneous plans become calendar plans once enough people join. Declining sends no notification. | Fewer people feel left out, and saying no costs nothing. |

## 2. The five highest-value problems

1. **"Who wants food?"** Cooking for others, food runs and grocery requests come up every day and are
   positive. They're the habit loop that brings people back to the app (Food, Leftovers, Runs).
2. **Shared-space collisions.** Interviews, calls, dates and guests in the one living room (Space Windows).
3. **Chores without nagging.** Trash and dishes rotate fairly, with private reminders and no public
   blame (Responsibilities, Resets).
4. **Plans that leave people out.** Spontaneous plans happen in DMs and some housemates never hear
   about them (Sparks).
5. **Not knowing who's around or what someone needs.** Late returns and exam-night quiet requests
   (Status, Quiet and Return Signals).

## 3. Personas

- **Maya, 20, a sophomore in a 4-person campus suite.** Wants dinner company and fewer awkward chats.
  Uses the app mostly for food and Sparks, and doesn't want her location tracked.
- **Jordan, 24, a grad student in a 3-bedroom off-campus apartment.** Takes interview calls, needs quiet
  before exams and shares grocery runs. Uses Space Windows, Quiet Signals and Runs.
- **Priya, 27, a young professional in a 6-person house share.** At this size, coordination needs some
  structure: fair rotations, a shared calendar and new housemates joining midyear.
- **Anti-persona: the landlord or RA who wants oversight.** Explicitly *not* served. Staff layers can
  never read private household data (see `03-architecture.md`).

## 4. Core journeys (MVP)

| # | Journey | Taps target |
| --- | --- | --- |
| J1 | Install, then sign in with an email code, set a name and color, then create or join a home | < 90 s |
| J2 | Announce cooking and see the portion count | ≤ 3 taps, < 10 s |
| J3 | Announce a run, housemates add items, runner accepts or declines and completes it (Scenario A) | ≤ 4 taps per person |
| J4 | Request the living room, resolve a conflict and reach an agreed window (Scenario B) | ≤ 5 taps |
| J5 | Get a trash reminder, mark it done, rotation advances (Scenario D) | 1 tap |
| J6 | Start a Spark; it becomes a plan on the calendar (Scenario E) | ≤ 3 taps |
| J7 | Share "Home around 10", it expires, can be hidden anytime (Scenario F) | ≤ 2 taps |

## 5. MVP scope

**In v1 (built in this repository):**

1. Email-code authentication and onboarding
2. Create a home, or join one by QR code, link or code (invites expire, are rate-limited and can be regenerated)
3. Private household membership with owner and member roles
4. Home dashboard: lit windows, active Signals, "later today", and an opportunity hint
5. Signals: Food, Leftovers, Run, Space, Reset (cleaning), Spark (social), Return, Quiet
6. Responses (one per person, safely idempotent), fuse expiry and the full lifecycle
7. Runs: item requests, a cutoff, accept / decline / purchased / unavailable, completion
8. Space Windows: conflict detection, alternative times, approvals, counter-proposals, agreed windows
9. Responsibilities: rotation, private reminders, completion history, swap requests
10. Sparks become plans when the threshold is met; plans appear on the shared calendar
11. Optional status: visibility (household, selected people, hidden) plus expiry; can be turned off entirely
12. In-app inbox, push notifications and per-category preferences with quiet hours
13. Privacy controls, leaving a household, account deletion, and an in-app feedback form

**Postponed, with reasons:**

| Feature | Target | Why it waits |
| --- | --- | --- |
| Laundry Queue | v1.1 | Only useful in homes with shared machines. Needs per-machine state, and we won't fake machine detection. |
| House Handoffs | v1.1 | Fits naturally as a new Signal kind once the core vocabulary has been tested with real users. |
| Household Issues + landlord hand-off | v1.1 | The tracking-vs-official-submission boundary needs careful UX. Safety issues must never depend on the app. |
| Recurring Resets, guest templates | v1.1 | Extensions of shipped primitives. |
| House Constitution (versioned agreements) | v1.2 | Needs proposal, voting and versioning UX. The rule that a majority can't override privacy needs design work. |
| House Digest | v1.2 | Worth adding once there's enough activity to summarize. Risk of notification fatigue. |
| Shared food inventory and expiry | v2 | High data-entry burden, low pilot value. |
| Smart Suggestions | v2 | Needs weeks of opt-in pattern history. Will use transparent rules, not ML. |
| Layer 2 (building) and Layer 3 (institution) | v2+ | Needs identity verification, moderation, blocking and reporting first. The schema already reserves the boundary. |

*One-Tap House Mood* is folded into status options ("Up to hang out", "Quiet night", "Focus mode").
A light version of the *Opportunity Window* ships in v1: a client-side rule that only reads statuses
people have explicitly shared.

## 6. Information architecture

```
Tab bar:  Home  ·  Explore  ·  [ ● Signal ]  ·  House  ·  Inbox
Header:   home name (switcher) ··················· your avatar → Profile
```

- **Home:** lit windows (status strip), Now (active Signals), Later today, House needs (your next chore), opportunity hint
- **Explore:** Sparks, the upcoming shared calendar (plans, agreed space windows, dinners)
- **Signal (center):** the compose sheet. Pick a kind, use smart defaults, send. Reachable from every tab.
- **House:** responsibilities, spaces, members and invites, household settings
- **Inbox:** requests that need your answer first (approvals, swaps), then updates
- **Profile** (opened from your avatar): status, privacy, notifications, households, account, feedback

**Tradeoff:** the brief lists five destinations *plus* a prominent Signal control. Six tab-bar items
is too crowded for one-handed use. Profile moves to the avatar button in the header, a familiar
pattern, which frees the center slot for the Signal action.

### Screen inventory

1. Welcome / onboarding (value props, sign-in with code)
2. Profile setup (name, color)
3. Create or join a home (create, join by code or deep link)
4. Home dashboard
5. Compose Signal (kind picker plus kind-specific forms)
6. Signal detail, one shared screen with kind panels: Food / Leftovers, Run, Space Window, Reset, Spark, Return / Quiet
7. Responsibilities (list, new, detail with history and swap)
8. Shared calendar (within Explore)
9. Inbox
10. House: spaces, members, invite (QR, link, code), household settings
11. Profile: status, privacy, notifications, account (leave, delete), feedback

Each list screen has empty, loading, error, and success states. Approvals and Space Windows also have conflict states.

## 7. Measurable launch criteria (pilot: 10–20 households, 4 weeks)

| Metric | Target | Source |
| --- | --- | --- |
| Activation: ≥ 2 members joined within 48 h of home creation | ≥ 70 % of homes | `analytics.household_activation()` |
| Signals that get ≥ 1 response within 2 h | ≥ 60 % | `analytics.signal_response_rate()` |
| Weekly active households (≥ 2 active members) in week 4 | ≥ 50 % of activated | `analytics.weekly_active_households()` |
| Runs completed (not canceled or expired) | ≥ 60 % | `analytics.run_completion()` |
| Space requests that end agreed or withdrawn (not left pending) | ≥ 80 % | `analytics.space_resolution()` |
| Push opt-out rate | < 20 % of members | `analytics.notification_opt_out()` |
| Median time to compose a Signal | < 10 s | Moderated pilot sessions (not tracked in-app) |
| Cross-household data exposure | 0, proven by tests | `supabase/tests/privacy.test.ts` |
| Participants who say group-chat friction went down | ≥ 60 % | End-of-pilot survey |

## 8. Major tradeoffs

- **Writes go through RPCs, reads go through row-level security.** Every state change (respond,
  approve, complete) is a vetted Postgres function, so each change is checked and atomic. This costs
  some flexibility on the client, but authorization lives in one place, on the server.
- **Fixed Signal kinds, not free-form "templates".** A fixed set means the database can validate
  responses per kind and each card can have a purpose-built design. Custom kinds may come later.
- **No location, no inference.** We give up "auto-home" convenience in exchange for trust.
  Availability is only ever what someone typed or tapped.
- **Aggregate SQL analytics, no client tracking SDK.** Metrics come from the product's own tables at
  household level. No third-party trackers, no per-user event stream.
- **Email codes instead of passwords or social login.** The lowest-friction way to sign in that's
  still secure for a pilot. Apple and Google sign-in can be added before App Store launch (see the
  store checklist).
