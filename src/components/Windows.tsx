/**
 * "Lit windows": one pane per housemate. A pane glows only when that person chose to share a
 * status with you. A dim pane reveals nothing — not whether they're hidden, away, or unset.
 */
import { ScrollView, View } from 'react-native';

import { statusLabel } from '@/lib/signals';
import { formatTime } from '@/lib/time';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import type { Member, MemberStatus, UUID } from '@/types/domain';

import { Glyph, Press, Text } from './ui';

export function Windows({
  members, statuses, me, timeZone, now, onPressMe,
}: {
  members: Member[]; statuses: MemberStatus[]; me: UUID; timeZone: string; now: Date; onPressMe: () => void;
}) {
  const { c, member } = useTheme();
  const visible = (uid: UUID) => statuses.find((s) => s.user_id === uid && new Date(s.expires_at) > now);
  const ordered = [...members].sort((a, b) => (a.user_id === me ? -1 : b.user_id === me ? 1 : 0));

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.md, paddingRight: space.xl }}>
      {ordered.map((m) => {
        const st = visible(m.user_id);
        const isMe = m.user_id === me;
        const name = isMe ? 'You' : m.profile.display_name || 'Housemate';
        const lit = !!st;
        const label = st
          ? `${statusLabel(st.status, st.label)}${st.eta_at ? ` ~${formatTime(st.eta_at, timeZone).replace(':00', '')}` : ''}`
          : isMe
            ? 'Set status'
            : '';
        const color = member(m.profile.color);
        const a11y = st ? `${name}: ${label}` : isMe ? 'Set your status' : `${name}: nothing shared`;
        const pane = (
          <View style={{ width: 76, alignItems: 'center', gap: 6 }}>
            <View
              style={{
                width: 56, height: 64, borderRadius: radius.input, borderTopLeftRadius: 28, borderTopRightRadius: 28,
                backgroundColor: lit ? color : c.windowDim, alignItems: 'center', justifyContent: 'center',
                borderWidth: isMe && !lit ? 1.5 : 0, borderStyle: 'dashed', borderColor: c.inkMuted,
                shadowColor: color, shadowOpacity: lit ? 0.45 : 0, shadowRadius: 12, shadowOffset: { width: 0, height: 0 },
              }}
            >
              {isMe && !lit ? (
                <Glyph name="plus" size={22} color={c.inkMuted} />
              ) : (
                <Text variant="title" color={lit ? '#FFFFFF' : c.inkMuted}>
                  {(m.profile.display_name || '?')[0]?.toUpperCase()}
                </Text>
              )}
            </View>
            <Text variant="caption" numberOfLines={1} tone={lit ? 'ink' : 'muted'}>
              {name}
            </Text>
            {label ? (
              <Text variant="micro" numberOfLines={2} align="center" tone={lit ? 'ink' : 'muted'} style={{ textTransform: 'none', letterSpacing: 0 }}>
                {label}
              </Text>
            ) : null}
          </View>
        );
        return isMe ? (
          <Press key={m.user_id} accessibilityRole="button" accessibilityLabel={a11y} onPress={onPressMe}>
            {pane}
          </Press>
        ) : (
          <View key={m.user_id} accessible accessibilityLabel={a11y}>
            {pane}
          </View>
        );
      })}
    </ScrollView>
  );
}
