import { Stack } from 'expo-router';

import { useTheme } from '@/theme/ThemeProvider';

export const unstable_settings = { initialRouteName: '(tabs)' };

export default function AppLayout() {
  const { c } = useTheme();
  const modal = { presentation: 'modal' as const, contentStyle: { backgroundColor: c.bg } };
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="compose" options={modal} />
      <Stack.Screen name="status" options={modal} />
      <Stack.Screen name="chores/new" options={modal} />
      <Stack.Screen name="household/join" options={modal} />
      <Stack.Screen name="household/create" options={modal} />
      <Stack.Screen name="feedback" options={modal} />
    </Stack>
  );
}
