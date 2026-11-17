/**
 * Time helpers. Everything is stored in UTC; these format in the viewer's time zone.
 * Pure (no React Native imports) so it can be unit-tested in Node.
 */

export const MINUTE = 60_000;

export function addMinutes(date: Date | string, minutes: number): Date {
  return new Date(new Date(date).getTime() + minutes * MINUTE);
}

function parts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) out[p.type] = p.value;
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour) % 24,
    minute: Number(out.minute),
  };
}

/** 'YYYY-MM-DD' for the given instant in a time zone. */
export function localDate(date: Date | string, timeZone: string): string {
  const p = parts(new Date(date), timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Days between two 'YYYY-MM-DD' strings (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** "7:00 PM" */
export function formatTime(date: Date | string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(new Date(date));
}

/** "7:00–7:45 PM", or "11:30 AM–12:15 PM" when the meridiem changes. */
export function formatTimeRange(start: Date | string, end: Date | string, timeZone: string): string {
  const a = formatTime(start, timeZone);
  const b = formatTime(end, timeZone);
  const [aTime, aMer] = a.split(' ');
  const [, bMer] = b.split(' ');
  return aMer === bMer ? `${aTime}–${b}` : `${a}–${b}`;
}

/** "Today", "Tomorrow", "Yesterday", "Thu", or "Nov 21". */
export function formatDay(date: Date | string, timeZone: string, now: Date = new Date()): string {
  const d = localDate(date, timeZone);
  const today = localDate(now, timeZone);
  const diff = daysBetween(today, d);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  const opts: Intl.DateTimeFormatOptions =
    Math.abs(diff) < 7 ? { timeZone, weekday: 'short' } : { timeZone, month: 'short', day: 'numeric' };
  return new Intl.DateTimeFormat('en-US', opts).format(new Date(date));
}

/** "Today 7:00 PM" style label; omits "Today". */
export function formatWhen(date: Date | string, timeZone: string, now: Date = new Date()): string {
  const day = formatDay(date, timeZone, now);
  const time = formatTime(date, timeZone);
  return day === 'Today' ? time : `${day} ${time}`;
}

/** "just now", "in 20 min", "2h ago", "in 3 days". */
export function relative(date: Date | string, now: Date = new Date()): string {
  const diffMin = Math.round((new Date(date).getTime() - now.getTime()) / MINUTE);
  const abs = Math.abs(diffMin);
  const future = diffMin > 0;
  if (abs < 1) return 'just now';
  let text: string;
  if (abs < 60) text = `${abs} min`;
  else if (abs < 60 * 24) {
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    text = m >= 15 && h < 3 ? `${h}h ${m}m` : `${Math.round(abs / 60)}h`;
  } else text = `${Math.round(abs / (60 * 24))} ${Math.round(abs / (60 * 24)) === 1 ? 'day' : 'days'}`;
  return future ? `in ${text}` : `${text} ago`;
}

/** "45m", "1h", "1h 30m" */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Rounds up to the next `step`-minute boundary (in absolute time — fine for :00/:15/:30). */
export function roundUp(date: Date, stepMinutes: number): Date {
  const step = stepMinutes * MINUTE;
  return new Date(Math.ceil(date.getTime() / step) * step);
}

export interface TimeChip {
  label: string;
  iso: string;
}

/**
 * Smart start-time options: optionally "Now", then the next `count` half-hour marks.
 * e.g. at 6:47 → Now, 7:00, 7:30, 8:00 …
 */
export function startTimeChips(
  now: Date,
  timeZone: string,
  opts: { includeNow?: boolean; count?: number; stepMinutes?: number } = {},
): TimeChip[] {
  const { includeNow = true, count = 8, stepMinutes = 30 } = opts;
  const chips: TimeChip[] = [];
  if (includeNow) chips.push({ label: 'Now', iso: now.toISOString() });
  let t = roundUp(addMinutes(now, 5), stepMinutes);
  for (let i = 0; i < count; i++) {
    const day = formatDay(t, timeZone, now);
    const time = formatTime(t, timeZone);
    chips.push({ label: day === 'Today' ? time : `${day.slice(0, 3)} ${time}`, iso: t.toISOString() });
    t = addMinutes(t, stepMinutes);
  }
  return chips;
}

/** Relative "in N minutes" options, e.g. for run departures. */
export function inMinutesChips(now: Date, minutes: number[]): TimeChip[] {
  return minutes.map((m) => ({ label: m === 0 ? 'Now' : `In ${formatDuration(m)}`, iso: addMinutes(now, m).toISOString() }));
}

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
