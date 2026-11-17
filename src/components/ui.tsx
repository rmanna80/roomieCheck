/**
 * Core primitives built on the Porch Light tokens. Every interactive element has an
 * accessibility role/label and a ≥ 44 pt touch target.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator, Pressable, Text as RNText, TextInput, View, Switch, type PressableProps,
  type StyleProp, type TextProps as RNTextProps, type TextStyle, type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { haptic } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { motion, radius, space, touch, type as typeScale, type TypeVariant } from '@/theme/tokens';
import type { MemberColor } from '@/types/domain';

export type GlyphName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export function Glyph({ name, size = 20, color }: { name: string; size?: number; color?: string }) {
  const { c } = useTheme();
  return <MaterialCommunityIcons name={name as GlyphName} size={size} color={color ?? c.ink} />;
}

// ---------------------------------------------------------------------------------------------
type Tone = 'ink' | 'muted' | 'ember' | 'danger' | 'success';

export interface TextProps extends RNTextProps {
  variant?: TypeVariant;
  tone?: Tone;
  color?: string;
  align?: TextStyle['textAlign'];
}

export function Text({ variant = 'body', tone = 'ink', color, align, style, ...rest }: TextProps) {
  const { c } = useTheme();
  const toneColor = { ink: c.ink, muted: c.inkMuted, ember: c.ember, danger: c.danger, success: c.success }[tone];
  return (
    <RNText
      {...rest}
      maxFontSizeMultiplier={variant === 'micro' ? 1.4 : 2}
      style={[typeScale[variant], { color: color ?? toneColor, textAlign: align }, style]}
    />
  );
}

// ---------------------------------------------------------------------------------------------
/** Pressable with a restrained press-scale (disabled under Reduce Motion). */
export function Press({ style, children, onPressIn, onPressOut, ...rest }: PressableProps & { style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const reduce = useReducedMotion();
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <Pressable
      {...rest}
      onPressIn={(e) => {
        if (!reduce) scale.set(withTiming(motion.pressScale, { duration: 100 }));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        if (!reduce) scale.set(withSpring(1, { damping: 18, stiffness: 300 }));
        onPressOut?.(e);
      }}
    >
      <Animated.View style={[animated, style]}>{children}</Animated.View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------------------------
export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: string;
  loading?: boolean;
  disabled?: boolean;
  compact?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}

export function Button({ label, onPress, variant = 'primary', icon, loading, disabled, compact, accessibilityHint, style }: ButtonProps) {
  const { c } = useTheme();
  const bg = { primary: c.ember, secondary: c.surface, ghost: 'transparent', danger: 'transparent' }[variant];
  const fg = { primary: c.onEmber, secondary: c.ink, ghost: c.ember, danger: c.danger }[variant];
  const border = variant === 'secondary' ? c.line : variant === 'danger' ? c.danger : 'transparent';
  const inactive = disabled || loading;
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={() => {
        haptic.tap();
        onPress?.();
      }}
      style={[
        {
          minHeight: compact ? touch.min : touch.button,
          paddingHorizontal: compact ? space.lg : space.xl,
          borderRadius: radius.button,
          backgroundColor: bg,
          borderWidth: border === 'transparent' ? 0 : 1,
          borderColor: border,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: space.sm,
          opacity: disabled ? 0.45 : 1,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Glyph name={icon} size={18} color={fg} /> : null}
      <Text variant="label" color={fg} style={{ fontSize: compact ? 14 : 16 }}>
        {label}
      </Text>
    </Press>
  );
}

// ---------------------------------------------------------------------------------------------
export function Chip({
  label, selected, onPress, icon, tint, ink, disabled, accessibilityLabel,
}: {
  label: string; selected?: boolean; onPress?: () => void; icon?: string; tint?: string; ink?: string;
  disabled?: boolean; accessibilityLabel?: string;
}) {
  const { c } = useTheme();
  const bg = selected ? (tint ?? c.ink) : c.surface;
  const fg = selected ? (ink ?? c.bg) : c.ink;
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      disabled={disabled}
      onPress={() => {
        haptic.tap();
        onPress?.();
      }}
      style={{
        minHeight: touch.min,
        paddingHorizontal: space.lg,
        borderRadius: radius.chip,
        borderWidth: 1,
        borderColor: selected ? (ink ?? c.ink) : c.line,
        backgroundColor: bg,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {icon ? <Glyph name={icon} size={16} color={fg} /> : null}
      <Text variant="label" color={fg}>
        {label}
      </Text>
    </Press>
  );
}

export function ChipRow({ children, wrap }: { children: ReactNode; wrap?: boolean }) {
  if (wrap) return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>{children}</View>;
  return (
    <Animated.ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingRight: space.xl }}>
      {children}
    </Animated.ScrollView>
  );
}

// ---------------------------------------------------------------------------------------------
export function Card({ children, style, tint }: { children: ReactNode; style?: StyleProp<ViewStyle>; tint?: string }) {
  const { c } = useTheme();
  return (
    <View style={[{ backgroundColor: tint ?? c.surface, borderRadius: radius.card, padding: space.lg, gap: space.sm }, style]}>
      {children}
    </View>
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <View style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 28 }}>
        <Text variant="micro" tone="muted" accessibilityRole="header">
          {title}
        </Text>
        {action}
      </View>
      {children}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
export function TextField({
  label, value, onChangeText, placeholder, multiline, maxLength, autoFocus, keyboardType, autoCapitalize, onSubmitEditing,
  autoComplete, textContentType, returnKeyType,
}: {
  label?: string; value: string; onChangeText: (v: string) => void; placeholder?: string; multiline?: boolean;
  maxLength?: number; autoFocus?: boolean; keyboardType?: ComponentProps<typeof TextInput>['keyboardType'];
  autoCapitalize?: ComponentProps<typeof TextInput>['autoCapitalize']; onSubmitEditing?: () => void;
  autoComplete?: ComponentProps<typeof TextInput>['autoComplete']; textContentType?: ComponentProps<typeof TextInput>['textContentType'];
  returnKeyType?: ComponentProps<typeof TextInput>['returnKeyType'];
}) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <Text variant="label" tone="muted">
          {label}
        </Text>
      ) : null}
      <TextInput
        accessibilityLabel={label ?? placeholder}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={c.inkMuted}
        multiline={multiline}
        maxLength={maxLength}
        autoFocus={autoFocus}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete}
        textContentType={textContentType}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        selectionColor={c.ember}
        style={[
          typeScale.body,
          {
            color: c.ink,
            backgroundColor: c.surfaceSunken,
            borderRadius: radius.input,
            paddingHorizontal: space.lg,
            paddingVertical: space.md,
            minHeight: multiline ? 88 : touch.button,
            textAlignVertical: multiline ? 'top' : 'center',
          },
        ]}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
export function Avatar({ name, color, size = 36, ring }: { name: string; color?: MemberColor | null; size?: number; ring?: boolean }) {
  const { c, member } = useTheme();
  const initial = (name.trim()[0] ?? '?').toUpperCase();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: member(color),
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: ring ? 2 : 0,
        borderColor: c.bg,
      }}
    >
      <Text variant="label" color="#FFFFFF" style={{ fontSize: size * 0.42, lineHeight: size * 0.52 }}>
        {initial}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
export function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (v: number) => void; label: string }) {
  const { c } = useTheme();
  const btn = (delta: number, icon: string, disabled: boolean, a11y: string) => (
    <Press
      accessibilityRole="button"
      accessibilityLabel={a11y}
      disabled={disabled}
      onPress={() => {
        haptic.tap();
        onChange(value + delta);
      }}
      style={{
        width: touch.min, height: touch.min, borderRadius: touch.min / 2, alignItems: 'center', justifyContent: 'center',
        backgroundColor: c.surfaceSunken, opacity: disabled ? 0.4 : 1,
      }}
    >
      <Glyph name={icon} size={20} />
    </Press>
  );
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ now: value, min, max }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'increment' && value < max) onChange(value + 1);
        if (e.nativeEvent.actionName === 'decrement' && value > min) onChange(value - 1);
      }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}
    >
      {btn(-1, 'minus', value <= min, `Fewer ${label}`)}
      <Text variant="title" style={{ minWidth: 32, textAlign: 'center' }}>
        {value}
      </Text>
      {btn(1, 'plus', value >= max, `More ${label}`)}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
export function ListRow({
  title, subtitle, icon, right, onPress, destructive, toggle,
}: {
  title: string; subtitle?: string; icon?: string; right?: ReactNode; onPress?: () => void; destructive?: boolean;
  toggle?: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean };
}) {
  const { c } = useTheme();
  const content = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 56, paddingVertical: space.sm }}>
      {icon ? <Glyph name={icon} size={22} color={destructive ? c.danger : c.inkMuted} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong" tone={destructive ? 'danger' : 'ink'}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone="muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {toggle ? (
        <Switch
          accessibilityLabel={title}
          value={toggle.value}
          disabled={toggle.disabled}
          onValueChange={(v) => {
            haptic.tap();
            toggle.onChange(v);
          }}
          trackColor={{ true: c.ember, false: c.line }}
          thumbColor={c.surface}
          ios_backgroundColor={c.line}
        />
      ) : (
        right ?? (onPress ? <Glyph name="chevron-right" size={22} color={c.inkMuted} /> : null)
      )}
    </View>
  );
  if (!onPress || toggle) return content;
  return (
    <Press accessibilityRole="button" accessibilityLabel={title} accessibilityHint={subtitle} onPress={onPress}>
      {content}
    </Press>
  );
}

export function Divider() {
  const { c } = useTheme();
  return <View style={{ height: 1, backgroundColor: c.line }} />;
}
