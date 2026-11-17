import { useQueryClient } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Screen } from '@/components/Screen';
import { useToast } from '@/components/Toast';
import { ColorPicker } from '@/components/ColorPicker';
import { Avatar, Button, Section, Text, TextField } from '@/components/ui';
import { useUserId } from '@/features/auth/AuthProvider';
import { useHousehold } from '@/features/household/HouseholdProvider';
import { updateProfile } from '@/lib/api';
import { keys } from '@/lib/queries';
import { deviceTimeZone } from '@/lib/time';
import { space } from '@/theme/tokens';
import type { MemberColor } from '@/types/domain';

export default function SetupProfile() {
  const uid = useUserId();
  const { me } = useHousehold();
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(me?.display_name ?? '');
  const [color, setColor] = useState<MemberColor>(me?.color ?? 'ember');
  const [busy, setBusy] = useState(false);

  if (me?.display_name) return <Redirect href="/setup-home" />;

  async function save() {
    setBusy(true);
    try {
      await updateProfile(uid, { display_name: name.trim(), color, time_zone: deviceTimeZone() });
      await qc.invalidateQueries({ queryKey: keys.profile(uid) });
      router.replace('/setup-home');
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      title="What should housemates call you?"
      subtitle="Only people in your home see this."
      footer={<Button label="Continue" onPress={save} loading={busy} disabled={name.trim().length === 0} />}
    >
      <View style={{ alignItems: 'center', paddingVertical: space.lg }}>
        <Avatar name={name || '?'} color={color} size={88} />
      </View>
      <TextField label="First name or nickname" value={name} onChangeText={setName} maxLength={40} autoFocus autoComplete="given-name" />
      <Section title="Your color">
        <ColorPicker value={color} onChange={setColor} />
        <Text variant="caption" tone="muted">
          Used for your avatar and window. Pick whatever you like.
        </Text>
      </Section>
    </Screen>
  );
}
