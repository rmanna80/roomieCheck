import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { View } from 'react-native';

import { Screen } from '@/components/Screen';
import { SignalCard } from '@/components/signal/SignalCard';
import { KindStamp } from '@/components/signal/SignalParts';
import { Skeleton } from '@/components/States';
import { useToast } from '@/components/Toast';
import { Card, Chip, ChipRow, Glyph, Press, Section, Text } from '@/components/ui';
import { useUserId } from '@/features/auth/AuthProvider';
import { useActiveHousehold } from '@/features/household/HouseholdProvider';
import { invalidateHousehold, useAgreedWindows, useChores, useEvents, useFeed, useRespond, useSpaces } from '@/lib/queries';
import { addMinutes, formatDay, formatTime, formatTimeRange, localDate } from '@/lib/time';
import { useNow } from '@/lib/useNow';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import type { SignalKind } from '@/types/domain';

interface CalendarItem {
  key: string;
  at: string;
  dayKey: string;
  title: string;
  detail: string;
  kind: SignalKind | 'chore';
  onPress?: () => void;
}

const QUICK_SPARKS = ['Movie night', 'Grab food', 'Gym', 'Video games', 'Study session'];

export default function Explore() {
  const me = useUserId();
  const { household, nameOf, timeZone } = useActiveHousehold();
  const { c } = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const now = useNow();
  const hid = household.id;

  const feed = useFeed(hid);
  const events = useEvents(hid);
  const windows = useAgreedWindows(hid);
  const spaces = useSpaces(hid);
  const chores = useChores(hid);
  const respond = useRespond(hid, me);

  const sparks = (feed.data ?? []).filter((s) => s.kind === 'spark' && s.status === 'proposed' && new Date(s.expires_at) > now);
  const horizon = addMinutes(now, 7 * 24 * 60);
  const inRange = (iso: string) => new Date(iso) >= addMinutes(now, -60) && new Date(iso) <= horizon;
  const spaceName = (id: string) => spaces.data?.find((s) => s.id === id)?.name ?? 'Space';
  const open = (id: string) => router.push({ pathname: '/signal/[id]', params: { id } });

  const items: CalendarItem[] = [
    ...(events.data ?? []).filter((e) => inRange(e.starts_at)).map((e) => ({
      key: `e-${e.id}`, at: e.starts_at, dayKey: localDate(e.starts_at, timeZone), title: e.title, detail: `Plan · ${formatTime(e.starts_at, timeZone)}`,
      kind: 'spark' as const, onPress: e.signal_id ? () => open(e.signal_id!) : undefined,
    })),
    ...(windows.data ?? []).filter((w) => inRange(w.starts_at)).map((w) => ({
      key: `w-${w.signal_id}`, at: w.starts_at, dayKey: localDate(w.starts_at, timeZone), title: `${spaceName(w.space_id)} · ${nameOf(w.requested_by)}`,
      detail: formatTimeRange(w.starts_at, w.ends_at, timeZone), kind: 'space' as const, onPress: () => open(w.signal_id),
    })),
    ...(feed.data ?? []).filter((s) => s.kind === 'food' && s.starts_at && inRange(s.starts_at)).map((s) => ({
      key: `f-${s.id}`, at: s.starts_at!, dayKey: localDate(s.starts_at!, timeZone), title: s.title,
      detail: `${nameOf(s.created_by)} cooking · ${formatTime(s.starts_at!, timeZone)}`, kind: 'food' as const, onPress: () => open(s.id),
    })),
    ...(chores.data ?? []).filter((ch) => ch.assignee_id === me).map((ch) => ({
      key: `c-${ch.id}`, at: `${ch.next_due_on}T12:00:00Z`, dayKey: ch.next_due_on, title: ch.title, detail: 'Your turn · only you see this',
      kind: 'chore' as const, onPress: () => router.push({ pathname: '/chores/[id]', params: { id: ch.id } }),
    })).filter((i) => i.dayKey <= localDate(horizon, timeZone)),
  ].sort((a, b) => a.dayKey.localeCompare(b.dayKey) || a.at.localeCompare(b.at));

  const days = [...new Set(items.map((i) => i.dayKey))];
  const loading = events.isLoading || windows.isLoading || feed.isLoading;

  return (
    <Screen title="Explore" tabBarInset refreshing={feed.isRefetching} onRefresh={() => invalidateHousehold(qc, hid)}>
      <Section title="Sparks">
        {sparks.map((s, i) => (
          <SignalCard
            key={s.id}
            index={i}
            signal={s}
            me={me}
            timeZone={timeZone}
            now={now}
            nameOf={nameOf}
            onPress={() => open(s.id)}
            onRespond={(r) => respond.mutate({ signalId: s.id, response: r }, { onError: (e) => toast.error(e) })}
          />
        ))}
        <Card>
          <Text variant="bodyStrong">{sparks.length ? 'Or start another' : 'Start something'}</Text>
          <ChipRow wrap>
            {QUICK_SPARKS.map((idea) => (
              <Chip key={idea} label={idea} icon="creation" onPress={() => router.push({ pathname: '/compose', params: { kind: 'spark', title: `${idea}?` } })} />
            ))}
          </ChipRow>
        </Card>
      </Section>

      <Section title="This week at home">
        {loading ? <Skeleton height={64} count={3} /> : null}
        {!loading && days.length === 0 ? (
          <Text tone="muted">Nothing planned yet. Agreed spaces, dinners and plans show up here.</Text>
        ) : null}
        {days.map((day) => (
          <View key={day} style={{ gap: space.sm }}>
            <Text variant="headline">{formatDay(`${day}T12:00:00Z`, 'UTC', new Date(`${localDate(now, timeZone)}T12:00:00Z`))}</Text>
            {items.filter((i) => i.dayKey === day).map((i) => (
              <Press key={i.key} accessibilityRole="button" accessibilityLabel={`${i.title}, ${i.detail}`} disabled={!i.onPress} onPress={i.onPress}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm }}>
                  {i.kind === 'chore' ? (
                    <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: c.surfaceSunken, alignItems: 'center', justifyContent: 'center' }}>
                      <Glyph name="check-circle-outline" color={c.inkMuted} />
                    </View>
                  ) : (
                    <KindStamp kind={i.kind} />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong" numberOfLines={1}>
                      {i.title}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {i.detail}
                    </Text>
                  </View>
                </View>
              </Press>
            ))}
          </View>
        ))}
      </Section>

      <Section title="Community">
        <Card>
          <Text variant="bodyStrong">Building events — later, and only if you opt in</Text>
          <Text variant="caption" tone="muted">
            When your building or residence hall joins, its events can appear here. Staff never see anything from your home.
          </Text>
        </Card>
      </Section>
    </Screen>
  );
}
