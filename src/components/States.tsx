import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { messageFor } from '@/lib/errors';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

import { Button, Glyph, Text } from './ui';

export function EmptyState({ icon, title, body, children }: { icon: string; title: string; body?: string; children?: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: space.xxxl, gap: space.md }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: c.surfaceSunken, alignItems: 'center', justifyContent: 'center' }}>
        <Glyph name={icon} size={30} color={c.inkMuted} />
      </View>
      <Text variant="headline" align="center">
        {title}
      </Text>
      {body ? (
        <Text variant="body" tone="muted" align="center" style={{ maxWidth: 300 }}>
          {body}
        </Text>
      ) : null}
      {children ? <View style={{ marginTop: space.sm, gap: space.sm, alignSelf: 'stretch' }}>{children}</View> : null}
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <EmptyState icon="cloud-off-outline" title="Couldn’t load this" body={messageFor(error)}>
      {onRetry ? <Button label="Try again" variant="secondary" onPress={onRetry} /> : null}
    </EmptyState>
  );
}

/** Skeleton blocks in a neutral tone — never spinners for lists. */
export function Skeleton({ height = 120, count = 3 }: { height?: number; count?: number }) {
  const { c } = useTheme();
  const reduce = useReducedMotion();
  const opacity = useSharedValue(0.6);
  useEffect(() => {
    if (!reduce) opacity.set(withRepeat(withTiming(1, { duration: 700 }), -1, true));
  }, [opacity, reduce]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return (
    <View accessibilityLabel="Loading" accessible style={{ gap: space.md }}>
      {Array.from({ length: count }, (_, i) => (
        <Animated.View key={i} style={[{ height, borderRadius: radius.card, backgroundColor: c.surfaceSunken }, style]} />
      ))}
    </View>
  );
}
