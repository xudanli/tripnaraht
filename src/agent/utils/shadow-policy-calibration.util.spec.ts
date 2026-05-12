import type { ECPSRuntimeBias } from '../contracts/policy-correction.types';
import {
  applySpclCalibrationStep,
  computeSpclError,
  meanEpsilon,
  spclRuntimeBiasDelta,
} from './shadow-policy-calibration.util';

describe('shadow-policy-calibration.util (SPCL)', () => {
  it('computeSpclError subtracts shadow from exec', () => {
    const e = computeSpclError({
      deltaPhiExec: { a: 1, b: 0 },
      deltaPhiShadow: { a: 0.8, b: 0.2 },
    });
    expect(e.epsilonByAgent.a).toBeCloseTo(0.2);
    expect(e.epsilonByAgent.b).toBeCloseTo(-0.2);
    expect(e.l2Norm).toBeGreaterThan(0);
  });

  it('zero error yields empty bias delta', () => {
    const e = computeSpclError({
      deltaPhiExec: { x: 0.5 },
      deltaPhiShadow: { x: 0.5 },
    });
    const d = spclRuntimeBiasDelta(e);
    expect(d.replayThresholdShift ?? 0).toBe(0);
  });

  it('applySpclCalibrationStep updates bias', () => {
    const base: ECPSRuntimeBias = {
      system1BiasAdjustment: 0,
      replayThresholdShift: 0,
      anomalyPenaltyWeight: 1,
    };
    const next = applySpclCalibrationStep(
      base,
      {
        deltaPhiExec: { n: 0.9 },
        deltaPhiShadow: { n: 0.2 },
      },
      { eta: 0.1 },
    );
    expect(next.anomalyPenaltyWeight).not.toBe(base.anomalyPenaltyWeight);
  });

  it('meanEpsilon aggregates direction', () => {
    const b = computeSpclError({
      deltaPhiExec: { a: 1 },
      deltaPhiShadow: { a: 0 },
    });
    expect(meanEpsilon(b)).toBeCloseTo(1);
  });
});
