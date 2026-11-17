/** Responsibility helpers (mirror of the SQL rules in 0700_status_chore_rpc.sql). */
import type { Chore, UUID } from '../types/domain';
import { daysBetween } from './time';

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Mirrors private.next_due_date: one cadence later, rolled forward to today if already past. */
export function nextDueDate(due: string, cadenceDays: number, today: string): string {
  const next = addDays(due, cadenceDays);
  const behind = daysBetween(next, today);
  if (behind <= 0) return next;
  return addDays(next, Math.ceil(behind / cadenceDays) * cadenceDays);
}

/** Gentle, non-judgmental due copy. Never "overdue". */
export function dueLabel(dueOn: string, today: string): string {
  const diff = daysBetween(today, dueOn);
  if (diff === 0) return 'Due today';
  if (diff === 1) return 'Due tomorrow';
  if (diff > 1 && diff < 7) {
    const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${dueOn}T12:00:00Z`));
    return `Due ${weekday}`;
  }
  if (diff >= 7) {
    return `Due ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${dueOn}T12:00:00Z`))}`;
  }
  return 'Whenever you get a minute';
}

export function isDue(dueOn: string, today: string): boolean {
  return daysBetween(today, dueOn) <= 0;
}

export function rotationOrder(chore: Pick<Chore, 'chore_rotation'>): UUID[] {
  return [...chore.chore_rotation].sort((a, b) => a.position - b.position).map((r) => r.user_id);
}

/** Who's after the current anchor (mirrors private.next_in_rotation). */
export function upNextAfter(chore: Pick<Chore, 'chore_rotation' | 'rotation_anchor_id'>): UUID | null {
  const order = rotationOrder(chore);
  if (order.length === 0) return null;
  const i = chore.rotation_anchor_id ? order.indexOf(chore.rotation_anchor_id) : -1;
  return order[(i + 1) % order.length];
}

export function cadenceLabel(days: number): string {
  switch (days) {
    case 1: return 'Every day';
    case 2: return 'Every other day';
    case 3: return 'Every 3 days';
    case 7: return 'Weekly';
    case 14: return 'Every 2 weeks';
    case 30: return 'Monthly';
    default: return `Every ${days} days`;
  }
}

/** MaterialCommunityIcons glyph per chore icon key. */
export const CHORE_GLYPH: Record<string, string> = {
  trash: 'trash-can-outline', recycle: 'recycle', dishes: 'silverware-clean', bathroom: 'shower-head', vacuum: 'robot-vacuum',
  kitchen: 'countertop-outline', supplies: 'package-variant', pet: 'paw', plants: 'sprout-outline', laundry: 'washing-machine', other: 'checkbox-marked-circle-outline',
};
