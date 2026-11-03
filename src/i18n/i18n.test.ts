import { describe, expect, mock, test } from 'bun:test';

// The native module isn't available under bun; locale detection is passed in explicitly.
mock.module('expo-localization', () => ({ getLocales: () => [{}], useLocales: () => [{}] }));
mock.module('@/settings/store', () => ({ useSettings: { getState: () => ({}) } }));

const { localize, messagesFor, resolveLocale } = await import('.');

function shape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(shape);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, shape(inner)]));
  }
  return typeof value;
}

describe('resolveLocale', () => {
  test('an explicit choice wins over the phone language', () => {
    expect(resolveLocale('en', 'mn')).toBe('en');
    expect(resolveLocale('mn', 'en')).toBe('mn');
  });

  test('system follows the phone when supported, else Mongolian', () => {
    expect(resolveLocale('system', 'en')).toBe('en');
    expect(resolveLocale('system', 'de')).toBe('mn');
    expect(resolveLocale('system', null)).toBe('mn');
  });
});

describe('catalogs', () => {
  test('English has exactly the same keys and value kinds as Mongolian', () => {
    expect(shape(messagesFor('en'))).toEqual(shape(messagesFor('mn')));
  });

  test('messages with values interpolate in both languages', () => {
    expect(messagesFor('mn').home.lessonsProgress(5, 10, 50)).toBe('5 / 10 хичээл · 50%');
    expect(messagesFor('en').home.lessonsProgress(5, 10, 50)).toBe('5 / 10 lessons · 50%');
    expect(messagesFor('en').profile.days(1)).toBe('1 day');
    expect(messagesFor('en').profile.days(3)).toBe('3 days');
  });

  test('localize picks the locale’s text', () => {
    expect(localize({ mn: 'Мэндчилгээ', en: 'Greetings' }, 'en')).toBe('Greetings');
  });
});
