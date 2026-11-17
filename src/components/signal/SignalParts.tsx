import { View } from 'react-native';

import { haptic } from '@/lib/haptics';
import { KINDS, type ResponseOption } from '@/lib/signals';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, touch } from '@/theme/tokens';
import type { SignalKind } from '@/types/domain';

import { Glyph, Press, Text } from '../ui';

/** The kind "stamp": glyph on the kind's tint. Color is never the only cue — there's a label too. */
export function KindStamp({ kind, size = 36 }: { kind: SignalKind; size?: number }) {
  const { kind: hearth } = useTheme();
  const h = hearth(kind);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size, height: size, borderRadius: size * 0.32, backgroundColor: h.fuse,
        alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-4deg' }],
      }}
    >
      <Glyph name={KINDS[kind].icon} size={size * 0.56} color="#FFFFFF" />
    </View>
  );
}

/** Thin line that burns down until the signal expires. Supplementary: expiry is also in text. */
export function Fuse({ remaining, color }: { remaining: number; color: string }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ height: 3, backgroundColor: 'transparent' }}>
      <View style={{ height: 3, width: `${Math.round(remaining * 100)}%`, backgroundColor: color, borderTopRightRadius: 2, borderBottomRightRadius: 2 }} />
    </View>
  );
}

export function ResponseBar({
  kind, options, selected, onSelect, disabled,
}: {
  kind: SignalKind; options: ResponseOption[]; selected: string | null; onSelect: (key: string | null) => void; disabled?: boolean;
}) {
  const { c, kind: hearth } = useTheme();
  const h = hearth(kind);
  return (
    <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }} accessibilityRole="radiogroup">
      {options.map((o) => {
        const isOn = selected === o.key;
        return (
          <Press
            key={o.key}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: isOn, disabled: !!disabled }}
            accessibilityHint={isOn ? 'Tap again to clear your response' : undefined}
            disabled={disabled}
            onPress={() => {
              haptic.tap();
              onSelect(isOn ? null : o.key);
            }}
            style={{
              minHeight: touch.min, paddingHorizontal: space.lg, borderRadius: radius.chip, justifyContent: 'center',
              backgroundColor: isOn ? h.ink : c.surface, borderWidth: 1, borderColor: isOn ? h.ink : c.line,
            }}
          >
            <Text variant="label" color={isOn ? h.tint : c.ink}>
              {o.label}
            </Text>
          </Press>
        );
      })}
    </View>
  );
}
