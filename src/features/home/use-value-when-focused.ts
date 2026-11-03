import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

/**
 * Returns `value` as it was when this screen last gained focus.
 *
 * Progress changes while Home is covered by a lesson or quiz. Holding the old
 * value until Home is visible again lets the XP counter, progress bar and
 * newly unlocked node animate in front of the learner instead of off-screen.
 */
export function useValueWhenFocused<T>(value: T): T {
  const [shown, setShown] = useState(value);
  useFocusEffect(
    useCallback(() => {
      setShown(value);
    }, [value]),
  );
  return shown;
}
