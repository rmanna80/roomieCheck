import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useToast } from '@/components/Toast';
import { Button, Chip, ChipRow, Section, Text, TextField } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import * as api from '@/lib/api';
import { messageFor } from '@/lib/errors';
import { formatCode, pendingInvite } from '@/lib/pendingInvite';
import { keys } from '@/lib/queries';
import { deviceTimeZone } from '@/lib/time';
import { space } from '@/theme/tokens';
import type { SpaceKind } from '@/types/domain';

import { useHousehold } from './HouseholdProvider';

export const HOME_ICONS: { key: string; label: string; glyph: string }[] = [
  { key: 'house', label: 'House', glyph: 'home-variant-outline' },
  { key: 'apartment', label: 'Apartment', glyph: 'office-building-outline' },
  { key: 'dorm', label: 'Dorm', glyph: 'school-outline' },
  { key: 'loft', label: 'Loft', glyph: 'stairs' },
  { key: 'cabin', label: 'Cabin', glyph: 'home-group' },
  { key: 'tree', label: 'Treehouse', glyph: 'pine-tree' },
];

export const SPACE_PRESETS: { name: string; kind: SpaceKind; glyph: string }[] = [
  { name: 'Living room', kind: 'living', glyph: 'sofa-outline' },
  { name: 'Kitchen', kind: 'kitchen', glyph: 'stove' },
  { name: 'Dining room', kind: 'dining', glyph: 'table-chair' },
  { name: 'Laundry', kind: 'laundry', glyph: 'washing-machine' },
  { name: 'Shared bathroom', kind: 'bathroom', glyph: 'shower' },
  { name: 'Study room', kind: 'study', glyph: 'desk' },
  { name: 'Backyard', kind: 'outdoor', glyph: 'flower-outline' },
];

export function CreateHouseholdForm({ onDone }: { onDone: () => void }) {
  const { userId } = useAuth();
  const { setActive } = useHousehold();
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('apartment');
  const [spaces, setSpaces] = useState<string[]>(['Living room', 'Kitchen']);
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      const id = await api.createHousehold({
        name: name.trim(),
        icon,
        timeZone: deviceTimeZone(),
        spaces: SPACE_PRESETS.filter((s) => spaces.includes(s.name)).map(({ name: n, kind }) => ({ name: n, kind })),
      });
      setActive(id);
      await qc.invalidateQueries({ queryKey: keys.households(userId ?? '') });
      toast.success('Your home is ready');
      onDone();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: space.xxl }}>
      <TextField label="Home name" value={name} onChangeText={setName} placeholder="e.g. The Maple House" maxLength={40} autoFocus />
      <Section title="What kind of place?">
        <ChipRow wrap>
          {HOME_ICONS.map((i) => (
            <Chip key={i.key} label={i.label} icon={i.glyph} selected={icon === i.key} onPress={() => setIcon(i.key)} />
          ))}
        </ChipRow>
      </Section>
      <Section title="Shared spaces people can ask for">
        <ChipRow wrap>
          {SPACE_PRESETS.map((s) => {
            const on = spaces.includes(s.name);
            return (
              <Chip
                key={s.name}
                label={s.name}
                icon={s.glyph}
                selected={on}
                onPress={() => setSpaces(on ? spaces.filter((x) => x !== s.name) : [...spaces, s.name])}
              />
            );
          })}
        </ChipRow>
        <Text variant="caption" tone="muted">
          Bedrooms stay private. Only shared spaces you list here can ever be requested. You can change these later.
        </Text>
      </Section>
      <Button label="Create home" onPress={create} loading={busy} disabled={name.trim().length === 0} />
    </View>
  );
}

export function JoinHouseholdForm({ onDone }: { onDone: () => void }) {
  const { userId } = useAuth();
  const { setActive } = useHousehold();
  const qc = useQueryClient();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    pendingInvite.get().then((c) => c && setCode(formatCode(c)));
  }, []);

  const clean = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

  async function join() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.joinHousehold(clean);
      if (!res.ok || !res.household_id) {
        setError(messageFor({ message: res.error ?? 'invalid_code' }));
        return;
      }
      await pendingInvite.clear();
      setActive(res.household_id);
      await qc.invalidateQueries({ queryKey: keys.households(userId ?? '') });
      toast.success(res.already_member ? 'You’re already in this home' : 'Welcome home');
      onDone();
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: space.lg }}>
      <TextField
        label="Invite code"
        value={code}
        onChangeText={(v) => {
          const raw = v.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8);
          setCode(raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw);
        }}
        placeholder="ABCD-2345"
        autoCapitalize="characters"
        autoFocus
        onSubmitEditing={() => clean.length === 8 && join()}
      />
      {error ? (
        <Text tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : (
        <Text variant="caption" tone="muted">
          Ask a housemate for the code, or scan their QR code with your camera.
        </Text>
      )}
      <Button label="Join home" onPress={join} loading={busy} disabled={clean.length !== 8} />
    </View>
  );
}
