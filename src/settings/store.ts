import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { Appearance } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ThemePreference = 'system' | 'light' | 'dark';

/** "system" follows the phone's language (see i18n). */
export type LanguagePreference = 'system' | 'mn' | 'en';

type Preferences = {
  language: LanguagePreference;
  theme: ThemePreference;
  sound: boolean;
  /** Daily study reminder (local notifications). Off until the learner turns it on. */
  reminders: boolean;
  /** Local hour (0–23) the reminder fires. */
  reminderHour: number;
  /** Expo push token once registered; a backend would store this to send remote pushes. */
  pushToken: string | null;
};

type Settings = Preferences & {
  setLanguage: (language: LanguagePreference) => void;
  setTheme: (theme: ThemePreference) => void;
  setSound: (sound: boolean) => void;
  setReminders: (reminders: boolean) => void;
  setReminderHour: (hour: number) => void;
  setPushToken: (token: string | null) => void;
};

const DEFAULTS: Preferences = {
  // Mongolian is the product language, so it is the default rather than the phone's.
  language: 'mn',
  theme: 'system',
  sound: true,
  reminders: false,
  reminderHour: 19,
  pushToken: null,
};

/** Applies the preference to every screen, native tab bar and system alert. */
function applyTheme(theme: ThemePreference) {
  Appearance.setColorScheme(theme === 'system' ? 'unspecified' : theme);
}

/** Device preferences. Kept apart from learning progress so "reset progress" leaves them alone. */
export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      setLanguage: (language) => set({ language }),
      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },
      setSound: (sound) => set({ sound }),
      setReminders: (reminders) => set({ reminders }),
      setReminderHour: (reminderHour) => set({ reminderHour }),
      setPushToken: (pushToken) => set({ pushToken }),
    }),
    {
      name: 'octolearn.settings',
      version: 3,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ language, theme, sound, reminders, reminderHour, pushToken }) => ({
        language,
        theme,
        sound,
        reminders,
        reminderHour,
        pushToken,
      }),
      // Older saves miss newer preferences; fill them with defaults.
      migrate: (persisted) => ({ ...DEFAULTS, ...(persisted as Partial<Preferences>) }),
      onRehydrateStorage: () => (state) => {
        if (state) applyTheme(state.theme);
      },
    },
  ),
);

const subscribeToHydration = (onChange: () => void) =>
  useSettings.persist.onFinishHydration(onChange);

/** True once the saved theme has been applied, so the first frame is already in the right theme. */
export function useSettingsHydrated(): boolean {
  return useSyncExternalStore(subscribeToHydration, () => useSettings.persist.hasHydrated());
}
