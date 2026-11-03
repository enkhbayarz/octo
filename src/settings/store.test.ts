import { beforeEach, describe, expect, mock, test } from 'bun:test';
import * as React from 'react';

const disk = new Map<string, string>();
mock.module('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => disk.get(key) ?? null,
    setItem: async (key: string, value: string) => void disk.set(key, value),
    removeItem: async (key: string) => void disk.delete(key),
  },
}));
const setColorScheme = mock();
mock.module('react-native', () => ({ Appearance: { setColorScheme } }));
mock.module('react', () => ({
  ...React,
  useSyncExternalStore: (
    subscribe: (onChange: () => void) => () => void,
    getSnapshot: () => unknown,
  ) => {
    subscribe(() => {})();
    return getSnapshot();
  },
}));

const { useSettings, useSettingsHydrated: readHydrated } = await import('./store');

const settings = () => useSettings.getState();

beforeEach(() => setColorScheme.mockClear());

describe('settings store', () => {
  test('starts in Mongolian with sound on and reminders off', () => {
    expect(readHydrated()).toBe(true);
    expect(settings()).toMatchObject({
      language: 'mn',
      theme: 'system',
      sound: true,
      reminders: false,
      reminderHour: 19,
      pushToken: null,
    });
  });

  test('applies the theme to the whole app', () => {
    settings().setTheme('dark');
    expect(setColorScheme).toHaveBeenLastCalledWith('dark');
    settings().setTheme('system');
    expect(setColorScheme).toHaveBeenLastCalledWith('unspecified');
    expect(settings().theme).toBe('system');
  });

  test('updates each preference', () => {
    settings().setLanguage('en');
    settings().setSound(false);
    settings().setReminders(true);
    settings().setReminderHour(8);
    settings().setPushToken('ExponentPushToken[abc]');
    expect(settings()).toMatchObject({
      language: 'en',
      sound: false,
      reminders: true,
      reminderHour: 8,
      pushToken: 'ExponentPushToken[abc]',
    });
  });

  test('migrates older saves and re-applies the saved theme on load', async () => {
    const options = useSettings.persist.getOptions();
    expect(await options.migrate?.({ theme: 'light' }, 2)).toMatchObject({
      theme: 'light',
      reminderHour: 19,
    });

    disk.set('octolearn.settings', JSON.stringify({ state: { theme: 'dark' }, version: 3 }));
    await useSettings.persist.rehydrate();
    expect(setColorScheme).toHaveBeenLastCalledWith('dark');
  });
});
