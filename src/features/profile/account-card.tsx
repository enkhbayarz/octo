import { router } from 'expo-router';
import { Alert, Pressable, View } from 'react-native';

import { showToast } from '@/components/toast';
import { Mascot } from '@/components/mascot';
import { LottieIcon } from '@/components/lottie-icon';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n';
import { haptics } from '@/lib/haptics';
import { type Account, useAccount } from '@/sync/use-account';
import { makeStyles, useColors } from '@/theme/theme';
import { gutter, radius, space } from '@/theme/tokens';

/** Guest: an invitation to save progress. Signed in: who, whether everything is saved, sign out. */
export function AccountCard() {
  const account = useAccount();
  return account.signedIn ? <SignedIn account={account} /> : <Guest />;
}

function Guest() {
  const styles = useStyles();
  const colors = useColors();
  const t = useT();
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Mascot mood="happy" size={56} />
        <View style={styles.text}>
          <AppText weight="bold">{t.account.guestTitle}</AppText>
          <AppText variant="label" color={colors.inkSoft}>
            {t.account.guestBody}
          </AppText>
        </View>
      </View>
      <Button label={t.account.create} onPress={() => router.push('/sign-in')} />
    </View>
  );
}

function SignedIn({ account }: { account: Account }) {
  const styles = useStyles();
  const colors = useColors();
  const t = useT();

  const state =
    account.status === 'syncing'
      ? { text: t.account.syncing, color: colors.sun }
      : account.status === 'offline'
        ? { text: t.account.offline, color: colors.muted }
        : account.status === 'failed'
          ? { text: t.account.failed, color: colors.danger }
          : account.pending > 0
            ? { text: t.account.pending(account.pending), color: colors.sun }
            : { text: t.account.synced, color: colors.success };

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

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.badge}>
          <LottieIcon name="user" color={colors.primaryText} size={24} />
        </View>
        <View style={styles.text}>
          <AppText weight="bold" numberOfLines={1}>
            {account.email ?? account.firstName ?? '—'}
          </AppText>
          <View style={styles.status} accessibilityLiveRegion="polite">
            <View style={[styles.dot, { backgroundColor: state.color }]} />
            <AppText variant="label" color={colors.inkSoft} style={styles.text}>
              {state.text}
            </AppText>
          </View>
        </View>
      </View>
      <View style={styles.actions}>
        {account.pending > 0 || account.status === 'failed' ? (
          <Pressable onPress={account.syncNow} accessibilityRole="button" hitSlop={8}>
            <AppText variant="label" weight="semibold" color={colors.primaryText}>
              {t.account.syncNow}
            </AppText>
          </Pressable>
        ) : (
          <View />
        )}
        <Pressable onPress={confirmSignOut} accessibilityRole="button" hitSlop={8}>
          <AppText variant="label" weight="semibold" color={colors.dangerDark}>
            {t.account.signOut}
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: {
    gap: space[4],
    marginHorizontal: gutter,
    marginTop: space[6],
    padding: space[4],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
  text: {
    flex: 1,
    gap: space[1],
  },
  badge: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryLight,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
}));
