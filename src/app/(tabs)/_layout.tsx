import { Tabs } from 'expo-router/js-tabs';
import { NativeTabs } from 'expo-router/native-tabs';

import { GlassTabBar, usesGlassTabBar } from '@/components/glass-tab-bar';
import { LottieIcon } from '@/components/lottie-icon';
import { useT } from '@/i18n';
import { useColors } from '@/theme/theme';
import { fonts } from '@/theme/tokens';

/**
 * Native tab bar on iOS 26 (Liquid Glass). Earlier iOS and Android draw a
 * matching floating capsule instead (GlassTabBar).
 * Lessons and quizzes are pushed on the root stack, so they cover the tabs.
 */
export default function TabsLayout() {
  const colors = useColors();
  const t = useT();

  if (usesGlassTabBar) {
    return (
      <Tabs
        tabBar={(props) => <GlassTabBar {...props} />}
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.paper } }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: t.tabs.home,
            tabBarIcon: ({ focused, color, size }) => (
              // Plays once each time the tab is selected. GlassTabBar passes palette strings.
              <LottieIcon
                name="home"
                color={color as string}
                size={size}
                delay={focused ? 120 : undefined}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: t.tabs.profile,
            tabBarIcon: ({ focused, color, size }) => (
              <LottieIcon
                name="user"
                color={color as string}
                size={size}
                delay={focused ? 120 : undefined}
              />
            ),
          }}
        />
      </Tabs>
    );
  }

  return (
    <NativeTabs
      tintColor={colors.primary}
      labelStyle={{ fontFamily: fonts.semibold }}
      disableTransparentOnScrollEdge
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" />
        <NativeTabs.Trigger.Label>{t.tabs.home}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Icon sf={{ default: 'person', selected: 'person.fill' }} md="person" />
        <NativeTabs.Trigger.Label>{t.tabs.profile}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
