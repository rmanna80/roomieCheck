import 'react-native-url-polyfill/auto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { secureStorage } from './secureStorage';

/**
 * Only the project URL and the *publishable* (anon) key ever ship in the app. Both are safe to
 * expose: every read is constrained by RLS and every write by server-side RPC checks.
 * Never put the service-role key in an EXPO_PUBLIC_ variable.
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const isConfigured = url.startsWith('http') && key.length > 20;

export const supabase: SupabaseClient = createClient(isConfigured ? url : 'http://localhost:54321', isConfigured ? key : 'missing-key', {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Refresh tokens only while the app is in the foreground (Supabase's recommended RN pattern).
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

export const functionsUrl = isConfigured ? `${url}/functions/v1` : '';
