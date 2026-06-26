import { mapDecisionDnaToMemoryPatch } from './decision-dna-memory.mapper';
import type { DecisionDnaDto } from '../../services/user-profile-learning.service';

describe('decision-dna-memory.mapper', () => {
  it('maps decision_dna into MemoryState v1 patch', () => {
    const dna: DecisionDnaDto = {
      version: 1,
      bias_map: { UPGRADE_TO_DRIVE: 0.15 },
      dominant_alternative: 'UPGRADE_TO_DRIVE',
      rollback_rate: 0.6,
      confidence_score: 0.7,
      last_synced_at: '2026-06-01T00:00:00.000Z',
      traits: { cost_sensitivity: 'HIGH' },
    };
    const patch = mapDecisionDnaToMemoryPatch({
      userId: 'u1',
      dna,
      reason: 'NEGOTIATION_ROLLED_BACK',
      now: new Date('2026-06-01T00:00:00.000Z'),
    });
    expect(patch.decisionDnaRef?.dominantAlternative).toBe('UPGRADE_TO_DRIVE');
    expect(patch.longTermPatch?.['preference.cost_sensitivity']?.provenance.signalTier).toBe(
      'IMPLICIT_WITH_CONSENT',
    );
  });
});
