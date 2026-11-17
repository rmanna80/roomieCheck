import { useQueryClient } from '@tanstack/react-query';
import { View } from 'react-native';

import { Screen } from '@/components/Screen';
import { useToast } from '@/components/Toast';
import { Card, Glyph, ListRow, Section, Text } from '@/components/ui';
import { useUserId } from '@/features/auth/AuthProvider';
import { useActiveHousehold } from '@/features/household/HouseholdProvider';
import { setStatusSharing } from '@/lib/api';
import { invalidateHousehold, keys, useStatusSharing } from '@/lib/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

const NEVER = [
  'Your location — HomePulse never asks for GPS and never runs in the background.',
  'Your schedule — only what you choose to share, and it fades on its own.',
  'Reasons — “Personal” is always enough for a room request or quiet time.',
  'Scores — no rankings, streaks, or “who did the least” anywhere.',
  'Landlords, RAs and building staff — they can never see anything from your home.',
  'Advertising — none, and your activity is never sold.',
];

export default function PrivacySettings() {
  const me = useUserId();
  const { household } = useActiveHousehold();
  const { c } = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const sharing = useStatusSharing(me);

  return (
    <Screen back="back" title="Privacy" subtitle="HomePulse is private to the people in your home — and even they only see what you choose.">
      <Card style={{ paddingVertical: space.xs }}>
        <ListRow
          title="Share a status"
          subtitle="When off, nobody sees a status from you and any current one is removed."
          toggle={{
            value: sharing.data ?? true,
            disabled: sharing.isLoading,
            onChange: async (v) => {
              try {
                await setStatusSharing(v);
                qc.setQueryData(keys.statusSharing(me), v);
                void invalidateHousehold(qc, household.id);
                toast.success(v ? 'Status sharing on' : 'Status sharing off');
              } catch (e) {
                toast.error(e);
              }
            },
          }}
        />
      </Card>

      <Section title="What HomePulse never collects or shows">
        {NEVER.map((line) => (
          <View key={line} style={{ flexDirection: 'row', gap: space.md }}>
            <Glyph name="shield-check-outline" size={20} color={c.success} />
            <Text style={{ flex: 1 }}>{line}</Text>
          </View>
        ))}
      </Section>

      <Section title="Your data">
        <Text tone="muted">
          Export or delete everything from You → Account. Leaving a home removes your access immediately; your open signals end and your turns move on.
        </Text>
      </Section>
    </Screen>
  );
}
