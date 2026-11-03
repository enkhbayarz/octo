import { getLocales, useLocales } from 'expo-localization';

import { type LanguagePreference, useSettings } from '@/settings/store';

import { en } from './en';
import { type Messages, mn } from './mn';

export type { Messages };

export const LOCALES = ['mn', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export type { LanguagePreference };

/** Text that differs per locale, as stored in course content. */
export type Localized = Record<Locale, string>;

const MESSAGES: Record<Locale, Messages> = { mn, en };

/**
 * The locale to show. Mongolian is the product's language, so "system" falls
 * back to it for any phone language we don't support.
 */
export function resolveLocale(
  preference: LanguagePreference,
  deviceLanguage: string | null,
): Locale {
  if (preference !== 'system') return preference;
  return LOCALES.find((locale) => locale === deviceLanguage) ?? 'mn';
}

export function localize(text: Localized, locale: Locale): string {
  return text[locale];
}

export function useLocale(): Locale {
  const preference = useSettings((state) => state.language);
  const [device] = useLocales();
  return resolveLocale(preference, device.languageCode);
}

/** The active message catalog: `const t = useT(); t.home.courseProgress`. */
export function useT(): Messages {
  return MESSAGES[useLocale()];
}

/** For code outside React (e.g. scheduling notifications). */
export function currentLocale(): Locale {
  return resolveLocale(useSettings.getState().language, getLocales()[0].languageCode);
}

export function messagesFor(locale: Locale): Messages {
  return MESSAGES[locale];
}
