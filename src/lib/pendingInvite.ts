/**
 * Invite links: homepulse://join?code=ABCD2345 (QR codes encode this). A code that arrives
 * before sign-in is held until onboarding can use it.
 */
import { prefsStorage } from './secureStorage';

const KEY = 'hp.pendingInvite';

export function inviteLink(code: string): string {
  return `homepulse://join?code=${code}`;
}

export function extractInviteCode(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/[?&]code=([A-Za-z0-9-]{8,10})/) ?? url.match(/\/join\/([A-Za-z0-9-]{8,10})/);
  return match ? match[1].replace(/-/g, '').toUpperCase() : null;
}

/** "ABCD2345" → "ABCD-2345" for display. */
export function formatCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

export const pendingInvite = {
  get: () => prefsStorage.getItem(KEY),
  set: (code: string) => prefsStorage.setItem(KEY, code),
  clear: () => prefsStorage.removeItem(KEY),
};
