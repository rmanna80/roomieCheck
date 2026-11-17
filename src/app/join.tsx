/**
 * Deep-link target for invites: homepulse://join?code=ABCD2345 (what the QR code encodes).
 * Stores the code, then sends the person to wherever they can use it.
 */
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useAuth } from '@/features/auth/AuthProvider';
import { useHousehold } from '@/features/household/HouseholdProvider';
import { extractInviteCode, pendingInvite } from '@/lib/pendingInvite';
import { useTheme } from '@/theme/ThemeProvider';

export default function JoinLink() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const { session } = useAuth();
  const { households, me } = useHousehold();
  const { c } = useTheme();
  const [stored, setStored] = useState(false);

  useEffect(() => {
    const normalized = extractInviteCode(`?code=${code ?? ''}`);
    (normalized ? pendingInvite.set(normalized) : Promise.resolve()).finally(() => setStored(true));
  }, [code]);

  if (!stored) return <View style={{ flex: 1, backgroundColor: c.bg }} />;
  if (!session) return <Redirect href="/welcome" />;
  if (!me?.display_name || households.length === 0) return <Redirect href="/onboarding-join" />;
  return <Redirect href="/household/join" />;
}
