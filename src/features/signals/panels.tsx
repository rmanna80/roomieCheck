/**
 * Kind-specific panels for the Signal detail screen. Each panel calls RPCs directly and
 * refreshes the household's queries; the server decides every outcome.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { ResponseBar } from '@/components/signal/SignalParts';
import { useToast } from '@/components/Toast';
import { Avatar, Button, Card, Chip, ChipRow, Divider, Glyph, Press, Section, Stepper, Text, TextField } from '@/components/ui';
import { useActiveHousehold } from '@/features/household/HouseholdProvider';
import * as api from '@/lib/api';
import { invalidateHousehold, useRespond, useSpaces } from '@/lib/queries';
import { isOpen, KINDS, myResponse, responseLabel } from '@/lib/signals';
import { suggestSlots } from '@/lib/spaces';
import { addMinutes, formatDuration, formatTimeRange, formatWhen, relative, startTimeChips } from '@/lib/time';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import type { RunItem, SignalDetail, UUID } from '@/types/domain';

interface PanelProps {
  s: SignalDetail;
  me: UUID;
  now: Date;
}

/** Wraps an async action with toast + refresh. */
export function useAction() {
  const qc = useQueryClient();
  const toast = useToast();
  const { household } = useActiveHousehold();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (id: string, fn: () => Promise<unknown>, success?: string) => {
    setBusy(id);
    try {
      await fn();
      if (success) toast.success(success);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
      void invalidateHousehold(qc, household.id);
    }
  };
  return { busy, run };
}

function People({ ids, empty }: { ids: UUID[]; empty: string }) {
  const { memberById, nameOf } = useActiveHousehold();
  if (ids.length === 0) return <Text tone="muted">{empty}</Text>;
  return (
    <View style={{ gap: space.sm }}>
      {ids.map((id) => (
        <View key={id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <Avatar name={memberById(id)?.profile.display_name ?? '?'} color={memberById(id)?.profile.color} size={32} />
          <Text>{nameOf(id)}</Text>
        </View>
      ))}
    </View>
  );
}

/** Responses grouped by choice. Declines are counted, never listed by name. */
export function ResponsesPanel({ s, me, now }: PanelProps) {
  const { household } = useActiveHousehold();
  const toast = useToast();
  const respond = useRespond(household.id, me);
  const meta = KINDS[s.kind];
  const mine = myResponse(s, me);
  const [portions, setPortions] = useState(s.signal_responses.find((r) => r.user_id === me)?.portions ?? 1);
  const canRespond = s.created_by !== me && isOpen(s, now) && meta.responses.length > 0;

  const groups = meta.responses.map((o) => ({ o, ids: s.signal_responses.filter((r) => r.response === o.key).map((r) => r.user_id) }));
  const send = (response: string | null, p?: number) =>
    respond.mutate({ signalId: s.id, response, portions: p ?? null }, { onError: (e) => toast.error(e) });

  return (
    <View style={{ gap: space.xxl }}>
      {canRespond ? (
        <Section title="Your answer">
          <ResponseBar kind={s.kind} options={meta.responses} selected={mine} onSelect={(k) => send(k, s.kind === 'food' ? portions : undefined)} />
          {s.kind === 'food' && (mine === 'in' || mine === 'save_me') ? (
            <Stepper
              value={portions}
              min={1}
              max={4}
              label="portions"
              onChange={(v) => {
                setPortions(v);
                send(mine, v);
              }}
            />
          ) : null}
        </Section>
      ) : null}
      {groups.map(({ o, ids }) =>
        o.positive || s.kind === 'quiet' ? (
          <Section key={o.key} title={`${o.label} · ${ids.length}`}>
            <People ids={ids} empty="No one yet" />
          </Section>
        ) : ids.length ? (
          <Text key={o.key} variant="caption" tone="muted">
            {ids.length} said “{o.label.toLowerCase()}”
          </Text>
        ) : null,
      )}
    </View>
  );
}

export function FoodHeadline({ s }: { s: SignalDetail }) {
  const ins = s.signal_responses.filter((r) => r.response === 'in' || r.response === 'save_me');
  const portions = ins.reduce((n, r) => n + (r.portions ?? 1), 0);
  const cap = s.food_details?.portions_total;
  return (
    <Card>
      <Text variant="display">{portions}</Text>
      <Text tone="muted">
        {portions === 1 ? 'portion' : 'portions'} confirmed{cap ? ` of ${cap}` : ''} · {ins.filter((r) => r.response === 'save_me').length} to save
      </Text>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------
export function LeftoversPanel({ s, me, now }: PanelProps) {
  const { busy, run } = useAction();
  const total = s.food_details?.portions_total ?? 0;
  const mineNow = s.signal_responses.find((r) => r.user_id === me)?.portions ?? 0;
  const claimedByOthers = s.signal_responses.filter((r) => r.user_id !== me).reduce((n, r) => n + (r.portions ?? 0), 0);
  const left = Math.max(total - claimedByOthers - mineNow, 0);
  const [want, setWant] = useState(mineNow);
  const open = isOpen(s, now);

  return (
    <View style={{ gap: space.xxl }}>
      <Card>
        <Text variant="display">{left}</Text>
        <Text tone="muted">
          of {total} left{s.food_details?.location ? ` · ${s.food_details.location}` : ''}
        </Text>
      </Card>
      {s.created_by !== me && open ? (
        <Section title="Your claim">
          <Stepper value={want} min={0} max={Math.max(mineNow + left, 0)} onChange={setWant} label="portions" />
          <Button
            label={want === 0 ? (mineNow ? 'Release my claim' : 'Claim') : `Claim ${want}`}
            disabled={want === mineNow}
            loading={busy === 'claim'}
            onPress={() => run('claim', () => api.claimPortions(s.id, want), want ? 'Claimed — enjoy' : 'Released')}
          />
        </Section>
      ) : null}
      <Section title="Claimed">
        <People ids={s.signal_responses.filter((r) => r.response === 'claimed').map((r) => r.user_id)} empty="Nobody yet" />
      </Section>
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
const ITEM_LABEL: Record<RunItem['status'], string> = {
  requested: 'Waiting', accepted: 'Will grab', declined: 'Not this time', purchased: 'Got it',
  unavailable: 'Unavailable', withdrawn: 'Withdrawn',
};

export function RunPanel({ s, me, now }: PanelProps) {
  const { nameOf, timeZone } = useActiveHousehold();
  const { c } = useTheme();
  const { busy, run } = useAction();
  const [name, setName] = useState('');
  const [qty, setQty] = useState('');
  const runner = s.created_by === me;
  const r = s.runs;
  const requestsOpen = !!r && isOpen(s, now) && !r.started_at && new Date(r.leaves_at) > now;
  const items = s.run_items.filter((i) => i.status !== 'withdrawn');

  return (
    <View style={{ gap: space.xxl }}>
      <Card>
        <Text variant="bodyStrong">
          {r?.completed_at ? 'Back from the run' : r?.started_at ? 'On the way' : `Leaves ${formatWhen(r!.leaves_at, timeZone, now)} (${relative(r!.leaves_at, now)})`}
        </Text>
        <Text variant="caption" tone="muted">
          {requestsOpen ? 'Requests are open until they leave.' : 'Requests are closed.'} No payment is assumed — settle up however you usually do.
        </Text>
      </Card>

      {!runner && requestsOpen ? (
        <Section title="Ask for something">
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <View style={{ flex: 2 }}>
              <TextField value={name} onChangeText={setName} placeholder="Item" maxLength={80} />
            </View>
            <View style={{ flex: 1 }}>
              <TextField value={qty} onChangeText={setQty} placeholder="Qty" maxLength={30} />
            </View>
          </View>
          <Button
            label="Add request"
            variant="secondary"
            icon="plus"
            disabled={!name.trim()}
            loading={busy === 'add'}
            onPress={() =>
              run('add', async () => {
                await api.addRunItem(s.id, name.trim(), qty.trim() || undefined);
                setName('');
                setQty('');
              }, 'Requested — they’ll confirm')
            }
          />
        </Section>
      ) : null}

      <Section title={`Requests · ${items.length}`}>
        {items.length === 0 ? <Text tone="muted">No requests yet.</Text> : null}
        {items.map((it) => (
          <View key={it.id} style={{ gap: space.sm, paddingVertical: space.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">
                  {it.name}
                  {it.quantity ? ` × ${it.quantity}` : ''}
                </Text>
                <Text variant="caption" tone="muted">
                  {nameOf(it.requested_by)}
                  {it.note ? ` · ${it.note}` : ''}
                </Text>
              </View>
              <Text variant="label" tone={it.status === 'declined' || it.status === 'unavailable' ? 'muted' : it.status === 'requested' ? 'ember' : 'success'}>
                {s.status === 'resolved' && it.status === 'requested' ? 'Not picked up' : ITEM_LABEL[it.status]}
              </Text>
            </View>
            {runner && s.status !== 'canceled' ? (
              <ChipRow wrap>
                {it.status === 'requested' ? (
                  <>
                    <Chip label="Accept" icon="check" onPress={() => run(it.id, () => api.decideRunItem(it.id, 'accepted'))} />
                    <Chip label="Can’t this time" onPress={() => run(it.id, () => api.decideRunItem(it.id, 'declined'))} />
                  </>
                ) : it.status === 'accepted' ? (
                  <>
                    <Chip label="Got it" icon="check-all" onPress={() => run(it.id, () => api.decideRunItem(it.id, 'purchased'))} />
                    <Chip label="Unavailable" onPress={() => run(it.id, () => api.decideRunItem(it.id, 'unavailable'))} />
                  </>
                ) : null}
              </ChipRow>
            ) : null}
            {it.requested_by === me && (it.status === 'requested' || it.status === 'accepted') && !r?.completed_at ? (
              <Press accessibilityRole="button" accessibilityLabel={`Withdraw ${it.name}`} onPress={() => run(it.id, () => api.withdrawRunItem(it.id), 'Withdrawn')}>
                <Text variant="label" tone="muted">
                  Withdraw
                </Text>
              </Press>
            ) : null}
            <Divider />
          </View>
        ))}
      </Section>

      {runner && isOpen(s, now) ? (
        <View style={{ gap: space.sm }}>
          {!r?.started_at ? (
            <Button label="Heading out now" variant="secondary" icon="walk" loading={busy === 'start'} onPress={() => run('start', () => api.startRun(s.id), 'Requests closed — have a good run')} />
          ) : null}
          <Button label="I’m back" icon="home-import-outline" loading={busy === 'done'} onPress={() => run('done', () => api.completeRun(s.id), 'Run complete')} />
          <Text variant="caption" tone="muted" style={{ color: c.inkMuted }}>
            Requests you didn’t accept stay unaccepted — nothing is assumed.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
const DECISION_LABEL = { pending: 'Waiting', approved: 'OK', needs_it_too: 'Needs it too', counter: 'Suggested another time' } as const;
const REASON_LABEL = { personal: 'Personal', call: 'Call / interview', guests: 'Having people over', study: 'Studying', event: 'Watching something', cooking: 'Cooking', other: 'Other' } as const;

export function SpacePanel({ s, me, now }: PanelProps) {
  const { nameOf, timeZone } = useActiveHousehold();
  const { kind } = useTheme();
  const h = kind('space');
  const { busy, run } = useAction();
  const spaces = useSpaces(s.household_id);
  const w = s.space_windows!;
  const mine = w.requested_by === me;
  const myApproval = s.space_window_approvals.find((a) => a.approver_id === me);
  const pending = w.state === 'pending' && isOpen(s, now);
  const [counterMode, setCounterMode] = useState(false);
  const duration = Math.round((new Date(w.ends_at).getTime() - new Date(w.starts_at).getTime()) / 60_000);
  const [counterStart, setCounterStart] = useState<string | null>(null);
  const spaceName = spaces.data?.find((x) => x.id === w.space_id)?.name ?? 'Space';

  const conflicts = useQuery({
    queryKey: ['conflicts', w.space_id, w.starts_at, w.ends_at, s.id],
    queryFn: () => api.spaceConflicts(w.space_id, w.starts_at, w.ends_at, s.id),
    enabled: mine && pending,
  });
  const alternatives = conflicts.data?.length
    ? suggestSlots({ desiredStart: w.starts_at, durationMinutes: duration, busy: conflicts.data.map((x) => ({ start: x.starts_at, end: x.ends_at })), now })
    : [];
  const counters = s.space_window_approvals.filter((a) => a.decision === 'counter' && a.counter_starts_at && a.counter_ends_at);

  return (
    <View style={{ gap: space.xxl }}>
      <Card tint={h.tint}>
        <Text variant="micro" color={h.ink}>
          {spaceName} · {REASON_LABEL[w.reason]}
        </Text>
        <Text variant="title" color={h.ink}>
          {formatTimeRange(w.starts_at, w.ends_at, timeZone)}
        </Text>
        <Text variant="label" color={h.ink}>
          {w.state === 'agreed' ? 'Agreed by everyone asked' : w.state === 'pending' ? 'Waiting for OKs — not booked yet' : w.state === 'withdrawn' ? 'Withdrawn' : 'Lapsed'}
        </Text>
      </Card>

      {myApproval && myApproval.decision !== 'approved' && pending ? (
        <Section title={`${nameOf(w.requested_by)} is asking you`}>
          <View style={{ gap: space.sm }}>
            <Button label="Works for me" icon="check" loading={busy === 'ok'} onPress={() => run('ok', () => api.decideSpaceWindow(s.id, 'approved'), 'Thanks — you said OK')} />
            <Button label="I need it too" variant="secondary" loading={busy === 'too'} onPress={() => run('too', () => api.decideSpaceWindow(s.id, 'needs_it_too'), 'Let them know — they’ll find another time')} />
            <Button label="Suggest another time" variant="ghost" onPress={() => setCounterMode((v) => !v)} />
          </View>
          {counterMode ? (
            <View style={{ gap: space.sm }}>
              <ChipRow>
                {startTimeChips(now, timeZone, { includeNow: false, count: 12 }).map((c) => (
                  <Chip key={c.iso} label={c.label} selected={counterStart === c.iso} onPress={() => setCounterStart(c.iso)} />
                ))}
              </ChipRow>
              <Button
                label={counterStart ? `Suggest ${formatTimeRange(counterStart, addMinutes(counterStart, duration), timeZone)}` : 'Pick a time'}
                disabled={!counterStart}
                loading={busy === 'counter'}
                onPress={() =>
                  counterStart &&
                  run('counter', () => api.decideSpaceWindow(s.id, 'counter', { start: counterStart, end: addMinutes(counterStart, duration).toISOString() }), 'Suggestion sent')
                }
              />
            </View>
          ) : null}
        </Section>
      ) : null}

      {mine && pending && (counters.length > 0 || alternatives.length > 0) ? (
        <Section title="Find a time that works">
          {counters.map((a) => (
            <Card key={a.approver_id}>
              <Text variant="bodyStrong">
                {nameOf(a.approver_id)} suggested {formatTimeRange(a.counter_starts_at!, a.counter_ends_at!, timeZone)}
              </Text>
              <Button
                compact
                label="Use this time"
                style={{ alignSelf: 'flex-start' }}
                loading={busy === a.approver_id}
                onPress={() => run(a.approver_id, () => api.rescheduleSpaceWindow(s.id, a.counter_starts_at!, a.counter_ends_at!), 'Moved')}
              />
            </Card>
          ))}
          {alternatives.length ? (
            <>
              <Text variant="caption" tone="muted">
                Overlaps {conflicts.data!.map((x) => `${nameOf(x.requested_by)} (${formatTimeRange(x.starts_at, x.ends_at, timeZone)})`).join(', ')}. Free slots of the same length:
              </Text>
              <ChipRow wrap>
                {alternatives.map((a) => (
                  <Chip key={a.start} label={formatTimeRange(a.start, a.end, timeZone)} onPress={() => run('move', () => api.rescheduleSpaceWindow(s.id, a.start, a.end), 'Moved — asking again')} />
                ))}
              </ChipRow>
            </>
          ) : null}
        </Section>
      ) : null}

      <Section title="Who’s been asked">
        {s.space_window_approvals.length === 0 ? <Text tone="muted">This space doesn’t need anyone’s OK.</Text> : null}
        {s.space_window_approvals.map((a) => (
          <View key={a.approver_id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: space.xs }}>
            <Text>{nameOf(a.approver_id)}</Text>
            <Text variant="label" tone={a.decision === 'approved' ? 'success' : a.decision === 'pending' ? 'muted' : 'ember'}>
              {DECISION_LABEL[a.decision]}
            </Text>
          </View>
        ))}
      </Section>
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
export function ResetPanel({ s, me, now }: PanelProps) {
  const { nameOf } = useActiveHousehold();
  const { c } = useTheme();
  const { busy, run } = useAction();
  const [label, setLabel] = useState('');
  const open = isOpen(s, now);
  const tasks = [...s.reset_tasks].sort((a, b) => a.position - b.position);
  const done = tasks.filter((t) => t.done_at).length;

  return (
    <View style={{ gap: space.xxl }}>
      <Card>
        <Text variant="title">
          {done}/{tasks.length} done
        </Text>
        <Text tone="muted">{formatDuration(s.resets?.minutes ?? 10)} together. Grab whatever you like.</Text>
      </Card>
      <Section title="Tasks">
        {tasks.map((t) => {
          const mineTask = t.claimed_by === me;
          return (
            <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 52 }}>
              <Press
                accessibilityRole="checkbox"
                accessibilityLabel={t.label}
                accessibilityState={{ checked: !!t.done_at, disabled: !open || (!!t.claimed_by && !mineTask && s.created_by !== me) }}
                disabled={!open || (!!t.claimed_by && !mineTask && s.created_by !== me)}
                onPress={() => run(t.id, () => api.setResetTaskDone(t.id, !t.done_at))}
                style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
              >
                <Glyph name={t.done_at ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'} size={28} color={t.done_at ? c.success : c.inkMuted} />
              </Press>
              <View style={{ flex: 1 }}>
                <Text style={{ textDecorationLine: t.done_at ? 'line-through' : 'none' }}>{t.label}</Text>
                {t.claimed_by ? (
                  <Text variant="caption" tone="muted">
                    {nameOf(t.claimed_by)}
                  </Text>
                ) : null}
              </View>
              {open && !t.done_at ? (
                t.claimed_by === null ? (
                  <Chip label="I’ll do it" onPress={() => run(t.id, () => api.claimResetTask(t.id))} />
                ) : mineTask ? (
                  <Chip label="Let go" onPress={() => run(t.id, () => api.releaseResetTask(t.id))} />
                ) : null
              ) : null}
            </View>
          );
        })}
        {open ? (
          <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}>
              <TextField value={label} onChangeText={setLabel} placeholder="Add a task" maxLength={40} />
            </View>
            <Button compact variant="secondary" label="Add" disabled={!label.trim()} loading={busy === 'add'} onPress={() => run('add', async () => { await api.addResetTask(s.id, label.trim()); setLabel(''); })} />
          </View>
        ) : null}
      </Section>
      <ResponsesPanel s={s} me={me} now={now} />
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
export function SparkPanel({ s, me, now }: PanelProps) {
  const { timeZone } = useActiveHousehold();
  const { kind } = useTheme();
  const h = kind('spark');
  const ins = s.signal_responses.filter((r) => r.response === 'in').length + 1;
  const min = s.sparks?.min_people ?? 2;
  return (
    <View style={{ gap: space.xxl }}>
      <Card tint={h.tint}>
        <Text variant="title" color={h.ink}>
          {s.status === 'active' ? 'It’s on' : `${ins} of ${min} in`}
        </Text>
        <Text color={h.ink}>
          {s.starts_at ? formatWhen(s.starts_at, timeZone, now) : 'Whenever works'}
          {s.status === 'active' ? ' · on the house calendar' : ' · becomes a plan when enough people join'}
        </Text>
      </Card>
      <ResponsesPanel s={s} me={me} now={now} />
    </View>
  );
}

export { responseLabel };
