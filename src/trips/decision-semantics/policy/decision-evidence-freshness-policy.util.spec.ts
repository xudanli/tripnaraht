import { assessDecisionRepairEvidenceFreshness } from './decision-evidence-freshness-policy.util';

describe('decision-evidence-freshness-policy.util', () => {
  const nowMs = Date.parse('2026-06-30T12:00:00.000Z');

  it('allows fresh road closure evidence', () => {
    const verdict = assessDecisionRepairEvidenceFreshness({
      nowMs,
      proofs: [
        {
          evidenceSource: 'road_feed',
          evidenceType: 'official_closure',
          observedAt: '2026-06-30T11:50:00.000Z',
        },
      ],
    });
    expect(verdict.blocked).toBe(false);
  });

  it('blocks stale road closure evidence with DATA_STALE', () => {
    const verdict = assessDecisionRepairEvidenceFreshness({
      nowMs,
      proofs: [
        {
          evidenceSource: 'road_feed',
          evidenceType: 'official_closure',
          observedAt: '2026-06-30T08:00:00.000Z',
        },
      ],
    });
    expect(verdict.blocked).toBe(true);
    expect(verdict.reasonCode).toBe('DATA_STALE');
    expect(verdict.requiresEvidenceRefresh).toBe(true);
  });
});
