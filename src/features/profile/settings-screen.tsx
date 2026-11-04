import Constants from 'expo-constants';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LottieIcon } from '@/components/lottie-icon';
import { showToast } from '@/components/toast';
import { appVersionLabel } from '@/components/update-banner';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { useT } from '@/i18n';
import { haptics } from '@/lib/haptics';
import { useProgress } from '@/progress/store';
import { useAccount } from '@/sync/use-account';
import { makeStyles, useColors } from '@/theme/theme';
import { controlHeight, gutter, radius, space } from '@/theme/tokens';

import { AccountCard } from './account-card';
import { SettingsCard } from './settings-card';

function Section({ title, children }: { title: string; children: ReactNode }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <View style={styles.section}>
      <AppText
        variant="caption"
        color={colors.muted}
        style={styles.sectionTitle}
        accessibilityRole="header"
      >
        {title}
      </AppText>
      {children}
    </View>
  );
}

/** Opened from the gear on Profile: account, preferences, then sign out or start over. */
export function SettingsScreen() {
  const styles = useStyles();
  const colors = useColors();
  const t = useT();
  const insets = useSafeAreaInsets();
  const account = useAccount();
  const reset = useProgress((state) => state.reset);

  const confirmSignOut = () => {
    haptics.warning();
    const body =
      account.pending > 0
        ? `${t.account.signOutBody}\n\n${t.account.signOutUnsynced(account.pending)}`
        : t.account.signOutBody;
    Alert.alert(t.account.signOutTitle, body, [
      { text: t.common.cancel, style: 'cancel' },
      {
        text: t.account.signOut,
        style: 'destructive',
        onPress: async () => {
          await account.signOut();
          showToast(t.account.signedOut, 'user');
        },
      },
    ]);
  };

  const confirmReset = () => {
    haptics.warning();
    Alert.alert(t.profile.resetTitle, t.profile.resetBody, [
      { text: t.common.cancel, style: 'cancel' },
      {
        text: t.profile.resetConfirm,
        style: 'destructive',
        onPress: () => {
          reset();
          showToast(t.profile.resetDone, 'refresh');
        },
      },
    ]);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <IconButton label={t.settings.close} onPress={() => router.back()}>
          <Icon name="close" color={colors.inkSoft} size={22} />
        </IconButton>
        <AppText variant="heading" accessibilityRole="header">
          {t.settings.title}
        </AppText>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space[8] }]}
        showsVerticalScrollIndicator={false}
      >
        <Section title={t.settings.account}>
          <AccountCard />
        </Section>

        <Section title={t.settings.preferences}>
          <SettingsCard />
        </Section>

        <View style={styles.footer}>
          {account.signedIn ? (
            <Button tone="secondary" label={t.account.signOut} onPress={confirmSignOut} />
          ) : (
            // Signed in, progress lives in the profile; "start over" would just sync back.
            <Pressable
              onPress={confirmReset}
              accessibilityRole="button"
              style={({ pressed }) => [styles.reset, pressed && styles.resetPressed]}
            >
              <LottieIcon name="refresh" color={colors.dangerDark} size={20} />
              <AppText weight="semibold" color={colors.dangerDark}>
                {t.profile.reset}
              </AppText>
            </Pressable>
          )}
          <AppText variant="caption" weight="medium" color={colors.muted} align="center">
            {appVersionLabel(t.profile.version(Constants.expoConfig?.version ?? '—'))}
          </AppText>
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space[3],
    paddingBottom: space[2],
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  headerSpacer: {
    width: controlHeight.control,
  },
  body: {
    paddingHorizontal: gutter,
  },
  section: {
    marginTop: space[6],
  },
  sectionTitle: {
    marginBottom: space[2],
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  footer: {
    gap: space[4],
    marginTop: space[8],
  },
  reset: {
    height: controlHeight.button,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.dangerBorder,
  },
  resetPressed: {
    backgroundColor: colors.dangerLight,
  },
}));
