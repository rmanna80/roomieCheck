import { router } from 'expo-router';
import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glyph, Press, Text } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { haptic } from '@/lib/haptics';
import { useInbox } from '@/lib/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

const TABS: Record<string, { label: string; icon: string; iconActive: string }> = {
  home: { label: 'Home', icon: 'home-outline', iconActive: 'home' },
  explore: { label: 'Explore', icon: 'compass-outline', iconActive: 'compass' },
  house: { label: 'House', icon: 'door', iconActive: 'door-open' },
  inbox: { label: 'Inbox', icon: 'bell-outline', iconActive: 'bell' },
};

/** Home · Explore · [Signal] · House · Inbox — the Signal button is always one thumb away. */
function TabBar({ state, navigateToTab }: BottomTabBarProps) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();
  const inbox = useInbox(userId);
  const unread = (inbox.data ?? []).filter((n) => !n.read_at).length;

  const tab = (routeIndex: number) => {
    const route = state.routes[routeIndex];
    const meta = TABS[route.name];
    if (!meta) return null;
    const focused = state.index === routeIndex;
    const badge = route.name === 'inbox' && unread > 0 ? unread : 0;
    return (
      <Press
        key={route.key}
        accessibilityRole="tab"
        accessibilityLabel={badge ? `${meta.label}, ${badge} unread` : meta.label}
        accessibilityState={{ selected: focused }}
        onPress={() => {
          if (!focused) {
            haptic.tap();
            navigateToTab(route.key);
          }
        }}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 52, gap: 2 }}
      >
        <View>
          <Glyph name={focused ? meta.iconActive : meta.icon} size={24} color={focused ? c.ink : c.inkMuted} />
          {badge ? (
            <View style={{ position: 'absolute', top: -2, right: -8, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: c.ember, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
              <Text variant="micro" color={c.onEmber} style={{ fontSize: 10 }}>
                {badge > 9 ? '9+' : badge}
              </Text>
            </View>
          ) : null}
        </View>
        <Text variant="micro" color={focused ? c.ink : c.inkMuted} style={{ textTransform: 'none', letterSpacing: 0, fontSize: 11 }} maxFontSizeMultiplier={1.3}>
          {meta.label}
        </Text>
      </Press>
    );
  };

  const order = state.routes.map((r, i) => ({ name: r.name, i }));
  const idx = (name: string) => order.find((o) => o.name === name)?.i ?? -1;

  return (
    <View
      style={{
        flexDirection: 'row', alignItems: 'center', paddingBottom: Math.max(insets.bottom, space.sm), paddingTop: space.sm,
        paddingHorizontal: space.sm, backgroundColor: c.bg, borderTopWidth: 1, borderTopColor: c.line,
      }}
    >
      {tab(idx('home'))}
      {tab(idx('explore'))}
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Press
          accessibilityRole="button"
          accessibilityLabel="Send a signal"
          accessibilityHint="Tell your home you're cooking, heading out, need a room, and more"
          onPress={() => {
            haptic.tap();
            router.push('/compose');
          }}
          style={{
            width: 60, height: 60, borderRadius: 30, backgroundColor: c.ember, alignItems: 'center', justifyContent: 'center',
            marginTop: -26, shadowColor: c.ember, shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6,
          }}
        >
          <Glyph name="broadcast" size={28} color={c.onEmber} />
        </Press>
      </View>
      {tab(idx('house'))}
      {tab(idx('inbox'))}
    </View>
  );
}

export const unstable_settings = { initialRouteName: 'home' };

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} />}>
      <Tabs.Screen name="home" />
      <Tabs.Screen name="explore" />
      <Tabs.Screen name="house" />
      <Tabs.Screen name="inbox" />
    </Tabs>
  );
}
