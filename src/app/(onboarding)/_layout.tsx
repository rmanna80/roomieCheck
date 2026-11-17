import { Stack } from 'expo-router';

export const unstable_settings = { initialRouteName: 'setup-profile' };

export default function OnboardingLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
