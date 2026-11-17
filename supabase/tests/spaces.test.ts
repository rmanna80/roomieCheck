/** Scenario B (need privacy) and Space Window consent rules. */
import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';

import { admin, createHouse, expectError, inMinutes, notificationsFor, pool } from './support/harness';

after(() => pool.end());

describe('Scenario B — need privacy', () => {
  test('conflict detected, time changed, acknowledgment collected, agreed window recorded', async () => {
    const house = await createHouse(['Jordan', 'Riley', 'Sky']);
    const [jordan, riley, sky] = house.members;
    const living = house.spaces['Living room'];

    // Riley already has the living room agreed from +60 to +120 minutes.
    const rileyWin = await riley.rpc<{ signal_id: string; state: string }>('request_space_window', {
      p_household: house.id, p_space: living, p_starts: inMinutes(60), p_ends: inMinutes(120), p_reason: 'guests',
    });
    await jordan.rpc('decide_space_window', { p_signal: rileyWin.signal_id, p_decision: 'approved' });
    await sky.rpc('decide_space_window', { p_signal: rileyWin.signal_id, p_decision: 'approved' });
    const [rw] = await admin<{ state: string }>('select state from public.space_windows where signal_id = $1', [rileyWin.signal_id]);
    assert.equal(rw.state, 'agreed');

    // Jordan wants 45 minutes from +90 — the app checks first and sees the overlap.
    const conflicts = await jordan.rpcRows<{ requested_by: string; state: string }>('space_conflicts', {
      p_space: living, p_starts: inMinutes(90), p_ends: inMinutes(135),
    });
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].requested_by, riley.id);
    assert.equal(conflicts[0].state, 'agreed');

    // Requesting the taken slot anyway is refused by the server.
    await expectError(
      jordan.rpc('request_space_window', { p_household: house.id, p_space: living, p_starts: inMinutes(90), p_ends: inMinutes(135) }),
      'space_taken',
    );

    // Jordan picks the suggested alternative right after Riley (+120 → +165), reason "personal".
    const req = await jordan.rpc<{ signal_id: string; state: string }>('request_space_window', {
      p_household: house.id, p_space: living, p_starts: inMinutes(120), p_ends: inMinutes(165), p_reason: 'personal',
    });
    assert.equal(req.state, 'pending');

    // Approvers were asked (actionable, always delivered).
    const rileyNotes = await notificationsFor(riley);
    assert.ok(rileyNotes.some((n) => n.actionable && n.signal_id === req.signal_id));

    await riley.rpc('decide_space_window', { p_signal: req.signal_id, p_decision: 'approved' });
    const mid = await admin<{ state: string }>('select state from public.space_windows where signal_id = $1', [req.signal_id]);
    assert.equal(mid[0].state, 'pending'); // still waiting on Sky — no one is forced out

    const done = await sky.rpc<{ state: string }>('decide_space_window', { p_signal: req.signal_id, p_decision: 'approved' });
    assert.equal(done.state, 'agreed');
    const [sig] = await admin<{ status: string }>('select status from public.signals where id = $1', [req.signal_id]);
    assert.equal(sig.status, 'active');
    assert.ok((await notificationsFor(jordan)).some((n) => n.title.startsWith('Agreed: Living room')));
  });

  test('"I need it too" and a counter-proposal lead to a rescheduled agreement', async () => {
    const house = await createHouse(['Kit', 'Lou']);
    const [kit, lou] = house.members;
    const req = await kit.rpc<{ signal_id: string }>('request_space_window', {
      p_household: house.id, p_space: house.spaces['Kitchen'], p_starts: inMinutes(30), p_ends: inMinutes(90), p_reason: 'cooking',
    });
    await lou.rpc('decide_space_window', { p_signal: req.signal_id, p_decision: 'needs_it_too' });
    assert.ok((await notificationsFor(kit)).some((n) => n.title === 'Lou needs the space then too'));

    const counterStart = inMinutes(90);
    const counterEnd = inMinutes(150);
    await lou.rpc('decide_space_window', {
      p_signal: req.signal_id, p_decision: 'counter', p_counter_starts: counterStart, p_counter_ends: counterEnd,
    });
    // Kit accepts the counter by rescheduling to exactly that time → Lou's approval is implied.
    const res = await kit.rpc<{ state: string }>('reschedule_space_window', {
      p_signal: req.signal_id, p_starts: counterStart, p_ends: counterEnd,
    });
    assert.equal(res.state, 'agreed');
  });

  test('rescheduling to a different time asks everyone again', async () => {
    const house = await createHouse(['Max', 'Nan']);
    const [max, nan] = house.members;
    const req = await max.rpc<{ signal_id: string }>('request_space_window', {
      p_household: house.id, p_space: house.spaces['Living room'], p_starts: inMinutes(30), p_ends: inMinutes(60),
    });
    await nan.rpc('decide_space_window', { p_signal: req.signal_id, p_decision: 'approved' });
    const res = await max.rpc<{ state: string }>('reschedule_space_window', {
      p_signal: req.signal_id, p_starts: inMinutes(200), p_ends: inMinutes(260),
    });
    assert.equal(res.state, 'pending');
    const [a] = await admin<{ decision: string }>('select decision from public.space_window_approvals where signal_id = $1', [req.signal_id]);
    assert.equal(a.decision, 'pending');
  });

  test('two overlapping requests approved at the same moment: only one can be agreed', async () => {
    const house = await createHouse(['Ora', 'Pip', 'Que']);
    const [ora, pip, que] = house.members;
    const living = house.spaces['Living room'];
    const one = await ora.rpc<{ signal_id: string }>('request_space_window', {
      p_household: house.id, p_space: living, p_starts: inMinutes(300), p_ends: inMinutes(360), p_approvers: [que.id],
    });
    const two = await pip.rpc<{ signal_id: string }>('request_space_window', {
      p_household: house.id, p_space: living, p_starts: inMinutes(330), p_ends: inMinutes(390), p_approvers: [que.id],
    });
    // Pending overlaps are allowed (and shown as a conflict).
    const shown = await ora.rpcRows('space_conflicts', { p_space: living, p_starts: inMinutes(300), p_ends: inMinutes(360), p_exclude: one.signal_id });
    assert.equal(shown.length, 1);

    const results = await Promise.allSettled([
      que.rpc('decide_space_window', { p_signal: one.signal_id, p_decision: 'approved' }),
      que.rpc('decide_space_window', { p_signal: two.signal_id, p_decision: 'approved' }),
    ]);
    const agreed = await admin('select 1 from public.space_windows where space_id = $1 and state = $2', [living, 'agreed']);
    assert.equal(agreed.length, 1);
    assert.equal(results.filter((r) => r.status === 'rejected').length, 1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    assert.match(String(rejected.reason.message), /space_taken/);
  });

  test('spaces that need no agreement are agreed immediately; non-reservable spaces cannot be requested', async () => {
    const house = await createHouse(['Rex', 'Sue']);
    const [rex] = house.members;
    const laundry = await rex.rpc<string>('save_space', {
      p_household: house.id, p_space: null, p_name: 'Laundry room', p_kind: 'laundry', p_requires_agreement: false,
    });
    const res = await rex.rpc<{ state: string }>('request_space_window', {
      p_household: house.id, p_space: laundry, p_starts: inMinutes(10), p_ends: inMinutes(70),
    });
    assert.equal(res.state, 'agreed');

    const porch = await rex.rpc<string>('save_space', {
      p_household: house.id, p_space: null, p_name: 'Porch', p_kind: 'outdoor', p_is_reservable: false,
    });
    await expectError(
      rex.rpc('request_space_window', { p_household: house.id, p_space: porch, p_starts: inMinutes(10), p_ends: inMinutes(70) }),
      'space_not_reservable',
    );
  });

  test('only named approvers can decide, and windows are bounded', async () => {
    const house = await createHouse(['Tom', 'Uri', 'Vee']);
    const [tom, uri, vee] = house.members;
    const req = await tom.rpc<{ signal_id: string }>('request_space_window', {
      p_household: house.id, p_space: house.spaces['Living room'], p_starts: inMinutes(30), p_ends: inMinutes(60), p_approvers: [uri.id],
    });
    await expectError(vee.rpc('decide_space_window', { p_signal: req.signal_id, p_decision: 'approved' }), 'not_an_approver');
    await expectError(tom.rpc('decide_space_window', { p_signal: req.signal_id, p_decision: 'approved' }), 'not_an_approver');
    await expectError(
      tom.rpc('request_space_window', { p_household: house.id, p_space: house.spaces['Kitchen'], p_starts: inMinutes(30), p_ends: inMinutes(30 + 13 * 60) }),
      'invalid_time',
    );
  });

  test('a pending request lapses once its start time passes', async () => {
    const house = await createHouse(['Wes', 'Xan']);
    const [wes] = house.members;
    const req = await wes.rpc<{ signal_id: string }>('request_space_window', {
      p_household: house.id, p_space: house.spaces['Living room'], p_starts: inMinutes(5), p_ends: inMinutes(35),
    });
    await admin(`update public.space_windows set starts_at = now() - interval '1 minute' where signal_id = $1`, [req.signal_id]);
    await admin('select private.expire_signals()');
    const [w] = await admin<{ state: string }>('select state from public.space_windows where signal_id = $1', [req.signal_id]);
    const [s] = await admin<{ status: string }>('select status from public.signals where id = $1', [req.signal_id]);
    assert.equal(w.state, 'declined');
    assert.equal(s.status, 'expired');
  });
});
