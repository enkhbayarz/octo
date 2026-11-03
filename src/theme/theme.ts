import {
  type ImageStyle,
  StyleSheet,
  type TextStyle,
  useColorScheme,
  type ViewStyle,
} from 'react-native';

import { type ColorScheme, type Palette, palettes } from './tokens';

/**
 * The active scheme. Follows the OS unless the learner picked one in Profile,
 * which is applied app-wide with `Appearance.setColorScheme` (see settings/store).
 */
export function useScheme(): ColorScheme {
  return useColorScheme() === 'dark' ? 'dark' : 'light';
}

export function useColors(): Palette {
  return palettes[useScheme()];
}

type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };

/**
 * Creates a `useStyles` hook for styles that depend on the palette. Each scheme's
 * StyleSheet is built once and cached, so switching themes costs nothing per render.
 */
export function makeStyles<T extends NamedStyles<T>>(
  factory: (colors: Palette) => T | NamedStyles<T>,
) {
  const cache: Partial<Record<ColorScheme, T>> = {};
  return function useStyles(): T {
    const scheme = useScheme();
    return (cache[scheme] ??= StyleSheet.create(factory(palettes[scheme]) as T));
  };
}
