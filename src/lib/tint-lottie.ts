/**
 * Iconly's animated icons ship in black. This returns a copy of a Lottie JSON
 * with every fill and stroke color replaced, so one icon file can be used in
 * any color from the design tokens.
 */

type Json = unknown;

function hexToUnitRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

function isColorArray(value: Json): value is number[] {
  return (
    Array.isArray(value) &&
    (value.length === 3 || value.length === 4) &&
    value.every((n) => typeof n === 'number')
  );
}

function recolor(color: number[], rgb: [number, number, number]): number[] {
  return color.length === 4 ? [...rgb, color[3] ?? 1] : [...rgb];
}

function tintShapeColor(colorProp: Record<string, Json>, rgb: [number, number, number]) {
  const keyframes = colorProp.k;
  if (isColorArray(keyframes)) {
    colorProp.k = recolor(keyframes, rgb);
  } else if (Array.isArray(keyframes)) {
    for (const frame of keyframes) {
      if (frame && typeof frame === 'object') {
        const record = frame as Record<string, Json>;
        if (isColorArray(record.s)) record.s = recolor(record.s, rgb);
        if (isColorArray(record.e)) record.e = recolor(record.e, rgb);
      }
    }
  }
}

function walk(node: Json, rgb: [number, number, number]) {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, rgb);
    return;
  }
  if (!node || typeof node !== 'object') return;

  const record = node as Record<string, Json>;
  const isPaint = record.ty === 'fl' || record.ty === 'st' || record.ty === 'gf';
  if (isPaint && record.c && typeof record.c === 'object') {
    tintShapeColor(record.c as Record<string, Json>, rgb);
  }
  for (const value of Object.values(record)) walk(value, rgb);
}

export function tintLottie<T extends object>(animation: T, hex: string): T {
  const copy = structuredClone(animation);
  walk(copy, hexToUnitRgb(hex));
  return copy;
}
