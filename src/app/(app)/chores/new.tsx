import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';

import { Screen } from '@/components/Screen';
import { useToast } from '@/components/Toast';
import { Button, Chip, ChipRow, Section, Text, TextField } from '@/components/ui';
import { useUserId } from '@/features/auth/AuthProvider';
import { useActiveHousehold } from '@/features/household/HouseholdProvider';
import { createChore } from '@/lib/api';
import { cadenceLabel, CHORE_GLYPH } from '@/lib/chores';
import { invalidateHousehold } from '@/lib/queries';
import { localDate } from '@/lib/time';


const PRESETS: { title: string; icon: string; cadence: number }[] = [
  { title: 'Trash & recycling', icon: 'trash', cadence: 7 },
  { title: 'Dishes', icon: 'dishes', cadence: 1 },
  { title: 'Bathroom', icon: 'bathroom', cadence: 7 },
  { title: 'Vacuum', icon: 'vacuum', cadence: 7 },
  { title: 'Kitchen wipe-down', icon: 'kitchen', cadence: 2 },
  { title: 'Restock supplies', icon: 'supplies', cadence: 14 },
  { title: 'Feed the pet', icon: 'pet', cadence: 1 },
  { title: 'Water plants', icon: 'plants', cadence: 3 },
];

export default function NewChore() {
  const me = useUserId();
  const { household, members } = useActiveHousehold();
  const toast = useToast();
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [icon, setIcon] = useState('other');
  const [cadence, setCadence] = useState(7);
  const [rotation, setRotation] = useState<string[]>(members.map((m) => m.user_id));
  const [firstToday, setFirstToday] = useState(true);
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) => setRotation((r) => (r.includes(id) ? r.filter((x) => x !== id) : [...r, id]));

  async function save() {
    setBusy(true);
    try {
      const today = localDate(new Date(), household.time_zone);
      const tomorrow = localDate(new Date(Date.now() + 86_400_000), household.time_zone);
      await createChore({ householdId: household.id, title: title.trim(), icon, cadenceDays: cadence, firstDue: firstToday ? today : tomorrow, rotation });
      void invalidateHousehold(qc, household.id);
      toast.success('Added — reminders go only to whoever’s turn it is');
      router.back();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen back="close" title="New responsibility" footer={<Button label="Add" onPress={save} loading={busy} disabled={!title.trim() || rotation.length === 0} />}>
      <Section title="Common ones">
        <ChipRow wrap>
          {PRESETS.map((p) => (
            <Chip
              key={p.title}
              label={p.title}
              icon={CHORE_GLYPH[p.icon]}
              selected={title === p.title}
              onPress={() => {
                setTitle(p.title);
                setIcon(p.icon);
                setCadence(p.cadence);
              }}
            />
          ))}
        </ChipRow>
      </Section>
      <TextField label="Name" value={title} onChangeText={setTitle} placeholder="e.g. Take out compost" maxLength={40} />
      <Section title="How often">
        <ChipRow wrap>
          {[1, 2, 3, 7, 14, 30].map((d) => (
            <Chip key={d} label={cadenceLabel(d)} selected={cadence === d} onPress={() => setCadence(d)} />
          ))}
        </ChipRow>
      </Section>
      <Section title="First one">
        <ChipRow>
          <Chip label="Today" selected={firstToday} onPress={() => setFirstToday(true)} />
          <Chip label="Tomorrow" selected={!firstToday} onPress={() => setFirstToday(false)} />
        </ChipRow>
      </Section>
      <Section title="Rotates between (in this order)">
        <ChipRow wrap>
          {members.map((m) => {
            const pos = rotation.indexOf(m.user_id);
            return (
              <Chip
                key={m.user_id}
                label={`${pos >= 0 ? `${pos + 1}. ` : ''}${m.user_id === me ? 'You' : m.profile.display_name}`}
                selected={pos >= 0}
                onPress={() => toggle(m.user_id)}
              />
            );
          })}
        </ChipRow>
        <Text variant="caption" tone="muted">
          Tap to include or skip someone. People can swap turns with each other any time.
        </Text>
      </Section>
    </Screen>
  );
}
