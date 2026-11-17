import { useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { View } from 'react-native';

import { Screen } from '@/components/Screen';
import { EmptyState, ErrorState, Skeleton } from '@/components/States';
import { Glyph, Press, Section, Text } from '@/components/ui';
import { useUserId } from '@/features/auth/AuthProvider';
import { markNotificationsRead } from '@/lib/api';
import { keys, useInbox } from '@/lib/queries';
import { relative } from '@/lib/time';
import { useNow } from '@/lib/useNow';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import type { AppNotification, NotificationCategory } from '@/types/domain';

const ICON: Record<NotificationCategory, string> = {
  food: 'pot-steam-outline', runs: 'cart-outline', spaces: 'sofa-outline', sparks: 'creation', resets: 'broom',
  updates: 'information-outline', chores: 'autorenew', responses: 'message-reply-outline', requests: 'hand-back-right-outline',
  household: 'home-outline',
};

export default function Inbox() {
  const me = useUserId();
  const { c } = useTheme();
  const qc = useQueryClient();
  const inbox = useInbox(me);
  const now = useNow();

  // Opening the inbox marks everything read (after a short beat so the unread dots are visible).
  useFocusEffect(
    useCallback(() => {
      const t = setTimeout(() => {
        markNotificationsRead()
          .then(() => qc.invalidateQueries({ queryKey: keys.inbox(me) }))
          .catch(() => undefined);
      }, 1500);
      return () => clearTimeout(t);
    }, [me, qc]),
  );

  const items = inbox.data ?? [];
  const asks = items.filter((n) => n.actionable && !n.read_at);
  const rest = items.filter((n) => !asks.includes(n));

  const row = (n: AppNotification) => (
    <Press
      key={n.id}
      accessibilityRole="button"
      accessibilityLabel={`${n.title}${n.body ? `. ${n.body}` : ''}. ${relative(n.created_at, now)}${n.read_at ? '' : '. Unread'}`}
      disabled={!n.signal_id && !n.chore_id}
      onPress={() => {
        if (n.signal_id) router.push({ pathname: '/signal/[id]', params: { id: n.signal_id } });
        else if (n.chore_id) router.push({ pathname: '/chores/[id]', params: { id: n.chore_id } });
      }}
    >
      <View style={{ flexDirection: 'row', gap: space.md, paddingVertical: space.md, alignItems: 'flex-start' }}>
        <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: c.surfaceSunken, alignItems: 'center', justifyContent: 'center' }}>
          <Glyph name={ICON[n.category]} size={20} color={c.inkMuted} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant={n.read_at ? 'body' : 'bodyStrong'}>{n.title}</Text>
          {n.body ? (
            <Text variant="caption" tone="muted">
              {n.body}
            </Text>
          ) : null}
          <Text variant="caption" tone="muted">
            {relative(n.created_at, now)}
          </Text>
        </View>
        {!n.read_at ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.ember, marginTop: 8 }} /> : null}
      </View>
    </Press>
  );

  return (
    <Screen title="Inbox" tabBarInset refreshing={inbox.isRefetching} onRefresh={() => inbox.refetch()}>
      {inbox.isLoading ? <Skeleton height={56} count={5} /> : null}
      {inbox.error ? <ErrorState error={inbox.error} onRetry={() => inbox.refetch()} /> : null}
      {!inbox.isLoading && items.length === 0 ? (
        <EmptyState icon="bell-sleep-outline" title="All caught up" body="Responses, requests and updates land here. Declines never do." />
      ) : null}
      {asks.length > 0 ? <Section title="Waiting on you">{asks.map(row)}</Section> : null}
      {rest.length > 0 ? <Section title="Updates">{rest.map(row)}</Section> : null}
    </Screen>
  );
}
