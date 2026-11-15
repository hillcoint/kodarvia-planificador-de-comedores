import { describe, expect, it } from 'vitest';
import { portionsToCook, roundHalfUp } from '../rounding';

describe('briefing rounding rules', () => {
  it('rounds half-up instead of bankers rounding', () => {
    expect(roundHalfUp(4.25, 1)).toBe(4.3);
  });

  it('rounds to six decimals before taking the ceiling', () => {
    expect(portionsToCook(90.69 / 180, 180)).toBe(91);
    expect(portionsToCook(108.0000000002 / 180, 180)).toBe(108);
  });

  it('does not produce portions for a proportion of 0.0000004', () => {
    expect(portionsToCook(0.0000004, 1)).toBe(0);
  });
});
