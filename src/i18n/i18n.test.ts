import { describe, expect, mock, test } from 'bun:test';

// The native module isn't available under bun, so the phone language and saved
// preference are stubbed; the hooks are plain reads of them.
const phone = { languageCode: 'en' as string | null };
const settings = { language: 'system' };
mock.module('expo-localization', () => ({
  getLocales: () => [phone],
  useLocales: () => [phone],
}));
mock.module('@/settings/store', () => ({
  useSettings: Object.assign((select: (state: typeof settings) => unknown) => select(settings), {
    getState: () => settings,
  }),
}));

const {
  currentLocale,
  localize,
  messagesFor,
  resolveLocale,
  useLocale: readLocale,
  useT: readMessages,
} = await import('.');

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

/** Calls every message function with sample values, so each one is exercised. */
function renderAll(value: unknown, sample: number): string[] {
  if (typeof value === 'function') return [value(...Array(value.length).fill(sample))];
  if (typeof value === 'string') return [value];
  if (value && typeof value === 'object') {
    return Object.values(value).flatMap((inner) => renderAll(inner, sample));
  }
  return [];
}

describe('every message', () => {
  test.each(['mn', 'en'] as const)(
    '%s: renders non-empty text for singular and plural values',
    (locale) => {
      for (const sample of [1, 3]) {
        const texts = renderAll(messagesFor(locale), sample);
        expect(texts.length).toBeGreaterThan(100);
        for (const text of texts) expect(text.trim().length).toBeGreaterThan(0);
      }
    },
  );
});

describe('active locale', () => {
  test('follows the saved preference, falling back to the phone language', () => {
    settings.language = 'system';
    phone.languageCode = 'en';
    expect(readLocale()).toBe('en');
    expect(currentLocale()).toBe('en');
    expect(readMessages()).toBe(messagesFor('en'));

    settings.language = 'mn';
    expect(readLocale()).toBe('mn');
    expect(currentLocale()).toBe('mn');
    expect(readMessages()).toBe(messagesFor('mn'));
  });
});
