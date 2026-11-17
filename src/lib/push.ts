/**
 * Push notifications via Expo. Permission is requested contextually (a card on Home or the
 * Notifications settings), never on first launch. Tokens are registered server-side so the
 * send-push Edge Function can deliver; quiet hours and categories are enforced there.
 */
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { registerPushToken } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export type PushPermission = 'granted' | 'denied' | 'undetermined' | 'unsupported';

export async function getPushPermission(): Promise<PushPermission> {
  if (!Device.isDevice || Platform.OS === 'web') return 'unsupported';
  const { status } = await Notifications.getPermissionsAsync();
  return status as PushPermission;
}

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

/** Asks for permission (if needed) and registers this device. Returns the final permission. */
export async function enablePush(): Promise<PushPermission> {
  if (!Device.isDevice || Platform.OS === 'web') return 'unsupported';

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'HomePulse',
      importance: AndroidImportance.DEFAULT,
    });
  }

  let { status } = await Notifications.getPermissionsAsync();
  if (status === 'undetermined') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return status as PushPermission;

  const id = projectId();
  if (!id) {
    console.warn('[push] No EAS projectId in app config; run `npx eas-cli init` to enable push tokens.');
    return 'granted';
  }
  const token = await Notifications.getExpoPushTokenAsync({ projectId: id });
  await registerPushToken(token.data, Platform.OS === 'ios' ? 'ios' : 'android');
  return 'granted';
}

/** Re-registers on launch (tokens can rotate) and routes notification taps to the right screen. */
export function usePushRouting(signedIn: boolean) {
  useEffect(() => {
    if (!signedIn) return;
    getPushPermission().then((p) => {
      if (p === 'granted') void enablePush().catch(() => undefined);
    });

    const open = (data: Record<string, unknown> | undefined) => {
      if (typeof data?.signal_id === 'string') router.push({ pathname: '/signal/[id]', params: { id: data.signal_id } });
      else if (typeof data?.chore_id === 'string') router.push({ pathname: '/chores/[id]', params: { id: data.chore_id } });
      else router.push('/inbox');
    };
    const sub = Notifications.addNotificationResponseReceivedListener((r) => open(r.notification.request.content.data));
    return () => sub.remove();
  }, [signedIn]);
}
