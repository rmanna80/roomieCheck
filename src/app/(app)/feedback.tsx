import { router } from 'expo-router';
import { useState } from 'react';

import { Screen } from '@/components/Screen';
import { useToast } from '@/components/Toast';
import { Button, Chip, ChipRow, Section, Text, TextField } from '@/components/ui';
import { useActiveHousehold } from '@/features/household/HouseholdProvider';
import { sendFeedback } from '@/lib/api';

const PROMPTS = ['Something was confusing', 'Something broke', 'I wish it could…', 'This helped us'];

/** Pilot feedback: stored privately (insert-only; users can't read others' feedback). */
export default function Feedback() {
  const { household } = useActiveHousehold();
  const toast = useToast();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    try {
      await sendFeedback(message.trim(), household.id);
      toast.success('Thank you — the team reads every one');
      router.back();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen back="close" title="Send feedback" subtitle="Honest is best. Your housemates won’t see this." footer={<Button label="Send" onPress={send} loading={busy} disabled={!message.trim()} />}>
      <Section title="Start with">
        <ChipRow wrap>
          {PROMPTS.map((p) => (
            <Chip key={p} label={p} onPress={() => setMessage((m) => (m ? m : `${p}: `))} />
          ))}
        </ChipRow>
      </Section>
      <TextField label="Your note" value={message} onChangeText={setMessage} multiline maxLength={2000} placeholder="What happened, and what did you expect?" />
      <Text variant="caption" tone="muted">
        We attach your app version and platform — nothing else.
      </Text>
    </Screen>
  );
}
