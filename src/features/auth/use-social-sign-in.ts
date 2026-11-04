import { useSSO } from '@clerk/expo/experimental';
import { useState } from 'react';

import { showToast } from '@/components/toast';
import { useT } from '@/i18n';
import { haptics } from '@/lib/haptics';

import { authErrorMessage } from './clerk-errors';

export type SocialProvider = 'oauth_google' | 'oauth_apple';

/**
 * Google / Apple sign-in through a secure browser sheet (works in Expo Go;
 * native buttons would need a development build). Clerk signs in an existing
 * account or creates one, and activates the session itself.
 */
export function useSocialSignIn(onSignedIn: () => void) {
  const t = useT();
  const { startSSOFlow } = useSSO();
  const [pending, setPending] = useState<SocialProvider | null>(null);

  async function signInWith(strategy: SocialProvider) {
    if (pending) return;
    setPending(strategy);
    haptics.tap();
    try {
      const { createdSessionId } = await startSSOFlow({ strategy });
      // No session means the learner closed the browser sheet: not an error.
      if (createdSessionId) {
        haptics.success();
        onSignedIn();
      }
    } catch (error) {
      haptics.warning();
      showToast(authErrorMessage(error, t.auth), 'lock-3');
    } finally {
      setPending(null);
    }
  }

  return { signInWith, pending };
}
