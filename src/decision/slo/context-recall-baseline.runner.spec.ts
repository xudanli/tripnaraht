import { runContextRecallBaseline, scoreContextRecallCase } from './context-recall-baseline.runner';
import { CONTEXT_RECALL_BASELINE_CASES } from './context-recall-baseline.cases';

describe('context-recall-baseline.runner', () => {
  it('scores a single case', () => {
    const result = scoreContextRecallCase(CONTEXT_RECALL_BASELINE_CASES[0]);
    expect(result.passed).toBe(true);
    expect(result.recallPct).toBe(100);
  });

  it('runs full baseline report', () => {
    const report = runContextRecallBaseline();
    expect(report.totalCases).toBeGreaterThanOrEqual(5);
    expect(report.recallPct).toBeGreaterThanOrEqual(90);
  });
});
