import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Alert, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { useToast } from '@/components/Toast';
import { Avatar, Button, Card, Divider, Press, Text } from '@/components/ui';
import { useUserId } from '@/features/auth/AuthProvider';
import { useActiveHousehold } from '@/features/household/HouseholdProvider';
import * as api from '@/lib/api';
import { keys } from '@/lib/queries';
import { formatDay } from '@/lib/time';
import { space } from '@/theme/tokens';
import type { Member } from '@/types/domain';

export default function MembersScreen() {
  const me = useUserId();
  const { household, members, isOwner, timeZone } = useActiveHousehold();
  const toast = useToast();
  const qc = useQueryClient();

  const refresh = () =>
    Promise.all([qc.invalidateQueries({ queryKey: keys.members(household.id) }), qc.invalidateQueries({ queryKey: keys.households(me) })]);

  const manage = (m: Member) => {
    if (!isOwner || m.user_id === me) return;
    Alert.alert(m.profile.display_name, undefined, [
      {
        text: m.role === 'owner' ? 'Make regular member' : 'Make an owner',
        onPress: () => api.setMemberRole(household.id, m.user_id, m.role === 'owner' ? 'member' : 'owner').then(refresh).catch(toast.error),
      },
      {
        text: `Remove from ${household.name}`,
        style: 'destructive',
        onPress: () =>
          Alert.alert(`Remove ${m.profile.display_name}?`, 'They lose access right away. Their open signals end and their turns move on.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Remove', style: 'destructive', onPress: () => api.removeMember(household.id, m.user_id).then(refresh).then(() => toast.success('Removed')).catch(toast.error) },
          ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const leave = () =>
    Alert.alert(`Leave ${household.name}?`, 'Your open signals end, your turns pass to the next person, and you lose access. You can rejoin with a new invite.', [
      { text: 'Stay', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.leaveHousehold(household.id);
            await qc.invalidateQueries({ queryKey: keys.households(me) });
            toast.success(`You left ${household.name}`);
            router.replace('/');
          } catch (e) {
            toast.error(e);
          }
        },
      },
    ]);

  return (
    <Screen back="back" title="People" subtitle={household.name}>
      <Card style={{ paddingVertical: space.xs }}>
        {members.map((m, i) => (
          <View key={m.user_id}>
            {i > 0 ? <Divider /> : null}
            <Press
              accessibilityRole={isOwner && m.user_id !== me ? 'button' : 'text'}
              accessibilityLabel={`${m.profile.display_name}${m.role === 'owner' ? ', owner' : ''}`}
              accessibilityHint={isOwner && m.user_id !== me ? 'Manage this person' : undefined}
              disabled={!isOwner || m.user_id === me}
              onPress={() => manage(m)}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 60 }}>
                <Avatar name={m.profile.display_name} color={m.profile.color} size={40} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">
                    {m.profile.display_name}
                    {m.user_id === me ? ' (you)' : ''}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {m.role === 'owner' ? 'Owner · ' : ''}Joined {formatDay(m.joined_at, timeZone)}
                  </Text>
                </View>
              </View>
            </Press>
          </View>
        ))}
      </Card>
      <Button label="Invite someone" icon="account-plus-outline" variant="secondary" onPress={() => router.push('/household/invite')} />
      <Text variant="caption" tone="muted">
        Owners can manage people and replace invite codes. Everyone can add shared spaces and responsibilities. Owners never see anything members can’t.
      </Text>
      <Button label={`Leave ${household.name}`} variant="danger" onPress={leave} />
    </Screen>
  );
}
