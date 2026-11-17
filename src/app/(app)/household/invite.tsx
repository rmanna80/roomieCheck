import { useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { Alert, Share, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Screen } from '@/components/Screen';
import { ErrorState, Skeleton } from '@/components/States';
import { useToast } from '@/components/Toast';
import { Button, Card, Press, Text } from '@/components/ui';
import { useActiveHousehold } from '@/features/household/HouseholdProvider';
import { regenerateInvite } from '@/lib/api';
import { formatCode, inviteLink } from '@/lib/pendingInvite';
import { keys, useInvite } from '@/lib/queries';
import { formatDay } from '@/lib/time';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

export default function InviteScreen() {
  const { household, isOwner, timeZone } = useActiveHousehold();
  const { c } = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const invite = useInvite(household.id);

  const regenerate = () =>
    Alert.alert('Make a new code?', 'The current code and QR stop working immediately.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'New code',
        style: 'destructive',
        onPress: async () => {
          try {
            const next = await regenerateInvite(household.id);
            qc.setQueryData(keys.invite(household.id), next);
            toast.success('New code ready');
          } catch (e) {
            toast.error(e);
          }
        },
      },
    ]);

  return (
    <Screen back="back" title="Invite a housemate" subtitle="They can scan this, open the link, or type the code.">
      {invite.isLoading ? <Skeleton height={320} count={1} /> : null}
      {invite.error ? <ErrorState error={invite.error} onRetry={() => invite.refetch()} /> : null}
      {invite.data ? (
        <>
          <Card style={{ alignItems: 'center', gap: space.lg, paddingVertical: space.xxl }}>
            <View style={{ padding: space.lg, backgroundColor: '#FFFFFF', borderRadius: radius.input }} accessibilityLabel="Invite QR code" accessible>
              <QRCode value={inviteLink(invite.data.code)} size={200} color="#2A211B" backgroundColor="#FFFFFF" />
            </View>
            <Press
              accessibilityRole="button"
              accessibilityLabel={`Invite code ${invite.data.code.split('').join(' ')}. Copy`}
              onPress={async () => {
                await Clipboard.setStringAsync(invite.data!.code);
                toast.success('Code copied');
              }}
            >
              <Text variant="display" style={{ letterSpacing: 4 }}>
                {formatCode(invite.data.code)}
              </Text>
            </Press>
            <Text variant="caption" tone="muted" align="center">
              Expires {formatDay(invite.data.expires_at, timeZone)} · {invite.data.uses_left} uses left{'\n'}Only people with this code can join {household.name}.
            </Text>
          </Card>
          <Button
            label="Share invite"
            icon="share-variant"
            onPress={() =>
              Share.share({
                message: `Join ${household.name} on HomePulse: ${inviteLink(invite.data!.code)} (code ${formatCode(invite.data!.code)})`,
              })
            }
          />
          {isOwner ? <Button label="Make a new code" variant="ghost" onPress={regenerate} /> : null}
          <Text variant="caption" tone="muted" style={{ color: c.inkMuted }}>
            Codes expire after 7 days. Owners can replace a code any time if it was shared too widely.
          </Text>
        </>
      ) : null}
    </Screen>
  );
}
