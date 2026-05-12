import type { ECPSRuntimeBias } from '../contracts/policy-correction.types';
import {
  GlobalSpclRingBuffer,
  applyGlobalSpclToBias,
  mergeSpclErrorsAcrossSamples,
} from './global-spcl-optimizer.util';

describe('global-spcl-optimizer.util', () => {
  it('mergeSpclErrorsAcrossSamples averages ε across observations', () => {
    const m = mergeSpclErrorsAcrossSamples([
      {
        deltaPhiExec: { a: 1 },
        deltaPhiShadow: { a: 0 },
      },
      {
        deltaPhiExec: { a: 0 },
        deltaPhiShadow: { a: 0 },
      },
    ]);
    expect(m.epsilonByAgent.a).toBeCloseTo(0.5);
  });

  it('GlobalSpclRingBuffer applies aggregated update', () => {
    const buf = new GlobalSpclRingBuffer(16);
    buf.push({ deltaPhiExec: { x: 1 }, deltaPhiShadow: { x: 0 } });
    buf.push({ deltaPhiExec: { x: 0.5 }, deltaPhiShadow: { x: 0.5 } });
    const base: ECPSRuntimeBias = {
      system1BiasAdjustment: 0,
      replayThresholdShift: 0,
      anomalyPenaltyWeight: 1,
    };
    const { next, applied } = applyGlobalSpclToBias(base, buf, { eta: 0.1 });
    expect(applied).toBe(true);
    expect(next.anomalyPenaltyWeight).not.toBe(base.anomalyPenaltyWeight);
  });
});
