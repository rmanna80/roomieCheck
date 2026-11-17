# Testing

## How to run

```bash
npm run typecheck   # strict TypeScript across app, tests, and shared function code
npm run lint        # ESLint (eslint-config-expo, incl. React Compiler rules)
npm run test:unit   # node:test via tsx, no device needed
npm run test:db     # needs PostgreSQL 15+, see README
```

## Results at the time of writing

| Suite | Tests | Result |
| --- | --- | --- |
| `test:unit`: time, space slots, chores, signals, opportunity window, errors, push policy | 27 | 27 pass |
| `test:db`: 7 files, run twice in parallel mode to check for flakiness | 64 | 64 pass |
| `typecheck` | — | clean |
| `lint` | — | clean |
| Metro export: iOS, Android, web | — | builds |
| Web render (Chrome, light and dark): welcome, sign-in, design preview | — | no console errors |

## What the database tests prove

Every test runs as the `authenticated` role with JWT claims set, exactly like PostgREST, so RLS
applies and the tests can't bypass policies.

| Required scenario / area | Where |
| --- | --- |
| A — Grocery run (2 requests, accept one, decline one, complete, Signal closes) | `runs.test.ts` |
| B — Need privacy (conflict detected, alternative time, approvals, agreed window) | `spaces.test.ts` |
| C — Dinner (3 responses, portion count, expires after dinner) | `signals.test.ts` |
| D — Trash (private reminder, complete, next in rotation) | `chores.test.ts` |
| E — Movie night (2 join, 1 declines silently, plan on the calendar) | `sparks-status-notifications.test.ts` |
| F — Home status (authorized viewers only, expiry, hide, sharing off) | `sparks-status-notifications.test.ts` |
| G — Household privacy (B's Signal invisible and untouchable from A, on every table) | `privacy.test.ts` |
| Invitations (normalization, expiry, regeneration, use caps, brute-force throttle, 16-member cap) | `households.test.ts` |
| Departure and deletion (owner promotion, last member deletes the home, cleanup, cascade) | `households.test.ts` |
| Duplicate actions (double-tap responses, double completion, duplicate run decisions) | `signals`, `chores`, `runs` |
| Concurrency (last leftover portion, reset task claim, simultaneous approvals, concurrent completion) | `signals`, `spaces`, `chores` |
| Notification preferences (muting, actionable always delivered, push flag), push token ownership | `sparks-status-notifications.test.ts` |
| No public shaming (no score/rank/streak columns, declines never notify, swaps private) | several |

## Not covered yet

- On-device UI tests. Candidates for a later round: Maestro flows for J1–J7, or React Native Testing Library.
- PostgREST/Realtime/Edge Function integration against a hosted project. Do the manual checklist in `docs/06-pilot.md`.
- Offline/interrupted requests are handled by TanStack Query retries, optimistic rollback and error
  toasts, but haven't been exercised on a flaky network yet.
