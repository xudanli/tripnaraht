import { SYSTEM1_RUNTIME_BOUNDARY } from './system1-runtime-boundary';

describe('System1 Runtime Boundary freeze', () => {
  it('冻结为 Evidence-aware Query Runtime，并进入验证阶段', () => {
    expect(SYSTEM1_RUNTIME_BOUNDARY.role).toBe('Evidence-aware Query Runtime');
    expect(SYSTEM1_RUNTIME_BOUNDARY.not).toMatch(/Decision Engine/);
    expect(SYSTEM1_RUNTIME_BOUNDARY.stopExpandingFastPaths).toBe(true);
    expect(SYSTEM1_RUNTIME_BOUNDARY.enterValidationPhase).toBe(true);
    expect(SYSTEM1_RUNTIME_BOUNDARY.pipeline).toContain('ClaimPlan');
    expect(SYSTEM1_RUNTIME_BOUNDARY.responsibilities).toHaveLength(8);
    expect(SYSTEM1_RUNTIME_BOUNDARY.never).toEqual(
      expect.arrayContaining([
        'modifies trip state',
        'optimizes itinerary',
        'arbitrates conflicts',
      ]),
    );
    expect(SYSTEM1_RUNTIME_BOUNDARY.validationMetrics).toEqual([
      'Claim Grounding Rate',
      'Evidence Sufficiency Precision',
      'Routing Accuracy',
    ]);
    expect(SYSTEM1_RUNTIME_BOUNDARY.acquisitionBacklog).toEqual(
      expect.arrayContaining(['EvidencePriority', 'SufficiencyEarlyStop']),
    );
  });
});
