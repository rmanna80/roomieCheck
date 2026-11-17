import { View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { memberColors, space } from '@/theme/tokens';
import type { MemberColor } from '@/types/domain';

import { Press } from './ui';

export function ColorPicker({ value, onChange }: { value: MemberColor; onChange: (c: MemberColor) => void }) {
  const { c, member } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }} accessibilityRole="radiogroup">
      {(Object.keys(memberColors) as MemberColor[]).map((key) => (
        <Press
          key={key}
          accessibilityRole="radio"
          accessibilityLabel={key}
          accessibilityState={{ selected: value === key }}
          onPress={() => onChange(key)}
          style={{
            width: 44, height: 44, borderRadius: 22, backgroundColor: member(key),
            borderWidth: value === key ? 3 : 0, borderColor: c.ink,
          }}
        >
          <View />
        </Press>
      ))}
    </View>
  );
}
