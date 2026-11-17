import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Share, View } from 'react-native';

import { ColorPicker } from '@/components/ColorPicker';
import { Screen } from '@/components/Screen';
import { useToast } from '@/components/Toast';
import { Avatar, Button, Card, Divider, ListRow, Section, Text, TextField } from '@/components/ui';
import { useAuth, useUserId } from '@/features/auth/AuthProvider';
import { useActiveHousehold } from '@/features/household/HouseholdProvider';
import * as api from '@/lib/api';
import { keys, useStatuses } from '@/lib/queries';
import { statusLabel } from '@/lib/signals';
import { deviceTimeZone } from '@/lib/time';
import { space } from '@/theme/tokens';
import type { MemberColor } from '@/types/domain';

export default function Profile() {
  const me = useUserId();
  const { signOut } = useAuth();
  const { me: profile, household, households, setActive } = useActiveHousehold();
  const toast = useToast();
  const qc = useQueryClient();
  const statuses = useStatuses(household.id);
  const myStatus = statuses.data?.find((s) => s.user_id === me && new Date(s.expires_at) > new Date());
  const [name, setName] = useState(profile?.display_name ?? '');
  const [color, setColor] = useState<MemberColor>(profile?.color ?? 'ember');
  const dirty = name.trim() !== (profile?.display_name ?? '') || color !== profile?.color;

  async function saveProfile() {
    try {
      await api.updateProfile(me, { display_name: name.trim(), color, time_zone: deviceTimeZone() });
      await Promise.all([qc.invalidateQueries({ queryKey: keys.profile(me) }), qc.invalidateQueries({ queryKey: keys.members(household.id) })]);
      toast.success('Saved');
    } catch (e) {
      toast.error(e);
    }
  }

  async function exportData() {
    try {
      const data = await api.exportMyData();
      await Share.share({ message: JSON.stringify(data, null, 2), title: 'My HomePulse data' });
    } catch (e) {
      toast.error(e);
    }
  }

  const deleteAccount = () =>
    Alert.alert(
      'Delete your account?',
      'This permanently removes your profile, your signals and responses, and your statuses. You’ll leave every home; your turns pass to the next person. This can’t be undone.',
      [
        { text: 'Keep my account', style: 'cancel' },
        {
          text: 'Delete forever',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteMyAccount();
            } catch (e) {
              toast.error(e);
            }
          },
        },
      ],
    );

  return (
    <Screen back="back" title="You">
      <Card style={{ alignItems: 'center', gap: space.lg, paddingVertical: space.xl }}>
        <Avatar name={name || '?'} color={color} size={72} />
        <View style={{ alignSelf: 'stretch', gap: space.md }}>
          <TextField label="Name" value={name} onChangeText={setName} maxLength={40} />
          <ColorPicker value={color} onChange={setColor} />
          {dirty ? <Button label="Save" onPress={saveProfile} disabled={!name.trim()} /> : null}
        </View>
      </Card>

      <Card style={{ paddingVertical: space.xs }}>
        <ListRow icon="lightbulb-on-outline" title="Status" subtitle={myStatus ? statusLabel(myStatus.status, myStatus.label) : 'Not sharing anything'} onPress={() => router.push('/status')} />
        <Divider />
        <ListRow icon="bell-outline" title="Notifications" subtitle="What pings you, quiet hours" onPress={() => router.push('/settings/notifications')} />
        <Divider />
        <ListRow icon="shield-lock-outline" title="Privacy" subtitle="Status sharing, your data" onPress={() => router.push('/settings/privacy')} />
      </Card>

      <Section title="Homes">
        <Card style={{ paddingVertical: space.xs }}>
          {households.map((h, i) => (
            <View key={h.household.id}>
              {i > 0 ? <Divider /> : null}
              <ListRow
                icon={h.household.id === household.id ? 'home' : 'home-outline'}
                title={h.household.name}
                subtitle={`${h.role === 'owner' ? 'Owner' : 'Member'}${h.household.id === household.id ? ' · current' : ''}`}
                onPress={h.household.id === household.id ? () => router.push('/household/members') : () => setActive(h.household.id)}
              />
            </View>
          ))}
          <Divider />
          <ListRow icon="key-outline" title="Join another home" onPress={() => router.push('/household/join')} />
          <Divider />
          <ListRow icon="home-plus-outline" title="Set up another home" onPress={() => router.push('/household/create')} />
        </Card>
      </Section>

      <Section title="Pilot">
        <Card style={{ paddingVertical: space.xs }}>
          <ListRow icon="message-text-outline" title="Send feedback" subtitle="Goes straight to the team" onPress={() => router.push('/feedback')} />
        </Card>
      </Section>

      <Section title="Account">
        <Card style={{ paddingVertical: space.xs }}>
          <ListRow icon="download-outline" title="Export my data" onPress={exportData} />
          <Divider />
          <ListRow icon="logout" title="Sign out" onPress={() => void signOut()} />
          <Divider />
          <ListRow icon="delete-outline" title="Delete account" destructive onPress={deleteAccount} />
        </Card>
        <Text variant="caption" tone="muted" align="center">
          HomePulse (working name) · pilot build
        </Text>
      </Section>
    </Screen>
  );
}
