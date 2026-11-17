import { DMSans_400Regular } from '@expo-google-fonts/dm-sans/400Regular';
import { DMSans_500Medium } from '@expo-google-fonts/dm-sans/500Medium';
import { DMSans_600SemiBold } from '@expo-google-fonts/dm-sans/600SemiBold';
import { DMSans_700Bold } from '@expo-google-fonts/dm-sans/700Bold';
import { Fraunces_500Medium } from '@expo-google-fonts/fraunces/500Medium';
import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces/600SemiBold';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import * as Linking from 'expo-linking';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '@/components/Toast';
import { ConfigMissing } from '@/features/auth/ConfigMissing';
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { HouseholdProvider, useHousehold } from '@/features/household/HouseholdProvider';
import { extractInviteCode, pendingInvite } from '@/lib/pendingInvite';
import { usePushRouting } from '@/lib/push';
import { isConfigured } from '@/lib/supabase';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 15_000, refetchOnWindowFocus: true },
    mutations: { retry: 0 },
  },
});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Fraunces_500Medium, Fraunces_600SemiBold, DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold,
  });

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AuthProvider>
            <HouseholdProvider>
              <ToastProvider>
                <RootNavigator fontsReady={fontsLoaded || !!fontError} />
              </ToastProvider>
            </HouseholdProvider>
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator({ fontsReady }: { fontsReady: boolean }) {
  const { c, scheme } = useTheme();
  const { session, loading } = useAuth();
  const { me, households, ready } = useHousehold();
  const url = Linking.useURL();

  // Hold on to invite codes from links/QR codes until the user can use them.
  useEffect(() => {
    const code = extractInviteCode(url);
    if (code) void pendingInvite.set(code);
  }, [url]);

  usePushRouting(!!session && households.length > 0);

  const signedIn = !!session;
  const needsOnboarding = signedIn && (!me?.display_name || households.length === 0);
  const booting = !fontsReady || loading || (signedIn && !ready);

  useEffect(() => {
    if (!booting) void SplashScreen.hideAsync();
  }, [booting]);

  const navTheme = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const theme = { ...navTheme, colors: { ...navTheme.colors, background: c.bg, card: c.bg, text: c.ink, border: c.line, primary: c.ember } };

  if (!isConfigured) return <ConfigMissing />;
  if (booting) return <View style={{ flex: 1, backgroundColor: c.bg }} />;

  return (
    <NavThemeProvider value={theme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
        <Stack.Screen name="index" />
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={needsOnboarding}>
          <Stack.Screen name="(onboarding)" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !needsOnboarding}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
      </Stack>
    </NavThemeProvider>
  );
}
