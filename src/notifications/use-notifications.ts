import * as Notifications from 'expo-notifications';
import { type Href, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { messagesFor, useLocale } from '@/i18n';
import { today } from '@/lib/dates';
import { currentStreak } from '@/progress/rules';
import { useProgress } from '@/progress/store';
import { useSettings } from '@/settings/store';

import {
  clearReminders,
  hasPermission,
  type NotificationData,
  scheduleReminders,
} from './notifications';
import { planReminders } from './reminder-plan';

/**
 * Keeps scheduled reminders in step with the learner: re-planned when the
 * setting, the hour, the name, the language or the streak changes, and when the app returns
 * to the foreground (the day may have rolled over).
 */
export function useReminderSync() {
  const enabled = useSettings((state) => state.reminders);
  const hour = useSettings((state) => state.reminderHour);
  const learnerName = useProgress((state) => state.learnerName);
  const lastActiveDay = useProgress((state) => state.streak.lastActiveDay);
  const streakCount = useProgress((state) => state.streak.count);
  const locale = useLocale();
  const [foregrounds, setForegrounds] = useState(0);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') setForegrounds((count) => count + 1);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!enabled || !learnerName) {
        await clearReminders();
        return;
      }
      // Permission can be revoked in system settings at any time.
      if (!(await hasPermission())) {
        if (!cancelled) useSettings.getState().setReminders(false);
        return;
      }
      const progress = useProgress.getState();
      const copy = messagesFor(locale).notifications;
      await scheduleReminders(
        planReminders({
          now: new Date(),
          hour,
          learnerName,
          streak: currentStreak(progress, today()),
          lastActiveDay: progress.streak.lastActiveDay,
          copy,
        }),
        copy,
      );
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled, hour, learnerName, lastActiveDay, streakCount, locale, foregrounds]);
}

/** Opens the screen a tapped notification points to, including one that launched the app. */
export function useNotificationNavigation() {
  useEffect(() => {
    const open = (notification: Notifications.Notification) => {
      const url = (notification.request.content.data as NotificationData | undefined)?.url;
      if (url) router.push(url as Href);
    };

    const launch = Notifications.getLastNotificationResponse();
    if (launch?.notification) {
      open(launch.notification);
      Notifications.clearLastNotificationResponse();
    }

    const subscription = Notifications.addNotificationResponseReceivedListener((response) =>
      open(response.notification),
    );
    return () => subscription.remove();
  }, []);
}
