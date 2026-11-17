/**
 * send-push — delivers pending notifications through the Expo Push API.
 *
 * Invoke either from a Database Webhook (INSERT on public.notifications) or a cron schedule;
 * each run sweeps all undelivered rows, so both are safe and idempotent.
 *
 * Required secrets (supabase secrets set …):
 *   PUSH_WEBHOOK_SECRET   — shared secret the webhook/cron sends in `x-webhook-secret`
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — provided automatically by Supabase
 *   EXPO_ACCESS_TOKEN     — optional; required if you enable enhanced push security in Expo
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

import { chunk, inQuietHours, type ExpoMessage, type PendingPush, toExpoMessages } from '../_shared/pushPolicy.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

Deno.serve(async (req) => {
  const secret = Deno.env.get('PUSH_WEBHOOK_SECRET');
  if (!secret || req.headers.get('x-webhook-secret') !== secret) {
    return new Response('unauthorized', { status: 401 });
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  // Only recent rows: a push about dinner from yesterday is noise.
  const { data: pending, error } = await admin
    .from('notifications')
    .select('id, user_id, title, body, signal_id, chore_id')
    .eq('push', true)
    .is('push_sent_at', null)
    .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
    .order('created_at')
    .limit(500);
  if (error) return new Response(error.message, { status: 500 });
  if (!pending?.length) return Response.json({ sent: 0 });

  const userIds = [...new Set(pending.map((n) => n.user_id))];
  const [{ data: prefs }, { data: profiles }, { data: tokens }] = await Promise.all([
    admin.from('notification_preferences').select('user_id, push_enabled, quiet_hours_start, quiet_hours_end').in('user_id', userIds),
    admin.from('profiles').select('id, time_zone').in('id', userIds),
    admin.from('push_tokens').select('user_id, token').in('user_id', userIds),
  ]);

  const now = new Date();
  const messages: ExpoMessage[] = [];
  for (const n of pending as PendingPush[]) {
    const p = prefs?.find((x) => x.user_id === n.user_id);
    const tz = profiles?.find((x) => x.id === n.user_id)?.time_zone ?? 'UTC';
    if (!p?.push_enabled) continue; // preference changed since the row was created
    if (inQuietHours(now, tz, p.quiet_hours_start, p.quiet_hours_end)) continue; // stays in the inbox only
    const userTokens = (tokens ?? []).filter((t) => t.user_id === n.user_id).map((t) => t.token);
    messages.push(...toExpoMessages(n, userTokens));
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const expoToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  if (expoToken) headers.Authorization = `Bearer ${expoToken}`;

  const deadTokens: string[] = [];
  for (const batch of chunk(messages, 100)) {
    const res = await fetch(EXPO_PUSH_URL, { method: 'POST', headers, body: JSON.stringify(batch) });
    if (!res.ok) continue;
    const body = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
    body.data?.forEach((ticket, i) => {
      if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') deadTokens.push(batch[i].to);
    });
  }

  // Mark everything processed (including quiet-hours skips) so nothing is retried later.
  await admin.from('notifications').update({ push_sent_at: now.toISOString() }).in('id', pending.map((n) => n.id));
  if (deadTokens.length) await admin.from('push_tokens').delete().in('token', deadTokens);

  return Response.json({ processed: pending.length, sent: messages.length, removed_tokens: deadTokens.length });
});
