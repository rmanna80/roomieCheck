/**
 * DEV-ONLY design review screen: renders real components with demo fixtures so the visual
 * system can be reviewed without a backend. Redirects away in production builds unless the
 * build explicitly sets EXPO_PUBLIC_DESIGN_PREVIEW=1.
 */
import { Redirect } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Screen } from '@/components/Screen';
import { SignalCard } from '@/components/signal/SignalCard';
import { EmptyState, ErrorState, Skeleton } from '@/components/States';
import { Avatar, Button, Card, Chip, ChipRow, Section, Text } from '@/components/ui';
import { Windows } from '@/components/Windows';
import { DEMO_ME, demoMembers, demoSignals, demoStatuses } from '@/dev/fixtures';
import { deviceTimeZone } from '@/lib/time';
import { space } from '@/theme/tokens';

export default function DesignPreview() {
  const [responses, setResponses] = useState<Record<string, string | null>>({});
  // Dev builds only — or an explicit design-review build (EXPO_PUBLIC_DESIGN_PREVIEW=1).
  if (!__DEV__ && process.env.EXPO_PUBLIC_DESIGN_PREVIEW !== '1') return <Redirect href="/" />;

  const now = new Date();
  const tz = deviceTimeZone();
  const nameOf = (id: string) => (id === DEMO_ME ? 'You' : demoMembers.find((m) => m.user_id === id)?.profile.display_name ?? '?');
  const signals = demoSignals.map((s) =>
    s.id in responses
      ? { ...s, signal_responses: [...s.signal_responses.filter((r) => r.user_id !== DEMO_ME), ...(responses[s.id] ? [{ signal_id: s.id, user_id: DEMO_ME, response: responses[s.id]!, portions: 1, note: null, updated_at: '' }] : [])] }
      : s,
  );

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingTop: space.md }}>
        <View style={{ flex: 1 }}>
          <Text variant="micro" tone="muted">
            Design preview · demo data
          </Text>
          <Text variant="display">Maple House</Text>
        </View>
        <Avatar name="Ryan" color="ember" size={44} />
      </View>
      <Windows members={demoMembers} statuses={demoStatuses} me={DEMO_ME} timeZone={tz} now={now} onPressMe={() => undefined} />
      <Card>
        <Text variant="headline">2 people are up to hang out</Text>
        <Text tone="muted">Maya, Sky said so. Want to plan something?</Text>
        <Button compact label="Start a Spark" icon="creation" style={{ alignSelf: 'flex-start' }} />
      </Card>
      <Section title="Now">
        {signals.map((s, i) => (
          <SignalCard
            key={s.id}
            index={i}
            signal={s}
            me={DEMO_ME}
            timeZone={tz}
            now={now}
            nameOf={nameOf}
            spaceName={() => 'Living room'}
            needsMe={s.kind === 'space'}
            onPress={() => undefined}
            onRespond={(resp) => setResponses((m) => ({ ...m, [s.id]: resp }))}
          />
        ))}
      </Section>
      <Section title="States">
        <Skeleton height={80} count={1} />
        <EmptyState icon="home-heart" title="Quiet house." body="Start something — it takes a few seconds.">
          <ChipRow wrap>
            <Chip label="I’m cooking" icon="pot-steam-outline" />
            <Chip label="Heading out" icon="cart-outline" />
            <Chip label="Anyone down?" icon="creation" selected />
          </ChipRow>
        </EmptyState>
        <ErrorState error={{ message: 'network' }} onRetry={() => undefined} />
      </Section>
      <Section title="Buttons">
        <Button label="Primary" />
        <Button label="Secondary" variant="secondary" />
        <Button label="Withdraw request" variant="danger" />
      </Section>
    </Screen>
  );
}
