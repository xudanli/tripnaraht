import { GlobalSpclRingBuffer } from '../utils/global-spcl-optimizer.util';
import { EcpsRuntimeBiasService } from './ecps-runtime-bias.service';

describe('EcpsRuntimeBiasService', () => {
  it('applySpclCalibration nudges bias from shadow vs exec error', () => {
    const svc = new EcpsRuntimeBiasService();
    const before = svc.getBias();
    svc.applySpclCalibration(
      {
        deltaPhiExec: { aggregate_intensity: 0.9 },
        deltaPhiShadow: { aggregate_intensity: 0.2 },
      },
      { eta: 0.08 },
    );
    const after = svc.getBias();
    expect(after.anomalyPenaltyWeight).not.toBe(before.anomalyPenaltyWeight);
  });

  it('applyGlobalSpclBuffer aggregates cross-request and clears on apply', () => {
    const svc = new EcpsRuntimeBiasService();
    const buf = new GlobalSpclRingBuffer(8);
    buf.push({ deltaPhiExec: { a: 1 }, deltaPhiShadow: { a: 0 } });
    buf.push({ deltaPhiExec: { a: 0 }, deltaPhiShadow: { a: 0.5 } });
    const r = svc.applyGlobalSpclBuffer(buf, { eta: 0.1 });
    expect(r.sampleCount).toBe(2);
    expect(r.applied).toBe(true);
    expect(buf.length()).toBe(0);
  });
});
