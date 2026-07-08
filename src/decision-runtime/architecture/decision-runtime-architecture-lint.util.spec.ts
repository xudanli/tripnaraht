import { runDecisionRuntimeArchitectureLint } from './decision-runtime-architecture-lint.util';

describe('decision-runtime-architecture-lint.util', () => {
  it('passes legacy boolean + executor bypass checks', () => {
    const report = runDecisionRuntimeArchitectureLint();
    expect(report.legacyBooleanCallerCount).toBe(0);
    expect(report.executorBypassCount).toBe(0);
    expect(report.pass).toBe(true);
    expect(report.agentItineraryPendingCount).toBeGreaterThanOrEqual(0);
  });
});
