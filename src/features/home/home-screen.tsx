import { router } from 'expo-router';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import { ScrollView, type ScrollViewInstance, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTabBarInset } from '@/components/glass-tab-bar';
import { Mascot } from '@/components/mascot';
import { OfflineBanner } from '@/components/offline-banner';
import { showToast } from '@/components/toast';
import { AppText } from '@/components/ui/app-text';
import { course, pathItems } from '@/course';
import { useIsOffline } from '@/hooks/use-is-offline';
import { localize, useLocale, useT } from '@/i18n';
import { today } from '@/lib/dates';
import { haptics } from '@/lib/haptics';
import { currentStreak } from '@/progress/rules';
import {
  getActiveItem,
  getCourseProgress,
  getItemStatus,
  getLockReason,
} from '@/progress/selectors';
import { useProgress } from '@/progress/store';
import { makeStyles, useColors } from '@/theme/theme';
import { gutter, radius, space } from '@/theme/tokens';

import { CourseHeader } from './course-header';
import { lockedMessage } from './locked-message';
import { layoutPath, NODE_SIZE } from './path-layout';
import { UnitBanner } from './unit-banner';
import { UnitPath, type UnitPathNode } from './unit-path';
import { useValueWhenFocused } from './use-value-when-focused';

type UnitSection = {
  id: string;
  number: number;
  title: string;
  meta: string;
  progress?: { done: number; total: number };
  nodes: UnitPathNode[];
  height: number;
  mirrored: boolean;
};

function CourseCompleteCard() {
  const styles = useStyles();
  const colors = useColors();
  const t = useT();
  return (
    <View style={styles.completeCard}>
      <Mascot mood="joy" size={56} />
      <View style={styles.completeText}>
        <AppText weight="bold">{t.home.courseDoneTitle}</AppText>
        <AppText variant="label" color={colors.sunText}>
          {t.home.courseDoneBody(course.units.length + 1)}
        </AppText>
      </View>
    </View>
  );
}

export function HomeScreen() {
  const styles = useStyles();
  const progress = useProgress();
  const t = useT();
  const locale = useLocale();
  const insets = useSafeAreaInsets();
  const tabBarInset = useTabBarInset();
  const { width, height: windowHeight } = useWindowDimensions();
  const isOffline = useIsOffline();
  const day = today();
  const pathWidth = width - gutter * 2;

  const active = getActiveItem(pathItems, progress);
  const courseProgress = getCourseProgress(progress);

  // Values that animate when Home becomes visible again (see useValueWhenFocused).
  const shownXp = useValueWhenFocused(progress.xp);
  const shownPercent = useValueWhenFocused(courseProgress.percent);
  const shownActiveId = useValueWhenFocused(active?.id);
  const [initialActiveId] = useState(active?.id);

  const sections: UnitSection[] = course.units.map((unit, unitIndex) => {
    const items = pathItems
      .map((item, index) => ({ item, status: getItemStatus(pathItems, index, progress) }))
      .filter(({ item }) => item.unitIndex === unitIndex);
    const mirrored = unitIndex % 2 === 1;
    const layout = layoutPath(
      items.map(({ item, status }) => ({
        size: NODE_SIZE[item.kind],
        hasBubble: status === 'active',
      })),
      pathWidth,
      mirrored,
    );
    const nodes = items.map(({ item, status }, index): UnitPathNode => {
      const result = progress.quizResults[item.id];
      return {
        id: item.id,
        kind: item.kind,
        status,
        title: item.kind === 'quiz' ? t.home.unitQuiz : localize(item.lesson.title, locale),
        badge: result ? `${result.best}/${result.total}` : undefined,
        layout: layout.nodes[index]!,
      };
    });
    return {
      id: unit.id,
      number: unitIndex + 1,
      title: localize(unit.title, locale),
      meta: t.home.unitMeta(unit.lessons.length),
      progress: {
        done: nodes.filter((node) => node.status === 'done').length,
        total: nodes.length,
      },
      nodes,
      height: layout.height,
      mirrored,
    };
  });

  const upcomingSections: UnitSection[] = course.upcomingUnits.map((unit, index) => {
    const number = course.units.length + index + 1;
    const mirrored = number % 2 === 0;
    const layout = layoutPath(
      unit.lessonTitles.map(() => ({ size: NODE_SIZE.lesson, hasBubble: false })),
      pathWidth,
      mirrored,
    );
    return {
      id: unit.id,
      number,
      title: localize(unit.title, locale),
      meta: t.home.upcomingMeta(unit.lessonTitles.length),
      nodes: unit.lessonTitles.map((title, k) => ({
        id: `${unit.id}-${k}`,
        kind: 'lesson',
        status: 'locked',
        title: localize(title, locale),
        layout: layout.nodes[k]!,
      })),
      height: layout.height,
      mirrored,
    };
  });

  // --- Auto-scroll to the current lesson -----------------------------------
  const scrollRef = useRef<ScrollViewInstance>(null);
  const pathOffsets = useRef<Record<string, number>>({});
  const viewportHeight = useRef(0);
  const didInitialScroll = useRef(false);

  const scrollToActive = (activeId: string | undefined, animated: boolean) => {
    const section = sections.find((s) => s.nodes.some((node) => node.id === activeId));
    const node = section?.nodes.find((n) => n.id === activeId);
    const offset = section && pathOffsets.current[section.id];
    if (!node || offset === undefined) return false;
    const viewport = viewportHeight.current || windowHeight * 0.6;
    const y = offset + node.layout.y - viewport / 2;
    scrollRef.current?.scrollTo({ y: Math.max(0, y), animated });
    return true;
  };

  useEffect(() => {
    if (didInitialScroll.current) scrollToActive(shownActiveId, true);
    // Only re-run when the focused active item changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownActiveId]);

  const onPathLayout = (sectionId: string, y: number) => {
    pathOffsets.current[sectionId] = y;
    if (!didInitialScroll.current && scrollToActive(active?.id, false)) {
      didInitialScroll.current = true;
    }
  };

  // --- Node taps -------------------------------------------------------------
  const openItem = (id: string) => {
    const index = pathItems.findIndex((item) => item.id === id);
    const item = pathItems[index];
    if (!item) {
      haptics.warning();
      showToast(t.home.upcomingToast(course.units.length + 1));
      return;
    }
    if (getItemStatus(pathItems, index, progress) === 'locked') {
      haptics.warning();
      showToast(lockedMessage(t, getLockReason(pathItems, index), locale));
      return;
    }
    haptics.tap();
    if (item.kind === 'lesson') router.push({ pathname: '/lesson/[id]', params: { id } });
    else router.push({ pathname: '/quiz/[id]', params: { id } });
  };

  // ScrollView children are flat so unit banners can be sticky headers.
  const children: ReactElement[] = [];
  const stickyIndices: number[] = [];
  if (!active) children.push(<CourseCompleteCard key="complete" />);
  [...sections, ...upcomingSections].forEach((section, index) => {
    stickyIndices.push(children.length);
    children.push(
      <UnitBanner
        key={`${section.id}-banner`}
        number={section.number}
        title={section.title}
        meta={section.meta}
        progress={section.progress}
      />,
    );
    children.push(
      <View
        key={`${section.id}-path`}
        onLayout={(event) => onPathLayout(section.id, event.nativeEvent.layout.y)}
      >
        <UnitPath
          nodes={section.nodes}
          height={section.height}
          mirrored={section.mirrored}
          mascotMood={section.progress ? (index === 0 ? 'happy' : 'joy') : undefined}
          celebrateId={shownActiveId !== initialActiveId ? shownActiveId : undefined}
          onPressNode={openItem}
        />
      </View>,
    );
  });

  return (
    <View style={styles.screen}>
      <CourseHeader
        topInset={insets.top}
        courseTitle={localize(course.shortTitle, locale)}
        streak={currentStreak(progress, day)}
        streakLitToday={progress.streak.lastActiveDay === day}
        xp={shownXp}
        done={courseProgress.done}
        total={courseProgress.total}
        percent={shownPercent}
      />
      {isOffline ? <OfflineBanner /> : null}
      <ScrollView
        ref={scrollRef}
        stickyHeaderIndices={stickyIndices}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: tabBarInset + space[10] }}
        onLayout={(event) => {
          viewportHeight.current = event.nativeEvent.layout.height;
        }}
      >
        {children}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  completeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    marginTop: space[4],
    marginHorizontal: gutter,
    padding: space[5],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.sunBorder,
    backgroundColor: colors.sunLight,
  },
  completeText: {
    flex: 1,
    gap: space[1],
  },
}));
