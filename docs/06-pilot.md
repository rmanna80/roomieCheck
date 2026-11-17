# Pilot readiness (10–20 households, 4 weeks)

## 1. Pilot onboarding instructions (send to each household)

> **Welcome to the HomePulse pilot!**
> 1. One person installs the app from the TestFlight / Play test link and taps **Get started**.
> 2. Sign in with your email. You'll get a 6-digit code (check spam the first time).
> 3. Choose **Set up a new home**, name it, and pick which shared spaces housemates can request.
>    Bedrooms are never requestable.
> 4. Go to **House → Invite a housemate** and share the QR code or link. Everyone else picks **Join my home**.
> 5. Try three things this week: tap **Signal** when you cook, when you head to the store, and when
>    you want to do something together.
> 6. Spot something odd? Go to **You → Send feedback**. Your housemates never see it.
>
> Privacy promise: no location, no scores, no ads. Only your housemates see your home, and only what
> you choose. You can export or delete your data any time under **You → Account**.

## 2. Feedback mechanism

- **In-app:** *You → Send feedback* writes to `public.feedback`. Users can insert their own rows and
  nothing else, so housemates can't read it. The team reads it from the Supabase dashboard or via
  `select * from feedback order by created_at desc`.
- **Week 2 and week 4:** a five-question survey (one link per household). Ask whether group-chat
  friction went down, which Signal kind they use most, anything that felt like surveillance or
  pressure, what's missing, and how likely they are to keep using it.

## 3. Analytics definitions (aggregate, service role only)

Run in the SQL editor as the service role. All outputs are household-level counts.

| Metric | Query | Target |
| --- | --- | --- |
| Activation (≥ 2 members within 48 h) | `select * from analytics.household_activation('2026-12-01');` | ≥ 70 % |
| Weekly active households (≥ 2 members acted) | `select * from analytics.weekly_active_households('2026-12-07');` | ≥ 50 % of activated, week 4 |
| Signals with a response within 2 h | `select * from analytics.signal_response_rate('2026-12-01');` | ≥ 60 % |
| Run completion | `select * from analytics.run_completion('2026-12-01');` | ≥ 60 % |
| Space requests resolved | `select * from analytics.space_resolution('2026-12-01');` | ≥ 80 % agreed or withdrawn |
| Sparks that become plans | `select * from analytics.spark_conversion('2026-12-01');` | track |
| Push opt-out | `select * from analytics.notification_opt_out();` | < 20 % |
| Four-week retention | `select * from analytics.four_week_retention('2026-12-01');` | ≥ 50 % |

**Friction check:** compare Signals created per household per week with notifications per member
per week. If notifications grow faster than Signals and responses, the app is adding noise rather
than removing friction. Revisit defaults before adding features.

## 4. Testing checklist (two phones, before inviting households)

- [ ] Sign up with a new email and receive the code. Wrong code shows a friendly error.
- [ ] Create a home and add spaces. Join from a second phone by QR, then link, then typed code (`abcd-2345` works).
- [ ] Regenerating an invite immediately invalidates the old code.
- [ ] **A:** Run → second phone adds 2 items → runner accepts one, declines one → "I'm back" → the requester gets notifications and the card closes.
- [ ] **B:** An agreed window exists → requesting an overlap shows the conflict and alternatives → pick one → approver OKs → agreed and on the calendar.
- [ ] **C:** Cooking → responses with portions → the count on the detail screen is correct → the card disappears after expiry.
- [ ] **D:** A responsibility due today → reminder arrives for the assignee only → Done → next person shown.
- [ ] **E:** Spark → two join, one declines (no notification for the decline) → "It's on" → appears in Explore.
- [ ] **F:** Status "Home later ~10" shared with one person → the other sees a dim window → Hide → gone.
- [ ] Leftovers: two phones claim the last portion at the same moment. Exactly one succeeds.
- [ ] Push: arrives on a dev build. Muted category doesn't push. Quiet hours hold it, and the inbox still shows it.
- [ ] Leave home → access gone and turns move on. Delete account → can't sign back in to the old data.
- [ ] Dark mode, Dynamic Type at the largest size, and VoiceOver/TalkBack on Home, Compose and Signal detail.
- [ ] Airplane mode mid-response: the change rolls back with a toast. Reconnect and it refreshes.

## 5. Deployment

1. **Supabase (production project):** `supabase link` → `supabase db push` (this also schedules the
   pg_cron jobs). Set up the email template and custom SMTP. Deploy both functions, run
   `supabase secrets set PUSH_WEBHOOK_SECRET=…`, and create the notifications webhook.
2. **Auth hardening:** confirm `private` and `analytics` are not exposed schemas. Turn on leaked-password
   protection (if passwords are ever added). Review the auth rate limits.
3. **App:** `eas init`, set EAS environment variables (`EXPO_PUBLIC_SUPABASE_URL`, `…_ANON_KEY`) for
   `preview` and `production`, then run `eas build --profile preview` for TestFlight and Play internal
   testing. Use `eas update --channel preview` for JS-only fixes during the pilot.
4. **Run Supabase advisors** (*Database → Advisors*) and fix any security or performance warnings
   before inviting households.

## 6. App Store & Google Play readiness

- [ ] Final name and trademark search. Bundle ids `com.homepulse.app` are placeholders.
- [ ] Real app icon (iOS Icon Composer `.icon` plus Android adaptive), splash, store screenshots (6.9" and 6.5" iPhone, Android phone)
- [ ] Privacy policy URL and support URL
- [ ] App Privacy ("nutrition label"): email (account), user content (Signals, comments), no location, no tracking, no data used for ads
- [ ] Google Play Data safety form (same answers). Account deletion: in-app, plus a web deletion request URL (Play requires one)
- [ ] Age rating questionnaire. The app targets **adults (18+)**. State this in the terms and onboarding copy.
- [ ] Sign in with Apple if any social login is added (Guideline 4.8)
- [ ] User-generated content safeguards (Guideline 1.2): remove member, leave home, and report or contact paths are in place. A "Report" action is on the roadmap before any community layer.
- [ ] Push permission requested in context (it already is, from the Home card or Settings), with a clear purpose string
- [ ] Test accounts and a demo home for App Review (seed two accounts in a review project)
- [ ] Export compliance: uses only standard HTTPS encryption (set `ITSAppUsesNonExemptEncryption = false`)
