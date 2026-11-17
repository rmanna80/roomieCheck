/** Household creation, invitations, joining, departure, removal, and account deletion. */
import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';

import { admin, createHouse, createUser, expectError, inMinutes, notificationsFor, pool } from './support/harness';

after(() => pool.end());

describe('creating and joining a household', () => {
  test('creator becomes owner; spaces and a first invite are created', async () => {
    const house = await createHouse(['Maya']);
    const [maya] = house.members;
    const members = await maya.query<{ role: string }>('select role from public.household_members where household_id = $1', [house.id]);
    assert.deepEqual(members.map((m) => m.role), ['owner']);
    assert.deepEqual(Object.keys(house.spaces).sort(), ['Kitchen', 'Living room']);
    assert.match(house.code, /^[A-HJ-NP-Z2-9]{8}$/);
  });

  test('codes are forgiving about case, spaces and dashes', async () => {
    const house = await createHouse(['Jo']);
    const friend = await createUser('Kai');
    const messy = `${house.code.slice(0, 4).toLowerCase()}-${house.code.slice(4)} `;
    const res = await friend.rpc<{ ok: boolean; household_id: string }>('join_household', { p_code: messy });
    assert.equal(res.ok, true);
    assert.equal(res.household_id, house.id);
  });

  test('joining twice is idempotent', async () => {
    const house = await createHouse(['Lu', 'Mo']);
    const mo = house.members[1];
    const res = await mo.rpc<{ ok: boolean; already_member: boolean }>('join_household', { p_code: house.code });
    assert.equal(res.ok, true);
    assert.equal(res.already_member, true);
    const count = await admin('select 1 from public.household_members where household_id = $1', [house.id]);
    assert.equal(count.length, 2);
  });

  test('existing members are told when someone joins', async () => {
    const house = await createHouse(['Ned', 'Ola']);
    const notes = await notificationsFor(house.members[0]);
    assert.ok(notes.some((n) => n.title === 'Ola joined the house'));
  });

  test('expired, revoked, and used-up invites are rejected', async () => {
    const house = await createHouse(['Pia']);
    const [pia] = house.members;
    const late = await createUser('Quin');

    await admin(`update public.household_invites set expires_at = now() - interval '1 minute' where household_id = $1`, [house.id]);
    assert.deepEqual(await late.rpc('join_household', { p_code: house.code }), { ok: false, error: 'expired_code' });

    const fresh = await pia.rpc<{ code: string }>('get_or_create_invite', { p_household: house.id });
    assert.notEqual(fresh.code, house.code);
    await pia.rpc('regenerate_invite', { p_household: house.id });
    assert.deepEqual(await late.rpc('join_household', { p_code: fresh.code }), { ok: false, error: 'expired_code' });

    const current = await pia.rpc<{ code: string }>('get_or_create_invite', { p_household: house.id });
    await admin(`update public.household_invites set max_uses = 1, use_count = 1 where code = $1`, [current.code]);
    assert.deepEqual(await late.rpc('join_household', { p_code: current.code }), { ok: false, error: 'expired_code' });
  });

  test('only owners can regenerate invites', async () => {
    const house = await createHouse(['Rae', 'Sol']);
    await expectError(house.members[1].rpc('regenerate_invite', { p_household: house.id }), 'owner_only');
  });

  test('guessing codes is throttled after 10 failures in 15 minutes', async () => {
    const house = await createHouse(['Tess']);
    const guesser = await createUser('Uma');
    for (let i = 0; i < 10; i++) {
      const res = await guesser.rpc<{ error: string }>('join_household', { p_code: `ZZZZZZ${String(i).padStart(2, '2')}` });
      assert.equal(res.error, 'invalid_code');
    }
    // Even the correct code is refused while throttled.
    const res = await guesser.rpc<{ ok: boolean; error: string }>('join_household', { p_code: house.code });
    assert.deepEqual(res, { ok: false, error: 'too_many_attempts' });
  });

  test('a household is capped at 16 members', async () => {
    const names = Array.from({ length: 16 }, (_, i) => `Cap${i}`);
    const house = await createHouse(names);
    const seventeenth = await createUser('Cap16');
    const res = await seventeenth.rpc<{ ok: boolean; error: string }>('join_household', { p_code: house.code });
    assert.deepEqual(res, { ok: false, error: 'household_full' });
  });
});

describe('leaving, removal, and account deletion', () => {
  test('when the only owner leaves, the longest-standing member becomes owner', async () => {
    const house = await createHouse(['Vic', 'Wen', 'Xia']);
    const [vic, wen] = house.members;
    await vic.rpc('leave_household', { p_household: house.id });
    const roles = await admin<{ user_id: string; role: string }>(
      'select user_id, role from public.household_members where household_id = $1 order by joined_at', [house.id]);
    assert.equal(roles.length, 2);
    assert.equal(roles.find((r) => r.user_id === wen.id)?.role, 'owner');
    // Vic can no longer see anything in the house.
    assert.equal((await vic.query('select 1 from public.households where id = $1', [house.id])).length, 0);
  });

  test('the last member leaving deletes the household and its data', async () => {
    const house = await createHouse(['Yan']);
    const [yan] = house.members;
    await yan.rpc('create_signal', { p_household: house.id, p_kind: 'food', p_title: 'Soup' });
    await yan.rpc('leave_household', { p_household: house.id });
    assert.equal((await admin('select 1 from public.households where id = $1', [house.id])).length, 0);
    assert.equal((await admin('select 1 from public.signals where household_id = $1', [house.id])).length, 0);
  });

  test('departure cleans up: signals canceled, approvals released, chores rotate on', async () => {
    const house = await createHouse(['Zed', 'Amy', 'Ben']);
    const [zed, amy, ben] = house.members;
    const dinner = await amy.rpc<string>('create_signal', { p_household: house.id, p_kind: 'food', p_title: 'Pasta' });
    await zed.rpc('respond_to_signal', { p_signal: dinner, p_response: 'in' });
    const amySignal = await amy.rpc<string>('create_signal', { p_household: house.id, p_kind: 'quiet', p_title: 'Exam tomorrow' });

    // Zed requests the living room; Amy and Ben must approve.
    const win = await zed.rpc<{ signal_id: string }>('request_space_window', {
      p_household: house.id, p_space: house.spaces['Living room'], p_starts: inMinutes(60), p_ends: inMinutes(105),
    });
    await ben.rpc('decide_space_window', { p_signal: win.signal_id, p_decision: 'approved' });

    // Amy is next for trash after Zed.
    const chore = await zed.rpc<string>('create_chore', {
      p_household: house.id, p_title: 'Trash', p_icon: 'trash', p_cadence_days: 7, p_rotation: [amy.id, ben.id, zed.id],
    });

    await amy.rpc('leave_household', { p_household: house.id });

    const [sig] = await admin<{ status: string }>('select status from public.signals where id = $1', [amySignal]);
    assert.equal(sig.status, 'canceled');
    // Amy's pending approval no longer blocks Zed: the window becomes agreed.
    const [w] = await admin<{ state: string }>('select state from public.space_windows where signal_id = $1', [win.signal_id]);
    assert.equal(w.state, 'agreed');
    // Trash rotates to the next person in order.
    const [c] = await admin<{ assignee_id: string; rotation_anchor_id: string }>(
      'select assignee_id, rotation_anchor_id from public.chores where id = $1', [chore]);
    assert.equal(c.assignee_id, ben.id);
    assert.equal(c.rotation_anchor_id, ben.id);
    const rotation = await admin('select user_id from public.chore_rotation where chore_id = $1', [chore]);
    assert.equal(rotation.length, 2);
  });

  test('owners can remove members; members cannot; removal is audited', async () => {
    const house = await createHouse(['Cal', 'Dee', 'Eli']);
    const [cal, dee, eli] = house.members;
    await expectError(dee.rpc('remove_member', { p_household: house.id, p_user: eli.id }), 'owner_only');
    await cal.rpc('remove_member', { p_household: house.id, p_user: eli.id });
    assert.equal((await eli.query('select 1 from public.households where id = $1', [house.id])).length, 0);
    const log = await cal.query<{ action: string }>('select action from public.household_audit_log where household_id = $1', [house.id]);
    assert.ok(log.some((l) => l.action === 'member_removed'));
    const eliNotes = await notificationsFor(eli);
    assert.ok(eliNotes.some((n) => n.title.startsWith('You were removed from')));
  });

  test('the last owner cannot be demoted', async () => {
    const house = await createHouse(['Fay', 'Gil']);
    const [fay, gil] = house.members;
    await expectError(fay.rpc('set_member_role', { p_household: house.id, p_user: fay.id, p_role: 'member' }), 'last_owner');
    await fay.rpc('set_member_role', { p_household: house.id, p_user: gil.id, p_role: 'owner' });
    await fay.rpc('set_member_role', { p_household: house.id, p_user: fay.id, p_role: 'member' });
  });

  test('deleting an account removes the person everywhere and keeps the house working', async () => {
    const house = await createHouse(['Hana', 'Ivo']);
    const [hana, ivo] = house.members;
    const sid = await hana.rpc<string>('create_signal', { p_household: house.id, p_kind: 'food', p_title: 'Curry' });
    await hana.rpc('set_status', { p_household: house.id, p_status: 'home' });
    const chore = await ivo.rpc<string>('create_chore', {
      p_household: house.id, p_title: 'Dishes', p_icon: 'dishes', p_cadence_days: 1, p_rotation: [hana.id, ivo.id],
    });

    // The account-deletion Edge Function calls auth.admin.deleteUser → this cascade.
    await admin('delete from auth.users where id = $1', [hana.id]);

    assert.equal((await admin('select 1 from public.profiles where id = $1', [hana.id])).length, 0);
    assert.equal((await admin('select 1 from public.signals where id = $1', [sid])).length, 0);
    assert.equal((await admin('select 1 from public.member_statuses where user_id = $1', [hana.id])).length, 0);
    const [m] = await admin<{ role: string }>('select role from public.household_members where household_id = $1', [house.id]);
    assert.equal(m.role, 'owner');
    const [c] = await admin<{ assignee_id: string }>('select assignee_id from public.chores where id = $1', [chore]);
    assert.equal(c.assignee_id, ivo.id);
  });

  test('a user can export their own data', async () => {
    const house = await createHouse(['Jai']);
    const [jai] = house.members;
    await jai.rpc('create_signal', { p_household: house.id, p_kind: 'quiet', p_title: 'Call at 3' });
    const data = await jai.rpc<{ profile: { display_name: string }; signals: unknown[]; memberships: unknown[] }>('export_my_data');
    assert.equal(data.profile.display_name, 'Jai');
    assert.equal(data.signals.length, 1);
    assert.equal(data.memberships.length, 1);
  });
});
