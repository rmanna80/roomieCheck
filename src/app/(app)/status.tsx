/**
 * Set your status (House Pulse). Voluntary, approximate, always expiring. No location.
 */
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Screen } from '@/components/Screen';
import { useToast } from '@/components/Toast';
import { Button, Card, Chip, ChipRow, Section, Text, TextField } from '@/components/ui';
import { useUserId } from '@/features/auth/AuthProvider';
import { useActiveHousehold } from '@/features/household/HouseholdProvider';
import * as api from '@/lib/api';
import { invalidateHousehold, useStatuses, useStatusSharing } from '@/lib/queries';
import { STATUS_OPTIONS, statusLabel } from '@/lib/signals';
import { addMinutes, formatTime, relative, startTimeChips } from '@/lib/time';
import { space } from '@/theme/tokens';
import type { StatusKind } from '@/types/domain';

const NEEDS_ETA: StatusKind[] = ['on_my_way', 'home_later'];

export default function StatusScreen() {
  const me = useUserId();
  const { household, members, timeZone } = useActiveHousehold();
  const toast = useToast();
  const qc = useQueryClient();
  const hid = household.id;
  const statuses = useStatuses(hid);
  const sharing = useStatusSharing(me);
  const current = statuses.data?.find((s) => s.user_id === me && new Date(s.expires_at) > new Date());
  const [now] = useState(() => new Date());

  const [status, setStatus] = useState<StatusKind>(current?.status ?? 'home');
  const [label, setLabel] = useState(current?.label ?? '');
  const [eta, setEta] = useState<string | null>(current?.eta_at ?? null);
  const [hours, setHours] = useState<number | null>(null);
  const [everyone, setEveryone] = useState(current?.visibility !== 'selected');
  const [viewers, setViewers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const others = members.filter((m) => m.user_id !== me);

  if (sharing.data === false) {
    return (
      <Screen back="close" title="Status is off">
        <Card>
          <Text>You turned off status sharing in Privacy. Nobody can see a status from you.</Text>
          <Button label="Open Privacy settings" variant="secondary" onPress={() => router.replace('/settings/privacy')} />
        </Card>
      </Screen>
    );
  }

  async function save() {
    setBusy(true);
    try {
      await api.setStatus({
        householdId: hid,
        status,
        label: status === 'custom' ? label.trim() : null,
        eta: NEEDS_ETA.includes(status) ? eta : null,
        expiresAt: hours ? addMinutes(new Date(), hours * 60).toISOString() : null,
        visibility: everyone ? 'household' : 'selected',
        viewers: everyone ? null : viewers,
      });
      void invalidateHousehold(qc, hid);
      toast.success('Status shared');
      router.back();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  async function hide() {
    setBusy(true);
    try {
      await api.clearStatus(hid);
      void invalidateHousehold(qc, hid);
      toast.success('Status hidden');
      router.back();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  const valid = (status !== 'custom' || label.trim().length > 0) && (!NEEDS_ETA.includes(status) || !!eta) && (everyone || viewers.length > 0);

  return (
    <Screen
      back="close"
      title="Your status"
      subtitle="Optional and approximate. It fades on its own, and you can hide it any time."
      footer={
        <View style={{ gap: space.sm }}>
          <Button label="Share" onPress={save} loading={busy} disabled={!valid} />
          {current ? <Button label="Hide my status" variant="ghost" onPress={hide} /> : null}
        </View>
      }
    >
      {current ? (
        <Card>
          <Text variant="bodyStrong">Now: {statusLabel(current.status, current.label)}</Text>
          <Text variant="caption" tone="muted">
            Fades {relative(current.expires_at)}
          </Text>
        </Card>
      ) : null}

      <Section title="Right now I’m">
        <ChipRow wrap>
          {STATUS_OPTIONS.map((o) => (
            <Chip key={o.key} label={o.label} icon={o.icon} selected={status === o.key} onPress={() => setStatus(o.key)} />
          ))}
        </ChipRow>
        {status === 'custom' ? <TextField value={label} onChangeText={setLabel} placeholder="e.g. At practice" maxLength={40} autoFocus /> : null}
      </Section>

      {NEEDS_ETA.includes(status) ? (
        <Section title="Home around">
          <ChipRow>
            {startTimeChips(now, timeZone, { includeNow: false, count: 12 }).map((c) => (
              <Chip key={c.iso} label={c.label} selected={eta === c.iso} onPress={() => setEta(c.iso)} />
            ))}
          </ChipRow>
        </Section>
      ) : (
        <Section title="Fade after">
          <ChipRow>
            {[1, 2, 4, 8, 12].map((h) => (
              <Chip key={h} label={`${h}h · ${formatTime(addMinutes(now, h * 60), timeZone)}`} selected={hours === h} onPress={() => setHours(hours === h ? null : h)} />
            ))}
          </ChipRow>
        </Section>
      )}

      {others.length > 0 ? (
        <Section title="Who can see it">
          <ChipRow wrap>
            <Chip label="Everyone at home" selected={everyone} onPress={() => setEveryone(true)} />
            {others.map((m) => (
              <Chip
                key={m.user_id}
                label={m.profile.display_name}
                selected={!everyone && viewers.includes(m.user_id)}
                onPress={() => {
                  setEveryone(false);
                  setViewers((v) => (v.includes(m.user_id) ? v.filter((x) => x !== m.user_id) : [...v, m.user_id]));
                }}
              />
            ))}
          </ChipRow>
          <Text variant="caption" tone="muted">
            People you don’t pick see a dim window — the same as if you hadn’t set anything.
          </Text>
        </Section>
      ) : null}
    </Screen>
  );
}
