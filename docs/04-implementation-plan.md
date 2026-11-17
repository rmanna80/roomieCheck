# Implementation plan & status

Each milestone was validated before the next started. "Validated" means the stated check actually
ran and passed in this repository. Nothing below is marked done on the strength of code that
merely exists.

| # | Milestone | Validation | Status |
| --- | --- | --- | --- |
| M0 | Product architecture & design system docs | Reviewed against the brief. Color contrast computed for every token pair. | ✅ |
| M1 | Database: schema, RLS, RPCs, jobs, analytics | 8 migrations apply cleanly to a fresh PostgreSQL 16. 64 database tests pass (scenarios A–G, privacy, concurrency). | ✅ |
| M2 | App foundation: tokens, components, Supabase client, secure session storage, providers, routing guards | `tsc --noEmit` and ESLint clean | ✅ |
| M3 | Auth & onboarding: email code, profile, create/join home (QR, link, code) | Typecheck. Rendered the welcome and sign-in flow in a browser build. | ✅ (auth not exercised against a live Supabase project) |
| M4 | Signals: compose (8 kinds), cards, detail panels, responses, expiry | DB scenarios A, B, C, E. Unit tests for summaries and fuse. Visual review in light and dark. | ✅ |
| M5 | Runs, Space Windows, Resets, Leftovers | DB tests incl. concurrent claims and approvals. Slot-suggestion unit tests. | ✅ |
| M6 | Responsibilities & rotation, swaps, reminders | DB scenario D, idempotency, late roll-forward, swap ordering. Unit tests mirror the SQL. | ✅ |
| M7 | Status, notifications, privacy, account exit | DB scenario F, preference muting, deletion cascade. Push quiet-hours unit tests. | ✅ (push delivery not tested end to end) |
| M8 | Build verification | Metro bundles for iOS, Android and web build. Web render shows no console errors. | ✅ |
| M9 | Pilot readiness docs | `docs/06-pilot.md` | ✅ |

## Known gaps (honest list)

- **Not yet run on a physical device or simulator.** This environment had no simulator. The app
  was typechecked, linted, bundled for iOS and Android, and rendered as a web build. The first
  on-device pass should go through the checklist in `docs/06-pilot.md`.
- **Not yet run against a hosted Supabase project.** Migrations and policies were tested on plain
  PostgreSQL 16 with a Supabase auth shim. PostgREST embedding (`select('*, runs(*)…')`),
  Realtime, and the Edge Functions need a smoke test on a real project.
- **Edge Functions** (`send-push`, `delete-account`) are written for Deno and not executed here.
  Their pure policy logic is unit-tested.
- **App icon and splash** are still Expo placeholders.
- **Sign in with Apple / Google** isn't implemented. Apple requires it if any third-party login is
  added, and email codes alone are fine for the pilot.

## Next milestones

1. Link a Supabase dev project. Run `supabase db push`, configure the email template, and smoke-test
   all 7 scenarios on two phones.
2. Development build plus push: run `eas init`, build, deploy the functions, add the webhook, and
   verify quiet hours on a device.
3. Replace the icon and splash, add an in-app onboarding tour of Signals (three cards, skippable).
4. Pilot with 10–20 households (`docs/06-pilot.md`).
