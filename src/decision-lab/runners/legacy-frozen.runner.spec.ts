import { LegacyFrozenLabRunner } from './legacy-frozen.runner';

describe('LegacyFrozenLabRunner', () => {
  it('runs legacy-frozen on iceland minimal fixture', async () => {
    const runner = new LegacyFrozenLabRunner();
    const problem = runner.buildIcelandMinimalProblem('lab_test_trip');
    const record = await runner.run(problem, {
      runId: 'run1',
      seed: 42,
      fixtureId: 'iceland_guide_minimal_v1',
      snapshotId: problem.snapshotId,
      startedAt: new Date().toISOString(),
    });

    expect(record.strategyId).toBe('legacy-frozen');
    expect(record.result.hasIncumbent).toBe(true);
    expect(record.result.recommendedCandidateId).toBe('balanced');
    expect(record.result.feasibilityStatus).toBe('FEASIBLE');
  });
});
