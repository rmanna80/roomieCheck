/**
 * Pure push-delivery policy shared by the send-push Edge Function and its unit tests.
 * No Deno or Node APIs — just logic.
 */

export interface PendingPush {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  signal_id: string | null;
  chore_id: string | null;
}

export interface ExpoMessage {
  to: string;
  title: string;
  body?: string;
  data: Record<string, string>;
  sound: null;
  priority: 'default';
  channelId: 'default';
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};

export function minutesOfDay(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24;
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

/** True when `now` falls inside quiet hours [start, end) in the user's zone. Handles midnight wrap. */
export function inQuietHours(now: Date, timeZone: string, start: string | null, end: string | null): boolean {
  if (!start || !end) return false;
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s === e) return false;
  const m = minutesOfDay(now, timeZone);
  return s < e ? m >= s && m < e : m >= s || m < e;
}

export function toExpoMessages(n: PendingPush, tokens: string[]): ExpoMessage[] {
  const data: Record<string, string> = { notification_id: n.id };
  if (n.signal_id) data.signal_id = n.signal_id;
  if (n.chore_id) data.chore_id = n.chore_id;
  return tokens.map((to) => ({
    to,
    title: n.title,
    ...(n.body ? { body: n.body } : {}),
    data,
    sound: null,
    priority: 'default',
    channelId: 'default',
  }));
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
