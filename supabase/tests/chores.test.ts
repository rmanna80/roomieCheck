/** Scenario D (trash rotation) plus completion idempotency, late completion, swaps, reminders. */
import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';

import { admin, createHouse, expectError, notificationsFor, pool } from './support/harness';

after(() => pool.end());

/** A time zone where it is currently between 09:00 and 23:00, so reminder timing is deterministic. */
function daytimeZone(): string {
  const candidates = [
    'America/New_York', 'Europe/London', 'Asia/Tokyo', 'Pacific/Honolulu', 'Asia/Kolkata',
    'America/Los_Angeles', 'Australia/Sydney', 'Europe/Berlin', 'Asia/Dubai', 'Pacific/Auckland',
  ];
  for (const tz of candidates) {
    const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
    if (hour >= 9 && hour <= 22) return tz;
  }
  throw new Error('no daytime zone found');
}

async function today(householdId: string): Promise<string> {
  const [row] = await admin<{ d: string }>('select private.household_today($1) as d', [householdId]);
  return row.d;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

describe('Scenario D — trash', () => {
  test('reminder → complete → next rotation calculated', async () => {
    const house = await createHouse(['Ada', 'Bea', 'Cy'], { timeZone: daytimeZone() });
    const [ada, bea, cy] = house.members;
    const due = await today(house.id);
    const chore = await ada.rpc<string>('create_chore', {
      p_household: house.id, p_title: 'Trash', p_icon: 'trash', p_cadence_days: 7, p_first_due: due,
      p_rotation: [bea.id, cy.id, ada.id],
    });

    // The reminder goes privately to Bea only — the rest of the house gets nothing.
    const sent = await admin<{ n: number }>('select private.queue_chore_reminders() as n');
    assert.ok(sent[0].n >= 1);
    const beaNotes = await notificationsFor(bea);
    assert.ok(beaNotes.some((n) => n.title === 'Trash is due today'));
    for (const other of [ada, cy]) {
      assert.ok(!(await notificationsFor(other)).some((n) => n.title.includes('Trash is due')));
    }
    // Reminders are sent once per due date.
    await admin('select private.queue_chore_reminders()');
    assert.equal((await notificationsFor(bea)).filter((n) => n.title === 'Trash is due today').length, 1);

    const res = await bea.rpc<{ completed: boolean; next_due_on: string; assignee_id: string }>('complete_chore', {
      p_chore: chore, p_due_on: due,
    });
    assert.deepEqual(res, { completed: true, next_due_on: addDays(due, 7), assignee_id: cy.id });

    const history = await ada.query<{ completed_by: string; due_on: string }>(
      'select completed_by, due_on from public.chore_completions where chore_id = $1', [chore]);
    assert.deepEqual(history, [{ completed_by: bea.id, due_on: due }]);
    assert.ok((await notificationsFor(cy)).some((n) => n.title === 'You\'re up next for Trash'));
  });
});

describe('responsibility rules', () => {
  test('completing twice (double tap or two housemates) only advances once', async () => {
    const house = await createHouse(['Dan', 'Eva']);
    const [dan, eva] = house.members;
    const due = await today(house.id);
    const chore = await dan.rpc<string>('create_chore', {
      p_household: house.id, p_title: 'Dishes', p_icon: 'dishes', p_cadence_days: 1, p_first_due: due, p_rotation: [dan.id, eva.id],
    });
    const results = await Promise.all([
      dan.rpc<{ completed: boolean }>('complete_chore', { p_chore: chore, p_due_on: due }),
      eva.rpc<{ completed: boolean }>('complete_chore', { p_chore: chore, p_due_on: due }),
    ]);
    assert.equal(results.filter((r) => r.completed).length, 1);
    const [c] = await admin<{ next_due_on: string }>('select next_due_on from public.chores where id = $1', [chore]);
    assert.equal(c.next_due_on, addDays(due, 1));
    assert.equal((await admin('select 1 from public.chore_completions where chore_id = $1', [chore])).length, 1);
  });

  test('a very late completion rolls the next due date forward to today or later', async () => {
    const house = await createHouse(['Fin', 'Gwen']);
    const [fin, gwen] = house.members;
    const t = await today(house.id);
    const chore = await fin.rpc<string>('create_chore', {
      p_household: house.id, p_title: 'Vacuum', p_icon: 'vacuum', p_cadence_days: 7, p_first_due: t, p_rotation: [fin.id, gwen.id],
    });
    const longAgo = addDays(t, -20);
    await admin('update public.chores set next_due_on = $2 where id = $1', [chore, longAgo]);
    const res = await fin.rpc<{ next_due_on: string }>('complete_chore', { p_chore: chore, p_due_on: longAgo });
    assert.equal(res.next_due_on, addDays(longAgo, 21)); // -20 + 21 = tomorrow, first weekly slot ≥ today
  });

  test('a swap exchanges turns: the helper goes now, the requester takes the helper’s next slot', async () => {
    const house = await createHouse(['Hugo', 'Iris', 'Jade']);
    const [hugo, iris, jade] = house.members;
    const due = await today(house.id);
    const chore = await hugo.rpc<string>('create_chore', {
      p_household: house.id, p_title: 'Bathroom', p_icon: 'bathroom', p_cadence_days: 7, p_first_due: due,
      p_rotation: [hugo.id, iris.id, jade.id],
    });
    await expectError(iris.rpc('request_chore_swap', { p_chore: chore, p_to_user: jade.id }), 'assignee_only');
    const swap = await hugo.rpc<string>('request_chore_swap', { p_chore: chore, p_to_user: iris.id });
    assert.ok((await notificationsFor(iris)).some((n) => n.actionable && n.title.includes('asked if you can take Bathroom')));
    // Swaps are private between the two people.
    assert.equal((await jade.query('select 1 from public.chore_swaps where id = $1', [swap])).length, 0);
    await expectError(jade.rpc('respond_chore_swap', { p_swap: swap, p_accept: true }), 'not_found');

    await iris.rpc('respond_chore_swap', { p_swap: swap, p_accept: true });
    const [c1] = await admin<{ assignee_id: string }>('select assignee_id from public.chores where id = $1', [chore]);
    assert.equal(c1.assignee_id, iris.id);

    // Iris completes; next turn is Hugo's (he took her slot), then Jade.
    const r1 = await iris.rpc<{ assignee_id: string }>('complete_chore', { p_chore: chore, p_due_on: due });
    assert.equal(r1.assignee_id, hugo.id);
    const r2 = await hugo.rpc<{ assignee_id: string; next_due_on: string }>('complete_chore', {
      p_chore: chore, p_due_on: addDays(due, 7),
    });
    assert.equal(r2.assignee_id, jade.id);
  });

  test('a declined swap leaves everything as it was', async () => {
    const house = await createHouse(['Kai', 'Lia']);
    const [kai, lia] = house.members;
    const chore = await kai.rpc<string>('create_chore', {
      p_household: house.id, p_title: 'Recycling', p_icon: 'recycle', p_cadence_days: 14, p_rotation: [kai.id, lia.id],
    });
    const swap = await kai.rpc<string>('request_chore_swap', { p_chore: chore, p_to_user: lia.id });
    assert.deepEqual(await lia.rpc('respond_chore_swap', { p_swap: swap, p_accept: false }), { status: 'declined' });
    const [c] = await admin<{ assignee_id: string }>('select assignee_id from public.chores where id = $1', [chore]);
    assert.equal(c.assignee_id, kai.id);
    assert.ok((await notificationsFor(kai)).some((n) => n.title === 'Lia can\'t swap Recycling this time'));
  });
});
