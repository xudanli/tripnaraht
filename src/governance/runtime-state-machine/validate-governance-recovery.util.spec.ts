import { validateGovernanceRecovery } from './validate-governance-recovery.util';

describe('validateGovernanceRecovery (RVL)', () => {
  it('clears to NORMAL when no risks and no halt restrictions', () => {
    const v = validateGovernanceRecovery({
      itineraryDays: [{ items: [{ metadata: { route_segment_ref: 'seg-a' } }] }],
      bannedCorridorRefs: [],
      snapshotActiveRestrictions: ['deny_long_distance_autorouting'],
      activeWorldRiskHints: [],
    });
    expect(v.valid).toBe(true);
    expect(v.recommendedRuntimeState).toBe('NORMAL');
  });

  it('flags banned corridor refs and recommends RECOVERING', () => {
    const v = validateGovernanceRecovery({
      itineraryDays: [{ items: [{ metadata: { route_segment_ref: 'bad' } }] }],
      bannedCorridorRefs: ['bad'],
    });
    expect(v.valid).toBe(false);
    expect(v.remainingRisks.some((r) => r.includes('bad'))).toBe(true);
    expect(v.recommendedRuntimeState).toBe('RECOVERING');
  });

  it('recommends RESTRICTED when halt restriction still on snapshot', () => {
    const v = validateGovernanceRecovery({
      snapshotActiveRestrictions: ['halt_automated_execution'],
    });
    expect(v.valid).toBe(false);
    expect(v.recommendedRuntimeState).toBe('RESTRICTED');
  });
});
