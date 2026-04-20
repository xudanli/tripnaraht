import {
  buildConstraintPenaltyCoefficientsFromRetrievalEvidence,
  buildConstraintPenaltyCoefficientsFromRetrievalHints,
  roadTrafficRecencyMultiplier,
} from './retrieval-category-constraint-boost';

describe('buildConstraintPenaltyCoefficientsFromRetrievalHints', () => {
  it('returns empty when no hints', () => {
    expect(buildConstraintPenaltyCoefficientsFromRetrievalHints(undefined)).toEqual({});
    expect(buildConstraintPenaltyCoefficientsFromRetrievalHints([])).toEqual({});
  });

  it('returns empty when only POI-like hints', () => {
    expect(buildConstraintPenaltyCoefficientsFromRetrievalHints(['POI_INFO', 'GEOGRAPHY'])).toEqual({});
  });

  it('boosts default soft lambda when RULES present', () => {
    const c = buildConstraintPenaltyCoefficientsFromRetrievalHints(['POI_INFO', 'RULES']);
    expect(c.__defaultSoft).toBeGreaterThan(0.5);
    expect(c.__defaultSoft).toBeLessThanOrEqual(0.95);
  });

  it('boosts when ROAD_STATUS present', () => {
    const c = buildConstraintPenaltyCoefficientsFromRetrievalHints(['ROAD_STATUS']);
    expect(c.__defaultSoft).toBeGreaterThan(0.5);
  });
});

describe('roadTrafficRecencyMultiplier', () => {
  it('treats missing age as fresh', () => {
    expect(roadTrafficRecencyMultiplier(undefined)).toBe(1);
  });

  it('is 1 within 2 hours', () => {
    expect(roadTrafficRecencyMultiplier(0)).toBe(1);
    expect(roadTrafficRecencyMultiplier(2)).toBe(1);
  });

  it('is 0.3 at or beyond 24 hours', () => {
    expect(roadTrafficRecencyMultiplier(24)).toBeCloseTo(0.3, 5);
    expect(roadTrafficRecencyMultiplier(48)).toBeCloseTo(0.3, 5);
  });

  it('decreases between 2h and 24h', () => {
    const m13 = roadTrafficRecencyMultiplier(13);
    expect(m13).toBeLessThan(1);
    expect(m13).toBeGreaterThan(0.3);
  });
});

describe('buildConstraintPenaltyCoefficientsFromRetrievalEvidence', () => {
  it('applies recency decay for stale ROAD_STATUS', () => {
    const fresh = buildConstraintPenaltyCoefficientsFromRetrievalEvidence([
      { category: 'ROAD_STATUS', ageHours: 1 },
    ]);
    const stale = buildConstraintPenaltyCoefficientsFromRetrievalEvidence([
      { category: 'ROAD_STATUS', ageHours: 24 },
    ]);
    expect(stale.__defaultSoft!).toBeLessThan(fresh.__defaultSoft!);
  });

  it('RULES without road rows keeps full boost', () => {
    const c = buildConstraintPenaltyCoefficientsFromRetrievalEvidence([{ category: 'RULES' }]);
    expect(c.__defaultSoft).toBeGreaterThan(0.5);
  });

  it('uses min decay across multiple road rows', () => {
    const c = buildConstraintPenaltyCoefficientsFromRetrievalEvidence([
      { category: 'ROAD_STATUS', ageHours: 1 },
      { category: 'TRAFFIC_ALERT', ageHours: 20 },
    ]);
    const onlyFresh = buildConstraintPenaltyCoefficientsFromRetrievalEvidence([
      { category: 'ROAD_STATUS', ageHours: 1 },
    ]);
    expect(c.__defaultSoft!).toBeLessThan(onlyFresh.__defaultSoft!);
  });

  /** 场景 A：24h+ 路况 → 衰减 0.3，λ≈0.825×0.25 */
  it('scenario A: stale ROAD_STATUS (~25h) soft-lands lambda toward ~0.25', () => {
    const c = buildConstraintPenaltyCoefficientsFromRetrievalEvidence([
      { category: 'ROAD_STATUS', ageHours: 25 },
    ]);
    expect(c.__defaultSoft).toBeCloseTo(0.825 * 0.3, 3);
  });

  /** 场景 B：RULES 无 recency 衰减，保持高压 */
  it('scenario B: RULES-only keeps full boosted lambda', () => {
    const c = buildConstraintPenaltyCoefficientsFromRetrievalEvidence([{ category: 'RULES' }]);
    expect(c.__defaultSoft).toBeCloseTo(0.825, 5);
  });
});
