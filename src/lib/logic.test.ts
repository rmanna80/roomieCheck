/**
 * Unit tests for the pure client logic (no React Native). Run: npm run test:unit
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { MemberStatus, Signal } from '../types/domain';
import { dueLabel, isDue, nextDueDate, upNextAfter } from './chores';
import { errorCode, messageFor } from './errors';
import { findOpportunity } from './opportunity';
import { effectiveStatus, fuseRemaining, isOpen, myResponse, sortFeed, summarize } from './signals';
import { overlaps, roomState, suggestSlots } from './spaces';
import {
  daysBetween, formatDay, formatDuration, formatTime, formatTimeRange, localDate, relative, startTimeChips,
} from './time';

const NY = 'America/New_York';

describe('time', () => {
  // 2026-11-17 23:47 UTC = 6:47 PM in New York (EST, UTC-5)
  const now = new Date('2026-11-17T23:47:00Z');

  test('formats times and ranges in the viewer’s zone', () => {
    assert.equal(formatTime('2026-11-18T00:00:00Z', NY), '7:00 PM');
    assert.equal(formatTimeRange('2026-11-18T00:00:00Z', '2026-11-18T00:45:00Z', NY), '7:00–7:45 PM');
    assert.equal(formatTimeRange('2026-11-17T16:30:00Z', '2026-11-17T17:15:00Z', NY), '11:30 AM–12:15 PM');
  });

  test('local dates respect the time zone, not UTC', () => {
    assert.equal(localDate(now, NY), '2026-11-17');
    assert.equal(localDate(now, 'UTC'), '2026-11-17');
    assert.equal(localDate('2026-11-18T03:00:00Z', NY), '2026-11-17');
    assert.equal(daysBetween('2026-11-17', '2026-11-24'), 7);
  });

  test('day labels', () => {
    assert.equal(formatDay('2026-11-18T01:00:00Z', NY, now), 'Today'); // 8 PM local
    assert.equal(formatDay('2026-11-18T15:00:00Z', NY, now), 'Tomorrow');
    assert.equal(formatDay('2026-11-20T15:00:00Z', NY, now), 'Fri');
    assert.equal(formatDay('2026-12-01T15:00:00Z', NY, now), 'Dec 1');
  });

  test('relative times', () => {
    assert.equal(relative('2026-11-18T00:07:00Z', now), 'in 20 min');
    assert.equal(relative('2026-11-17T21:47:00Z', now), '2h ago');
    assert.equal(relative('2026-11-18T00:32:00Z', now), 'in 45 min');
    assert.equal(relative(now, now), 'just now');
  });

  test('start-time chips begin with Now and step in half hours', () => {
    const chips = startTimeChips(now, NY, { count: 3 });
    assert.deepEqual(chips.map((c) => c.label), ['Now', '7:00 PM', '7:30 PM', '8:00 PM']);
  });

  test('durations', () => {
    assert.equal(formatDuration(45), '45m');
    assert.equal(formatDuration(60), '1h');
    assert.equal(formatDuration(90), '1h 30m');
  });
});

describe('space slots', () => {
  const now = new Date('2026-11-17T22:00:00Z');
  const busy = [{ start: '2026-11-18T00:00:00Z', end: '2026-11-18T01:00:00Z' }]; // 7–8 PM NY

  test('back-to-back windows do not overlap', () => {
    assert.equal(overlaps(busy[0], { start: '2026-11-18T01:00:00Z', end: '2026-11-18T01:45:00Z' }), false);
    assert.equal(overlaps(busy[0], { start: '2026-11-18T00:30:00Z', end: '2026-11-18T01:15:00Z' }), true);
  });

  test('suggests the slot right after and right before a conflict (Scenario B)', () => {
    const slots = suggestSlots({ desiredStart: '2026-11-18T00:30:00Z', durationMinutes: 45, busy, now });
    assert.deepEqual(slots, [
      { start: '2026-11-17T23:15:00.000Z', end: '2026-11-18T00:00:00.000Z' },
      { start: '2026-11-18T01:00:00.000Z', end: '2026-11-18T01:45:00.000Z' },
    ]);
    for (const s of slots) assert.equal(overlaps(s, busy[0]), false);
  });

  test('never suggests the past', () => {
    const soon = new Date('2026-11-17T23:50:00Z');
    const slots = suggestSlots({ desiredStart: '2026-11-18T00:30:00Z', durationMinutes: 45, busy, now: soon });
    assert.ok(slots.every((s) => new Date(s.start) >= soon));
  });

  test('room state', () => {
    const at = new Date('2026-11-18T00:30:00Z');
    assert.deepEqual(roomState(busy, at).busyNow, busy[0]);
    assert.equal(roomState(busy, new Date('2026-11-17T20:00:00Z')).next, busy[0]);
  });
});

describe('chores', () => {
  test('next due date mirrors the SQL rule', () => {
    assert.equal(nextDueDate('2026-11-15', 7, '2026-11-15'), '2026-11-22');
    assert.equal(nextDueDate('2026-11-15', 7, '2026-11-17'), '2026-11-22'); // late, still in the future
    assert.equal(nextDueDate('2026-10-28', 7, '2026-11-17'), '2026-11-18'); // 20 days late → first slot ≥ today
    assert.equal(nextDueDate('2026-11-10', 7, '2026-11-17'), '2026-11-17'); // lands exactly on today
  });

  test('gentle due copy, never "overdue"', () => {
    assert.equal(dueLabel('2026-11-17', '2026-11-17'), 'Due today');
    assert.equal(dueLabel('2026-11-18', '2026-11-17'), 'Due tomorrow');
    assert.equal(dueLabel('2026-11-15', '2026-11-17'), 'Whenever you get a minute');
    assert.equal(isDue('2026-11-15', '2026-11-17'), true);
  });

  test('up next follows rotation order and wraps', () => {
    const chore = { rotation_anchor_id: 'c', chore_rotation: [{ user_id: 'a', position: 1 }, { user_id: 'c', position: 3 }, { user_id: 'b', position: 2 }] };
    assert.equal(upNextAfter(chore), 'a');
    assert.equal(upNextAfter({ ...chore, rotation_anchor_id: 'a' }), 'b');
  });
});

function signal(overrides: Partial<Signal>): Signal {
  return {
    id: 's1', household_id: 'h', created_by: 'cook', kind: 'food', title: 'Tacos', body: null, status: 'active',
    audience: 'household', starts_at: null, expires_at: '2026-11-18T03:00:00Z', resolved_at: null,
    created_at: '2026-11-18T00:00:00Z', signal_responses: [], food_details: null, runs: null, space_windows: null,
    sparks: null, resets: null, ...overrides,
  };
}

const resp = (user_id: string, response: string, portions: number | null = null) =>
  ({ signal_id: 's1', user_id, response, portions, note: null, updated_at: '' });

describe('signals', () => {
  test('past-expiry signals read as expired even before the job runs', () => {
    const s = signal({});
    assert.equal(effectiveStatus(s, new Date('2026-11-18T02:59:00Z')), 'active');
    assert.equal(effectiveStatus(s, new Date('2026-11-18T03:00:00Z')), 'expired');
    assert.equal(isOpen({ ...s, status: 'canceled' }, new Date('2026-11-18T01:00:00Z')), false);
  });

  test('fuse burns from creation to expiry', () => {
    const s = signal({});
    assert.equal(fuseRemaining(s, new Date('2026-11-18T00:00:00Z')), 1);
    assert.equal(fuseRemaining(s, new Date('2026-11-18T01:30:00Z')), 0.5);
    assert.equal(fuseRemaining(s, new Date('2026-11-18T05:00:00Z')), 0);
  });

  test('summaries count portions and stay blame-free (Scenario C)', () => {
    const s = signal({ signal_responses: [resp('a', 'in', 1), resp('b', 'in', 2), resp('c', 'save_me', 1), resp('d', 'not_tonight')] });
    assert.equal(summarize(s), '4 portions · 3 people');
    assert.equal(myResponse(s, 'b'), 'in');
    assert.equal(myResponse(s, 'zed'), null);
    assert.equal(summarize(signal({})), 'No one yet');
  });

  test('leftovers and sparks', () => {
    assert.equal(summarize(signal({ kind: 'leftovers', food_details: { portions_total: 2, location: null }, signal_responses: [resp('a', 'claimed', 1)] })), '1 of 2 left');
    assert.equal(summarize(signal({ kind: 'spark', status: 'proposed', sparks: { min_people: 3, plan_at: null, became_plan_at: null }, signal_responses: [resp('a', 'in')] })), '2 of 3 needed');
    assert.equal(summarize(signal({ kind: 'spark', status: 'active', sparks: { min_people: 2, plan_at: null, became_plan_at: 'x' }, signal_responses: [resp('a', 'in'), resp('b', 'in')] })), 'It’s on · 3 in');
  });

  test('feed puts signals waiting on me first', () => {
    const a = signal({ id: 'a', created_at: '2026-11-18T00:00:00Z' });
    const b = signal({ id: 'b', created_at: '2026-11-18T01:00:00Z' });
    assert.deepEqual(sortFeed([a, b], (s) => s.id === 'b').map((s) => s.id), ['b', 'a']);
  });
});

describe('opportunity window', () => {
  const st = (user_id: string, status: MemberStatus['status'], expires = '2026-11-18T05:00:00Z'): MemberStatus =>
    ({ household_id: 'h', user_id, status, label: null, eta_at: null, expires_at: expires, visibility: 'household', updated_at: '' });
  const now = new Date('2026-11-18T00:00:00Z');

  test('needs at least two people who explicitly said they are up to hang out', () => {
    assert.equal(findOpportunity([st('a', 'available')], 'me', now), null);
    assert.equal(findOpportunity([st('a', 'available'), st('b', 'home')], 'me', now), null);
    const o = findOpportunity([st('a', 'available'), st('b', 'available'), st('me', 'available')], 'me', now);
    assert.deepEqual(o, { people: ['a', 'b', 'me'], includesMe: true });
  });

  test('ignores expired statuses', () => {
    assert.equal(findOpportunity([st('a', 'available', '2026-11-17T00:00:00Z'), st('b', 'available')], 'me', now), null);
  });
});

describe('errors', () => {
  test('maps server codes to friendly copy', () => {
    assert.equal(errorCode({ message: 'space_taken' }), 'space_taken');
    assert.match(messageFor({ message: 'space_taken' }), /just agreed for someone else/);
    assert.equal(errorCode(new TypeError('Network request failed')), 'network');
    assert.match(messageFor({ message: 'something odd' }), /Something went wrong/);
  });
});
