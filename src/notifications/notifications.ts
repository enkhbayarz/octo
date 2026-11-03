import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

import type { Messages } from '@/i18n/mn';

import type { PlannedReminder } from './reminder-plan';

const CHANNEL_ID = 'reminders';

/** What a notification is for; also tells the tap handler where to go. */
export type NotificationData = { kind: 'reminder' | 'test' | 'push'; url?: string };

// A reminder to study is pointless while studying, so it stays silent in the
// foreground. Test and remote pushes still show, so they can be demonstrated.
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const show =
      (notification.request.content.data as NotificationData | undefined)?.kind !== 'reminder';
    return {
      shouldShowBanner: show,
      shouldShowList: show,
      shouldPlaySound: show,
      shouldSetBadge: false,
    };
  },
});

/** Android 8+ needs a channel, and Android 13 only shows the permission prompt after one exists. */
async function ensureChannel(name: string) {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name,
    importance: AndroidImportance.DEFAULT,
  });
}

export async function hasPermission(): Promise<boolean> {
  return (await Notifications.getPermissionsAsync()).granted;
}

/** Asks only when needed; returns whether notifications may be shown. */
export async function requestPermission(copy: Messages['notifications']): Promise<boolean> {
  await ensureChannel(copy.channel);
  if (await hasPermission()) return true;
  return (await Notifications.requestPermissionsAsync()).granted;
}

/** Replaces every scheduled reminder with `plan`. */
export async function scheduleReminders(plan: PlannedReminder[], copy: Messages['notifications']) {
  await ensureChannel(copy.channel);
  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const reminder of plan) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: reminder.title,
        body: reminder.body,
        data: { kind: 'reminder', url: '/' } satisfies NotificationData,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: reminder.date,
        channelId: CHANNEL_ID,
      },
    });
  }
}

export function clearReminders() {
  return Notifications.cancelAllScheduledNotificationsAsync();
}

/** Fires a sample reminder a few seconds from now, for demos and QA. */
export async function sendTestNotification(learnerName: string, copy: Messages['notifications']) {
  await ensureChannel(copy.channel);
  await Notifications.scheduleNotificationAsync({
    content: {
      title: copy.testTitle,
      body: copy.testBody(learnerName),
      data: { kind: 'test', url: '/' } satisfies NotificationData,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 5,
      channelId: CHANNEL_ID,
    },
  });
}

/**
 * Registers for remote push and returns the Expo push token, or null when push
 * isn't possible here: simulators, Expo Go on Android, or no EAS project yet.
 */
export async function registerForPushAsync(): Promise<string | null> {
  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  if (!Device.isDevice || !projectId) return null;
  try {
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch {
    return null;
  }
}
