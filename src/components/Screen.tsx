import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/ThemeProvider';
import { gutter, space, touch } from '@/theme/tokens';

import { Glyph, Press, Text } from './ui';

interface ScreenProps {
  title?: string;
  subtitle?: string;
  /** Show a back/close button (modal screens use "close"). */
  back?: 'back' | 'close';
  right?: ReactNode;
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  scroll?: boolean;
  footer?: ReactNode;
  /** Extra bottom padding for screens under the tab bar. */
  tabBarInset?: boolean;
}

export function Screen({ title, subtitle, back, right, children, refreshing, onRefresh, scroll = true, footer, tabBarInset }: ScreenProps) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();

  const header = (title || back || right) && (
    <View style={{ paddingHorizontal: gutter, paddingTop: space.sm, paddingBottom: space.md, gap: space.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: touch.min, gap: space.sm }}>
        {back ? (
          <Press
            accessibilityRole="button"
            accessibilityLabel={back === 'close' ? 'Close' : 'Back'}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            style={{ width: touch.min, height: touch.min, marginLeft: -space.md, alignItems: 'center', justifyContent: 'center' }}
          >
            <Glyph name={back === 'close' ? 'close' : 'chevron-left'} size={28} />
          </Press>
        ) : null}
        <View style={{ flex: 1 }} />
        {right}
      </View>
      {title ? (
        <Text variant="display" accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      {subtitle ? (
        <Text variant="body" tone="muted">
          {subtitle}
        </Text>
      ) : null}
    </View>
  );

  const bottomPad = (tabBarInset ? 120 : space.huge) + (footer ? 0 : insets.bottom);
  const body = scroll ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: bottomPad, gap: space.xxl }}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.ember} /> : undefined}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={{ flex: 1, paddingHorizontal: gutter, paddingBottom: bottomPad }}>{children}</View>
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      {header}
      {body}
      {footer ? (
        <View style={{ paddingHorizontal: gutter, paddingTop: space.md, paddingBottom: insets.bottom + space.md, backgroundColor: c.bg, gap: space.sm }}>
          {footer}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}
