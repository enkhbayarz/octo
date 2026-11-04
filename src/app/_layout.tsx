import { ClerkProvider } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import {
  Onest_500Medium,
  Onest_600SemiBold,
  Onest_700Bold,
  useFonts,
} from '@expo-google-fonts/onest';
import {
  DarkTheme,
  DefaultTheme,
  type ErrorBoundaryProps,
  Stack,
  ThemeProvider,
} from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AnimatedSplash } from '@/components/animated-splash';
import { Mascot } from '@/components/mascot';
import { ToastHost } from '@/components/toast';
import { UpdateBanner } from '@/components/update-banner';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n';
import { accountsEnabled, clerkPublishableKey } from '@/lib/config';
import { useNotificationNavigation, useReminderSync } from '@/notifications/use-notifications';
import { useProgress, useProgressHydrated } from '@/progress/store';
import { useSettingsHydrated } from '@/settings/store';
import { SyncBridge, useSyncHydrated } from '@/sync/sync-bridge';
import { makeStyles, useColors, useScheme } from '@/theme/theme';
import { gutter, space } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync();
// The app is portrait; only a fullscreen lesson video unlocks rotation (lesson-video.tsx).
ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});

/**
 * Where a guarded route sends a learner without a name (and what sits under
 * the sign-in sheet). Without it Expo Router would fall back to the first
 * open route alphabetically, which is now "sign-in".
 */
export const unstable_settings = { anchor: 'welcome' };

/**
 * Accounts are optional: guests learn offline as before. With Clerk configured,
 * a signed-in learner's progress also syncs to the API (see src/sync).
 */
export default function RootLayout() {
  if (!accountsEnabled) return <App />;
  return (
    <ClerkProvider publishableKey={clerkPublishableKey} tokenCache={tokenCache}>
      <SyncBridge />
      <App />
    </ClerkProvider>
  );
}

function App() {
  const colors = useColors();
  const scheme = useScheme();
  const [fontsLoaded, fontError] = useFonts({ Onest_500Medium, Onest_600SemiBold, Onest_700Bold });
  const progressReady = useProgressHydrated();
  const settingsReady = useSettingsHydrated();
  const syncReady = useSyncHydrated();
  const hasName = useProgress((state) => state.learnerName.length > 0);
  // A font failure falls back to the system font rather than blocking the app.
  const ready = (fontsLoaded || Boolean(fontError)) && progressReady && settingsReady && syncReady;
  // The native splash stays up until AnimatedSplash has drawn the same frame on top of the app.
  const [splashDone, setSplashDone] = useState(false);

  if (!ready) return null;

  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...base,
    colors: {
      ...base.colors,
      background: colors.paper,
      card: colors.paper,
      text: colors.ink,
      border: colors.line,
      primary: colors.primary,
    },
  };

  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }}
      >
        {/* Onboarding ends by asking for a name; saving it swaps the welcome flow for the tabs. */}
        <Stack.Protected guard={hasName}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="lesson/[id]/index" />
          <Stack.Screen
            name="lesson/[id]/complete"
            options={{ animation: 'fade_from_bottom', gestureEnabled: false }}
          />
          <Stack.Screen name="quiz/[id]/index" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="settings" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen
            name="quiz/[id]/result"
            options={{ animation: 'fade_from_bottom', gestureEnabled: false }}
          />
          <Stack.Screen
            name="quiz/[id]/review"
            options={{
              presentation: 'formSheet',
              sheetGrabberVisible: true,
              sheetAllowedDetents: [0.75, 1],
              sheetCornerRadius: 24,
              contentStyle: { backgroundColor: colors.paper },
            }}
          />
        </Stack.Protected>
        <Stack.Protected guard={!hasName}>
          <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
        </Stack.Protected>
        {/* Reachable from onboarding and from the Profile tab. */}
        <Stack.Screen
          name="sign-in"
          options={{
            presentation: 'formSheet',
            sheetGrabberVisible: true,
            sheetAllowedDetents: [0.85, 1],
            sheetCornerRadius: 24,
            contentStyle: { backgroundColor: colors.paper },
          }}
        />
        <Stack.Screen name="sso-callback" options={{ animation: 'none' }} />
      </Stack>
      <ToastHost />
      <UpdateBanner />
      <NotificationEffects />
      {splashDone ? null : <AnimatedSplash onDone={() => setSplashDone(true)} />}
    </ThemeProvider>
  );
}

/** Rendered only once the navigator exists, so a tapped notification can navigate. */
function NotificationEffects() {
  useReminderSync();
  useNotificationNavigation();
  return null;
}

/** Shown by Expo Router if a screen throws while rendering. */
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  const styles = useStyles();
  const colors = useColors();
  const t = useT();

  // A crash during startup must not leave the native splash covering this screen.
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <View style={styles.error}>
      <Mascot mood="sad" size={112} />
      <AppText variant="heading" align="center">
        {t.errors.crashTitle}
      </AppText>
      <AppText color={colors.inkSoft} align="center">
        {t.errors.crashBody}
      </AppText>
      <View style={styles.errorAction}>
        <Button label={t.common.retry} onPress={retry} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  error: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
    paddingHorizontal: gutter,
    backgroundColor: colors.paper,
  },
  errorAction: {
    alignSelf: 'stretch',
    marginTop: space[6],
  },
}));
