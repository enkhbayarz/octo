import { describe, expect, test } from 'bun:test';

import { tintLottie } from './tint-lottie';

const animation = {
  layers: [
    {
      shapes: [
        { ty: 'fl', c: { a: 0, k: [0, 0, 0, 1] } },
        { ty: 'st', c: { a: 1, k: [{ s: [0, 0, 0] }, { s: [1, 0, 0] }] } },
        { ty: 'tr', c: { a: 0, k: [0, 0, 0] } },
      ],
    },
  ],
};

describe('tintLottie', () => {
  test('recolors static and animated fills and strokes, keeping alpha', () => {
    const tinted = tintLottie(animation, '#FF8000');
    const [fill, stroke, transform] = tinted.layers[0]!.shapes;
    expect(fill!.c.k).toEqual([1, 128 / 255, 0, 1]);
    expect(stroke!.c.k).toEqual([{ s: [1, 128 / 255, 0] }, { s: [1, 128 / 255, 0] }]);
    expect(transform!.c.k).toEqual([0, 0, 0]);
  });

  test('does not mutate the source animation', () => {
    tintLottie(animation, '#FFFFFF');
    expect(animation.layers[0]!.shapes[0]!.c.k).toEqual([0, 0, 0, 1]);
  });
});
