import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LottieIcon } from '@/components/lottie-icon';
import { showToast } from '@/components/toast';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import type { Lesson } from '@/course';
import { useShake } from '@/hooks/use-shake';
import { localize, useLocale, useT } from '@/i18n';
import { formatDuration } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { XP_PER_LESSON } from '@/progress/rules';
import { useProgress } from '@/progress/store';
import { makeStyles, useColors } from '@/theme/theme';
import { gutter, radius, space } from '@/theme/tokens';

import { LessonVideo } from './lesson-video';
import { useLessonPlayer } from './use-lesson-player';
import { canFinishLesson, unlockProgress } from './watch-progress';

type LessonScreenProps = {
  lesson: Lesson;
  unitNumber: number;
  lessonNumber: number;
  lessonsInUnit: number;
};

export function LessonScreen({
  lesson,
  unitNumber,
  lessonNumber,
  lessonsInUnit,
}: LessonScreenProps) {
  const styles = useStyles();
  const colors = useColors();
  const t = useT();
  const locale = useLocale();
  const insets = useSafeAreaInsets();
  const completeLesson = useProgress((state) => state.completeLesson);
  // Read once: completing the lesson flips this, but the screen is leaving by then.
  const [isRewatch] = useState(() => Boolean(useProgress.getState().completedLessons[lesson.id]));
  const { player, status, isOffline, ratio, reachedEnd, retry } = useLessonPlayer(lesson);
  const { shake, style: shakeStyle } = useShake();

  const ready = isRewatch || canFinishLesson(ratio, reachedEnd);
  const percentWatched = Math.floor(ratio * 100);

  const finish = () => {
    if (isRewatch) {
      router.back();
      showToast(t.lesson.rewatched, 'play-square');
      return;
    }
    if (!ready) {
      shake();
      haptics.warning();
      showToast(t.lesson.watchFirst, 'play');
      return;
    }
    const outcome = completeLesson(lesson.id);
    haptics.success();
    router.replace({
      pathname: '/lesson/[id]/complete',
      params: {
        id: lesson.id,
        xp: String(outcome.xpGained),
        streakUp: outcome.streakIncreased ? '1' : '0',
      },
    });
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <IconButton label={t.common.back} onPress={() => router.back()}>
          <Icon name="back" color={colors.inkSoft} />
        </IconButton>
        <AppText variant="label" color={colors.muted}>
          {t.lesson.unit(unitNumber)}
          <AppText variant="label" weight="semibold">
            {t.lesson.lessonOf(lessonNumber, lessonsInUnit)}
          </AppText>
        </AppText>
        <View style={styles.headerSpacer} />
      </View>

      <LessonVideo player={player} status={status} isOffline={isOffline} onRetry={retry} />

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.tag}>
          <LottieIcon name="video-camera" color={colors.primaryText} size={16} delay={700} />
          <AppText variant="caption" color={colors.primaryText}>
            {t.lesson.tag(formatDuration(lesson.durationSec), isRewatch)}
          </AppText>
        </View>
        <AppText variant="title" style={styles.title}>
          {localize(lesson.title, locale)}
        </AppText>
        <AppText color={colors.inkSoft} style={styles.description}>
          {localize(lesson.description, locale)}
        </AppText>

        <AppText variant="caption" color={colors.muted} style={styles.sectionLabel}>
          {t.lesson.phrasesTitle}
        </AppText>
        <View style={styles.phrases}>
          {lesson.phrases.map((phrase) => (
            <View key={phrase.en} style={styles.phrase}>
              <AppText weight="semibold">{phrase.en}</AppText>
              <AppText variant="label" color={colors.inkSoft}>
                {phrase.mn}
              </AppText>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space[4] }]}>
        <Animated.View style={shakeStyle}>
          <Button
            label={isRewatch ? t.common.backHome : t.lesson.finish}
            onPress={finish}
            disabled={!ready}
            fill={unlockProgress(ratio, reachedEnd)}
            accessibilityHint={ready ? undefined : t.lesson.finishHint}
          />
        </Animated.View>
        <View style={styles.hint}>
          {ready ? <Icon name="check" color={colors.successDark} size={16} /> : null}
          <AppText variant="label" color={ready ? colors.successDark : colors.muted} tabular>
            {isRewatch
              ? t.lesson.alreadyDone
              : ready
                ? t.lesson.ready(XP_PER_LESSON)
                : t.lesson.watchProgress(percentWatched)}
          </AppText>
        </View>
      </View>
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
  },
  headerSpacer: {
    width: 44,
  },
  body: {
    paddingHorizontal: gutter,
    paddingTop: space[6],
    paddingBottom: space[4],
  },
  tag: {
    alignSelf: 'flex-start',
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingHorizontal: space[3],
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
  },
  title: {
    marginTop: space[3],
  },
  description: {
    marginTop: space[2],
  },
  sectionLabel: {
    marginTop: space[6],
    marginBottom: space[3],
    letterSpacing: 0.7,
  },
  phrases: {
    gap: space[2],
  },
  phrase: {
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  footer: {
    paddingTop: space[4],
    paddingHorizontal: gutter,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.paper,
  },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
    marginTop: space[3],
  },
}));
