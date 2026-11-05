import { Modal, Pressable, View } from 'react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { useT } from '@/i18n';
import { haptics } from '@/lib/haptics';
import { makeStyles, useColors } from '@/theme/theme';
import { controlHeight, gutter, radius, space } from '@/theme/tokens';

import { formatSpeed, SPEEDS } from './player-controls';

type VideoSettingsSheetProps = {
  visible: boolean;
  onClose: () => void;
  speed: number;
  onSpeed: (speed: number) => void;
  /** Rendition heights, best first; empty hides the quality section. */
  qualities: number[];
  /** The chosen cap, or null for automatic. */
  quality: number | null;
  /** What's playing right now, shown next to "Auto". */
  playingHeight: number | null;
  onQuality: (height: number | null) => void;
};

/** Playback speed and video quality, in a bottom sheet over the lesson. */
export function VideoSettingsSheet({
  visible,
  onClose,
  speed,
  onSpeed,
  qualities,
  quality,
  playingHeight,
  onQuality,
}: VideoSettingsSheetProps) {
  const styles = useStyles();
  const colors = useColors();
  const t = useT();
  const insets = useSafeAreaInsets();

  const pick = (apply: () => void) => {
    haptics.tap();
    apply();
  };

  const qualityRows = [
    {
      key: 'auto',
      value: null,
      label: playingHeight ? t.player.autoNow(playingHeight) : t.player.auto,
    },
    ...qualities.map((height, index) => ({
      key: String(height),
      value: height,
      label: `${height}p`,
      note: index === qualities.length - 1 && qualities.length > 1 ? t.player.dataSaver : undefined,
    })),
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t.player.done}
      />
      <Animated.View
        entering={SlideInDown.duration(260)}
        style={[styles.sheet, { paddingBottom: insets.bottom + space[4] }]}
      >
        <View style={styles.grabber} />
        <AppText variant="heading">{t.player.settings}</AppText>

        <AppText variant="caption" color={colors.muted} style={styles.section}>
          {t.player.speed}
        </AppText>
        <View style={styles.chips}>
          {SPEEDS.map((option) => {
            const selected = option === speed;
            return (
              <Pressable
                key={option}
                onPress={() => pick(() => onSpeed(option))}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={option === 1 ? t.player.normalSpeed : formatSpeed(option)}
                style={({ pressed }) => [
                  styles.chip,
                  selected && styles.chipSelected,
                  pressed && styles.pressed,
                ]}
              >
                <AppText
                  variant="label"
                  weight="semibold"
                  color={selected ? colors.white : colors.ink}
                  tabular
                >
                  {formatSpeed(option)}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        {qualities.length > 0 ? (
          <>
            <AppText variant="caption" color={colors.muted} style={styles.section}>
              {t.player.quality}
            </AppText>
            <View style={styles.list}>
              {qualityRows.map((row, index) => {
                const selected = row.value === quality;
                return (
                  <Pressable
                    key={row.key}
                    onPress={() => pick(() => onQuality(row.value))}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    style={({ pressed }) => [
                      styles.row,
                      index === qualityRows.length - 1 && styles.lastRow,
                      pressed && styles.pressed,
                    ]}
                  >
                    <AppText weight={selected ? 'semibold' : 'medium'}>{row.label}</AppText>
                    {'note' in row && row.note ? (
                      <AppText variant="label" color={colors.muted} style={styles.note}>
                        {row.note}
                      </AppText>
                    ) : (
                      <View style={styles.note} />
                    )}
                    {selected ? <Icon name="check" color={colors.primary} size={20} /> : null}
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}
      </Animated.View>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
  backdrop: {
    flex: 1,
    backgroundColor: colors.shadow,
  },
  sheet: {
    paddingHorizontal: gutter,
    paddingTop: space[3],
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    backgroundColor: colors.card,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: radius.full,
    marginBottom: space[4],
    backgroundColor: colors.line,
  },
  section: {
    marginTop: space[5],
    marginBottom: space[2],
    letterSpacing: 0.7,
  },
  chips: {
    flexDirection: 'row',
    gap: space[1],
  },
  chip: {
    flex: 1,
    height: controlHeight.control,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.soft,
  },
  chipSelected: {
    backgroundColor: colors.primary,
  },
  list: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  row: {
    minHeight: controlHeight.control + space[2],
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingHorizontal: space[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  lastRow: {
    borderBottomWidth: 0,
  },
  note: {
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
  },
}));
