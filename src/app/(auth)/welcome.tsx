import { router } from 'expo-router';
import { View } from 'react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KindStamp } from '@/components/signal/SignalParts';
import { Button, Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { gutter, radius, space } from '@/theme/tokens';
import type { SignalKind } from '@/types/domain';

const PROMISES: { kind: SignalKind; title: string; body: string }[] = [
  { kind: 'food', title: 'Who’s in for dinner?', body: 'One tap to say you’re in, or to ask for a plate saved.' },
  { kind: 'space', title: 'Living room, 7–8?', body: 'Ask for shared spaces. Nothing is booked until everyone it affects says OK.' },
  { kind: 'spark', title: 'Movie at 9?', body: 'Spontaneous plans that include everyone. Saying no costs nothing.' },
];

export default function Welcome() {
  const { c, kind } = useTheme();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + space.xxxl, paddingBottom: insets.bottom + space.lg, paddingHorizontal: gutter }}>
      <View style={{ gap: space.sm }}>
        <Text variant="micro" tone="ember">
          HomePulse
        </Text>
        <Text variant="display" accessibilityRole="header">
          Living together,{'\n'}made easier.
        </Text>
        <Text tone="muted">A private space for your home. No tracking, no scoreboards. Just less back-and-forth.</Text>
      </View>

      <View style={{ flex: 1, justifyContent: 'center', gap: space.md }}>
        {PROMISES.map((p, i) => (
          <Animated.View
            key={p.kind}
            entering={reduce ? undefined : FadeInDown.delay(120 + i * 90).duration(260)}
            style={{ flexDirection: 'row', gap: space.md, alignItems: 'center', backgroundColor: kind(p.kind).tint, borderRadius: radius.card, padding: space.lg }}
          >
            <KindStamp kind={p.kind} size={40} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="headline" color={kind(p.kind).ink}>
                {p.title}
              </Text>
              <Text variant="caption" color={kind(p.kind).ink}>
                {p.body}
              </Text>
            </View>
          </Animated.View>
        ))}
      </View>

      <Button label="Get started" onPress={() => router.push('/sign-in')} />
    </View>
  );
}
