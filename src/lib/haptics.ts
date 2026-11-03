import * as Haptics from 'expo-haptics';

// Haptics are feedback, never logic: failures (e.g. unsupported devices) are ignored.
const ignore = () => {};

export const haptics = {
  tap: () => Haptics.selectionAsync().catch(ignore),
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(ignore),
  error: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(ignore),
  warning: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(ignore),
};
