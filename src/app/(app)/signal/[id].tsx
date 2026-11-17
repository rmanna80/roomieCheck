import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { whenText } from '@/components/signal/SignalCard';
import { Fuse, KindStamp } from '@/components/signal/SignalParts';
import { EmptyState, ErrorState, Skeleton } from '@/components/States';
import { Avatar, Button, Section, Text, TextField } from '@/components/ui';
import { useUserId } from '@/features/auth/AuthProvider';
import { useActiveHousehold } from '@/features/household/HouseholdProvider';
import {
  FoodHeadline, LeftoversPanel, ResetPanel, ResponsesPanel, RunPanel, SpacePanel, SparkPanel, useAction,
} from '@/features/signals/panels';
import * as api from '@/lib/api';
import { useSignal, useSpaces } from '@/lib/queries';
import { effectiveStatus, fuseRemaining, isOpen, KINDS } from '@/lib/signals';
import { formatTime, relative } from '@/lib/time';
import { useNow } from '@/lib/useNow';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import type { SignalDetail } from '@/types/domain';

const RESOLVE_LABEL: Partial<Record<SignalDetail['kind'], string>> = {
  food: 'Dinner’s served',
  leftovers: 'All gone',
  reset: 'We’re done',
  spark: 'Wrap up',
  return: 'I’m home',
  quiet: 'End quiet time',
};

function Comments({ s }: { s: SignalDetail }) {
  const { nameOf, memberById, timeZone } = useActiveHousehold();
  const { busy, run } = useAction();
  const [body, setBody] = useState('');
  const comments = [...s.signal_comments].sort((a, b) => a.created_at.localeCompare(b.created_at));
  return (
    <Section title="Talk it through">
      {comments.map((c) => (
        <View key={c.id} style={{ flexDirection: 'row', gap: space.md }}>
          <Avatar name={memberById(c.user_id)?.profile.display_name ?? '?'} color={memberById(c.user_id)?.profile.color} size={30} />
          <View style={{ flex: 1 }}>
            <Text variant="label">
              {nameOf(c.user_id)}{' '}
              <Text variant="caption" tone="muted">
                {formatTime(c.created_at, timeZone)}
              </Text>
            </Text>
            <Text>{c.body}</Text>
          </View>
        </View>
      ))}
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>
          <TextField value={body} onChangeText={setBody} placeholder="Add a note" maxLength={500} multiline />
        </View>
        <Button
          compact
          label="Send"
          disabled={!body.trim()}
          loading={busy === 'comment'}
          onPress={() =>
            run('comment', async () => {
              await api.addComment(s.id, body.trim());
              setBody('');
            })
          }
        />
      </View>
    </Section>
  );
}

export default function SignalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useUserId();
  const { nameOf, memberById, timeZone } = useActiveHousehold();
  const { kind } = useTheme();
  const now = useNow(30_000);
  const q = useSignal(id ?? null);
  const spaces = useSpaces(q.data?.household_id ?? null);
  const { busy, run } = useAction();

  if (q.isLoading) {
    return (
      <Screen back="back">
        <Skeleton height={160} count={2} />
      </Screen>
    );
  }
  if (q.error) {
    return (
      <Screen back="back">
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      </Screen>
    );
  }
  const s = q.data;
  if (!s) {
    return (
      <Screen back="back">
        <EmptyState icon="eye-off-outline" title="Not available" body="This signal was removed, or it wasn’t shared with you." />
      </Screen>
    );
  }

  const h = kind(s.kind);
  const open = isOpen(s, now);
  const status = effectiveStatus(s, now);
  const mine = s.created_by === me;
  const spaceName = (sid: string) => spaces.data?.find((x) => x.id === sid)?.name ?? 'Space';
  const creator = memberById(s.created_by);

  const panel = (() => {
    switch (s.kind) {
      case 'food':
        return (
          <View style={{ gap: space.xxl }}>
            <FoodHeadline s={s} />
            <ResponsesPanel s={s} me={me} now={now} />
          </View>
        );
      case 'leftovers':
        return <LeftoversPanel s={s} me={me} now={now} />;
      case 'run':
        return <RunPanel s={s} me={me} now={now} />;
      case 'space':
        return <SpacePanel s={s} me={me} now={now} />;
      case 'reset':
        return <ResetPanel s={s} me={me} now={now} />;
      case 'spark':
        return <SparkPanel s={s} me={me} now={now} />;
      default:
        return <ResponsesPanel s={s} me={me} now={now} />;
    }
  })();

  const confirmCancel = () =>
    Alert.alert(
      s.kind === 'space' ? 'Withdraw this request?' : 'Cancel this signal?',
      'Anyone who said yes will get a short heads-up.',
      [
        { text: 'Keep it', style: 'cancel' },
        { text: s.kind === 'space' ? 'Withdraw' : 'Cancel signal', style: 'destructive', onPress: () => run('cancel', () => api.cancelSignal(s.id), 'Canceled') },
      ],
    );

  return (
    <Screen back="back">
      <View style={{ backgroundColor: h.tint, borderRadius: radius.card, overflow: 'hidden' }}>
        <View style={{ padding: space.xl, gap: space.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <KindStamp kind={s.kind} size={44} />
            <View style={{ flex: 1 }}>
              <Text variant="micro" color={h.ink}>
                {KINDS[s.kind].label} · {whenText(s, timeZone, now, spaceName)}
              </Text>
              <Text variant="caption" color={h.ink}>
                {open ? `Ends ${relative(s.expires_at, now)}` : status === 'resolved' ? 'Wrapped up' : status === 'canceled' ? 'Canceled' : 'Expired'}
                {s.audience === 'selected' ? ' · shared with a few people' : ''}
              </Text>
            </View>
          </View>
          <Text variant="title" color={h.ink} accessibilityRole="header">
            {s.title}
          </Text>
          {s.body ? <Text color={h.ink}>{s.body}</Text> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Avatar name={creator?.profile.display_name ?? '?'} color={creator?.profile.color} size={26} />
            <Text variant="label" color={h.ink}>
              {nameOf(s.created_by)} · {relative(s.created_at, now)}
            </Text>
          </View>
        </View>
        {open ? <Fuse remaining={fuseRemaining(s, now)} color={h.fuse} /> : null}
      </View>

      {panel}

      <Comments s={s} />

      {mine && open ? (
        <View style={{ gap: space.sm }}>
          {RESOLVE_LABEL[s.kind] ? (
            <Button
              label={RESOLVE_LABEL[s.kind]!}
              variant="secondary"
              icon="check"
              loading={busy === 'resolve'}
              onPress={() =>
                run('resolve', async () => {
                  await api.resolveSignal(s.id);
                  router.back();
                }, 'Wrapped up')
              }
            />
          ) : null}
          <Button label={s.kind === 'space' ? 'Withdraw request' : 'Cancel signal'} variant="danger" loading={busy === 'cancel'} onPress={confirmCancel} />
        </View>
      ) : null}
    </Screen>
  );
}
