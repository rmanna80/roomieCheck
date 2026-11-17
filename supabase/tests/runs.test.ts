/** Scenario A (grocery run) and run rules: cutoff, runner-only decisions, no assumed purchases. */
import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';

import { admin, createHouse, expectError, inMinutes, notificationsFor, pool } from './support/harness';

after(() => pool.end());

describe('Scenario A — grocery run', () => {
  test('two requests, one accepted, one declined, run completes and the signal closes', async () => {
    const house = await createHouse(['Runner', 'Ana', 'Ben']);
    const [runner, ana, ben] = house.members;
    const sid = await runner.rpc<string>('create_signal', {
      p_household: house.id, p_kind: 'run', p_title: 'Going to the grocery store',
      p_details: { run_type: 'groceries', destination: 'Trader Joe’s', leaves_at: inMinutes(25) },
    });

    const milk = await ana.rpc<string>('add_run_item', { p_signal: sid, p_name: 'Oat milk', p_quantity: '1' });
    const chips = await ben.rpc<string>('add_run_item', { p_signal: sid, p_name: 'Chips', p_note: 'any salty kind' });

    // Requests are not accepted until the runner says so.
    const pending = await admin<{ status: string }>('select status from public.run_items where signal_id = $1', [sid]);
    assert.deepEqual(pending.map((p) => p.status), ['requested', 'requested']);

    await expectError(ana.rpc('decide_run_item', { p_item: chips, p_decision: 'accepted' }), 'runner_only');
    await runner.rpc('decide_run_item', { p_item: milk, p_decision: 'accepted' });
    await runner.rpc('decide_run_item', { p_item: milk, p_decision: 'accepted' }); // duplicate tap → no-op
    await runner.rpc('decide_run_item', { p_item: chips, p_decision: 'declined' });

    const result = await runner.rpc<{ status: string }>('complete_run', { p_signal: sid });
    assert.equal(result.status, 'resolved');
    const again = await runner.rpc<{ already: boolean }>('complete_run', { p_signal: sid });
    assert.equal(again.already, true);

    const [sig] = await admin<{ status: string }>('select status from public.signals where id = $1', [sid]);
    assert.equal(sig.status, 'resolved');

    const anaNotes = await notificationsFor(ana);
    assert.ok(anaNotes.some((n) => n.title === 'Runner will grab Oat milk'));
    assert.ok(anaNotes.some((n) => n.title === 'Runner is back from the run'));
    const benNotes = await notificationsFor(ben);
    assert.ok(benNotes.some((n) => n.title === 'Runner can\'t grab Chips this time'));
    // Exactly one "will grab" notification despite the duplicate tap.
    assert.equal(anaNotes.filter((n) => n.title === 'Runner will grab Oat milk').length, 1);

    // Adding an item marks the requester as "grab me".
    const responses = await admin<{ response: string }>(
      'select response from public.signal_responses where signal_id = $1 order by user_id', [sid]);
    assert.ok(responses.every((r) => r.response === 'grab_me'));
  });
});

describe('run rules', () => {
  test('requests close at the cutoff and when the runner heads out', async () => {
    const house = await createHouse(['Cam', 'Dot']);
    const [cam, dot] = house.members;
    const sid = await cam.rpc<string>('create_signal', {
      p_household: house.id, p_kind: 'run', p_title: 'Pharmacy run', p_details: { run_type: 'pharmacy', leaves_at: inMinutes(10) },
    });
    await dot.rpc('add_run_item', { p_signal: sid, p_name: 'Tissues' });
    await cam.rpc('start_run', { p_signal: sid });
    await expectError(dot.rpc('add_run_item', { p_signal: sid, p_name: 'Cough drops' }), 'run_closed');

    const sid2 = await cam.rpc<string>('create_signal', {
      p_household: house.id, p_kind: 'run', p_title: 'Coffee run', p_details: { run_type: 'takeout', leaves_at: inMinutes(10) },
    });
    await admin(`update public.runs set leaves_at = now() - interval '1 minute' where signal_id = $1`, [sid2]);
    await expectError(dot.rpc('add_run_item', { p_signal: sid2, p_name: 'Latte' }), 'run_closed');
  });

  test('requesters can withdraw their own items, not other people’s', async () => {
    const house = await createHouse(['Eli', 'Flo', 'Gem']);
    const [eli, flo, gem] = house.members;
    const sid = await eli.rpc<string>('create_signal', { p_household: house.id, p_kind: 'run', p_title: 'Target' });
    const item = await flo.rpc<string>('add_run_item', { p_signal: sid, p_name: 'Sponges' });
    await expectError(gem.rpc('withdraw_run_item', { p_item: item }), 'not_found');
    await flo.rpc('withdraw_run_item', { p_item: item });
    await expectError(eli.rpc('decide_run_item', { p_item: item, p_decision: 'accepted' }), 'signal_closed');
  });

  test('item requests per person are capped', async () => {
    const house = await createHouse(['Hub', 'Ivy']);
    const [hub, ivy] = house.members;
    const sid = await hub.rpc<string>('create_signal', { p_household: house.id, p_kind: 'run', p_title: 'Costco' });
    for (let i = 0; i < 15; i++) await ivy.rpc('add_run_item', { p_signal: sid, p_name: `Item ${i}` });
    await expectError(ivy.rpc('add_run_item', { p_signal: sid, p_name: 'One more' }), 'too_many_items');
  });
});
