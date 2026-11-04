import { Pressable, Share, Switch, View } from 'react-native';

import { showToast } from '@/components/toast';
import { AppText } from '@/components/ui/app-text';
import { useT } from '@/i18n';
import { haptics } from '@/lib/haptics';
import {
  registerForPushAsync,
  requestPermission,
  sendTestNotification,
} from '@/notifications/notifications';
import { REMINDER_HOURS } from '@/notifications/reminder-plan';
import { useProgress } from '@/progress/store';
import { type LanguagePreference, type ThemePreference, useSettings } from '@/settings/store';
import { makeStyles, useColors } from '@/theme/theme';
import { controlHeight, radius, space } from '@/theme/tokens';

const formatHour = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

type SegmentsProps<T> = {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
};

function Segments<T extends string | number>({ options, value, onChange }: SegmentsProps<T>) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <View style={styles.segments} accessibilityRole="radiogroup">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => {
              haptics.tap();
              onChange(option.value);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            <AppText
              variant="label"
              weight={selected ? 'bold' : 'semibold'}
              color={selected ? colors.ink : colors.muted}
              tabular
            >
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Language, appearance, sound and reminders. Device preferences, so resetting progress keeps them. */
export function SettingsCard() {
  const styles = useStyles();
  const colors = useColors();
  const t = useT();
  const settings = useSettings();
  const learnerName = useProgress((state) => state.learnerName);

  // Language names are written in their own language, so anyone can find theirs.
  const languages: { value: LanguagePreference; label: string }[] = [
    { value: 'system', label: t.settings.system },
    { value: 'mn', label: 'Монгол' },
    { value: 'en', label: 'English' },
  ];
  const themes: { value: ThemePreference; label: string }[] = [
    { value: 'system', label: t.settings.system },
    { value: 'light', label: t.settings.light },
    { value: 'dark', label: t.settings.dark },
  ];

  const toggleReminders = async (on: boolean) => {
    if (!on) {
      settings.setReminders(false);
      return;
    }
    if (!(await requestPermission(t.notifications))) {
      haptics.warning();
      showToast(t.settings.permissionDenied, 'lock-3');
      return;
    }
    haptics.success();
    settings.setReminders(true);
    // Remote push needs a real device and an EAS project; quietly skipped otherwise.
    const token = await registerForPushAsync();
    if (token) settings.setPushToken(token);
  };

  const switchColors = {
    trackColor: { true: colors.primary, false: colors.lockDark },
    thumbColor: colors.white,
    ios_backgroundColor: colors.lockDark,
  };

  return (
    <View style={styles.card}>
      <AppText variant="label" color={colors.inkSoft}>
        {t.settings.language}
      </AppText>
      <Segments options={languages} value={settings.language} onChange={settings.setLanguage} />

      <AppText variant="label" color={colors.inkSoft} style={styles.label}>
        {t.settings.appearance}
      </AppText>
      <Segments options={themes} value={settings.theme} onChange={settings.setTheme} />

      <View style={styles.switchRow}>
        <View style={styles.switchText}>
          <AppText variant="label" weight="semibold">
            {t.settings.sound}
          </AppText>
          <AppText variant="caption" weight="medium" color={colors.muted}>
            {t.settings.soundHint}
          </AppText>
        </View>
        <Switch
          value={settings.sound}
          onValueChange={settings.setSound}
          accessibilityLabel={t.settings.sound}
          {...switchColors}
        />
      </View>

      <View style={styles.switchRow}>
        <View style={styles.switchText}>
          <AppText variant="label" weight="semibold">
            {t.settings.reminders}
          </AppText>
          <AppText variant="caption" weight="medium" color={colors.muted}>
            {settings.reminders
              ? t.settings.remindersOn(formatHour(settings.reminderHour))
              : t.settings.remindersOff}
          </AppText>
        </View>
        <Switch
          value={settings.reminders}
          onValueChange={toggleReminders}
          accessibilityLabel={t.settings.reminders}
          {...switchColors}
        />
      </View>

      {settings.reminders ? (
        <>
          <Segments
            options={REMINDER_HOURS.map((hour) => ({ value: hour, label: formatHour(hour) }))}
            value={settings.reminderHour}
            onChange={settings.setReminderHour}
          />
          {__DEV__ ? (
            <Pressable
              onPress={() => {
                haptics.tap();
                sendTestNotification(learnerName, t.notifications).then(
                  () => showToast(t.settings.testScheduled, 'calendar'),
                  () => {},
                );
              }}
              accessibilityRole="button"
              style={({ pressed }) => [styles.link, pressed && styles.linkPressed]}
            >
              <AppText variant="label" weight="semibold" color={colors.primaryText}>
                {t.settings.sendTest}
              </AppText>
            </Pressable>
          ) : null}
          {settings.pushToken ? (
            <Pressable
              onPress={() => Share.share({ message: settings.pushToken ?? '' })}
              accessibilityRole="button"
              style={({ pressed }) => [styles.link, pressed && styles.linkPressed]}
            >
              <AppText variant="label" weight="semibold" color={colors.primaryText}>
                {t.settings.sharePushToken}
              </AppText>
            </Pressable>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: {
    padding: space[5],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  label: {
    marginTop: space[4],
  },
  segments: {
    flexDirection: 'row',
    gap: space[1],
    marginTop: space[2],
    padding: space[1],
    borderRadius: radius.full,
    backgroundColor: colors.soft,
  },
  segment: {
    flex: 1,
    height: controlHeight.control,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
  },
  segmentSelected: {
    backgroundColor: colors.card,
    boxShadow: `0 1px 3px ${colors.shadow}`,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    marginTop: space[4],
  },
  switchText: {
    flex: 1,
  },
  link: {
    minHeight: controlHeight.control,
    justifyContent: 'center',
    marginTop: space[2],
    paddingHorizontal: space[3],
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
  linkPressed: {
    backgroundColor: colors.primaryLight,
  },
}));
