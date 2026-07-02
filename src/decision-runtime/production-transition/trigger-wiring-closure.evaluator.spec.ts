import { evaluateTriggerWiringClosure } from './trigger-wiring-closure.evaluator';

describe('evaluateTriggerWiringClosure', () => {
  it('passes when all catalog entries are dispatch', () => {
    const report = evaluateTriggerWiringClosure();
    expect(report.pass).toBe(true);
    expect(report.summary.lineageOnly).toBe(0);
    expect(report.summary.notWired).toBe(0);
    expect(report.summary.dispatchWired).toBe(report.summary.total);
  });
});
