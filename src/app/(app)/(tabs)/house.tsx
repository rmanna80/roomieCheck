import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { View } from 'react-native';

import { Screen } from '@/components/Screen';
import { EmptyState, ErrorState, Skeleton } from '@/components/States';
import { useToast } from '@/components/Toast';
import { Avatar, Button, Card, Glyph, ListRow, Press, Section, Text } from '@/components/ui';
import { useUserId } from '@/features/auth/AuthProvider';
import { useActiveHousehold } from '@/features/household/HouseholdProvider';
import { completeChore } from '@/lib/api';
import { cadenceLabel, CHORE_GLYPH, dueLabel, isDue } from '@/lib/chores';
import { invalidateHousehold, useAgreedWindows, useChores, useSpaces } from '@/lib/queries';
import { roomState } from '@/lib/spaces';
import { formatTime, localDate } from '@/lib/time';
import { useNow } from '@/lib/useNow';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';


export default function House() {
  const me = useUserId();
  const { household, members, nameOf, timeZone } = useActiveHousehold();
  const { c, kind } = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const now = useNow(60_000);
  const hid = household.id;
  const chores = useChores(hid);
  const spaces = useSpaces(hid);
  const windows = useAgreedWindows(hid);
  const today = localDate(now, household.time_zone);

  return (
    <Screen title="House" subtitle={`${members.length} ${members.length === 1 ? 'person' : 'people'} · ${household.name}`} tabBarInset onRefresh={() => invalidateHousehold(qc, hid)}>
      <Section title="Responsibilities" action={<Button compact variant="ghost" icon="plus" label="Add" onPress={() => router.push('/chores/new')} />}>
        {chores.isLoading ? <Skeleton height={64} count={2} /> : null}
        {chores.error ? <ErrorState error={chores.error} onRetry={() => chores.refetch()} /> : null}
        {chores.data?.length === 0 ? (
          <EmptyState icon="autorenew" title="Share the routine" body="Set up trash, dishes, or anything that rotates. Reminders go privately to whoever’s turn it is — no scoreboards.">
            <Button label="Add a responsibility" onPress={() => router.push('/chores/new')} />
          </EmptyState>
        ) : null}
        {chores.data?.map((ch) => {
          const mine = ch.assignee_id === me;
          return (
            <Card key={ch.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <Press
                accessibilityRole="button"
                accessibilityLabel={`${ch.title}, ${mine ? 'your turn' : `${nameOf(ch.assignee_id)}’s turn`}, ${dueLabel(ch.next_due_on, today)}`}
                onPress={() => router.push({ pathname: '/chores/[id]', params: { id: ch.id } })}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md }}
              >
                <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: c.surfaceSunken, alignItems: 'center', justifyContent: 'center' }}>
                  <Glyph name={CHORE_GLYPH[ch.icon] ?? CHORE_GLYPH.other} color={c.ink} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{ch.title}</Text>
                  <Text variant="caption" tone="muted">
                    {mine ? 'Your turn' : nameOf(ch.assignee_id)} · {mine ? dueLabel(ch.next_due_on, today) : cadenceLabel(ch.cadence_days)}
                  </Text>
                </View>
              </Press>
              {mine && isDue(ch.next_due_on, today) ? (
                <Button
                  compact
                  label="Done"
                  onPress={async () => {
                    try {
                      const r = await completeChore(ch.id, ch.next_due_on);
                      toast.success(r.completed ? `Thanks! ${nameOf(r.assignee_id)} is next` : 'Already done — thanks anyway');
                      void invalidateHousehold(qc, hid);
                    } catch (e) {
                      toast.error(e);
                    }
                  }}
                />
              ) : null}
            </Card>
          );
        })}
      </Section>

      <Section title="Spaces" action={<Button compact variant="ghost" icon="cog-outline" label="Manage" onPress={() => router.push('/household/settings')} />}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
          {(spaces.data ?? []).map((s) => {
            const state = roomState((windows.data ?? []).filter((w) => w.space_id === s.id).map((w) => ({ start: w.starts_at, end: w.ends_at })), now);
            const label = !s.is_reservable
              ? 'Not requestable'
              : state.busyNow
                ? `Taken until ${formatTime(state.busyNow.end, timeZone)}`
                : state.next
                  ? `Free · next ${formatTime(state.next.start, timeZone)}`
                  : 'Free';
            return (
              <Press
                key={s.id}
                accessibilityRole="button"
                accessibilityLabel={`${s.name}. ${label}. Request it`}
                disabled={!s.is_reservable}
                onPress={() => router.push({ pathname: '/compose', params: { kind: 'space' } })}
                style={{
                  width: '47%', flexGrow: 1, minHeight: 92, borderRadius: radius.card, padding: space.lg, gap: 4,
                  backgroundColor: state.busyNow ? kind('space').tint : c.surface, borderWidth: 1, borderColor: c.line,
                }}
              >
                <Text variant="bodyStrong">{s.name}</Text>
                <Text variant="caption" tone="muted">
                  {label}
                </Text>
              </Press>
            );
          })}
        </View>
        {spaces.data?.length === 0 ? <Text tone="muted">No shared spaces yet. Add them in Manage.</Text> : null}
      </Section>

      <Section title="People">
        <Press accessibilityRole="button" accessibilityLabel="Members" onPress={() => router.push('/household/members')}>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <View style={{ flexDirection: 'row' }}>
              {members.slice(0, 6).map((m, i) => (
                <View key={m.user_id} style={{ marginLeft: i === 0 ? 0 : -10 }}>
                  <Avatar name={m.profile.display_name} color={m.profile.color} size={36} ring />
                </View>
              ))}
            </View>
            <Text variant="bodyStrong" style={{ flex: 1 }}>
              {members.length === 1 ? 'Just you so far' : `${members.length} people`}
            </Text>
            <Glyph name="chevron-right" color={c.inkMuted} />
          </Card>
        </Press>
        <Button label="Invite a housemate" icon="account-plus-outline" variant="secondary" onPress={() => router.push('/household/invite')} />
      </Section>

      <Section title="Home">
        <Card style={{ paddingVertical: space.xs }}>
          <ListRow icon="home-edit-outline" title="Home settings" subtitle="Name, spaces, time zone" onPress={() => router.push('/household/settings')} />
        </Card>
      </Section>
    </Screen>
  );
}
