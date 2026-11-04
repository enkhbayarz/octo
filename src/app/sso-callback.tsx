import { router } from 'expo-router';
import { useEffect } from 'react';

/**
 * Where Google/Apple sign-in returns to. The sign-in sheet already received
 * the result, so this only steps back out of the way (Android can open the
 * redirect as a deep link).
 */
export default function SsoCallback() {
  useEffect(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, []);
  return null;
}
