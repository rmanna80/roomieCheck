import { View } from 'react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';

import { effectiveStatus, fuseRemaining, isOpen, KINDS, myResponse, summarize } from '@/lib/signals';
import { formatTime, formatTimeRange, formatWhen, relative } from '@/lib/time';
import { useTheme } from '@/theme/ThemeProvider';
import { motion, radius, space } from '@/theme/tokens';
import type { Signal, UUID } from '@/types/domain';

import { Button, Press, Text } from '../ui';
import { Fuse, KindStamp, ResponseBar } from './SignalParts';

export interface SignalCardProps {
  signal: Signal;
  me: UUID;
  timeZone: string;
  now: Date;
  nameOf: (id: UUID) => string;
  spaceName?: (id: UUID) => string;
  /** e.g. an approval waiting on me */
  needsMe?: boolean;
  onPress: () => void;
  onRespond?: (response: string | null) => void;
  index?: number;
}

export function whenText(s: Signal, tz: string, now: Date, spaceName?: (id: UUID) => string): string {
  switch (s.kind) {
    case 'food':
      return s.starts_at && new Date(s.starts_at) > now ? formatWhen(s.starts_at, tz, now) : 'Now';
    case 'run':
      return s.runs ? `Leaves ${formatWhen(s.runs.leaves_at, tz, now)}${s.runs.destination ? ` · ${s.runs.destination}` : ''}` : '';
    case 'space':
      return s.space_windows
        ? `${spaceName?.(s.space_windows.space_id) ?? 'Space'} · ${formatTimeRange(s.space_windows.starts_at, s.space_windows.ends_at, tz)}`
        : '';
    case 'spark':
      return s.starts_at ? formatWhen(s.starts_at, tz, now) : 'Whenever';
    case 'return':
      return s.starts_at ? `Around ${formatTime(s.starts_at, tz)}` : '';
    case 'quiet':
      return `${s.starts_at && new Date(s.starts_at) > now ? `From ${formatTime(s.starts_at, tz)} · ` : ''}Until ${formatTime(s.expires_at, tz)}`;
    case 'reset':
      return `${s.resets?.minutes ?? 10} min`;
    case 'leftovers':
      return s.food_details?.location ?? 'In the fridge';
  }
}

export function SignalCard({ signal: s, me, timeZone, now, nameOf, spaceName, needsMe, onPress, onRespond, index = 0 }: SignalCardProps) {
  const { c, kind } = useTheme();
  const reduce = useReducedMotion();
  const h = kind(s.kind);
  const meta = KINDS[s.kind];
  const mine = s.created_by === me;
  const open = isOpen(s, now);
  const when = whenText(s, timeZone, now, spaceName);
  const summary = summarize(s);
  const mineResponse = myResponse(s, me);
  const author = mine ? 'You' : nameOf(s.created_by);
  const status = effectiveStatus(s, now);

  const canRespond = open && !mine && meta.responses.length > 0 && onRespond;
  const a11y = [meta.label, s.title, when, `from ${author}`, summary, open ? `ends ${relative(s.expires_at, now)}` : status]
    .filter(Boolean)
    .join('. ');

  return (
    <Animated.View
      entering={reduce ? undefined : FadeInDown.duration(motion.enterMs).delay(Math.min(index, 8) * motion.staggerMs)}
      style={{
        backgroundColor: h.tint, borderRadius: radius.card, overflow: 'hidden',
        borderWidth: needsMe ? 2 : 0, borderColor: h.fuse,
      }}
    >
      <Press accessibilityRole="button" accessibilityLabel={a11y} accessibilityHint="Opens details" onPress={onPress}>
        <View style={{ padding: space.lg, paddingBottom: canRespond ? space.sm : space.lg, gap: space.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <KindStamp kind={s.kind} />
            <View style={{ flex: 1 }}>
              <Text variant="micro" color={h.ink} numberOfLines={2}>
                {meta.label} · {when}
              </Text>
              <Text variant="caption" color={h.ink} style={{ opacity: 0.85 }} numberOfLines={1}>
                {author} · {relative(s.created_at, now)}
              </Text>
            </View>
            {needsMe ? (
              <View style={{ backgroundColor: h.ink, borderRadius: radius.chip, paddingHorizontal: space.sm, paddingVertical: 2 }}>
                <Text variant="micro" color={h.tint}>
                  Your call
                </Text>
              </View>
            ) : null}
          </View>
          <Text variant="headline" color={h.ink}>
            {s.title}
          </Text>
          {s.body ? (
            <Text variant="body" color={h.ink} numberOfLines={2}>
              {s.body}
            </Text>
          ) : null}
          {summary ? (
            <Text variant="label" color={h.ink} style={{ opacity: 0.9 }}>
              {summary}
            </Text>
          ) : null}
        </View>
      </Press>

      {canRespond ? (
        <View style={{ paddingHorizontal: space.lg, paddingBottom: space.lg }}>
          <ResponseBar kind={s.kind} options={meta.responses} selected={mineResponse} onSelect={(k) => onRespond?.(k)} />
        </View>
      ) : null}
      {open && !mine && (s.kind === 'leftovers' || needsMe) ? (
        <View style={{ paddingHorizontal: space.lg, paddingBottom: space.lg }}>
          <Button
            compact
            variant="secondary"
            label={s.kind === 'leftovers' ? (mineResponse ? 'Change claim' : 'Claim a portion') : 'Review request'}
            onPress={onPress}
            style={{ alignSelf: 'flex-start' }}
          />
        </View>
      ) : null}

      {open ? <Fuse remaining={fuseRemaining(s, now)} color={h.fuse} /> : null}
      {!open ? (
        <View style={{ position: 'absolute', top: space.lg, right: space.lg, backgroundColor: c.surface, borderRadius: radius.chip, paddingHorizontal: space.sm, paddingVertical: 2 }}>
          <Text variant="micro" tone="muted">
            {status}
          </Text>
        </View>
      ) : null}
    </Animated.View>
  );
}
