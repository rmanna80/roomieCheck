/**
 * DEMO DATA — for the dev-only design preview (src/app/design-preview.tsx). Never imported by
 * production screens and never sent to the server.
 */
import type { Member, MemberStatus, Signal } from '@/types/domain';

const now = Date.now();
const iso = (minutes: number) => new Date(now + minutes * 60_000).toISOString();

export const DEMO_ME = 'demo-me';

export const demoMembers: Member[] = [
  { household_id: 'demo', user_id: DEMO_ME, role: 'owner', joined_at: iso(-9000), profile: { id: DEMO_ME, display_name: 'Ryan', color: 'ember' } },
  { household_id: 'demo', user_id: 'maya', role: 'member', joined_at: iso(-8000), profile: { id: 'maya', display_name: 'Maya', color: 'sage' } },
  { household_id: 'demo', user_id: 'jordan', role: 'member', joined_at: iso(-7000), profile: { id: 'jordan', display_name: 'Jordan', color: 'plum' } },
  { household_id: 'demo', user_id: 'sky', role: 'member', joined_at: iso(-6000), profile: { id: 'sky', display_name: 'Sky', color: 'dusk' } },
];

export const demoStatuses: MemberStatus[] = [
  { household_id: 'demo', user_id: 'maya', status: 'available', label: null, eta_at: null, expires_at: iso(180), visibility: 'household', updated_at: iso(-10) },
  { household_id: 'demo', user_id: 'jordan', status: 'home_later', label: null, eta_at: iso(150), expires_at: iso(210), visibility: 'household', updated_at: iso(-30) },
];

const base = (o: Partial<Signal>): Signal => ({
  id: Math.random().toString(36).slice(2), household_id: 'demo', created_by: 'maya', kind: 'food', title: '', body: null,
  status: 'active', audience: 'household', starts_at: null, expires_at: iso(150), resolved_at: null, created_at: iso(-30),
  signal_responses: [], food_details: null, runs: null, space_windows: null, sparks: null, resets: null, ...o,
});

const r = (user_id: string, response: string, portions: number | null = null) =>
  ({ signal_id: 'x', user_id, response, portions, note: null, updated_at: iso(-5) });

export const demoSignals: Signal[] = [
  base({
    kind: 'space', created_by: 'jordan', title: 'Can I have the living room?', body: 'Interview call', status: 'proposed',
    starts_at: iso(60), expires_at: iso(105), created_at: iso(-12),
    space_windows: { space_id: 'living', requested_by: 'jordan', starts_at: iso(60), ends_at: iso(105), reason: 'call', state: 'pending', agreed_at: null },
    space_window_approvals: [{ approver_id: DEMO_ME, decision: 'pending' }, { approver_id: 'sky', decision: 'approved' }],
  }),
  base({
    kind: 'food', title: 'Making tacos — want some?', starts_at: iso(40), expires_at: iso(220), created_at: iso(-20),
    signal_responses: [r('jordan', 'in', 2), r('sky', 'save_me', 1), r(DEMO_ME, 'in', 1)],
  }),
  base({
    kind: 'run', created_by: 'sky', title: 'Going to Trader Joe’s', created_at: iso(-8), expires_at: iso(200),
    runs: { run_type: 'groceries', destination: 'Trader Joe’s', leaves_at: iso(20), started_at: null, completed_at: null },
    signal_responses: [r('maya', 'grab_me')],
  }),
  base({
    kind: 'spark', created_by: DEMO_ME, title: 'Movie night?', status: 'proposed', starts_at: iso(150), expires_at: iso(330), created_at: iso(-5),
    sparks: { plan_at: iso(150), min_people: 3, became_plan_at: null }, signal_responses: [r('maya', 'in')],
  }),
  base({
    kind: 'reset', created_by: 'maya', title: 'Kitchen reset — 10 min', created_at: iso(-50), expires_at: iso(190),
    resets: { minutes: 10 }, signal_responses: [r('sky', 'together')],
  }),
  base({
    kind: 'leftovers', created_by: 'jordan', title: 'Extra pasta', created_at: iso(-90), expires_at: iso(2000),
    food_details: { portions_total: 3, location: 'Fridge, top shelf' }, signal_responses: [r('sky', 'claimed', 1)],
  }),
  base({ kind: 'quiet', created_by: 'sky', title: 'Big exam tomorrow. Could we keep things quiet?', starts_at: iso(120), expires_at: iso(600), created_at: iso(-15) }),
  base({ kind: 'return', created_by: 'jordan', title: 'Probably home around 10:30', starts_at: iso(150), expires_at: iso(240), created_at: iso(-3) }),
];
