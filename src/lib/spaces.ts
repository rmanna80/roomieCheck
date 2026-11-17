/**
 * Space Window helpers: overlap checks and alternative-slot suggestions.
 * The server is the authority on conflicts (exclusion constraint); this only proposes options.
 */
import { addMinutes, MINUTE, roundUp } from './time';

export interface Interval {
  start: string | Date;
  end: string | Date;
}

const ms = (d: string | Date) => new Date(d).getTime();

/** Half-open [start, end) overlap — back-to-back windows do not conflict. */
export function overlaps(a: Interval, b: Interval): boolean {
  return ms(a.start) < ms(b.end) && ms(b.start) < ms(a.end);
}

export interface SlotOptions {
  desiredStart: string | Date;
  durationMinutes: number;
  busy: Interval[];
  now?: Date;
  limit?: number;
  stepMinutes?: number;
}

export interface Slot {
  start: string;
  end: string;
}

/**
 * Proposes up to `limit` free slots of the requested length, closest to the desired start:
 * right after each conflicting window, and right before it (if that's not in the past).
 */
export function suggestSlots(opts: SlotOptions): Slot[] {
  const { desiredStart, durationMinutes, busy, now = new Date(), limit = 3, stepMinutes = 15 } = opts;
  const dur = durationMinutes * MINUTE;
  const earliest = roundUp(now, stepMinutes).getTime();
  const candidates = new Set<number>();

  for (const b of busy) {
    candidates.add(roundUp(new Date(ms(b.end)), stepMinutes).getTime());
    // Latest start that still ends by b.start, snapped down to the step.
    const before = ms(b.start) - dur;
    candidates.add(Math.floor(before / (stepMinutes * MINUTE)) * stepMinutes * MINUTE);
  }

  const desired = ms(desiredStart);
  return [...candidates]
    .filter((s) => s >= earliest)
    .filter((s) => !busy.some((b) => overlaps({ start: new Date(s), end: new Date(s + dur) }, b)))
    .sort((a, b) => Math.abs(a - desired) - Math.abs(b - desired) || a - b)
    .slice(0, limit)
    .sort((a, b) => a - b)
    .map((s) => ({ start: new Date(s).toISOString(), end: addMinutes(new Date(s), durationMinutes).toISOString() }));
}

/** Current/next agreed window for a room tile: "Taken until 8:00" / "Free now". */
export function roomState(windows: Interval[], now: Date = new Date()): { busyNow: Interval | null; next: Interval | null } {
  const sorted = [...windows].sort((a, b) => ms(a.start) - ms(b.start));
  const busyNow = sorted.find((w) => ms(w.start) <= now.getTime() && ms(w.end) > now.getTime()) ?? null;
  const next = sorted.find((w) => ms(w.start) > now.getTime()) ?? null;
  return { busyNow, next };
}
