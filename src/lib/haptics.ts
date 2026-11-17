import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const enabled = Platform.OS === 'ios' || Platform.OS === 'android';

export const haptic = {
  tap: () => enabled && void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined),
  success: () => enabled && void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined),
  warn: () => enabled && void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined),
};
