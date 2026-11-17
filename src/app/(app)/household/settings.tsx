import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { useToast } from '@/components/Toast';
import { Button, Card, Chip, ChipRow, Divider, ListRow, Section, Text, TextField } from '@/components/ui';
import { useUserId } from '@/features/auth/AuthProvider';
import { HOME_ICONS, SPACE_PRESETS } from '@/features/household/HouseholdForms';
import { useActiveHousehold } from '@/features/household/HouseholdProvider';
import * as api from '@/lib/api';
import { invalidateHousehold, keys, useSpaces } from '@/lib/queries';
import { deviceTimeZone } from '@/lib/time';
import { space } from '@/theme/tokens';
import type { Space, SpaceKind } from '@/types/domain';

export default function HouseholdSettings() {
  const me = useUserId();
  const { household, isOwner } = useActiveHousehold();
  const toast = useToast();
  const qc = useQueryClient();
  const spaces = useSpaces(household.id);
  const [name, setName] = useState(household.name);
  const [icon, setIcon] = useState(household.icon);
  const [newSpace, setNewSpace] = useState('');
  const [newKind, setNewKind] = useState<SpaceKind>('other');
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (key: string, fn: () => Promise<unknown>, msg?: string) => {
    setBusy(key);
    try {
      await fn();
      if (msg) toast.success(msg);
      await Promise.all([invalidateHousehold(qc, household.id), qc.invalidateQueries({ queryKey: keys.households(me) })]);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  };

  const canEditSpace = (s: Space) => isOwner || s.created_by === me;

  return (
    <Screen back="back" title="Home settings">
      {isOwner ? (
        <Section title="Home">
          <TextField label="Name" value={name} onChangeText={setName} maxLength={40} />
          <ChipRow wrap>
            {HOME_ICONS.map((i) => (
              <Chip key={i.key} label={i.label} icon={i.glyph} selected={icon === i.key} onPress={() => setIcon(i.key)} />
            ))}
          </ChipRow>
          <Button
            variant="secondary"
            label="Save"
            disabled={!name.trim() || (name === household.name && icon === household.icon)}
            loading={busy === 'home'}
            onPress={() => act('home', () => api.updateHousehold(household.id, { name: name.trim(), icon }), 'Saved')}
          />
          <ListRow
            icon="earth"
            title="Time zone"
            subtitle={`${household.time_zone}${household.time_zone !== deviceTimeZone() ? ` · tap to use ${deviceTimeZone()}` : ''}`}
            onPress={
              household.time_zone !== deviceTimeZone()
                ? () => act('tz', () => api.updateHousehold(household.id, { timeZone: deviceTimeZone() }), 'Time zone updated')
                : undefined
            }
          />
        </Section>
      ) : (
        <Card>
          <Text variant="bodyStrong">{household.name}</Text>
          <Text variant="caption" tone="muted">
            Only owners can rename the home. Anyone can add shared spaces.
          </Text>
        </Card>
      )}

      <Section title="Shared spaces">
        <Text variant="caption" tone="muted">
          Only spaces listed here can be requested. Bedrooms are never requestable. Turn off “needs an OK” for spaces like a laundry room where a heads-up is enough.
        </Text>
        <Card style={{ paddingVertical: space.xs }}>
          {(spaces.data ?? []).map((s, i) => (
            <View key={s.id}>
              {i > 0 ? <Divider /> : null}
              <ListRow
                title={s.name}
                subtitle={!s.is_reservable ? 'Not requestable' : s.requires_agreement ? 'Requests need an OK from housemates' : 'Heads-up only, no OK needed'}
                toggle={
                  canEditSpace(s)
                    ? {
                        value: s.requires_agreement,
                        onChange: (v) =>
                          act(s.id, () =>
                            api.saveSpace(household.id, { id: s.id, name: s.name, kind: s.kind, isReservable: s.is_reservable, requiresAgreement: v }),
                          ),
                      }
                    : undefined
                }
              />
              {canEditSpace(s) ? (
                <Button
                  compact
                  variant="ghost"
                  label="Remove"
                  style={{ alignSelf: 'flex-start' }}
                  onPress={() =>
                    Alert.alert(`Remove ${s.name}?`, 'Pending requests for it are withdrawn.', [
                      { text: 'Keep', style: 'cancel' },
                      { text: 'Remove', style: 'destructive', onPress: () => act(s.id, () => api.archiveSpace(s.id), 'Removed') },
                    ])
                  }
                />
              ) : null}
            </View>
          ))}
        </Card>
        <TextField label="Add a shared space" value={newSpace} onChangeText={setNewSpace} placeholder="e.g. Basement" maxLength={30} />
        <ChipRow wrap>
          {SPACE_PRESETS.filter((p) => !(spaces.data ?? []).some((s) => s.name.toLowerCase() === p.name.toLowerCase())).map((p) => (
            <Chip
              key={p.name}
              label={p.name}
              icon={p.glyph}
              selected={newSpace === p.name}
              onPress={() => {
                setNewSpace(p.name);
                setNewKind(p.kind);
              }}
            />
          ))}
        </ChipRow>
        <Button
          variant="secondary"
          icon="plus"
          label="Add space"
          disabled={!newSpace.trim()}
          loading={busy === 'add'}
          onPress={() =>
            act('add', async () => {
              await api.saveSpace(household.id, { name: newSpace.trim(), kind: newKind, isReservable: true, requiresAgreement: true });
              setNewSpace('');
              setNewKind('other');
            }, 'Space added')
          }
        />
      </Section>
    </Screen>
  );
}
