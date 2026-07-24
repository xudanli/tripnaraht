import { LegacyRfc001ComparatorService } from './legacy-rfc001-comparator.service';
import type { ShadowDecisionSnapshot } from './shadow-decision-snapshot.types';

describe('LegacyRfc001ComparatorService (WP1)', () => {
  const comparator = new LegacyRfc001ComparatorService();

  const baseLegacy: ShadowDecisionSnapshot = {
    source: 'legacy',
    finalAction: 'ALLOW',
    allowed: true,
    hardBlockOnOriginal: false,
    affectedPlanItemIds: ['item-1'],
    candidateIds: [],
    reasonCodes: [],
    hasPlanMutation: false,
    latencyMs: 10,
  };

  const baseRfc: ShadowDecisionSnapshot = {
    source: 'rfc001',
    finalAction: 'DEFER_TO_HUMAN',
    allowed: true,
    hardBlockOnOriginal: true,
    affectedPlanItemIds: ['item-1'],
    candidateIds: ['cand_a', 'cand_b', 'cand_c'],
    selectedCandidateId: 'cand_a',
    reasonCodes: ['HUMAN_CONFIRMATION_REQUIRED'],
    hasPlanMutation: true,
    latencyMs: 25,
  };

  it('classifies RFC_PREFERRED when RFC blocks original and legacy does not', () => {
    const result = comparator.compare({
      tripId: 'trip-1',
      eventId: 'evt-1',
      legacy: baseLegacy,
      rfc001: baseRfc,
    });
    expect(result.diff.kind).toBe('RFC_PREFERRED');
    expect(result.metrics.hardBlockAgreement).toBe(false);
    expect(result.metrics.affectedScopeAgreement).toBe(true);
  });

  it('classifies INPUT_INCONSISTENCY when affected scope differs', () => {
    const result = comparator.compare({
      tripId: 'trip-1',
      eventId: 'evt-1',
      legacy: baseLegacy,
      rfc001: { ...baseRfc, affectedPlanItemIds: ['item-2'] },
    });
    expect(result.diff.kind).toBe('INPUT_INCONSISTENCY');
  });

  it('aggregate computes agreement rates', () => {
    const r1 = comparator.compare({
      tripId: 't',
      eventId: 'e1',
      legacy: baseLegacy,
      rfc001: baseRfc,
    });
    const r2 = comparator.compare({
      tripId: 't',
      eventId: 'e2',
      legacy: { ...baseLegacy, hardBlockOnOriginal: true, allowed: false, finalAction: 'REJECT' },
      rfc001: baseRfc,
    });
    const agg = comparator.aggregate([r1, r2]);
    expect(agg.sampleCount).toBe(2);
    expect(agg.hardBlockAgreementRate).toBe(0.5);
    expect(agg.diffKindCounts.RFC_PREFERRED).toBe(1);
  });
});
