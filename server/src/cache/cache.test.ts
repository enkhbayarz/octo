import { describe, expect, test } from 'vitest';

import { jitteredTtl } from './cache.js';

describe('jitteredTtl', () => {
  test('spreads expiry ±10% so keys written together expire apart', () => {
    expect(jitteredTtl(600, () => 0)).toBe(540);
    expect(jitteredTtl(600, () => 0.5)).toBe(600);
    expect(jitteredTtl(600, () => 1)).toBe(660);
  });

  test('never drops to zero (which would mean "no expiry" mistakes)', () => {
    expect(jitteredTtl(1, () => 0)).toBe(1);
  });
});
