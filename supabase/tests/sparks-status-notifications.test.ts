/** Scenario E (movie night), Scenario F (home status), and notification preferences. */
import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';

import { admin, createHouse, createUser, expectError, inMinutes, notificationsFor, pool } from './support/harness';

after(() => pool.end());

describe('Scenario E — movie night', () => {
  test('two join, one declines, the plan appears on the household calendar', async () => {
    const house = await createHouse(['Host', 'Ivy', 'Jon', 'Kay']);
    const [host, ivy, jon, kay] = house.members;
    const sid = await host.rpc<string>('create_signal', {
      p_household: house.id, p_kind: 'spark', p_title: 'Movie at 9?', p_details: { plan_at: inMinutes(120), min_people: 3 },
    });
    const [s0] = await admin<{ status: string }>('select status from public.signals where id = $1', [sid]);
    assert.equal(s0.status, 'proposed');

    const first = await ivy.rpc<{ became_plan: boolean }>('respond_to_signal', { p_signal: sid, p_response: 'in' });
    assert.equal(first.became_plan, false); // host + Ivy = 2 of 3
    const hostBefore = (await notificationsFor(host)).length;
    await kay.rpc('respond_to_signal', { p_signal: sid, p_response: 'cant' });
    assert.equal((await notificationsFor(host)).length, hostBefore, 'declining must not notify anyone');

    const second = await jon.rpc<{ became_plan: boolean; status: string }>('respond_to_signal', { p_signal: sid, p_response: 'in' });
    assert.equal(second.became_plan, true);
    assert.equal(second.status, 'active');

    // Every member can see the plan on the calendar.
    for (const m of house.members) {
      const events = await m.query<{ title: string; signal_id: string }>('select title, signal_id from public.events where household_id = $1', [house.id]);
      assert.deepEqual(events, [{ title: 'Movie at 9?', signal_id: sid }]);
    }
    assert.ok((await notificationsFor(ivy)).some((n) => n.title === 'It\'s on: Movie at 9?'));
    assert.ok(!(await notificationsFor(kay)).some((n) => n.title === 'It\'s on: Movie at 9?'));

    // Joining again doesn't create a second event.
    await ivy.rpc('respond_to_signal', { p_signal: sid, p_response: 'in' });
    assert.equal((await admin('select 1 from public.events where signal_id = $1', [sid])).length, 1);
  });

  test('a spontaneous spark (no plan time) stays open for two hours', async () => {
    const house = await createHouse(['Nyx', 'Oz']);
    const [nyx] = house.members;
    const sid = await nyx.rpc<string>('create_signal', { p_household: house.id, p_kind: 'spark', p_title: 'Coffee run?' });
    await admin('select private.expire_signals()');
    const [s] = await admin<{ status: string; minutes: number }>(
      `select status, round(extract(epoch from expires_at - created_at) / 60)::int as minutes from public.signals where id = $1`, [sid]);
    assert.deepEqual(s, { status: 'proposed', minutes: 120 });
  });

  test('a spark nobody joins expires quietly at its planned time', async () => {
    const house = await createHouse(['Lux', 'Moe']);
    const [lux] = house.members;
    const sid = await lux.rpc<string>('create_signal', {
      p_household: house.id, p_kind: 'spark', p_title: 'Gym?', p_details: { plan_at: inMinutes(30) },
    });
    await admin(`update public.signals set starts_at = now() - interval '10 minutes' where id = $1`, [sid]);
    await admin('select private.expire_signals()');
    const [grace] = await admin<{ status: string }>('select status from public.signals where id = $1', [sid]);
    assert.equal(grace.status, 'proposed', 'late joiners get 15 minutes of grace');
    await admin(`update public.signals set starts_at = now() - interval '16 minutes' where id = $1`, [sid]);
    await admin('select private.expire_signals()');
    const [s] = await admin<{ status: string }>('select status from public.signals where id = $1', [sid]);
    assert.equal(s.status, 'expired');
    assert.equal((await admin('select 1 from public.events where signal_id = $1', [sid])).length, 0);
  });
});

describe('Scenario F — home status', () => {
  test('visible only to authorized housemates, expires, can be hidden any time', async () => {
    const house = await createHouse(['Nova', 'Otto', 'Pia']);
    const [nova, otto, pia] = house.members;
    const outsider = await createUser('Quincy');

    const res = await nova.rpc<{ expires_at: string }>('set_status', {
      p_household: house.id, p_status: 'home_later', p_eta: inMinutes(120),
    });
    assert.ok(res.expires_at);
    assert.equal((await otto.query('select 1 from public.member_statuses where user_id = $1', [nova.id])).length, 1);
    assert.equal((await outsider.query('select 1 from public.member_statuses where user_id = $1', [nova.id])).length, 0);

    // Shared with Otto only.
    await nova.rpc('set_status', {
      p_household: house.id, p_status: 'home_later', p_eta: inMinutes(120), p_visibility: 'selected', p_viewers: [otto.id],
    });
    assert.equal((await otto.query('select 1 from public.member_statuses where user_id = $1', [nova.id])).length, 1);
    assert.equal((await pia.query('select 1 from public.member_statuses where user_id = $1', [nova.id])).length, 0);
    // Pia can't even learn who it was shared with.
    assert.equal((await pia.query('select 1 from public.status_viewers where user_id = $1', [nova.id])).length, 0);

    // Expired statuses disappear for everyone but the owner.
    await admin(`update public.member_statuses set expires_at = now() - interval '1 second' where user_id = $1`, [nova.id]);
    assert.equal((await otto.query('select 1 from public.member_statuses where user_id = $1', [nova.id])).length, 0);
    assert.equal((await nova.query('select 1 from public.member_statuses where user_id = $1', [nova.id])).length, 1);

    // Hide = gone.
    await nova.rpc('set_status', { p_household: house.id, p_status: 'studying' });
    await nova.rpc('clear_status', { p_household: house.id });
    assert.equal((await admin('select 1 from public.member_statuses where user_id = $1', [nova.id])).length, 0);
  });

  test('turning status sharing off removes statuses and blocks new ones', async () => {
    const house = await createHouse(['Remy', 'Sage']);
    const [remy] = house.members;
    await remy.rpc('set_status', { p_household: house.id, p_status: 'available' });
    await remy.rpc('set_status_sharing', { p_enabled: false });
    assert.equal((await admin('select 1 from public.member_statuses where user_id = $1', [remy.id])).length, 0);
    await expectError(remy.rpc('set_status', { p_household: house.id, p_status: 'home' }), 'status_sharing_disabled');
    await remy.rpc('set_status_sharing', { p_enabled: true });
    await remy.rpc('set_status', { p_household: house.id, p_status: 'home' });
  });

  test('statuses are bounded in time and custom ones need a label', async () => {
    const house = await createHouse(['Tao']);
    const [tao] = house.members;
    await expectError(tao.rpc('set_status', { p_household: house.id, p_status: 'busy', p_expires_at: inMinutes(60 * 25) }), 'invalid_time');
    await expectError(tao.rpc('set_status', { p_household: house.id, p_status: 'custom' }), /check constraint/);
    await tao.rpc('set_status', { p_household: house.id, p_status: 'custom', p_label: 'At practice' });
  });
});

describe('notifications & preferences', () => {
  test('muted categories create nothing; actionable requests always arrive; push follows prefs', async () => {
    const house = await createHouse(['Uma', 'Vik']);
    const [uma, vik] = house.members;
    await vik.query(`update public.notification_preferences set food = false, spaces = false, push_enabled = false where user_id = $1`, [vik.id]);

    await uma.rpc('create_signal', { p_household: house.id, p_kind: 'food', p_title: 'Waffles' });
    await uma.rpc('request_space_window', {
      p_household: house.id, p_space: house.spaces['Living room'], p_starts: inMinutes(60), p_ends: inMinutes(90),
    });
    const notes = await notificationsFor(vik);
    assert.ok(!notes.some((n) => n.title.includes('Waffles')));
    const request = notes.find((n) => n.category === 'requests');
    assert.ok(request, 'approval request must arrive');
    assert.equal(request.push, false);
  });

  test('users read and clear only their own notifications', async () => {
    const house = await createHouse(['Wyn', 'Xio']);
    const [wyn, xio] = house.members;
    await wyn.rpc('create_signal', { p_household: house.id, p_kind: 'quiet', p_title: 'Call 3–4' });
    assert.equal((await wyn.query('select 1 from public.notifications where user_id = $1', [xio.id])).length, 0);
    const marked = await xio.rpc<number>('mark_notifications_read');
    assert.ok(marked >= 1);
    assert.equal(await wyn.rpc<number>('mark_notifications_read', { p_ids: null }), 1); // only "Xio joined"
  });

  test('push tokens belong to whoever registered them last', async () => {
    const yara = await createUser('Yara');
    const zane = await createUser('Zane');
    const token = 'ExponentPushToken[test-device-123]';
    await yara.rpc('register_push_token', { p_token: token, p_platform: 'ios' });
    await zane.rpc('register_push_token', { p_token: token, p_platform: 'ios' });
    assert.equal((await yara.query('select 1 from public.push_tokens')).length, 0);
    assert.equal((await zane.query('select 1 from public.push_tokens')).length, 1);
  });
});
