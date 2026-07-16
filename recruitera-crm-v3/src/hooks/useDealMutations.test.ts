import { describe, it, expect } from 'vitest';
import { positionBetween, guardStagePromotion } from './useDealMutations';

describe('positionBetween', () => {
  it('returns the STEP when both neighbours are missing', () => {
    expect(positionBetween(null, null)).toBe(1024);
  });
  it('places above the first row when there is no before neighbour', () => {
    expect(positionBetween(null, 500)).toBeLessThan(500);
  });
  it('appends past the last row when there is no after neighbour', () => {
    expect(positionBetween(500, null)).toBeGreaterThan(500);
  });
  it('splits the interval between two neighbours', () => {
    expect(positionBetween(100, 200)).toBe(150);
  });
  it('keeps subdividing without collision for 20 sequential inserts', () => {
    let before = 0, after = 1024;
    for (let i = 0; i < 20; i++) {
      const p = positionBetween(before, after);
      expect(p).toBeGreaterThan(before);
      expect(p).toBeLessThan(after);
      after = p;
    }
  });
});

describe('guardStagePromotion', () => {
  it('never blocks any transition — ACV is no longer a gate (Won dialog still enforces amount)', () => {
    expect(guardStagePromotion('mql', 'sql', null)).toBeNull();
    expect(guardStagePromotion('sql', 'demo', 0)).toBeNull();
    expect(guardStagePromotion('sql', 'proposal', null)).toBeNull();
    expect(guardStagePromotion('demo', 'won', null)).toBeNull();
    expect(guardStagePromotion('proposal', 'collected', null)).toBeNull();
    expect(guardStagePromotion('proposal', 'mql', null)).toBeNull();
  });
});
