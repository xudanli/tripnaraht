import {
  expectTravelContextRegressionGatePass,
  runTravelContextRegressionGate,
} from './travel-context-regression-gate.util';

describe('Travel Context Regression Gate (H-P3)', () => {
  it('runs bundled harness cases for release regression', async () => {
    const result = await runTravelContextRegressionGate();
    expectTravelContextRegressionGatePass(result);
    expect(result.caseCount).toBeGreaterThanOrEqual(9);
    expect(result.passedCount).toBe(result.caseCount);
  });
});
