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
