import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { gutter, space } from '@/theme/tokens';

/** Shown in development when Supabase env vars are missing, instead of crashing. */
export function ConfigMissing() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: gutter, paddingTop: insets.top + space.xxl, gap: space.lg }}>
      <Text variant="display">Almost there</Text>
      <Text tone="muted">
        HomePulse needs a Supabase project. Copy .env.example to .env and set these two values, then restart Expo:
      </Text>
      <Card>
        <Text variant="label">EXPO_PUBLIC_SUPABASE_URL</Text>
        <Text variant="label">EXPO_PUBLIC_SUPABASE_ANON_KEY</Text>
      </Card>
      <View>
        <Text variant="caption" tone="muted">
          Only the publishable (anon) key belongs in the app. Never use the service-role key here. See README → Local setup.
        </Text>
      </View>
    </ScrollView>
  );
}
