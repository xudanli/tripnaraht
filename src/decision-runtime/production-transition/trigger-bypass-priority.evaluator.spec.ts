import { evaluateTriggerBypassPriority } from './trigger-bypass-priority.evaluator';

describe('evaluateTriggerBypassPriority', () => {
  it('ranks lineage_only entries with static priority when no metrics', () => {
    const report = evaluateTriggerBypassPriority();
    expect(report.bypassCount).toBe(0);
    expect(report.topWireTargets).toHaveLength(0);
    expect(report.metricsSource).toBe('none');
  });

  it('ignores production metrics when no bypass candidates remain', () => {
    const report = evaluateTriggerBypassPriority({
      entries: [{ entryId: 'agent.route-and-run', requestCount30d: 50000 }],
    });
    expect(report.bypassCount).toBe(0);
    expect(report.ranked).toHaveLength(0);
    expect(report.metricsSource).toBe('artifact');
  });
});
