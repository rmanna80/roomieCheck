/** Signals: lifecycle, responses, duplicates, expiry, leftovers concurrency, resets. */
import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';

import { admin, createHouse, expectError, inMinutes, notificationsFor, pool } from './support/harness';

after(() => pool.end());

describe('Scenario C — dinner', () => {
  test('cook sees confirmed portions; the signal expires after dinner', async () => {
    const house = await createHouse(['Cook', 'Ann', 'Bob', 'Cat']);
    const [cook, ann, bob, cat] = house.members;
    const sid = await cook.rpc<string>('create_signal', {
      p_household: house.id, p_kind: 'food', p_title: 'Making tacos', p_starts_at: inMinutes(90),
    });

    await ann.rpc('respond_to_signal', { p_signal: sid, p_response: 'in' });
    await bob.rpc('respond_to_signal', { p_signal: sid, p_response: 'in', p_portions: 2 });
    await cat.rpc('respond_to_signal', { p_signal: sid, p_response: 'save_me' });

    const [counts] = await cook.query<{ portions: number; people: number }>(
      `select sum(portions)::int as portions, count(*)::int as people
       from public.signal_responses where signal_id = $1 and response in ('in', 'save_me')`, [sid]);
    assert.deepEqual(counts, { portions: 4, people: 3 });

    // Defaults: expires 3 hours after the start time.
    const [sig] = await admin<{ minutes: number; status: string }>(
      `select round(extract(epoch from expires_at - starts_at) / 60)::int as minutes, status from public.signals where id = $1`, [sid]);
    assert.deepEqual(sig, { minutes: 180, status: 'active' });

    // Fast-forward past dinner, run the expiry job.
    await admin(`update public.signals set expires_at = now() - interval '1 minute', starts_at = now() - interval '2 hours' where id = $1`, [sid]);
    await admin('select private.expire_signals()');
    const [after] = await admin<{ status: string }>('select status from public.signals where id = $1', [sid]);
    assert.equal(after.status, 'expired');
    await expectError(ann.rpc('respond_to_signal', { p_signal: sid, p_response: 'not_tonight' }), 'signal_closed');

    // The cook heard about each "in"/"save me".
    const notes = await notificationsFor(cook);
    assert.equal(notes.filter((n) => n.category === 'responses').length, 3);
  });

  test('responses are one-per-person: repeated taps update, never duplicate', async () => {
    const house = await createHouse(['Dee', 'Eve']);
    const [dee, eve] = house.members;
    const sid = await dee.rpc<string>('create_signal', { p_household: house.id, p_kind: 'food', p_title: 'Chili' });
    await eve.rpc('respond_to_signal', { p_signal: sid, p_response: 'in' });
    await eve.rpc('respond_to_signal', { p_signal: sid, p_response: 'in' });
    await eve.rpc('respond_to_signal', { p_signal: sid, p_response: 'not_tonight' });
    const rows = await admin<{ response: string }>('select response from public.signal_responses where signal_id = $1', [sid]);
    assert.deepEqual(rows, [{ response: 'not_tonight' }]);
    // Repeating the same response doesn't re-notify; declining never notifies.
    const notes = (await notificationsFor(dee)).filter((n) => n.category === 'responses');
    assert.equal(notes.length, 1);
  });

  test('concurrent duplicate taps from two devices still leave one response', async () => {
    const house = await createHouse(['Fox', 'Gia']);
    const [fox, gia] = house.members;
    const sid = await fox.rpc<string>('create_signal', { p_household: house.id, p_kind: 'food', p_title: 'Ramen' });
    await Promise.all(Array.from({ length: 5 }, () => gia.rpc('respond_to_signal', { p_signal: sid, p_response: 'in' })));
    const rows = await admin('select 1 from public.signal_responses where signal_id = $1', [sid]);
    assert.equal(rows.length, 1);
  });

  test('invalid responses, own-signal responses and cancelled signals are rejected', async () => {
    const house = await createHouse(['Hal', 'Ida']);
    const [hal, ida] = house.members;
    const sid = await hal.rpc<string>('create_signal', { p_household: house.id, p_kind: 'food', p_title: 'Pho' });
    await expectError(ida.rpc('respond_to_signal', { p_signal: sid, p_response: 'grab_me' }), 'invalid_response');
    await expectError(hal.rpc('respond_to_signal', { p_signal: sid, p_response: 'in' }), 'own_signal');
    await ida.rpc('respond_to_signal', { p_signal: sid, p_response: 'in' });
    await expectError(ida.rpc('cancel_signal', { p_signal: sid }), 'creator_only');
    await hal.rpc('cancel_signal', { p_signal: sid });
    await hal.rpc('cancel_signal', { p_signal: sid }); // idempotent
    await expectError(ida.rpc('respond_to_signal', { p_signal: sid, p_response: 'in' }), 'signal_closed');
    // People who were "in" are told it was canceled.
    assert.ok((await notificationsFor(ida)).some((n) => n.title === 'Canceled: Pho'));
  });

  test('a capped meal refuses more portions than were offered', async () => {
    const house = await createHouse(['Jen', 'Kim', 'Lee']);
    const [jen, kim, lee] = house.members;
    const sid = await jen.rpc<string>('create_signal', {
      p_household: house.id, p_kind: 'food', p_title: 'Lasagna', p_details: { portions_total: 3 },
    });
    await kim.rpc('respond_to_signal', { p_signal: sid, p_response: 'in', p_portions: 2 });
    await expectError(lee.rpc('respond_to_signal', { p_signal: sid, p_response: 'in', p_portions: 2 }), 'not_enough_portions');
    await lee.rpc('respond_to_signal', { p_signal: sid, p_response: 'in', p_portions: 1 });
  });

  test('signal times are validated', async () => {
    const house = await createHouse(['Mia']);
    const [mia] = house.members;
    await expectError(
      mia.rpc('create_signal', { p_household: house.id, p_kind: 'food', p_title: 'x', p_expires_at: inMinutes(-5) }),
      'invalid_time',
    );
    await expectError(mia.rpc('create_signal', { p_household: house.id, p_kind: 'return', p_title: 'Home soon' }), 'eta_required');
    await expectError(mia.rpc('create_signal', { p_household: house.id, p_kind: 'leftovers', p_title: 'Pasta' }), 'portions_required');
    await expectError(mia.rpc('create_signal', { p_household: house.id, p_kind: 'space', p_title: 'x' }), 'use_request_space_window');
  });

  test('signal creation is rate limited per person', async () => {
    const house = await createHouse(['Nia']);
    const [nia] = house.members;
    await admin(
      `insert into public.signals (household_id, created_by, kind, title, expires_at)
       select $1, $2, 'quiet', 'q' || g, now() + interval '1 hour' from generate_series(1, 40) g`,
      [house.id, nia.id],
    );
    await expectError(nia.rpc('create_signal', { p_household: house.id, p_kind: 'quiet', p_title: 'one more' }), 'rate_limited');
  });
});

describe('leftovers — limited items claimed concurrently', () => {
  test('two people racing for the last portion: exactly one wins', async () => {
    const house = await createHouse(['Oli', 'Pat', 'Quy']);
    const [oli, pat, quy] = house.members;
    const sid = await oli.rpc<string>('create_signal', {
      p_household: house.id, p_kind: 'leftovers', p_title: 'Extra pasta', p_details: { portions_total: 1, location: 'Top shelf' },
    });
    const results = await Promise.allSettled([
      pat.rpc('claim_portions', { p_signal: sid, p_portions: 1 }),
      quy.rpc('claim_portions', { p_signal: sid, p_portions: 1 }),
    ]);
    const won = results.filter((r) => r.status === 'fulfilled');
    const lost = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    assert.equal(won.length, 1);
    assert.equal(lost.length, 1);
    assert.match(String(lost[0].reason.message), /not_enough_portions/);
    const [claimed] = await admin<{ total: number }>(
      `select sum(portions)::int as total from public.signal_responses where signal_id = $1 and response = 'claimed'`, [sid]);
    assert.equal(claimed.total, 1);
  });

  test('claims can be changed and released', async () => {
    const house = await createHouse(['Ria', 'Sam']);
    const [ria, sam] = house.members;
    const sid = await ria.rpc<string>('create_signal', {
      p_household: house.id, p_kind: 'leftovers', p_title: 'Soup', p_details: { portions_total: 3 },
    });
    assert.deepEqual(await sam.rpc('claim_portions', { p_signal: sid, p_portions: 2 }), { claimed: 2, remaining: 1 });
    assert.deepEqual(await sam.rpc('claim_portions', { p_signal: sid, p_portions: 3 }), { claimed: 3, remaining: 0 });
    assert.deepEqual(await sam.rpc('claim_portions', { p_signal: sid, p_portions: 0 }), { claimed: 0, remaining: 3 });
    await expectError(sam.rpc('respond_to_signal', { p_signal: sid, p_response: 'claimed' }), 'use_claim_portions');
  });
});

describe('resets — collaborative cleaning without blame', () => {
  test('tasks are claimed atomically and checked off', async () => {
    const house = await createHouse(['Tia', 'Uli', 'Val']);
    const [tia, uli, val] = house.members;
    const sid = await tia.rpc<string>('create_signal', {
      p_household: house.id, p_kind: 'reset', p_title: 'Kitchen reset',
      p_details: { minutes: 10, tasks: ['Dishes', 'Counters', 'Trash', ' '] },
    });
    const tasks = await uli.query<{ id: string; label: string }>(
      'select id, label from public.reset_tasks where signal_id = $1 order by position', [sid]);
    assert.deepEqual(tasks.map((t) => t.label), ['Dishes', 'Counters', 'Trash']);

    const race = await Promise.allSettled([
      uli.rpc('claim_reset_task', { p_task: tasks[0].id }),
      val.rpc('claim_reset_task', { p_task: tasks[0].id }),
    ]);
    assert.equal(race.filter((r) => r.status === 'fulfilled').length, 1);

    const [owner] = await admin<{ claimed_by: string }>('select claimed_by from public.reset_tasks where id = $1', [tasks[0].id]);
    const winner = owner.claimed_by === uli.id ? uli : val;
    const loser = winner === uli ? val : uli;
    await expectError(loser.rpc('set_reset_task_done', { p_task: tasks[0].id, p_done: true }), 'already_claimed');
    await winner.rpc('set_reset_task_done', { p_task: tasks[0].id, p_done: true });

    // Joining a task marks you as "together" on the reset.
    const resp = await admin<{ response: string }>('select response from public.signal_responses where signal_id = $1 and user_id = $2', [sid, winner.id]);
    assert.deepEqual(resp, [{ response: 'together' }]);

    // Someone who said "I'll handle it" may close the reset; others may not.
    await loser.rpc('respond_to_signal', { p_signal: sid, p_response: 'handle_it' });
    await expectError(winner.rpc('resolve_signal', { p_signal: sid }), 'creator_only');
    await loser.rpc('resolve_signal', { p_signal: sid });
    const [s] = await admin<{ status: string }>('select status from public.signals where id = $1', [sid]);
    assert.equal(s.status, 'resolved');
  });

  test('no table records who did the least: there is no per-person cleanliness score', async () => {
    const cols = await admin<{ column_name: string }>(
      `select column_name from information_schema.columns where table_schema = 'public' and column_name ~ '(score|rank|streak)'`);
    assert.equal(cols.length, 0);
  });
});
