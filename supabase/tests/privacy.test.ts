/**
 * Scenario G + privacy boundaries. A member of Household A must never read or change anything
 * belonging to Household B, no matter what the client sends.
 */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { admin, anon, createHouse, createUser, expectError, House, inMinutes, pool } from './support/harness';

let A: House;
let B: House;
let bSignal: string;
let bWindow: string;

before(async () => {
  A = await createHouse(['Ava', 'Abe']);
  B = await createHouse(['Bo', 'Bea']);
  const [bo] = B.members;
  bSignal = await bo.rpc<string>('create_signal', {
    p_household: B.id,
    p_kind: 'food',
    p_title: 'Making tacos at 7',
    p_starts_at: inMinutes(60),
  });
  const win = await bo.rpc<{ signal_id: string }>('request_space_window', {
    p_household: B.id,
    p_space: B.spaces['Living room'],
    p_starts: inMinutes(120),
    p_ends: inMinutes(165),
  });
  bWindow = win.signal_id;
  await bo.rpc('set_status', { p_household: B.id, p_status: 'home_later', p_eta: inMinutes(180) });
  await bo.rpc('create_chore', { p_household: B.id, p_title: 'Trash', p_icon: 'trash', p_cadence_days: 7 });
});

after(() => pool.end());

describe('Scenario G — cross-household isolation', () => {
  test('a member of A cannot read a signal of B', async () => {
    const [ava] = A.members;
    const rows = await ava.query('select * from public.signals where id = $1', [bSignal]);
    assert.equal(rows.length, 0);
  });

  test('a member of A sees none of B’s rows in any household table', async () => {
    const [ava] = A.members;
    assert.equal((await ava.query('select 1 from public.households where id = $1', [B.id])).length, 0);
    const tables = [
      'household_members', 'household_invites', 'spaces', 'signals', 'signal_responses',
      'food_details', 'space_windows', 'space_window_approvals', 'member_statuses', 'chores',
      'chore_rotation', 'events', 'run_items', 'reset_tasks', 'sparks', 'household_audit_log',
    ];
    for (const t of tables) {
      const rows = await ava.query(`select 1 from public.${t} where household_id = $1`, [B.id]);
      assert.equal(rows.length, 0, `leak in ${t}`);
    }
    // Sanity check: B's own member does see these rows, so the zero above is meaningful.
    const [bo] = B.members;
    assert.equal((await bo.query('select 1 from public.signals where id = $1', [bSignal])).length, 1);
    assert.equal((await bo.query('select 1 from public.member_statuses where household_id = $1', [B.id])).length, 1);
  });

  test('a tampered client cannot respond to, comment on, or cancel B’s signal', async () => {
    const [ava] = A.members;
    await expectError(ava.rpc('respond_to_signal', { p_signal: bSignal, p_response: 'in' }), 'not_found');
    await expectError(ava.rpc('add_signal_comment', { p_signal: bSignal, p_body: 'hi' }), 'not_found');
    await expectError(ava.rpc('cancel_signal', { p_signal: bSignal }), 'not_found');
    await expectError(ava.rpc('decide_space_window', { p_signal: bWindow, p_decision: 'approved' }), /not_an_approver|not_found/);
  });

  test('a tampered client cannot create content in B by passing B’s household id', async () => {
    const [ava] = A.members;
    await expectError(
      ava.rpc('create_signal', { p_household: B.id, p_kind: 'food', p_title: 'sneaky' }),
      'not_member',
    );
    await expectError(
      ava.rpc('request_space_window', {
        p_household: B.id, p_space: B.spaces['Living room'], p_starts: inMinutes(300), p_ends: inMinutes(330),
      }),
      'not_member',
    );
    await expectError(ava.rpc('set_status', { p_household: B.id, p_status: 'home' }), 'not_member');
    await expectError(ava.rpc('get_or_create_invite', { p_household: B.id }), 'not_member');
    // Using A's household id with B's space id must not work either.
    await expectError(
      ava.rpc('request_space_window', {
        p_household: A.id, p_space: B.spaces['Living room'], p_starts: inMinutes(300), p_ends: inMinutes(330),
      }),
      'space_not_found',
    );
  });

  test('direct table writes are denied regardless of client', async () => {
    const [ava] = A.members;
    await expectError(
      ava.query(
        `insert into public.signals (household_id, created_by, kind, title, expires_at)
         values ($1, $2, 'food', 'direct', now() + interval '1 hour')`,
        [A.id, ava.id],
      ),
      'permission denied',
    );
    await expectError(
      ava.query(`insert into public.household_members (household_id, user_id) values ($1, $2)`, [B.id, ava.id]),
      'permission denied',
    );
    await expectError(ava.query(`update public.signals set title = 'x' where id = $1`, [bSignal]), 'permission denied');
    await expectError(ava.query(`delete from public.signals where id = $1`, [bSignal]), 'permission denied');
  });

  test('profiles are only visible to housemates', async () => {
    const [ava, abe] = A.members;
    const [bo] = B.members;
    const visible = await ava.query<{ id: string }>('select id from public.profiles');
    const ids = visible.map((r) => r.id).sort();
    assert.deepEqual(ids, [ava.id, abe.id].sort());
    assert.equal((await ava.query('select 1 from public.profiles where id = $1', [bo.id])).length, 0);
  });

  test('anonymous requests see nothing and can call nothing', async () => {
    assert.equal((await anon.query('select * from public.signals')).length, 0);
    assert.equal((await anon.query('select * from public.profiles')).length, 0);
    await expectError(anon.rpc('create_household', { p_name: 'x' }), 'permission denied');
    await expectError(anon.rpc('join_household', { p_code: B.code }), 'permission denied');
  });

  test('private helpers and analytics are not callable by users', async () => {
    const [ava] = A.members;
    await expectError(
      ava.query(`select private.notify($1, $2, 'food', 'spoof')`, [B.members[0].id, B.id]),
      'permission denied',
    );
    await expectError(ava.query(`select private.expire_signals()`), 'permission denied');
    await expectError(ava.query(`select * from analytics.notification_opt_out()`), 'permission denied');
    await expectError(ava.query(`select * from private.join_attempts`), 'permission denied');
  });

  test('users can only update their own profile, and only safe columns', async () => {
    const [ava, abe] = A.members;
    await ava.query(`update public.profiles set display_name = 'Ava R' where id = $1`, [ava.id]);
    const updated = await ava.query<{ n: number }>(
      `with u as (update public.profiles set display_name = 'hijack' where id = $1 returning 1) select count(*)::int as n from u`,
      [abe.id],
    );
    assert.equal(updated[0].n, 0);
    await expectError(
      ava.query(`update public.profiles set id = gen_random_uuid() where id = $1`, [ava.id]),
      'permission denied',
    );
  });

  test('the audit log is visible to owners only', async () => {
    const [ava, abe] = A.members;
    assert.ok((await ava.query('select * from public.household_audit_log')).length > 0);
    assert.equal((await abe.query('select * from public.household_audit_log')).length, 0);
  });

  test('Layer 2 tables are closed to clients until verification exists', async () => {
    const [ava] = A.members;
    await admin(`insert into public.buildings (name) values ('Hall 1')`);
    assert.equal((await ava.query('select * from public.buildings')).length, 0);
    await expectError(ava.query(`insert into public.buildings (name) values ('x')`), 'permission denied');
  });
});

describe('audience-restricted signals', () => {
  test('a "selected" signal is hidden from housemates who were not selected', async () => {
    const house = await createHouse(['Cy', 'Di', 'Ed']);
    const [cy, di, ed] = house.members;
    const sid = await cy.rpc<string>('create_signal', {
      p_household: house.id, p_kind: 'spark', p_title: 'Surprise planning for Ed', p_recipients: [di.id],
    });
    assert.equal((await di.query('select 1 from public.signals where id = $1', [sid])).length, 1);
    assert.equal((await ed.query('select 1 from public.signals where id = $1', [sid])).length, 0);
    assert.equal((await ed.query('select 1 from public.sparks where signal_id = $1', [sid])).length, 0);
    await expectError(ed.rpc('respond_to_signal', { p_signal: sid, p_response: 'in' }), 'not_found');
    // Ed received no notification about it either.
    const edNotes = await admin('select 1 from public.notifications where user_id = $1 and signal_id = $2', [ed.id, sid]);
    assert.equal(edNotes.length, 0);
  });

  test('recipients must be members of the household', async () => {
    const house = await createHouse(['Fi', 'Gus']);
    const outsider = await createUser('Hal');
    await expectError(
      house.owner.rpc('create_signal', {
        p_household: house.id, p_kind: 'food', p_title: 'Soup', p_recipients: [outsider.id],
      }),
      'invalid_recipient',
    );
  });
});
