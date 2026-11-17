import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { chunk, inQuietHours, minutesOfDay, toExpoMessages } from './pushPolicy';

describe('push policy', () => {
  // 2026-11-18 03:30 UTC = 10:30 PM in New York
  const lateNight = new Date('2026-11-18T03:30:00Z');
  const afternoon = new Date('2026-11-17T19:00:00Z'); // 2 PM New York

  test('minutes of day in the user’s zone', () => {
    assert.equal(minutesOfDay(lateNight, 'America/New_York'), 22 * 60 + 30);
  });

  test('quiet hours wrap past midnight', () => {
    assert.equal(inQuietHours(lateNight, 'America/New_York', '22:00:00', '08:00:00'), true);
    assert.equal(inQuietHours(afternoon, 'America/New_York', '22:00:00', '08:00:00'), false);
  });

  test('boundary minutes: start is quiet, end is not', () => {
    const at = (h: number, m: number) => new Date(Date.UTC(2026, 10, 18, h + 5, m)); // NY = UTC-5
    assert.equal(inQuietHours(at(22, 0), 'America/New_York', '22:00', '08:00'), true);
    assert.equal(inQuietHours(at(7, 59), 'America/New_York', '22:00', '08:00'), true);
    assert.equal(inQuietHours(at(8, 0), 'America/New_York', '22:00', '08:00'), false);
  });

  test('no quiet hours configured means always deliver', () => {
    assert.equal(inQuietHours(lateNight, 'America/New_York', null, null), false);
  });

  test('messages carry routing data and never sound', () => {
    const msgs = toExpoMessages({ id: 'n1', user_id: 'u', title: 'Maya: Tacos at 7', body: null, signal_id: 's1', chore_id: null }, ['t1', 't2']);
    assert.equal(msgs.length, 2);
    assert.deepEqual(msgs[0].data, { notification_id: 'n1', signal_id: 's1' });
    assert.equal(msgs[0].sound, null);
    assert.equal('body' in msgs[0], false);
  });

  test('chunks requests for the Expo API limit', () => {
    assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  });
});
