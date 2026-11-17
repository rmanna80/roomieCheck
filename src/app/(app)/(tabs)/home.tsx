import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Screen } from '@/components/Screen';
import { SignalCard } from '@/components/signal/SignalCard';
import { ErrorState, EmptyState, Skeleton } from '@/components/States';
import { useToast } from '@/components/Toast';
import { Avatar, Button, Card, Chip, ChipRow, Glyph, Press, Section, Text } from '@/components/ui';
import { Windows } from '@/components/Windows';
import { useUserId } from '@/features/auth/AuthProvider';
import { useActiveHousehold } from '@/features/household/HouseholdProvider';
import { completeChore } from '@/lib/api';
import { dueLabel } from '@/lib/chores';
import { findOpportunity } from '@/lib/opportunity';
import { enablePush, getPushPermission } from '@/lib/push';
import { invalidateHousehold, useChores, useFeed, useRespond, useSpaces, useStatuses, useSwaps } from '@/lib/queries';
import { prefsStorage } from '@/lib/secureStorage';
import { sortFeed } from '@/lib/signals';
import { addMinutes, daysBetween, localDate } from '@/lib/time';
import { useNow } from '@/lib/useNow';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import type { Signal } from '@/types/domain';

const PUSH_DISMISSED = 'hp.pushPromptDismissed';

function PushPrompt() {
  const toast = useToast();
  const [show, setShow] = useState(false);
  useEffect(() => {
    Promise.all([getPushPermission(), prefsStorage.getItem(PUSH_DISMISSED)]).then(([p, dismissed]) => setShow(p === 'undetermined' && !dismissed));
  }, []);
  if (!show) return null;
  return (
    <Card>
      <Text variant="headline">Get a ping when it matters</Text>
      <Text variant="body" tone="muted">
        Dinner’s ready, someone’s heading to the store, a room request needs your OK. You choose which ones in Settings.
      </Text>
      <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.xs }}>
        <Button
          compact
          label="Turn on"
          onPress={async () => {
            const p = await enablePush().catch(() => 'denied' as const);
            setShow(false);
            if (p === 'granted') toast.success('Notifications on');
          }}
        />
        <Button
          compact
          variant="ghost"
          label="Not now"
          onPress={() => {
            setShow(false);
            void prefsStorage.setItem(PUSH_DISMISSED, '1');
          }}
        />
      </View>
    </Card>
  );
}

export default function Home() {
  const me = useUserId();
  const { household, households, members, nameOf, memberById, timeZone, setActive } = useActiveHousehold();
  const { c } = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const now = useNow();
  const hid = household.id;
  const [switching, setSwitching] = useState(false);

  const feed = useFeed(hid);
  const statuses = useStatuses(hid);
  const chores = useChores(hid);
  const spaces = useSpaces(hid);
  const swaps = useSwaps(hid);
  const respond = useRespond(hid, me);

  const spaceName = (id: string) => spaces.data?.find((s) => s.id === id)?.name ?? 'Space';
  const needsMe = (s: Signal) =>
    s.kind === 'space' && !!s.space_window_approvals?.some((a) => a.approver_id === me && a.decision === 'pending');

  // (React Compiler memoizes this; no manual useMemo needed.)
  const open = (feed.data ?? []).filter((s) => new Date(s.expires_at) > now);
  const sorted = sortFeed(open, needsMe);
  const soon = addMinutes(now, 90);
  const nowSignals = sorted.filter((s) => needsMe(s) || !s.starts_at || new Date(s.starts_at) <= soon);
  const laterSignals = sorted.filter((s) => !needsMe(s) && s.starts_at && new Date(s.starts_at) > soon);

  const today = localDate(now, household.time_zone);
  const myChores = (chores.data ?? []).filter((ch) => ch.assignee_id === me && daysBetween(today, ch.next_due_on) <= 1);
  const swapsForMe = (swaps.data ?? []).filter((s) => s.to_user === me);
  const opportunity = findOpportunity(statuses.data ?? [], me, now);
  const myself = memberById(me);

  const refresh = () => invalidateHousehold(qc, hid);
  const onRespond = (s: Signal) => (response: string | null) =>
    respond.mutate({ signalId: s.id, response }, { onError: (e) => toast.error(e) });

  const card = (s: Signal, i: number) => (
    <SignalCard
      key={s.id}
      index={i}
      signal={s}
      me={me}
      timeZone={timeZone}
      now={now}
      nameOf={nameOf}
      spaceName={spaceName}
      needsMe={needsMe(s)}
      onPress={() => router.push({ pathname: '/signal/[id]', params: { id: s.id } })}
      onRespond={onRespond(s)}
    />
  );

  return (
    <Screen tabBarInset refreshing={feed.isRefetching} onRefresh={refresh}>
      {/* Header: home name (switcher) + you */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingTop: space.md }}>
        <Press
          accessibilityRole="button"
          accessibilityLabel={`${household.name}${households.length > 1 ? ', switch home' : ''}`}
          disabled={households.length < 2}
          onPress={() => setSwitching((v) => !v)}
          style={{ flex: 1 }}
        >
          <Text variant="micro" tone="muted">
            {new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone }).format(now)}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
            <Text variant="display" numberOfLines={1} style={{ flexShrink: 1 }}>
              {household.name}
            </Text>
            {households.length > 1 ? <Glyph name={switching ? 'chevron-up' : 'chevron-down'} size={22} /> : null}
          </View>
        </Press>
        <Press accessibilityRole="button" accessibilityLabel="Your profile and settings" onPress={() => router.push('/profile')}>
          <Avatar name={myself?.profile.display_name ?? 'You'} color={myself?.profile.color} size={44} />
        </Press>
      </View>

      {switching ? (
        <ChipRow wrap>
          {households.map((h) => (
            <Chip
              key={h.household.id}
              label={h.household.name}
              selected={h.household.id === hid}
              onPress={() => {
                setActive(h.household.id);
                setSwitching(false);
              }}
            />
          ))}
        </ChipRow>
      ) : null}

      <Windows members={members} statuses={statuses.data ?? []} me={me} timeZone={timeZone} now={now} onPressMe={() => router.push('/status')} />

      <PushPrompt />

      {opportunity ? (
        <Card tint={c.surface}>
          <Text variant="headline">
            {opportunity.people.length} {opportunity.people.length === 1 ? 'person is' : 'people are'} up to hang out
          </Text>
          <Text tone="muted">
            {opportunity.people.map((p) => nameOf(p)).join(', ')} said so. Want to plan something?
          </Text>
          <Button compact label="Start a Spark" icon="creation" style={{ alignSelf: 'flex-start', marginTop: space.xs }} onPress={() => router.push({ pathname: '/compose', params: { kind: 'spark' } })} />
        </Card>
      ) : null}

      {swapsForMe.length > 0 ? (
        <Section title="Asked of you">
          {swapsForMe.map((sw) => {
            const chore = chores.data?.find((ch) => ch.id === sw.chore_id);
            return (
              <Press key={sw.id} accessibilityRole="button" accessibilityLabel={`${nameOf(sw.from_user)} asked you to take ${chore?.title ?? 'a chore'}`} onPress={() => router.push({ pathname: '/chores/[id]', params: { id: sw.chore_id } })}>
                <Card>
                  <Text variant="bodyStrong">
                    {nameOf(sw.from_user)} asked if you can take {chore?.title ?? 'a chore'}
                  </Text>
                  <Text variant="caption" tone="muted">
                    Tap to answer
                  </Text>
                </Card>
              </Press>
            );
          })}
        </Section>
      ) : null}

      <Section title="Now">
        {feed.isLoading ? (
          <Skeleton />
        ) : feed.error ? (
          <ErrorState error={feed.error} onRetry={() => feed.refetch()} />
        ) : nowSignals.length === 0 && laterSignals.length === 0 ? (
          <EmptyState icon="home-heart" title="Quiet house." body="Start something — it takes a few seconds.">
            <ChipRow wrap>
              <Chip label="I’m cooking" icon="pot-steam-outline" onPress={() => router.push({ pathname: '/compose', params: { kind: 'food' } })} />
              <Chip label="Heading out" icon="cart-outline" onPress={() => router.push({ pathname: '/compose', params: { kind: 'run' } })} />
              <Chip label="Anyone down?" icon="creation" onPress={() => router.push({ pathname: '/compose', params: { kind: 'spark' } })} />
            </ChipRow>
          </EmptyState>
        ) : nowSignals.length === 0 ? (
          <Text tone="muted">Nothing right now.</Text>
        ) : (
          nowSignals.map(card)
        )}
      </Section>

      {laterSignals.length > 0 ? <Section title="Later">{laterSignals.map(card)}</Section> : null}

      {myChores.length > 0 ? (
        <Section title="Your turn">
          {myChores.map((ch) => (
            <Card key={ch.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <Press
                accessibilityRole="button"
                accessibilityLabel={`${ch.title}, ${dueLabel(ch.next_due_on, today)}`}
                style={{ flex: 1 }}
                onPress={() => router.push({ pathname: '/chores/[id]', params: { id: ch.id } })}
              >
                <Text variant="bodyStrong">{ch.title}</Text>
                <Text variant="caption" tone="muted">
                  {dueLabel(ch.next_due_on, today)} · only you see this
                </Text>
              </Press>
              <Button
                compact
                label="Done"
                icon="check"
                onPress={async () => {
                  try {
                    const res = await completeChore(ch.id, ch.next_due_on);
                    toast.success(res.completed ? `Thanks! Next up: ${nameOf(res.assignee_id)}` : 'Already done — thanks anyway');
                    void refresh();
                  } catch (e) {
                    toast.error(e);
                  }
                }}
              />
            </Card>
          ))}
        </Section>
      ) : null}
    </Screen>
  );
}
