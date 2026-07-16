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
  it('blocks promotion to demo without ACV', () => {
    const msg = guardStagePromotion('sql', 'demo', null);
    expect(msg).toMatch(/ACV/i);
  });
  it('blocks promotion to proposal / negotiation / won / collected without ACV', () => {
    for (const s of ['proposal', 'negotiation', 'won', 'collected'] as const) {
      expect(guardStagePromotion('sql', s, 0)).not.toBeNull();
    }
  });
  it('allows promotion to sql without ACV (discovery stages)', () => {
    expect(guardStagePromotion('mql', 'sql', null)).toBeNull();
  });
  it('allows promotion once ACV is set', () => {
    expect(guardStagePromotion('sql', 'proposal', 12000)).toBeNull();
  });
  it('allows demotion to mql/sql regardless of ACV', () => {
    expect(guardStagePromotion('proposal', 'mql', null)).toBeNull();
    expect(guardStagePromotion('proposal', 'sql', null)).toBeNull();
  });
});
