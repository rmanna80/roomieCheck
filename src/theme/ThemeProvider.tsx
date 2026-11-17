import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import type { MemberColor, SignalKind } from '../types/domain';
import { hearth, memberColors, palette, type ColorScheme, type HearthColor, type Palette } from './tokens';

interface Theme {
  scheme: ColorScheme;
  c: Palette;
  kind: (k: SignalKind) => HearthColor;
  member: (color: MemberColor | null | undefined) => string;
}

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const scheme: ColorScheme = system === 'dark' ? 'dark' : 'light';
  const value = useMemo<Theme>(
    () => ({
      scheme,
      c: palette[scheme],
      kind: (k) => hearth[scheme][k],
      member: (color) => memberColors[color ?? 'ember'][scheme],
    }),
    [scheme],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const t = useContext(ThemeContext);
  if (!t) throw new Error('useTheme must be used inside ThemeProvider');
  return t;
}
