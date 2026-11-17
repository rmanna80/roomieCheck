/**
 * Supabase auth storage backed by the device keychain/keystore (expo-secure-store).
 * SecureStore values are limited to ~2 KB, and a session can exceed that, so values are split
 * into chunks under `${key}.${i}` with a chunk count under `${key}.n`.
 */
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const CHUNK = 1800;
const options: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

// SecureStore keys may only contain alphanumerics, ".", "-", and "_".
const safe = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, '_');

async function getItem(key: string): Promise<string | null> {
  const k = safe(key);
  const count = await SecureStore.getItemAsync(`${k}.n`, options);
  if (!count) return null;
  const parts: string[] = [];
  for (let i = 0; i < Number(count); i++) {
    const part = await SecureStore.getItemAsync(`${k}.${i}`, options);
    if (part === null) return null; // partial write — treat as signed out
    parts.push(part);
  }
  return parts.join('');
}

async function removeItem(key: string): Promise<void> {
  const k = safe(key);
  const count = Number((await SecureStore.getItemAsync(`${k}.n`, options)) ?? 0);
  await SecureStore.deleteItemAsync(`${k}.n`, options);
  for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(`${k}.${i}`, options);
}

async function setItem(key: string, value: string): Promise<void> {
  await removeItem(key);
  const k = safe(key);
  const chunks = Math.ceil(value.length / CHUNK) || 1;
  for (let i = 0; i < chunks; i++) {
    await SecureStore.setItemAsync(`${k}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK), options);
  }
  await SecureStore.setItemAsync(`${k}.n`, String(chunks), options);
}

// Web has no keychain; fall back to localStorage for local web previews only.
const webStorage = {
  getItem: async (key: string) => (typeof localStorage === 'undefined' ? null : localStorage.getItem(key)),
  setItem: async (key: string, value: string) => localStorage?.setItem(key, value),
  removeItem: async (key: string) => localStorage?.removeItem(key),
};

export const secureStorage = Platform.OS === 'web' ? webStorage : { getItem, setItem, removeItem };

/** Small non-secret preferences (active household id, pending invite code). */
export const prefsStorage = secureStorage;
