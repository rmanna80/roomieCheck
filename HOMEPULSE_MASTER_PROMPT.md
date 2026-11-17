# MASTER DEVELOPMENT PROMPT — HOMEPULSE

## Project: HOMEPULSE

**Working name. Final name and trademark availability must be verified before launch.**

**Tagline:** Living together, made easier.

## 1. Your Role

You are an expert team consisting of:

- Senior mobile application architect
- React Native / Expo engineer
- Backend and database engineer
- UI/UX and interaction designer
- Product manager specializing in consumer social applications
- Application security and privacy engineer
- Quality assurance engineer

Your responsibility is to design and build a production-oriented mobile application called HOMEPULSE.

Do not create a generic roommate chore tracker, group messaging application, or apartment-management clone.

I want a distinctive product with original interaction patterns, strong visual identity, and a clear reason for people to use it every day.

Think critically about every feature. Solve meaningful problems. Avoid adding features solely because other applications have them.

**Your goal is to build an application that people want to use, not one they feel obligated to use.**

---

# 2. The Problem

People living together experience constant small communication failures.

Examples:

- Someone leaves dishes in the sink for three days.
- Nobody takes responsibility for the trash.
- One roommate needs the living room for an hour.
- Someone is cooking dinner but doesn't know who wants food.
- Someone is going grocery shopping but forgets to ask if anyone needs anything.
- Roommates make plans without knowing who is available.
- Someone has friends coming over but forgets to tell everyone.
- Someone is studying and needs the apartment quiet.
- Nobody knows whose laundry is sitting in the washing machine.
- A roommate is returning home late but wants to update the others.
- Someone feels excluded because social plans happen spontaneously.
- Small household issues turn into passive-aggressive group messages.
- Maintenance issues get forgotten.
- Supplies run out because nobody takes responsibility.
- Shared spaces become frustrating to coordinate.

These aren't necessarily major problems individually, but collectively they affect relationships, productivity, comfort, and quality of life.

**HOMEPULSE should solve these problems without making roommates feel monitored, judged, or micromanaged.**

---

# 3. Product Philosophy

HOMEPULSE is a private social coordination system for people who share living spaces.

It combines household coordination, spontaneous social interaction, communication, and lightweight responsibilities into one intuitive experience.

The app must follow seven principles:

1. **Action over conversation:** Users should resolve common situations through one or two taps rather than lengthy messages.
2. **Consent over control:** Roommates communicate preferences and agree on shared-space arrangements. Nobody can automatically force another person out of a room.
3. **Privacy by default:** Nobody should need to share precise location, personal schedules, private activities, or reasons for requesting privacy.
4. **Positive social experiences:** The app should make it easier to spend time together, not just assign chores.
5. **Low friction:** Most daily interactions should take under 10 seconds.
6. **No public shaming:** Avoid punitive rankings, guilt-driven streaks, and embarrassing notifications about household responsibilities.
7. **Free core experience:** Households must be able to use essential functionality without a subscription.

The product should work for college dormitories, student apartments, off-campus houses, traditional apartments, and groups of friends living together.

---

# 4. Original Core Interaction: House Signals

Create a new interaction system called **Signals**.

A Signal is a short, structured, actionable update shared with selected roommates.

Unlike a normal message, a Signal has:

- A clear purpose
- An optional start time
- An optional expiration time
- Relevant response actions
- Participants or recipients
- A lifecycle: proposed, active, resolved, expired, or canceled
- Optional follow-up discussion

Signals should appear on the home's activity dashboard as visually distinctive cards.

Examples:

### Food Signal

"I'm making tacos at 7 PM."

Actions:

- I'm in
- Not tonight
- Save me some

The creator sees how many people want food.

### Food Run Signal

"Going to Chipotle in 20 minutes."

Actions:

- I'll come
- Can you grab me something?
- I'm good

If someone wants food, they can add a request. The requester and runner confirm the details. No payment is assumed or processed automatically.

### Privacy Signal

"Can I have the living room from 7–8 PM?"

Actions:

- Works for me
- I need it too
- Suggest another time

The requesting roommate must receive any necessary approvals before the request is marked agreed.

### Cleaning Signal

"The kitchen needs cleaning."

Actions:

- I'll handle it
- Want to clean together?
- Schedule for later

Avoid assigning blame.

### Social Signal

"Anyone down for a movie at 9?"

Actions:

- I'm down
- Maybe
- Can't tonight

Participants can vote on what to watch.

### Return Signal

"Probably home around 10:30."

This is voluntary, approximate, and automatically expires. It is not a tracking system.

### Quiet Signal

"Big exam tomorrow. Could we keep things quiet after 10?"

Actions:

- Sounds good
- Can we adjust the time?
- Discuss

**Design Signals as the central interaction language of the application.**

---

# 5. Core Features

## A. My Home

Every household has its own private digital space.

A user can:

- Create a home
- Name their home
- Select a household icon or theme
- Invite roommates through a QR code or secure link
- View connected members
- Set household notification preferences
- Define shared rooms
- Create consensual household agreements

The application should support households with different numbers of roommates.

Avoid designing exclusively for four-person apartments.

## B. House Pulse

Create a lightweight home-status system.

Users can optionally select:

- Home
- Out
- On my way
- Home later
- Busy
- Studying
- Available to hang out
- Do not disturb
- Custom temporary status

Allow approximate arrival times.

Status updates should expire automatically when appropriate.

Never require GPS access.

No passive background location monitoring.

Users can hide their status, choose who sees it, or disable the feature entirely.

## C. Space Windows

Develop a shared-space reservation and coordination system.

Examples:

- Need the living room for a video interview
- Using the kitchen for meal preparation
- Hosting a study group
- Need some privacy
- Planning to have guests
- Using the laundry room
- Watching a sporting event

Users select:

- Space
- Start time
- Duration
- Optional description
- Recipients who need to agree

Detect overlapping requests.

Offer alternative times.

Support roommate consent and conflict resolution.

Private bedrooms must not be treated as reservable communal property. Only authorized spaces can be requested.

Requesters should be able to select "Personal" as a reason without disclosing details.

## D. House Runs

Create a system for coordinating errands.

Examples:

- Grocery shopping
- Picking up takeout
- Pharmacy run
- Convenience store
- Getting household supplies

A user creates a Run:

"Going to the grocery store. Leaving in 25 minutes."

Other roommates can:

- Add items
- Ask to join
- Volunteer to help
- View the cutoff time
- Confirm whether their request was accepted

The creator can mark items as accepted, purchased, or unavailable.

Automatically close requests when the Run begins or the cutoff arrives.

Do not assume a roommate has agreed to purchase every requested item.

## E. Kitchen and Food Coordination

Users can announce meals, ask who wants portions, and coordinate cooking.

Features:

- Meal announcements
- Portion RSVPs
- Cooking time
- Shared grocery requests
- Leftover availability
- Food labeling
- Optional shared food inventory
- Expiration reminders for voluntarily tracked food

Example:

"Made extra pasta. Two portions in the fridge."

Roommates can claim available portions.

Support clear distinctions between private groceries and food offered for sharing.

## F. House Reset

Invent a positive approach to cleaning.

Instead of only assigning chores, create short collaborative cleanup sessions.

Example:

"Kitchen Reset — 10 minutes."

Roommates can join and divide tasks.

Example tasks:

- Dishes
- Counters
- Trash
- Sweep
- Put away groceries

Allow users to create recurring resets.

Offer individual tasks as well for people with different schedules.

Do not rank roommates by cleanliness or display public blame statistics.

## G. Responsibilities

Support:

- Trash and recycling
- Dishes
- Shared bathroom cleaning
- Vacuuming
- Kitchen cleanup
- Restocking supplies
- Pet care where applicable
- Other custom household responsibilities

Allow fair rotating schedules and voluntary swaps.

Roommates should be able to mark a task complete, request help, or reschedule with agreement.

Provide a simple history for transparency, but avoid turning the system into a surveillance or punishment tool.

## H. Laundry Queue

For households with shared machines:

- Indicate that a washer or dryer is available or in use
- Optionally reserve a time slot
- Set voluntary cycle-completion reminders
- Notify the next person when equipment becomes available

Do not claim to detect machine status without actual hardware integration.

## I. Social Sparks

Create a spontaneous social-planning system.

Examples:

- Movie night
- Video games
- Going to the gym
- Going out for food
- Watching a game
- Studying together
- Attending a university event
- Playing pickup sports
- Coffee run
- Cooking together

Users should be able to create a Spark in seconds.

Other people respond with availability.

If enough roommates join, the app converts the Spark into a shared plan.

A Spark expires automatically if nobody participates.

Include low-pressure responses. Declining should not generate guilt or unwanted follow-up notifications.

## J. Guests and Quiet Hours

Create respectful coordination around:

- Visitors
- Overnight guests
- Parties
- Noise
- Early classes
- Exams
- Work calls
- Shared-space use

Households can negotiate rules together.

Provide friendly notification templates that reduce awkward conversations.

Never assume a notification equals permission.

## K. Household Issues

Allow members to report shared problems:

- Broken appliance
- Plumbing issue
- Internet outage
- Missing supplies
- Package delivery
- Heating or cooling problem
- Maintenance request
- Safety concern

For maintenance, maintain a clear distinction between tracking a problem inside the household and formally submitting a request to a landlord or property manager.

Future integrations can support official maintenance submissions.

Urgent safety situations must not depend on app notifications.

---

# 6. Inventive Features Worth Exploring

Develop the following as possible differentiators.

Do not implement every idea in the first version.

### 1. House Handoffs

Instead of sending a reminder, a roommate can transfer responsibility for a small task with acknowledgment.

Example:

"I'm heading out. Can someone move my clothes to the dryer when the washer finishes?"

Someone can accept or decline.

No assignment should be considered accepted without confirmation.

### 2. One-Tap House Mood

Housemates can voluntarily indicate their social energy:

- Down to hang out
- Quiet night
- Focus mode
- Up for an adventure

Display only the statuses users explicitly choose to share.

This should not infer someone's emotional state or create relationship scores.

### 3. The Opportunity Window

When several roommates voluntarily indicate they're free, suggest a shared activity.

Example:

"Three people are free around 8. Want to plan something?"

This feature should work from explicitly shared availability, not location surveillance.

### 4. The House Constitution

A collaborative document of household expectations.

Members can propose agreements about:

- Cleaning
- Guests
- Quiet hours
- Shared food
- Shared expenses
- Space usage

Allow proposals, discussion, and approval.

Version agreements and preserve the ability to revise them.

Do not let a majority vote override a roommate's basic privacy or safety.

### 5. Friction-Free Resolution

Create a structured way to address awkward household issues.

Instead of:

"Who keeps leaving dishes everywhere?"

Offer:

"The sink is full. Can we get it cleared by tonight?"

Users can volunteer or negotiate a time.

Do not identify, accuse, or score individuals automatically.

### 6. The House Digest

An optional short daily summary:

- What's planned tonight
- Current shared-space arrangements
- Outstanding household needs
- Tomorrow's agreed commitments

Every user can control notification frequency.

Avoid collecting or exposing private information.

### 7. Smart Household Suggestions

After sufficient opt-in use, the app may offer simple suggestions based on explicit household patterns.

Examples:

"You usually take the trash out on Sunday. Want to make that recurring?"

"Several people have joined Thursday movie nights. Create a recurring Spark?"

Initially use transparent rules rather than expensive AI.

Never infer personal relationships, monitor roommate movements, or use private messages for hidden profiling.

---

# 7. User Experience and Visual Design

I want a distinctive, premium-feeling consumer application.

It should feel like a welcoming shared home rather than an administrative dashboard.

Design principles:

- Warm, inviting visual language
- Clear typography and hierarchy
- Thoughtful color system
- Playful but restrained motion
- Visually engaging Signal cards
- Excellent dark mode
- Accessible contrast
- Comfortable one-handed interactions
- Smooth loading and empty states
- Clear feedback after every action
- No cluttered dashboards
- No childish gamification
- No generic chatbot-style interface
- No copied layouts from existing roommate applications

Develop at least three visual directions, evaluate them, and select one coherent system before implementation.

Use an original visual identity rather than default gradients and generic icon grids.

### Navigation

Propose a streamlined navigation system built around:

**Home:** Today's household activity, current Signals, and important shared-space updates.

**Explore:** Social Sparks, upcoming activities, and opt-in community events.

**House:** Responsibilities, spaces, groceries, members, agreements, and household resources.

**Inbox:** Responses, acknowledgments, requests, and important notifications.

**Profile:** Personal settings, privacy, availability, and notification controls.

Place a prominent contextual action control on the main screen for creating a Signal.

Users should not need to navigate through several screens to announce they are getting food.

Create designs for:

1. Welcome and onboarding
2. Create or join a home
3. Home dashboard
4. Create Signal
5. Food Run
6. Space Window
7. Responsibilities
8. House Reset
9. Social Sparks
10. Shared calendar
11. Notifications
12. Household settings
13. Privacy settings
14. Member management

Include realistic empty, loading, error, confirmation, conflict, and success states.

---

# 8. University and Apartment Expansion

Build the architecture so the product can eventually support three independent layers.

### Layer 1: Private Household

Members communicate and coordinate inside their own home.

This is the core experience.

### Layer 2: Building or Residence Hall

With appropriate verification and user opt-in, residents can access:

- Community events
- Optional shared activities
- Building announcements
- Shared facility coordination
- Lost-and-found posts
- Community resources

### Layer 3: University or Property Management

Authorized staff may eventually publish:

- Official announcements
- Residential events
- Housing resources
- Maintenance information

**Critical privacy boundary:** University administrators, landlords, and building managers must not be able to access private household Signals, roommate availability, personal discussions, or individual home-status information.

Do not claim official institutional affiliation without authorization.

Do not build campus-wide user discovery until appropriate identity verification, privacy controls, blocking, reporting, and moderation systems exist.

---

# 9. Technical Architecture

Build the application using:

### Mobile

- React Native
- Expo
- TypeScript
- Expo Router
- React Query / TanStack Query
- A consistent component and design-token system
- Expo Notifications where applicable
- Secure local token storage
- Accessible UI components

### Backend

Use Supabase for:

- PostgreSQL
- Authentication
- Row-Level Security
- Realtime subscriptions
- Edge Functions where necessary
- File storage where necessary

Use server-side authorization for sensitive actions.

Never rely solely on client-side authorization.

Design database policies ensuring users cannot access another household's private information.

### Data Model

Create a normalized relational schema supporting:

- Users and profiles
- Households
- Household memberships
- Invitations
- Shared spaces
- Signals
- Signal responses
- Commitments and approvals
- Availability statuses
- Food Runs
- Run items
- Tasks and rotations
- House Resets
- Events and RSVPs
- Household agreements
- Notifications
- User notification preferences
- Optional buildings and community membership

Add appropriate timestamps, foreign keys, constraints, indexes, and deletion behavior.

Separate public profile information from private household information.

Use UTC internally and display dates in the user's selected time zone.

Design transactional handling for concurrent requests, including overlapping space reservations and multiple people claiming the same limited item.

---

# 10. Security and Privacy Requirements

Security must be part of the architecture from the beginning.

Implement:

- Secure authentication
- Household-scoped authorization
- Row-Level Security
- Invitation validation and expiration
- Secure invite regeneration
- Input validation
- Rate limiting where appropriate
- Abuse prevention
- Notification permission controls
- Account deletion
- Household departure
- Data export planning
- Safe handling of user-generated content
- Protection against cross-household information leaks
- Secure management of credentials and secrets
- Appropriate audit logging of administrative actions
- Tests proving privacy boundaries

Do not include:

- Mandatory precise location tracking
- Continuous roommate surveillance
- Secret background activity monitoring
- Default sharing of personal schedules
- Public roommate behavior scores
- Access to private household information by landlords
- Ads based on roommate presence or personal behavior

The app should initially target adults. If the product later supports minors in student housing, assess additional legal, consent, safeguarding, and privacy requirements before expanding eligibility.

---

# 11. MVP: What to Actually Build First

Do not attempt to build every future feature simultaneously.

The first release must solve a small number of problems exceptionally well.

Implement these features first:

1. Authentication and onboarding
2. Creating and joining a household
3. Private household membership
4. Home dashboard
5. House Signals
6. Signal responses and expiration
7. Food Runs
8. Space Windows with agreement handling
9. Responsibilities and simple chore rotation
10. Social Sparks
11. Optional home/away status
12. Basic notifications and notification preferences
13. Privacy controls and account/household exit flows

Build all other features into a clearly prioritized roadmap.

The MVP should be polished, functional, and testable with real roommates.

---

# 12. Required User Flows

Implement and test these complete scenarios.

**Scenario A: Grocery Run**

A roommate announces they are going shopping. Two other roommates add requests. The runner accepts one item, declines another, marks the shopping trip complete, and the Signal closes.

**Scenario B: Need Privacy**

A roommate requests the shared living room for 45 minutes. Another roommate has an overlapping need. The app detects the conflict, allows a time change, collects the required acknowledgment, and records the agreed window.

**Scenario C: Dinner**

A roommate announces they are cooking. Three roommates respond. The cook can see the confirmed portion count. The Signal expires after dinner.

**Scenario D: Trash**

The household has a recurring trash responsibility. A member receives an appropriate reminder, marks it complete, and the next rotation is calculated.

**Scenario E: Movie Night**

A roommate sends a Social Spark. Two others join, one declines, and the accepted plan appears on the household calendar.

**Scenario F: Home Status**

A roommate sets "Home around 10 PM." Only authorized roommates can view it. The status expires, and the user can hide it at any time.

**Scenario G: Household Privacy**

A member of Household A attempts to access a Signal belonging to Household B. The database denies access, regardless of client modifications.

---

# 13. Product Quality and Testing

Implement meaningful tests for:

- Authentication and permissions
- Household creation and invitations
- Signal creation and expiration
- Signal responses
- Duplicate actions
- Space reservation conflicts
- Cancellation and rescheduling
- Task rotation
- Push notification preferences
- Unauthorized access
- Household departure
- Account deletion
- Offline or interrupted requests
- Concurrent user actions

Include clear error handling and retry behavior.

Use optimistic updates when safe, with rollback on failure.

Support basic accessibility requirements, including screen reader labels, adequate touch targets, and readable text sizes.

Do not fabricate successful test results.

---

# 14. Product Analytics

Design privacy-respecting, aggregate analytics for evaluating the product.

Important metrics:

- Household activation rate
- Number of households where at least two members participate
- Weekly active households
- Signals created per household
- Signals receiving responses
- Food Run completion
- Space requests resolved
- Social Sparks converting into plans
- Four-week household retention
- Notification opt-out rates

Do not sell identifiable household activity data.

Avoid invasive tracking.

Evaluate whether the application is actually reducing coordination friction rather than simply increasing notifications.

---

# 15. Business Strategy

The essential consumer app should remain free.

Initially focus on:

1. University students living with roommates
2. Students living in off-campus apartments
3. Young adults in shared apartments
4. Larger houses with several residents

Future business opportunities may include opt-in institutional event distribution and community-management tools for universities or apartment operators.

Do not require commercial features for the first launch.

Do not build a subscription paywall into core household coordination.

---

# 16. Development Process

Follow this execution order.

### Phase 1 — Product Architecture

Define:

- Product positioning
- Primary user personas
- Core user journeys
- Information architecture
- Screen inventory
- MVP scope
- Feature priorities
- Technical architecture
- Database schema
- Security boundaries
- Measurable launch criteria

Briefly explain major tradeoffs.

### Phase 2 — Design System

Produce original visual directions.

Choose one visual system and define:

- Colors
- Typography
- Components
- Spacing
- Navigation
- Motion
- Signal card design
- Empty states
- Dark mode
- Accessibility

Design the primary app screens and important interaction states.

### Phase 3 — Working Application

Create the project structure and implement the core application.

Build real navigation, authentication, persistence, permissions, and functional user interactions.

Do not substitute hardcoded data for production functionality.

Temporary demo data is acceptable only when clearly separated from real data.

### Phase 4 — Quality Assurance

Test important flows, verify authorization policies, resolve errors, review performance, and document limitations.

### Phase 5 — Pilot Readiness

Prepare the application for testing with 10–20 real households.

Create:

- Pilot onboarding instructions
- Simple feedback mechanism
- Analytics definitions
- Testing checklist
- Deployment instructions
- Initial App Store and Google Play readiness checklist

---

# 17. Coding Standards and Deliverables

Use maintainable, strongly typed TypeScript.

Prefer reusable components, clear separation of concerns, simple data structures, and documented architectural decisions.

Do not overengineer the application into unnecessary microservices.

Create:

- Working Expo application
- Supabase schema and migrations
- Security policies
- Shared TypeScript types
- Authentication flows
- Core UI components
- Functional screens
- Reusable Signal system
- Tests
- Environment variable example
- README
- Local setup instructions
- Development and production configuration guidance

Never place service-role credentials or private API keys in client code.

Preserve existing repository content when modifying an existing project.

Do not claim a feature is complete unless it works and has been tested at an appropriate level.

---

# 18. Success Criteria

The application succeeds when four roommates can:

- Join the same private household quickly
- Know what shared plans are happening
- Coordinate food without lengthy group messages
- Handle basic cleaning responsibilities
- Request shared-space time respectfully
- Share voluntary availability
- Resolve common household issues with minimal interaction

Most importantly:

**The app must reduce friction between roommates while increasing opportunities for positive interaction.**

It must feel useful even when nobody is arguing about dishes or trash.

The final product should not feel like a chore app.

It should feel like a digital extension of the home.

---

# 19. Begin Implementation

Start by inspecting the existing repository, if one is provided.

Then:

1. Summarize the product concept and the most important differentiators.
2. Identify the five highest-value user problems.
3. Propose a focused MVP and explain what should be postponed.
4. Define the architecture, database, and authorization boundaries.
5. Design the primary user experience and visual direction.
6. Create an implementation plan with testable milestones.
7. Begin implementing the first milestone immediately.
8. Continue through the MVP, validating each milestone before proceeding.

Make reasonable implementation decisions without repeatedly requesting approval for minor details.

When credentials, external services, or platform permissions are required, document the exact setup steps.

Prioritize functioning software over lengthy theoretical documentation.

Be inventive, but remain realistic.

Build something people would genuinely want to bring into their homes.
