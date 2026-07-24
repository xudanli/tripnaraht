import { SkillEvolverBatchComparatorService } from './skill-evolver-batch-comparator.service';

describe('SkillEvolverBatchComparatorService', () => {
  const svc = new SkillEvolverBatchComparatorService();

  it('compares batches and finds tau+/tau-', () => {
    const baseline = [
      { taskId: 't1', score: 60, taskCompleted: true, trajectoryId: 'a' },
      { taskId: 't2', score: 50, taskCompleted: false, trajectoryId: 'b' },
    ];
    const candidate = [
      { taskId: 't1', score: 70, taskCompleted: true, trajectoryId: 'c' },
      { taskId: 't2', score: 55, taskCompleted: true, trajectoryId: 'd' },
    ];
    const cmp = svc.compareBatches(baseline, candidate);
    expect(cmp.scoreDelta).toBeGreaterThan(0);
    expect(cmp.tauPlus?.score).toBe(70);
    expect(cmp.tauMinus?.score).toBe(50);
    expect(svc.passesGate(cmp, 1).passed).toBe(true);
  });
});
