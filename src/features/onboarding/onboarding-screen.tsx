import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInDown, FadeInLeft, FadeInRight } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Mascot } from '@/components/mascot';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { ProgressBar } from '@/components/ui/progress-bar';
import { useShake } from '@/hooks/use-shake';
import { useT } from '@/i18n';
import { accountsEnabled } from '@/lib/config';
import { haptics } from '@/lib/haptics';
import { registerForPushAsync, requestPermission } from '@/notifications/notifications';
import { MAX_NAME_LENGTH, normalizeName } from '@/progress/rules';
import { useProgress } from '@/progress/store';
import type { EnglishLevel, LearningReason } from '@/progress/types';
import { useSettings } from '@/settings/store';
import { useAccount } from '@/sync/use-account';
import { makeStyles, useColors } from '@/theme/theme';
import { fonts, gutter, radius, space, typeScale } from '@/theme/tokens';

import { ChoiceOption } from './choice-option';
import { OctoSays } from './octo-says';

type Step = 'intro' | 'reason' | 'level' | 'goal' | 'reminder' | 'account' | 'name';

const REASONS: { value: LearningReason; emoji: string }[] = [
  { value: 'travel', emoji: '✈️' },
  { value: 'work', emoji: '💼' },
  { value: 'school', emoji: '🎓' },
  { value: 'fun', emoji: '🎬' },
  { value: 'other', emoji: '✨' },
];

const LEVELS: { value: EnglishLevel; emoji: string }[] = [
  { value: 'new', emoji: '🌱' },
  { value: 'some', emoji: '👋' },
  { value: 'basic', emoji: '💬' },
];

const GOALS = [5, 10, 15, 20] as const;
type Goal = (typeof GOALS)[number];

/**
 * First run, Duolingo style: Окто says hi, asks three quick questions, offers a
 * daily reminder, offers to save progress in a profile (optional), then asks
 * for a name. Saving the name flips the root layout's guard, which swaps this
 * screen for the tabs. Signing in to a profile that already has a name skips
 * straight to the tabs (sync fills the name in).
 */
export function OnboardingScreen() {
  const styles = useStyles();
  const colors = useColors();
  const t = useT();
  const insets = useSafeAreaInsets();
  const setLearnerName = useProgress((state) => state.setLearnerName);
  const setAnswers = useProgress((state) => state.setAnswers);
  const setReminders = useSettings((state) => state.setReminders);
  const setPushToken = useSettings((state) => state.setPushToken);
  const account = useAccount();

  // Someone who reset their progress may already have reminders on; don't ask again.
  const [allSteps] = useState<Step[]>(() => [
    'intro',
    'reason',
    'level',
    'goal',
    ...(useSettings.getState().reminders ? [] : (['reminder'] as const)),
    ...(accountsEnabled ? (['account'] as const) : []),
    'name',
  ]);
  const [index, setIndex] = useState(0);
  const [forward, setForward] = useState(true);
  const [reason, setReason] = useState<LearningReason | null>(null);
  const [level, setLevel] = useState<EnglishLevel | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
  // Null until typed: until then a Google/Apple first name is suggested.
  const [typedName, setName] = useState<string | null>(null);
  const name = typedName ?? account.firstName ?? '';
  const [focused, setFocused] = useState(false);
  const { shake, style: shakeStyle } = useShake();
  // Once signed in (here, or earlier from the intro) there's no profile to offer:
  // the step drops out and whatever followed it takes its place.
  const steps = account.signedIn ? allSteps.filter((item) => item !== 'account') : allSteps;
  const step = steps[index] ?? 'intro';

  const next = () => {
    setForward(true);
    setIndex((current) => Math.min(current + 1, steps.length - 1));
  };
  const back = () => {
    setForward(false);
    setIndex((current) => Math.max(current - 1, 0));
  };

  // Android's back button steps back through the questions instead of closing the app.
  useEffect(() => {
    if (index === 0) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setForward(false);
      setIndex((current) => current - 1);
      return true;
    });
    return () => subscription.remove();
  }, [index]);

  const pick = <T,>(setter: (value: T) => void, value: T) => {
    haptics.tap();
    setter(value);
  };

  const answered =
    step === 'reason' ? reason !== null : step === 'level' ? level !== null : goal !== null;
  const continueOrShake = () => {
    if (!answered) {
      shake();
      haptics.warning();
      return;
    }
    next();
  };

  const turnOnReminders = async () => {
    if (await requestPermission(t.notifications)) {
      haptics.success();
      setReminders(true);
      // Remote push needs a real device and an EAS project; quietly skipped otherwise.
      registerForPushAsync().then((token) => {
        if (token) setPushToken(token);
      });
    }
    next();
  };

  const nameValid = normalizeName(name) !== null;
  const finish = () => {
    if (!nameValid) {
      shake();
      haptics.warning();
      return;
    }
    if (reason && level && goal) setAnswers({ reason, level, dailyMinutes: goal });
    haptics.success();
    setLearnerName(name);
  };

  const entering = (forward ? FadeInRight : FadeInLeft).duration(260);

  const footer = {
    intro: accountsEnabled ? (
      <View style={styles.footerStack}>
        <Button label={t.onboarding.getStarted} onPress={next} />
        <Button
          label={t.onboarding.haveAccount}
          onPress={() => router.push({ pathname: '/sign-in', params: { mode: 'sign-in' } })}
          tone="secondary"
        />
      </View>
    ) : (
      <Button label={t.onboarding.getStarted} onPress={next} />
    ),
    reason: <Button label={t.common.continue} onPress={continueOrShake} disabled={!answered} />,
    level: <Button label={t.common.continue} onPress={continueOrShake} disabled={!answered} />,
    goal: <Button label={t.onboarding.commit} onPress={continueOrShake} disabled={!answered} />,
    reminder: (
      <View style={styles.footerStack}>
        <Button label={t.onboarding.reminderOn} onPress={turnOnReminders} />
        <Button label={t.onboarding.notNow} onPress={next} tone="secondary" />
      </View>
    ),
    account: (
      <View style={styles.footerStack}>
        <Button label={t.account.create} onPress={() => router.push('/sign-in')} />
        <Button label={t.onboarding.later} onPress={next} tone="secondary" />
      </View>
    ),
    name: (
      <Button
        label={t.onboarding.finish}
        onPress={finish}
        disabled={!nameValid}
        accessibilityHint={nameValid ? undefined : t.onboarding.nameHint}
      />
    ),
  }[step];

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {step === 'intro' ? null : (
        <View style={styles.header}>
          <IconButton label={t.common.back} onPress={back}>
            <Icon name="back" color={colors.muted} />
          </IconButton>
          <View style={styles.progress}>
            <ProgressBar percent={(index / steps.length) * 100} height={12} />
          </View>
        </View>
      )}

      <Animated.View key={step} entering={entering} style={styles.body}>
        {step === 'intro' ? (
          <View style={styles.intro}>
            <Mascot mood="joy" size={200} floating />
            <Animated.View entering={FadeInDown.delay(150).springify()} style={styles.introCopy}>
              <AppText variant="display" color={colors.primaryText} align="center">
                octolearn
              </AppText>
              <AppText color={colors.inkSoft} align="center">
                {t.onboarding.tagline}
              </AppText>
            </Animated.View>
          </View>
        ) : null}

        {step === 'reason' || step === 'level' || step === 'goal' ? (
          <ScrollView contentContainerStyle={styles.question}>
            <OctoSays
              text={
                {
                  reason: t.onboarding.reasonQuestion,
                  level: t.onboarding.levelQuestion,
                  goal: t.onboarding.goalQuestion,
                }[step]
              }
            />
            <Animated.View style={[styles.options, shakeStyle]} accessibilityRole="radiogroup">
              {step === 'reason'
                ? REASONS.map((option) => (
                    <ChoiceOption
                      key={option.value}
                      emoji={option.emoji}
                      label={t.onboarding.reasons[option.value]}
                      selected={reason === option.value}
                      onPress={() => pick(setReason, option.value)}
                    />
                  ))
                : null}
              {step === 'level'
                ? LEVELS.map((option) => (
                    <ChoiceOption
                      key={option.value}
                      emoji={option.emoji}
                      label={t.onboarding.levels[option.value]}
                      selected={level === option.value}
                      onPress={() => pick(setLevel, option.value)}
                    />
                  ))
                : null}
              {step === 'goal'
                ? GOALS.map((minutes) => (
                    <ChoiceOption
                      key={minutes}
                      label={t.onboarding.goalMinutes(minutes)}
                      detail={t.onboarding.goalTags[minutes]}
                      selected={goal === minutes}
                      onPress={() => pick(setGoal, minutes)}
                    />
                  ))
                : null}
            </Animated.View>
          </ScrollView>
        ) : null}

        {step === 'reminder' ? (
          <View style={styles.reminder}>
            <OctoSays text={t.onboarding.reminderQuestion} layout="stacked" />
            <AppText color={colors.inkSoft} align="center" style={styles.reminderBody}>
              {t.onboarding.reminderBody}
            </AppText>
          </View>
        ) : null}

        {step === 'account' ? (
          <View style={styles.reminder}>
            <OctoSays text={t.onboarding.accountQuestion} layout="stacked" />
            <AppText color={colors.inkSoft} align="center" style={styles.reminderBody}>
              {t.onboarding.accountBody}
            </AppText>
          </View>
        ) : null}

        {step === 'name' ? (
          <View style={styles.question}>
            <OctoSays text={t.onboarding.nameQuestion} />
            <Animated.View style={[styles.options, shakeStyle]}>
              <TextInput
                value={name}
                onChangeText={setName}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onSubmitEditing={finish}
                placeholder={t.onboarding.namePlaceholder}
                placeholderTextColor={colors.muted}
                selectionColor={colors.primary}
                cursorColor={colors.primary}
                maxLength={MAX_NAME_LENGTH}
                autoCapitalize="words"
                autoComplete="name-given"
                textContentType="givenName"
                returnKeyType="go"
                autoFocus
                accessibilityLabel={t.onboarding.namePlaceholder}
                style={[styles.input, focused && styles.inputFocused]}
              />
            </Animated.View>
          </View>
        ) : null}
      </Animated.View>

      <View style={styles.footer}>{footer}</View>
    </KeyboardAvoidingView>
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
    gap: space[2],
    paddingLeft: space[2],
    paddingRight: gutter,
    paddingVertical: space[2],
  },
  progress: {
    flex: 1,
  },
  body: {
    flex: 1,
  },
  intro: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: gutter,
  },
  introCopy: {
    gap: space[2],
    marginTop: space[4],
    maxWidth: 320,
  },
  question: {
    paddingHorizontal: gutter,
    paddingTop: space[4],
    paddingBottom: space[6],
    gap: space[6],
  },
  options: {
    gap: space[3],
  },
  reminder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: gutter,
  },
  reminderBody: {
    marginTop: space[6],
    maxWidth: 300,
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
  footer: {
    paddingTop: space[4],
    paddingHorizontal: gutter,
    paddingBottom: space[4],
  },
  footerStack: {
    gap: space[3],
  },
}));
