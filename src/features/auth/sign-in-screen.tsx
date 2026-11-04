import { useSignIn, useSignUp } from '@clerk/expo';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Mascot } from '@/components/mascot';
import { showToast } from '@/components/toast';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { useShake } from '@/hooks/use-shake';
import { useT } from '@/i18n';
import { haptics } from '@/lib/haptics';
import { makeStyles, useColors } from '@/theme/theme';
import { fonts, gutter, radius, space, typeScale } from '@/theme/tokens';

import { AppleLogo, GoogleLogo } from './brand-icons';
import { authErrorMessage, clerkErrorCode, looksLikeEmail } from './clerk-errors';
import { useSocialSignIn } from './use-social-sign-in';

const CODE_LENGTH = 6;
const RESEND_AFTER_SECONDS = 30;

/**
 * Sign in or create a profile, in a sheet: Google, Apple, or an email code.
 * One flow for new and returning learners: Clerk signs in an existing account
 * or creates one ("sign up if missing"), so there's no separate sign-up form
 * and no password to forget.
 */
export function SignInScreen() {
  const styles = useStyles();
  const colors = useColors();
  const t = useT();
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const { shake, style: shakeStyle } = useShake();
  // "I already have a profile" opens this as sign-in; elsewhere it invites creating one.
  const { mode } = useLocalSearchParams<{ mode?: 'sign-in' }>();
  const returning = mode === 'sign-in';

  const [step, setStep] = useState<'start' | 'code'>('start');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  const done = () => {
    haptics.success();
    showToast(t.auth.welcome(''), 'user');
    if (router.canGoBack()) router.back();
  };
  const social = useSocialSignIn(done);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const fail = (cause: unknown) => {
    if (__DEV__) {
      console.warn(
        'auth failed:',
        clerkErrorCode(cause) ?? (cause instanceof Error ? cause.message : cause),
      );
    }
    haptics.warning();
    shake();
    setError(authErrorMessage(cause, t.auth));
    setBusy(false);
  };

  async function sendCode() {
    if (!looksLikeEmail(email)) {
      fail({ code: 'form_identifier_invalid' });
      return;
    }
    setBusy(true);
    setError(null);
    const started = await signIn.create({ identifier: email.trim(), signUpIfMissing: true });
    if (started.error) return fail(started.error);
    const sent = await signIn.emailCode.sendCode();
    if (sent.error) return fail(sent.error);
    setBusy(false);
    setStep('code');
    setResendIn(RESEND_AFTER_SECONDS);
  }

  async function resend() {
    if (resendIn > 0 || busy) return;
    const sent = await signIn.emailCode.sendCode();
    if (sent.error) return fail(sent.error);
    setError(null);
    setResendIn(RESEND_AFTER_SECONDS);
    showToast(t.auth.codeResent, 'refresh');
  }

  async function verify(value = code) {
    if (value.length !== CODE_LENGTH || busy) return;
    setBusy(true);
    setError(null);
    const verified = await signIn.emailCode.verifyCode({ code: value });
    if (verified.error) {
      // No account for this email yet: the verified sign-in becomes a sign-up.
      if (clerkErrorCode(verified.error) !== 'sign_up_if_missing_transfer')
        return fail(verified.error);
      const created = await signUp.create({ transfer: true });
      if (created.error) return fail(created.error);
      if (signUp.status !== 'complete') {
        return fail(
          new Error(`sign-up ${signUp.status}: missing ${signUp.missingFields.join(', ')}`),
        );
      }
      const finished = await signUp.finalize();
      if (finished.error) return fail(finished.error);
      return done();
    }
    if (signIn.status !== 'complete') return fail(new Error(`sign-in ${signIn.status}`));
    const finished = await signIn.finalize();
    if (finished.error) return fail(finished.error);
    done();
  }

  const onCodeChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    if (digits.length === CODE_LENGTH) void verify(digits);
  };

  const spinner = <ActivityIndicator color={colors.white} />;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <View style={styles.head}>
        <Mascot mood={step === 'code' ? 'joy' : 'happy'} size={80} />
        <AppText variant="heading" align="center" accessibilityRole="header">
          {step === 'code' ? t.auth.codeTitle : returning ? t.auth.signInTitle : t.auth.title}
        </AppText>
        <AppText color={colors.inkSoft} align="center">
          {step === 'code'
            ? t.auth.codeSent(email.trim())
            : returning
              ? t.auth.signInSubtitle
              : t.auth.subtitle}
        </AppText>
      </View>

      {step === 'start' ? (
        <View style={styles.form}>
          <Button
            label={t.auth.google}
            tone="secondary"
            onPress={() => void social.signInWith('oauth_google')}
            disabled={social.pending !== null || busy}
            icon={
              social.pending === 'oauth_google' ? (
                <ActivityIndicator color={colors.ink} />
              ) : (
                <GoogleLogo />
              )
            }
          />
          {Platform.OS === 'ios' ? (
            <Button
              label={t.auth.apple}
              tone="secondary"
              onPress={() => void social.signInWith('oauth_apple')}
              disabled={social.pending !== null || busy}
              icon={
                social.pending === 'oauth_apple' ? (
                  <ActivityIndicator color={colors.ink} />
                ) : (
                  <AppleLogo color={colors.ink} />
                )
              }
            />
          ) : null}

          <View style={styles.divider}>
            <View style={styles.rule} />
            <AppText variant="label" color={colors.muted}>
              {t.auth.or}
            </AppText>
            <View style={styles.rule} />
          </View>

          <Animated.View style={shakeStyle}>
            <TextInput
              value={email}
              onChangeText={(value) => {
                setEmail(value);
                setError(null);
              }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onSubmitEditing={() => void sendCode()}
              placeholder={t.auth.email}
              placeholderTextColor={colors.muted}
              selectionColor={colors.primary}
              cursorColor={colors.primary}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="send"
              accessibilityLabel={t.auth.email}
              style={[styles.input, focused && styles.inputFocused, error && styles.inputError]}
            />
          </Animated.View>
          {error ? (
            <AppText variant="label" color={colors.dangerDark} accessibilityLiveRegion="polite">
              {error}
            </AppText>
          ) : null}
          <Button
            label={t.auth.sendCode}
            onPress={() => void sendCode()}
            disabled={busy || !looksLikeEmail(email)}
            icon={busy ? spinner : undefined}
          />
        </View>
      ) : (
        <View style={styles.form}>
          <Animated.View style={shakeStyle}>
            <TextInput
              value={code}
              onChangeText={onCodeChange}
              placeholder={'•'.repeat(CODE_LENGTH)}
              placeholderTextColor={colors.lock}
              selectionColor={colors.primary}
              cursorColor={colors.primary}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              maxLength={CODE_LENGTH}
              autoFocus
              accessibilityLabel={t.auth.code}
              style={[
                styles.input,
                styles.codeInput,
                styles.inputFocused,
                error && styles.inputError,
              ]}
            />
          </Animated.View>
          {error ? (
            <AppText variant="label" color={colors.dangerDark} accessibilityLiveRegion="polite">
              {error}
            </AppText>
          ) : null}
          <Button
            label={t.auth.verify}
            onPress={() => void verify()}
            disabled={busy || code.length !== CODE_LENGTH}
            icon={busy ? spinner : undefined}
          />
          <View style={styles.links}>
            <Pressable
              onPress={() => void resend()}
              disabled={resendIn > 0}
              accessibilityRole="button"
              hitSlop={8}
            >
              <AppText
                variant="label"
                weight="semibold"
                color={resendIn > 0 ? colors.muted : colors.primaryText}
              >
                {resendIn > 0 ? t.auth.resendIn(resendIn) : t.auth.resend}
              </AppText>
            </Pressable>
            <Pressable
              onPress={() => {
                setStep('start');
                setCode('');
                setError(null);
              }}
              accessibilityRole="button"
              hitSlop={8}
            >
              <AppText variant="label" weight="semibold" color={colors.primaryText}>
                {t.auth.changeEmail}
              </AppText>
            </Pressable>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  content: {
    paddingHorizontal: gutter,
    paddingTop: space[6],
    paddingBottom: space[10],
    gap: space[6],
  },
  head: {
    alignItems: 'center',
    gap: space[2],
  },
  form: {
    gap: space[3],
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    marginVertical: space[1],
  },
  rule: {
    flex: 1,
    height: 1,
    backgroundColor: colors.line,
  },
  input: {
    height: 56,
    paddingHorizontal: space[4],
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: colors.card,
    color: colors.ink,
    fontFamily: fonts.semibold,
    fontSize: typeScale.body.fontSize,
  },
  inputFocused: {
    borderColor: colors.primary,
  },
  inputError: {
    borderColor: colors.danger,
  },
  codeInput: {
    textAlign: 'center',
    fontFamily: fonts.bold,
    fontSize: typeScale.title.fontSize,
    letterSpacing: 12,
  },
  links: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: space[1],
    marginTop: space[1],
  },
}));
