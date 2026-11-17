import { router } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Card, Glyph, Press, Text } from '@/components/ui';
import { useHousehold } from '@/features/household/HouseholdProvider';
import { pendingInvite } from '@/lib/pendingInvite';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

function Choice({ icon, title, body, onPress }: { icon: string; title: string; body: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Press accessibilityRole="button" accessibilityLabel={title} accessibilityHint={body} onPress={onPress}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg, padding: space.xl }}>
        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: c.surfaceSunken, alignItems: 'center', justifyContent: 'center' }}>
          <Glyph name={icon} size={26} color={c.ember} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="headline">{title}</Text>
          <Text variant="caption" tone="muted">
            {body}
          </Text>
        </View>
        <Glyph name="chevron-right" color={c.inkMuted} />
      </Card>
    </Press>
  );
}

export default function SetupHome() {
  const { me } = useHousehold();

  // Arrived from an invite link? Go straight to joining.
  useEffect(() => {
    pendingInvite.get().then((code) => {
      if (code) router.push('/onboarding-join');
    });
  }, []);

  return (
    <Screen title={`Hi ${me?.display_name ?? 'there'}.`} subtitle="Let’s get you into your home.">
      <View style={{ gap: space.md }}>
        <Choice icon="key-outline" title="Join my home" body="A housemate already set it up and has a code." onPress={() => router.push('/onboarding-join')} />
        <Choice icon="home-plus-outline" title="Set up a new home" body="Takes a minute. You’ll get a code to share." onPress={() => router.push('/onboarding-create')} />
      </View>
    </Screen>
  );
}
