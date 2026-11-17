/**
 * Compose a Signal. Two steps: pick a kind (or arrive with one), then a single screen of smart
 * defaults. Most signals go out in under 10 seconds: kind → (optional tweak) → Send.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { Screen } from '@/components/Screen';
import { KindStamp } from '@/components/signal/SignalParts';
import { useToast } from '@/components/Toast';
import { Button, Card, Chip, ChipRow, Press, Section, Stepper, Text, TextField } from '@/components/ui';
import { useUserId } from '@/features/auth/AuthProvider';
import { useActiveHousehold } from '@/features/household/HouseholdProvider';
import * as api from '@/lib/api';
import { invalidateHousehold, useSpaces } from '@/lib/queries';
import { KIND_ORDER, KINDS } from '@/lib/signals';
import { suggestSlots } from '@/lib/spaces';
import { addMinutes, formatDuration, formatTime, formatTimeRange, inMinutesChips, startTimeChips } from '@/lib/time';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import type { RunType, SignalKind, SpaceReason } from '@/types/domain';

// ---------------------------------------------------------------------------------------------
function KindPicker({ onPick }: { onPick: (k: SignalKind) => void }) {
  const { kind } = useTheme();
  return (
    <Screen back="close" title="Send a signal" subtitle="What’s happening?">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
        {KIND_ORDER.map((k) => (
          <Press
            key={k}
            accessibilityRole="button"
            accessibilityLabel={`${KINDS[k].label}: ${KINDS[k].blurb}`}
            onPress={() => onPick(k)}
            style={{ width: '47%', flexGrow: 1, backgroundColor: kind(k).tint, borderRadius: 22, padding: space.lg, gap: space.sm, minHeight: 112 }}
          >
            <KindStamp kind={k} />
            <Text variant="headline" color={kind(k).ink}>
              {KINDS[k].label}
            </Text>
            <Text variant="caption" color={kind(k).ink}>
              {KINDS[k].blurb}
            </Text>
          </Press>
        ))}
      </View>
    </Screen>
  );
}

// ---------------------------------------------------------------------------------------------
const RUN_TYPES: { key: RunType; label: string; icon: string }[] = [
  { key: 'groceries', label: 'Groceries', icon: 'cart-outline' },
  { key: 'takeout', label: 'Takeout', icon: 'food-takeout-box-outline' },
  { key: 'convenience', label: 'Corner store', icon: 'store-outline' },
  { key: 'pharmacy', label: 'Pharmacy', icon: 'pill' },
  { key: 'supplies', label: 'House supplies', icon: 'spray-bottle' },
  { key: 'other', label: 'Other', icon: 'dots-horizontal' },
];
const REASONS: { key: SpaceReason; label: string }[] = [
  { key: 'personal', label: 'Personal' },
  { key: 'call', label: 'Call / interview' },
  { key: 'guests', label: 'Having people over' },
  { key: 'study', label: 'Studying' },
  { key: 'cooking', label: 'Cooking' },
  { key: 'event', label: 'Watching something' },
];
const SPARK_IDEAS = ['Movie night', 'Video games', 'Gym', 'Grab food', 'Watch the game', 'Study session', 'Coffee run', 'Cook together', 'Pickup game'];
const RESET_AREAS: Record<string, string[]> = {
  Kitchen: ['Dishes', 'Counters', 'Trash', 'Sweep', 'Put away groceries'],
  'Living room': ['Tidy up', 'Vacuum', 'Dust', 'Take out recycling'],
  Bathroom: ['Sink & mirror', 'Toilet', 'Shower', 'Restock TP'],
  'Whole house': ['Dishes', 'Trash', 'Vacuum', 'Bathroom', 'Tidy common areas'],
};
const QUIET_REASONS = ['Big exam tomorrow', 'Work call', 'Early class', 'Sleeping early', 'Need to focus'];

function Field({ title, children }: { title: string; children: ReactNode }) {
  return <Section title={title}>{children}</Section>;
}

function ComposeForm({ kind, onBack, initialTitle }: { kind: SignalKind; onBack: () => void; initialTitle?: string }) {
  const me = useUserId();
  const { household, members, timeZone, nameOf } = useActiveHousehold();
  const { kind: hearth } = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const hid = household.id;
  const [now] = useState(() => new Date());
  const h = hearth(kind);

  // Shared
  const [title, setTitle] = useState(initialTitle ?? '');
  const [body, setBody] = useState('');
  const [startsAt, setStartsAt] = useState<string>(now.toISOString());
  const [everyone, setEveryone] = useState(true);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  // Food / leftovers
  const [portionCap, setPortionCap] = useState<number | null>(null);
  const [portions, setPortions] = useState(2);
  const [location, setLocation] = useState('Fridge');
  // Run
  const [runType, setRunType] = useState<RunType>('groceries');
  const [destination, setDestination] = useState('');
  const [leavesAt, setLeavesAt] = useState(addMinutes(now, 20).toISOString());
  // Space
  const spaces = useSpaces(hid);
  const reservable = (spaces.data ?? []).filter((s) => s.is_reservable);
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [duration, setDuration] = useState(60);
  const [reason, setReason] = useState<SpaceReason>('personal');
  const others = members.filter((m) => m.user_id !== me);
  const [approvers, setApprovers] = useState<string[] | null>(null);
  // Reset
  const [area, setArea] = useState('Kitchen');
  const [minutes, setMinutes] = useState(10);
  const [tasks, setTasks] = useState<string[]>(RESET_AREAS.Kitchen.slice(0, 3));
  const [customTask, setCustomTask] = useState('');
  // Spark
  const [minPeople, setMinPeople] = useState(2);
  // Quiet
  const [quietUntil, setQuietUntil] = useState(addMinutes(now, 4 * 60).toISOString());

  const chosenSpace = reservable.find((s) => s.id === spaceId) ?? reservable[0];
  const spaceStart = startsAt;
  const spaceEnd = addMinutes(spaceStart, duration).toISOString();
  const conflicts = useQuery({
    queryKey: ['conflicts', chosenSpace?.id, spaceStart, spaceEnd],
    queryFn: () => api.spaceConflicts(chosenSpace!.id, spaceStart, spaceEnd),
    enabled: kind === 'space' && !!chosenSpace,
  });
  const alternatives = useMemo(
    () =>
      conflicts.data?.length
        ? suggestSlots({
            desiredStart: spaceStart,
            durationMinutes: duration,
            busy: conflicts.data.filter((x) => x.state === 'agreed').map((x) => ({ start: x.starts_at, end: x.ends_at })),
            now,
          })
        : [],
    [conflicts.data, spaceStart, duration, now],
  );
  const takenByAgreed = (conflicts.data ?? []).some((x) => x.state === 'agreed');

  const defaultTitle = (): string => {
    switch (kind) {
      case 'food': return 'Making dinner — want some?';
      case 'leftovers': return 'Extra food to share';
      case 'run': return `Going to ${destination.trim() || RUN_TYPES.find((r) => r.key === runType)!.label.toLowerCase()}`;
      case 'reset': return `${area} reset — ${minutes} min`;
      case 'spark': return 'Anyone down?';
      case 'return': return `Probably home around ${formatTime(startsAt, timeZone)}`;
      case 'quiet': return 'Could we keep things quiet?';
      case 'space': return `Can I have the ${chosenSpace?.name.toLowerCase() ?? 'space'}?`;
    }
  };

  async function send() {
    setBusy(true);
    try {
      const finalTitle = title.trim() || defaultTitle();
      const recips = everyone ? null : recipients;
      if (kind === 'space') {
        if (!chosenSpace) return;
        const res = await api.requestSpaceWindow({
          householdId: hid, spaceId: chosenSpace.id, startsAt: spaceStart, endsAt: spaceEnd, reason,
          title: finalTitle, note: body.trim() || null, approvers: chosenSpace.requires_agreement ? approvers : null,
        });
        toast.success(res.state === 'agreed' ? 'It’s yours — no OK needed for this space' : 'Asked for an OK');
      } else {
        const details: Record<string, unknown> = {};
        let starts: string | null = null;
        let expires: string | null = null;
        if (kind === 'food') {
          starts = startsAt;
          if (portionCap) details.portions_total = portionCap;
        }
        if (kind === 'leftovers') Object.assign(details, { portions_total: portions, location });
        if (kind === 'run') Object.assign(details, { run_type: runType, destination: destination.trim() || null, leaves_at: leavesAt });
        if (kind === 'reset') Object.assign(details, { minutes, tasks });
        // "Now" means spontaneous: no fixed plan time.
        if (kind === 'spark') Object.assign(details, { plan_at: startsAt === now.toISOString() ? null : startsAt, min_people: minPeople });
        if (kind === 'return') starts = startsAt;
        if (kind === 'quiet') {
          starts = startsAt;
          expires = quietUntil;
        }
        await api.createSignal({ householdId: hid, kind, title: finalTitle, body: body.trim() || null, startsAt: starts, expiresAt: expires, recipients: recips, details });
        toast.success('Sent');
      }
      void invalidateHousehold(qc, hid);
      router.back();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  const timeChips = startTimeChips(now, timeZone, { includeNow: kind !== 'return', count: 10 });
  const audience =
    kind !== 'space' && others.length > 1 ? (
      <Field title="Who should see this">
        <ChipRow wrap>
          <Chip label="Everyone" selected={everyone} onPress={() => setEveryone(true)} />
          {others.map((m) => (
            <Chip
              key={m.user_id}
              label={m.profile.display_name}
              selected={!everyone && recipients.includes(m.user_id)}
              onPress={() => {
                setEveryone(false);
                setRecipients((r) => (r.includes(m.user_id) ? r.filter((x) => x !== m.user_id) : [...r, m.user_id]));
              }}
            />
          ))}
        </ChipRow>
      </Field>
    ) : null;

  const canSend =
    !busy &&
    (kind !== 'space' || (!!chosenSpace && !takenByAgreed)) &&
    (everyone || recipients.length > 0) &&
    (kind !== 'reset' || minutes > 0);

  return (
    <Screen
      back="close"
      right={<Button compact variant="ghost" label="Change type" onPress={onBack} />}
      footer={<Button label={kind === 'space' ? 'Ask' : 'Send'} icon="send" onPress={send} loading={busy} disabled={!canSend} />}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <KindStamp kind={kind} size={48} />
        <View style={{ flex: 1 }}>
          <Text variant="micro" tone="muted">
            {KINDS[kind].label}
          </Text>
          <Text variant="title">{KINDS[kind].blurb}</Text>
        </View>
      </View>

      {kind === 'spark' ? (
        <Field title="What’s the plan?">
          <ChipRow wrap>
            {SPARK_IDEAS.map((idea) => (
              <Chip key={idea} label={idea} selected={title === `${idea}?`} onPress={() => setTitle(`${idea}?`)} />
            ))}
          </ChipRow>
        </Field>
      ) : null}
      {kind === 'quiet' ? (
        <Field title="Why (optional — you never have to say)">
          <ChipRow wrap>
            {QUIET_REASONS.map((r) => (
              <Chip key={r} label={r} selected={title.startsWith(r)} onPress={() => setTitle(`${r}. Could we keep things quiet?`)} />
            ))}
          </ChipRow>
        </Field>
      ) : null}
      {kind === 'reset' ? (
        <Field title="Where">
          <ChipRow wrap>
            {Object.keys(RESET_AREAS).map((a) => (
              <Chip key={a} label={a} selected={area === a} onPress={() => { setArea(a); setTasks(RESET_AREAS[a].slice(0, 3)); }} />
            ))}
          </ChipRow>
        </Field>
      ) : null}

      <TextField label="Headline" value={title} onChangeText={setTitle} placeholder={defaultTitle()} maxLength={120} />

      {kind === 'run' ? (
        <>
          <Field title="Where to">
            <ChipRow wrap>
              {RUN_TYPES.map((r) => (
                <Chip key={r.key} label={r.label} icon={r.icon} selected={runType === r.key} onPress={() => setRunType(r.key)} />
              ))}
            </ChipRow>
            <TextField value={destination} onChangeText={setDestination} placeholder="Store or restaurant (optional)" maxLength={60} />
          </Field>
          <Field title="Leaving">
            <ChipRow>
              {inMinutesChips(now, [0, 10, 20, 30, 45, 60]).map((c) => (
                <Chip key={c.label} label={c.label} selected={leavesAt === c.iso} onPress={() => setLeavesAt(c.iso)} />
              ))}
            </ChipRow>
            <Text variant="caption" tone="muted">
              Requests close when you leave. Nothing is accepted until you say so, and no payment is assumed.
            </Text>
          </Field>
        </>
      ) : null}

      {kind === 'space' ? (
        reservable.length === 0 ? (
          <Card>
            <Text variant="bodyStrong">No shared spaces yet</Text>
            <Text tone="muted">Add shared rooms in House → Spaces. Bedrooms are never requestable.</Text>
          </Card>
        ) : (
          <>
            <Field title="Space">
              <ChipRow wrap>
                {reservable.map((s) => (
                  <Chip key={s.id} label={s.name} selected={chosenSpace?.id === s.id} onPress={() => setSpaceId(s.id)} />
                ))}
              </ChipRow>
            </Field>
            <Field title="From">
              <ChipRow>
                {timeChips.map((c) => (
                  <Chip key={c.iso} label={c.label} selected={startsAt === c.iso} onPress={() => setStartsAt(c.iso)} />
                ))}
              </ChipRow>
            </Field>
            <Field title="For">
              <ChipRow>
                {[30, 45, 60, 90, 120, 180].map((m) => (
                  <Chip key={m} label={formatDuration(m)} selected={duration === m} onPress={() => setDuration(m)} />
                ))}
              </ChipRow>
            </Field>
            {conflicts.data && conflicts.data.length > 0 ? (
              <Card tint={h.tint}>
                <Text variant="bodyStrong" color={h.ink}>
                  {takenByAgreed ? 'That time is already agreed for someone' : 'Someone else has asked for this time too'}
                </Text>
                {conflicts.data.map((x) => (
                  <Text key={x.signal_id} variant="caption" color={h.ink}>
                    {nameOf(x.requested_by)} · {formatTimeRange(x.starts_at, x.ends_at, timeZone)} · {x.state === 'agreed' ? 'agreed' : 'waiting'}
                  </Text>
                ))}
                {alternatives.length ? (
                  <>
                    <Text variant="label" color={h.ink} style={{ marginTop: space.xs }}>
                      Try instead
                    </Text>
                    <ChipRow wrap>
                      {alternatives.map((a) => (
                        <Chip key={a.start} label={formatTimeRange(a.start, a.end, timeZone)} onPress={() => setStartsAt(a.start)} />
                      ))}
                    </ChipRow>
                  </>
                ) : null}
              </Card>
            ) : null}
            <Field title="Reason">
              <ChipRow wrap>
                {REASONS.map((r) => (
                  <Chip key={r.key} label={r.label} selected={reason === r.key} onPress={() => setReason(r.key)} />
                ))}
              </ChipRow>
              <Text variant="caption" tone="muted">
                “Personal” is always enough. You never have to explain.
              </Text>
            </Field>
            {chosenSpace?.requires_agreement && others.length > 0 ? (
              <Field title="Who needs to OK it">
                <ChipRow wrap>
                  {others.map((m) => {
                    const on = (approvers ?? others.map((o) => o.user_id)).includes(m.user_id);
                    return (
                      <Chip
                        key={m.user_id}
                        label={m.profile.display_name}
                        selected={on}
                        onPress={() => {
                          const cur = approvers ?? others.map((o) => o.user_id);
                          setApprovers(on ? cur.filter((x) => x !== m.user_id) : [...cur, m.user_id]);
                        }}
                      />
                    );
                  })}
                </ChipRow>
                <Text variant="caption" tone="muted">
                  It’s only agreed once everyone selected says OK.
                </Text>
              </Field>
            ) : null}
          </>
        )
      ) : null}

      {kind === 'food' || kind === 'spark' || kind === 'quiet' ? (
        <Field title={kind === 'quiet' ? 'From' : kind === 'spark' ? 'When' : 'Ready at'}>
          <ChipRow>
            {timeChips.map((c) => (
              <Chip key={c.iso} label={c.label} selected={startsAt === c.iso} onPress={() => setStartsAt(c.iso)} />
            ))}
          </ChipRow>
        </Field>
      ) : null}

      {kind === 'return' ? (
        <Field title="Back around">
          <ChipRow>
            {timeChips.map((c) => (
              <Chip key={c.iso} label={c.label} selected={startsAt === c.iso} onPress={() => setStartsAt(c.iso)} />
            ))}
          </ChipRow>
          <Text variant="caption" tone="muted">
            Approximate and voluntary. It disappears on its own — this isn’t tracking.
          </Text>
        </Field>
      ) : null}

      {kind === 'quiet' ? (
        <Field title="Until">
          <ChipRow>
            {[60, 120, 240, 480, 600].map((m) => {
              const iso = addMinutes(startsAt, m).toISOString();
              return <Chip key={m} label={formatTime(iso, timeZone)} selected={quietUntil === iso} onPress={() => setQuietUntil(iso)} />;
            })}
          </ChipRow>
        </Field>
      ) : null}

      {kind === 'food' ? (
        <Field title="Portions">
          <ChipRow>
            {[null, 2, 3, 4, 6, 8].map((n) => (
              <Chip key={String(n)} label={n === null ? 'Whoever’s in' : `Up to ${n}`} selected={portionCap === n} onPress={() => setPortionCap(n)} />
            ))}
          </ChipRow>
        </Field>
      ) : null}

      {kind === 'leftovers' ? (
        <>
          <Field title="Portions to share">
            <Stepper value={portions} min={1} max={10} onChange={setPortions} label="portions" />
          </Field>
          <Field title="Where">
            <ChipRow>
              {['Fridge', 'Freezer', 'Counter', 'Stove'].map((l) => (
                <Chip key={l} label={l} selected={location === l} onPress={() => setLocation(l)} />
              ))}
            </ChipRow>
          </Field>
        </>
      ) : null}

      {kind === 'reset' ? (
        <>
          <Field title="How long">
            <ChipRow>
              {[10, 15, 20, 30].map((m) => (
                <Chip key={m} label={`${m} min`} selected={minutes === m} onPress={() => setMinutes(m)} />
              ))}
            </ChipRow>
          </Field>
          <Field title="Tasks people can claim">
            <ChipRow wrap>
              {[...new Set([...RESET_AREAS[area], ...tasks])].map((t) => {
                const on = tasks.includes(t);
                return <Chip key={t} label={t} selected={on} onPress={() => setTasks(on ? tasks.filter((x) => x !== t) : [...tasks, t].slice(0, 12))} />;
              })}
            </ChipRow>
            <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-end' }}>
              <View style={{ flex: 1 }}>
                <TextField value={customTask} onChangeText={setCustomTask} placeholder="Add a task" maxLength={40} />
              </View>
              <Button
                compact
                variant="secondary"
                label="Add"
                disabled={!customTask.trim()}
                onPress={() => {
                  setTasks([...tasks, customTask.trim()].slice(0, 12));
                  setCustomTask('');
                }}
              />
            </View>
            <Text variant="caption" tone="muted">
              No names, no blame — just what needs doing.
            </Text>
          </Field>
        </>
      ) : null}

      {kind === 'spark' ? (
        <Field title="It’s on when this many are in (incl. you)">
          <Stepper value={minPeople} min={2} max={Math.max(2, members.length)} onChange={setMinPeople} label="people" />
          <Text variant="caption" tone="muted">
            Declines are silent — nobody gets a notification when someone says no.
          </Text>
        </Field>
      ) : null}

      {audience}

      <TextField label="Details (optional)" value={body} onChangeText={setBody} placeholder="Anything else?" multiline maxLength={500} />
    </Screen>
  );
}

export default function Compose() {
  const params = useLocalSearchParams<{ kind?: string; title?: string }>();
  const initial = params.kind && params.kind in KINDS ? (params.kind as SignalKind) : null;
  const [kind, setKind] = useState<SignalKind | null>(initial);
  if (!kind) return <KindPicker onPick={setKind} />;
  return <ComposeForm key={kind} kind={kind} initialTitle={kind === initial ? params.title : undefined} onBack={() => setKind(null)} />;
}
