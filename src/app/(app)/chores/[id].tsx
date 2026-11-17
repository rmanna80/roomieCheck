import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { EmptyState, Skeleton } from '@/components/States';
import { useToast } from '@/components/Toast';
import { Avatar, Button, Card, Chip, ChipRow, Section, Text } from '@/components/ui';
import { useUserId } from '@/features/auth/AuthProvider';
import { useActiveHousehold } from '@/features/household/HouseholdProvider';
import * as api from '@/lib/api';
import { cadenceLabel, dueLabel, rotationOrder, upNextAfter } from '@/lib/chores';
import { invalidateHousehold, useChoreHistory, useChores, useSwaps } from '@/lib/queries';
import { formatDay, localDate } from '@/lib/time';
import { space } from '@/theme/tokens';

export default function ChoreScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useUserId();
  const { household, members, nameOf, memberById, isOwner, timeZone } = useActiveHousehold();
  const toast = useToast();
  const qc = useQueryClient();
  const chores = useChores(household.id);
  const history = useChoreHistory(id ?? null);
  const swaps = useSwaps(household.id);
  const [swapTo, setSwapTo] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const chore = chores.data?.find((c) => c.id === id);
  if (chores.isLoading) {
    return (
      <Screen back="back">
        <Skeleton />
      </Screen>
    );
  }
  if (!chore) {
    return (
      <Screen back="back">
        <EmptyState icon="broom" title="This one was removed" />
      </Screen>
    );
  }

  const today = localDate(new Date(), household.time_zone);
  const mine = chore.assignee_id === me;
  const order = rotationOrder(chore);
  const next = upNextAfter(chore);
  const swapForMe = swaps.data?.find((s) => s.chore_id === chore.id && s.to_user === me && s.status === 'pending');
  const mySwap = swaps.data?.find((s) => s.chore_id === chore.id && s.from_user === me && s.status === 'pending');

  const act = async (key: string, fn: () => Promise<unknown>, msg: string) => {
    setBusy(key);
    try {
      await fn();
      toast.success(msg);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
      void invalidateHousehold(qc, household.id);
    }
  };

  return (
    <Screen back="back" title={chore.title} subtitle={`${cadenceLabel(chore.cadence_days)} · ${order.length} in rotation`}>
      <Card>
        <Text variant="micro" tone="muted">
          {dueLabel(chore.next_due_on, today)}
        </Text>
        <Text variant="title">{mine ? 'Your turn' : `${nameOf(chore.assignee_id)}’s turn`}</Text>
        {next && next !== chore.assignee_id ? (
          <Text tone="muted">Then {nameOf(next)}</Text>
        ) : null}
        <View style={{ gap: space.sm, marginTop: space.sm }}>
          <Button
            label={mine ? 'Mark done' : 'I did it'}
            icon="check"
            loading={busy === 'done'}
            onPress={async () => {
              setBusy('done');
              try {
                const r = await api.completeChore(chore.id, chore.next_due_on);
                toast.success(!r.completed ? 'Someone already marked this one done' : mine ? 'Thanks!' : 'Thanks for helping out');
              } catch (e) {
                toast.error(e);
              } finally {
                setBusy(null);
                void invalidateHousehold(qc, household.id);
              }
            }}
          />
        </View>
      </Card>

      {swapForMe ? (
        <Card>
          <Text variant="bodyStrong">{nameOf(swapForMe.from_user)} asked if you can take this turn</Text>
          <Text variant="caption" tone="muted">
            If you say yes, they take your next turn instead.
          </Text>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button compact label="Sure" loading={busy === 'yes'} onPress={() => act('yes', () => api.respondChoreSwap(swapForMe.id, true), 'Swapped')} />
            <Button compact variant="secondary" label="Not this time" loading={busy === 'no'} onPress={() => act('no', () => api.respondChoreSwap(swapForMe.id, false), 'Let them know')} />
          </View>
        </Card>
      ) : null}

      {mine && members.length > 1 ? (
        <Section title="Need to swap?">
          {mySwap ? (
            <Text tone="muted">Waiting to hear back from {nameOf(mySwap.to_user)}.</Text>
          ) : (
            <>
              <ChipRow wrap>
                {members.filter((m) => m.user_id !== me).map((m) => (
                  <Chip key={m.user_id} label={m.profile.display_name} selected={swapTo === m.user_id} onPress={() => setSwapTo(m.user_id)} />
                ))}
              </ChipRow>
              <Button
                variant="secondary"
                label={swapTo ? `Ask ${nameOf(swapTo)}` : 'Pick someone'}
                disabled={!swapTo}
                loading={busy === 'swap'}
                onPress={() => swapTo && act('swap', () => api.requestChoreSwap(chore.id, swapTo), 'Asked — only they’ll see it')}
              />
            </>
          )}
        </Section>
      ) : null}

      <Section title="Rotation">
        {order.map((uid, i) => (
          <View key={uid} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <Text variant="label" tone="muted" style={{ width: 20 }}>
              {i + 1}
            </Text>
            <Avatar name={memberById(uid)?.profile.display_name ?? '?'} color={memberById(uid)?.profile.color} size={30} />
            <Text style={{ flex: 1 }}>{nameOf(uid)}</Text>
            {uid === chore.assignee_id ? (
              <Text variant="label" tone="ember">
                Up now
              </Text>
            ) : null}
          </View>
        ))}
      </Section>

      <Section title="Recent">
        {(history.data ?? []).length === 0 ? <Text tone="muted">Nothing yet.</Text> : null}
        {(history.data ?? []).map((h) => (
          <Text key={h.id} variant="caption" tone="muted">
            {formatDay(h.completed_at, timeZone)} · {nameOf(h.completed_by)}
          </Text>
        ))}
        <Text variant="caption" tone="muted">
          A simple record for transparency. There are no streaks or rankings.
        </Text>
      </Section>

      {chore.created_by === me || isOwner ? (
        <Button
          label="Remove responsibility"
          variant="danger"
          onPress={() =>
            Alert.alert('Remove this responsibility?', 'History stays; reminders stop.', [
              { text: 'Keep', style: 'cancel' },
              { text: 'Remove', style: 'destructive', onPress: () => act('archive', () => api.archiveChore(chore.id), 'Removed').then(() => router.back()) },
            ])
          }
        />
      ) : null}
    </Screen>
  );
}
