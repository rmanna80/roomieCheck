import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Skeleton } from '@/components/States';
import { useToast } from '@/components/Toast';
import { Button, Card, Chip, ChipRow, Divider, ListRow, Section, Text } from '@/components/ui';
import { useUserId } from '@/features/auth/AuthProvider';
import { updateNotificationPrefs } from '@/lib/api';
import { enablePush, getPushPermission, type PushPermission } from '@/lib/push';
import { keys, useNotificationPrefs } from '@/lib/queries';
import { space } from '@/theme/tokens';
import type { NotificationPreferences } from '@/types/domain';

type Category = 'food' | 'runs' | 'spaces' | 'sparks' | 'resets' | 'updates' | 'chores' | 'responses';

const CATEGORIES: { key: Category; title: string; subtitle: string }[] = [
  { key: 'food', title: 'Food', subtitle: 'Someone’s cooking or sharing leftovers' },
  { key: 'runs', title: 'Runs', subtitle: 'Someone’s heading out; your requests' },
  { key: 'sparks', title: 'Sparks', subtitle: 'Spontaneous plans' },
  { key: 'spaces', title: 'Spaces', subtitle: 'Updates on your room requests' },
  { key: 'resets', title: 'Resets', subtitle: 'Quick group cleanups' },
  { key: 'updates', title: 'Heads-ups', subtitle: 'Quiet requests and “home around…”' },
  { key: 'chores', title: 'Your turns', subtitle: 'Private reminders when it’s your turn' },
  { key: 'responses', title: 'Responses', subtitle: 'People answering your signals' },
];

const QUIET: { label: string; start: string | null; end: string | null }[] = [
  { label: 'Off', start: null, end: null },
  { label: '10 PM – 8 AM', start: '22:00', end: '08:00' },
  { label: '11 PM – 7 AM', start: '23:00', end: '07:00' },
  { label: '12 AM – 9 AM', start: '00:00', end: '09:00' },
];

export default function NotificationSettings() {
  const me = useUserId();
  const toast = useToast();
  const qc = useQueryClient();
  const prefs = useNotificationPrefs(me);
  const [permission, setPermission] = useState<PushPermission>('undetermined');

  useEffect(() => {
    void getPushPermission().then(setPermission);
  }, []);

  const update = async (patch: Partial<NotificationPreferences>) => {
    const prev = qc.getQueryData<NotificationPreferences>(keys.prefs(me));
    if (prev) qc.setQueryData(keys.prefs(me), { ...prev, ...patch }); // optimistic
    try {
      await updateNotificationPrefs(me, patch);
    } catch (e) {
      if (prev) qc.setQueryData(keys.prefs(me), prev);
      toast.error(e);
    }
  };

  const p = prefs.data;
  return (
    <Screen back="back" title="Notifications" subtitle="Requests that need your answer always reach your Inbox. Everything else is up to you.">
      {permission === 'denied' ? (
        <Card>
          <Text variant="bodyStrong">Notifications are blocked for HomePulse</Text>
          <Text variant="caption" tone="muted">
            Turn them on in your phone’s settings if you want pings.
          </Text>
          <Button compact variant="secondary" label="Open settings" style={{ alignSelf: 'flex-start' }} onPress={() => Linking.openSettings()} />
        </Card>
      ) : null}
      {permission === 'undetermined' ? (
        <Button
          label="Allow notifications on this phone"
          icon="bell-ring-outline"
          onPress={async () => setPermission(await enablePush().catch(() => 'denied' as const))}
        />
      ) : null}

      {!p ? (
        <Skeleton height={56} count={6} />
      ) : (
        <>
          <Card style={{ paddingVertical: space.xs }}>
            <ListRow title="Push notifications" subtitle="Master switch for this account" toggle={{ value: p.push_enabled, onChange: (v) => update({ push_enabled: v }) }} />
          </Card>
          <Section title="What pings me">
            <Card style={{ paddingVertical: space.xs }}>
              {CATEGORIES.map((cat, i) => (
                <View key={cat.key}>
                  {i > 0 ? <Divider /> : null}
                  <ListRow title={cat.title} subtitle={cat.subtitle} toggle={{ value: p[cat.key], onChange: (v) => update({ [cat.key]: v }) }} />
                </View>
              ))}
            </Card>
            <Text variant="caption" tone="muted">
              Muted categories don’t create notifications at all — but you’ll still see the signals at home.
            </Text>
          </Section>
          <Section title="Quiet hours">
            <ChipRow wrap>
              {QUIET.map((q) => (
                <Chip
                  key={q.label}
                  label={q.label}
                  selected={(p.quiet_hours_start?.slice(0, 5) ?? null) === q.start}
                  onPress={() => update({ quiet_hours_start: q.start, quiet_hours_end: q.end })}
                />
              ))}
            </ChipRow>
            <Text variant="caption" tone="muted">
              No pushes during quiet hours (in your time zone). They still land in your Inbox.
            </Text>
          </Section>
        </>
      )}
    </Screen>
  );
}
