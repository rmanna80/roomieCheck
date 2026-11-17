import { useState } from 'react';
import { View } from 'react-native';

import { Screen } from '@/components/Screen';
import { useToast } from '@/components/Toast';
import { Button, Text, TextField } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { space } from '@/theme/tokens';

/** Passwordless sign-in: email → 6-digit code. Creates the account on first use. */
export default function SignIn() {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  async function sendCode() {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) return toast.show(error.message, 'error');
    setStep('code');
    toast.success('Code sent — check your email');
  }

  async function verify() {
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) toast.show('That code didn’t work. Check it or send a new one.', 'error');
    // On success the auth listener swaps the navigator to onboarding.
  }

  return (
    <Screen
      back="back"
      title={step === 'email' ? 'Sign in' : 'Check your email'}
      subtitle={step === 'email' ? 'We’ll email you a 6-digit code. No password to remember.' : `Enter the code we sent to ${email.trim()}.`}
      footer={
        step === 'email' ? (
          <Button label="Send code" onPress={sendCode} loading={busy} disabled={!validEmail} />
        ) : (
          <View style={{ gap: space.sm }}>
            <Button label="Sign in" onPress={verify} loading={busy} disabled={code.trim().length < 6} />
            <Button label="Use a different email" variant="ghost" onPress={() => setStep('email')} />
          </View>
        )
      }
    >
      {step === 'email' ? (
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@school.edu"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          autoFocus
          returnKeyType="send"
          onSubmitEditing={() => validEmail && sendCode()}
        />
      ) : (
        <View style={{ gap: space.md }}>
          <TextField
            label="Code"
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 8))}
            placeholder="123456"
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            autoFocus
            onSubmitEditing={verify}
          />
          <Button label="Send a new code" variant="ghost" compact onPress={sendCode} />
          <Text variant="caption" tone="muted">
            Codes expire after a few minutes. By continuing you agree to the pilot terms shared with your invite.
          </Text>
        </View>
      )}
    </Screen>
  );
}
