import Svg, { Circle, Path } from 'react-native-svg';

const STROKE = { fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

const ICONS = {
  check: (color: string) => (
    <Path d="M5 12.5l4.5 4.5L19 7.5" stroke={color} strokeWidth={3.2} {...STROKE} />
  ),
  close: (color: string) => (
    <Path d="M6.5 6.5l11 11M17.5 6.5l-11 11" stroke={color} strokeWidth={3} {...STROKE} />
  ),
  back: (color: string) => <Path d="M15 5l-7 7 7 7" stroke={color} strokeWidth={2.6} {...STROKE} />,
  star: (color: string) => (
    <Path
      fill={color}
      d="M12 2.9l2.7 5.6 6.1.8c.6.1.9.9.4 1.3l-4.5 4.2 1.1 6c.1.7-.6 1.2-1.2.9L12 18.8l-5.4 2.9c-.6.3-1.3-.2-1.2-.9l1.1-6-4.5-4.2c-.5-.4-.2-1.2.4-1.3l6.1-.8z"
    />
  ),
  wifiOff: (color: string) => (
    <>
      <Path
        d="M3 3l18 18M8.6 16.3a4.8 4.8 0 0 1 6.1-.5M5.2 12.8a9.8 9.8 0 0 1 4-2.2M18.8 12.8a9.7 9.7 0 0 0-2.4-1.7M2 9.2a14.8 14.8 0 0 1 4.3-2.8M22 9.2a14.8 14.8 0 0 0-11.3-3.6"
        stroke={color}
        strokeWidth={2.2}
        {...STROKE}
      />
      <Circle cx={12} cy={19.6} r={1.2} fill={color} />
    </>
  ),
  play: (color: string) => (
    <Path
      fill={color}
      d="M7.5 5.6v12.8c0 1.1 1.2 1.8 2.2 1.2l10-6.4c.9-.6.9-1.8 0-2.4l-10-6.4c-1-.6-2.2.1-2.2 1.2z"
    />
  ),
  pause: (color: string) => (
    <Path d="M8 6v12M16 6v12" stroke={color} strokeWidth={3.6} {...STROKE} />
  ),
  replay: (color: string) => (
    <Path
      d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v4h4"
      stroke={color}
      strokeWidth={2.4}
      {...STROKE}
    />
  ),
  // Open rings for the ±5s buttons; the number is drawn in the middle by the caller.
  skipBack: (color: string) => (
    <Path
      d="M4 12a8 8 0 1 0 8-8M14.5 1.5L12 4l2.5 2.5"
      stroke={color}
      strokeWidth={2.2}
      {...STROKE}
    />
  ),
  skipForward: (color: string) => (
    <Path
      d="M20 12a8 8 0 1 1-8-8M9.5 1.5L12 4 9.5 6.5"
      stroke={color}
      strokeWidth={2.2}
      {...STROKE}
    />
  ),
  volume: (color: string) => (
    <>
      <Path
        fill={color}
        d="M3.5 9.8v4.4c0 .6.4 1 1 1h2.8l4 3.4c.6.5 1.7.1 1.7-.8V6.2c0-.9-1.1-1.3-1.7-.8l-4 3.4H4.5c-.6 0-1 .4-1 1z"
      />
      <Path
        d="M16 9a4.2 4.2 0 0 1 0 6M18.8 6.3a8 8 0 0 1 0 11.4"
        stroke={color}
        strokeWidth={2.2}
        {...STROKE}
      />
    </>
  ),
  volumeOff: (color: string) => (
    <>
      <Path
        fill={color}
        d="M3.5 9.8v4.4c0 .6.4 1 1 1h2.8l4 3.4c.6.5 1.7.1 1.7-.8V6.2c0-.9-1.1-1.3-1.7-.8l-4 3.4H4.5c-.6 0-1 .4-1 1z"
      />
      <Path d="M16.5 9.5l5 5M21.5 9.5l-5 5" stroke={color} strokeWidth={2.2} {...STROKE} />
    </>
  ),
  fullscreen: (color: string) => (
    <Path
      d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"
      stroke={color}
      strokeWidth={2.4}
      {...STROKE}
    />
  ),
  fullscreenExit: (color: string) => (
    <Path
      d="M9 4v4a1 1 0 0 1-1 1H4M15 4v4a1 1 0 0 0 1 1h4M20 15h-4a1 1 0 0 0-1 1v4M4 15h4a1 1 0 0 1 1 1v4"
      stroke={color}
      strokeWidth={2.4}
      {...STROKE}
    />
  ),
  sliders: (color: string) => (
    <>
      <Path d="M4 7h9M19 7h1M4 17h1M11 17h9" stroke={color} strokeWidth={2.2} {...STROKE} />
      <Circle cx={16} cy={7} r={2.5} stroke={color} strokeWidth={2.2} fill="none" />
      <Circle cx={8} cy={17} r={2.5} stroke={color} strokeWidth={2.2} fill="none" />
    </>
  ),
  settings: (color: string) => (
    <>
      <Path
        d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
        stroke={color}
        strokeWidth={2}
        {...STROKE}
      />
      <Circle cx={12} cy={12} r={3} stroke={color} strokeWidth={2} fill="none" />
    </>
  ),
} as const;

export type IconName = keyof typeof ICONS;

type IconProps = {
  name: IconName;
  size?: number;
  color: string;
};

/** Static UI glyphs drawn as SVG. Animated icons use `LottieIcon`. */
export function Icon({ name, size = 24, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      {ICONS[name](color)}
    </Svg>
  );
}
