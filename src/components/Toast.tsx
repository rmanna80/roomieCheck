import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { messageFor } from '@/lib/errors';
import { haptic } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

import { Glyph, Text } from './ui';

type ToastKind = 'success' | 'error' | 'info';
interface ToastState {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  show: (message: string, kind?: ToastKind) => void;
  success: (message: string) => void;
  error: (err: unknown) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const { c, scheme } = useTheme();

  const show = useCallback((message: string, kind: ToastKind = 'info') => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ id: Date.now(), kind, message });
    if (kind === 'success') haptic.success();
    if (kind === 'error') haptic.warn();
    AccessibilityInfo.announceForAccessibility(message);
    timer.current = setTimeout(() => setToast(null), kind === 'error' ? 4000 : 2400);
  }, []);

  const api: ToastApi = {
    show,
    success: (m) => show(m, 'success'),
    error: (err) => show(messageFor(err), 'error'),
  };

  const icon = toast?.kind === 'success' ? 'check-circle-outline' : toast?.kind === 'error' ? 'alert-circle-outline' : 'information-outline';
  const fg = scheme === 'dark' ? c.ink : c.surface;

  return (
    <ToastContext.Provider value={api}>
      {children}
      <View pointerEvents="none" style={{ position: 'absolute', top: insets.top + space.sm, left: space.lg, right: space.lg }}>
        {toast ? (
          <Animated.View
            key={toast.id}
            entering={FadeInUp.duration(180)}
            exiting={FadeOutUp.duration(160)}
            accessibilityLiveRegion="polite"
            style={{
              flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.md, paddingHorizontal: space.lg,
              borderRadius: radius.button, backgroundColor: scheme === 'dark' ? c.surfaceSunken : c.ink,
              shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 4,
            }}
          >
            <Glyph name={icon} size={20} color={toast.kind === 'error' ? c.danger : fg} />
            <Text variant="label" color={fg} style={{ flex: 1 }}>
              {toast.message}
            </Text>
          </Animated.View>
        ) : null}
      </View>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const t = useContext(ToastContext);
  if (!t) throw new Error('useToast must be used inside ToastProvider');
  return t;
}
