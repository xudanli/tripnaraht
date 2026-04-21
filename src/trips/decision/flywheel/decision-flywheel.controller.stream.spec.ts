jest.setTimeout(60000);

import { DecisionFlywheelController } from './decision-flywheel.controller';
import { ParallelDecisionKernelService } from '../../../decision/kernel/parallel-decision-kernel.service';
import { DecisionAuditService } from './decision-audit.service';
import { InterventionEngine } from '../../../decision/actuator/intervention-engine';

class FakeRes {
  headers: Record<string, string> = {};
  chunks: string[] = [];
  ended = false;
  setHeader(k: string, v: string) {
    this.headers[k] = v;
  }
  write(s: string) {
    this.chunks.push(s);
  }
  end() {
    this.ended = true;
  }
  flushHeaders() {
    // noop
  }
}

describe('DecisionFlywheelController (stream)', () => {
  it('predict-stream emits SUMMARY then DIAGNOSTICS', async () => {
    const kernelSvc = new ParallelDecisionKernelService();
    const audit = {
      getRecentSignals: jest.fn().mockResolvedValue([]),
      logRiskFeedback: jest.fn(),
      logShadowDecision: jest.fn(),
      updateConsensusEmergency: jest.fn().mockResolvedValue({ isEmergency: false, state: { isEmergency: false } }),
    } as any as DecisionAuditService;
    const ctrl = new DecisionFlywheelController(kernelSvc, audit, new InterventionEngine());
    const res = new FakeRes() as any;

    const samples = Array.from({ length: 20 }).map((_, i) => ({
      sampleId: `s${i}`,
      weight: 1,
      environmentSummary: { weatherRisk: i < 2 ? 0.95 : 0.2 },
    }));
    const edges = [
      {
        edge: {
          id: 'e1',
          from: 'A',
          to: 'B',
          travel_time: 5,
          road_open: 1,
          exposure: 1,
          surface_type: 'mud',
          water_crossing_depth_cm: 80,
          f_road_level: 'F208',
        },
      },
    ];

    await ctrl.predictStream(
      {
        samples: samples as any,
        edges: edges as any,
        envDefaults: { weatherRisk01: 0.2, windSpeedMs: 18.2 },
        alpha: 0.95,
        beta: 0.5,
        targetReducedN: 10,
        topMEdges: 1,
        context: { userId: 'u1', region: 'Iceland_South', countryCode: 'IS', month: 4, vehicleClass: 'SUV' },
      },
      res,
    );

    const out = res.chunks.join('');
    expect(out).toMatch(/"stage":"SUMMARY"/);
    expect(out).toMatch(/"stage":"DIAGNOSTICS"/);
    expect(res.ended).toBe(true);
    await kernelSvc.kernel.close();
  }, 60000);

  it('shadowMode records emergency decision but does not cut off stream', async () => {
    const kernelSvc = new ParallelDecisionKernelService();
    const audit = {
      getRecentSignals: jest.fn().mockResolvedValue([]),
      logRiskFeedback: jest.fn(),
      logShadowDecision: jest.fn().mockResolvedValue({ id: 'shadow-1' }),
      updateConsensusEmergency: jest.fn().mockResolvedValue({
        isEmergency: true,
        reason: '[紧急] Shadow consensus emergency.',
        state: { isEmergency: true },
      }),
    } as any as DecisionAuditService;
    const ctrl = new DecisionFlywheelController(kernelSvc, audit, new InterventionEngine());
    const res = new FakeRes() as any;

    const samples = Array.from({ length: 20 }).map((_, i) => ({
      sampleId: `s${i}`,
      weight: 1,
      environmentSummary: { weatherRisk: i < 2 ? 0.95 : 0.2 },
    }));
    const edges = [
      {
        edge: {
          id: 'e1',
          from: 'A',
          to: 'B',
          travel_time: 5,
          road_open: 1,
          exposure: 1,
          surface_type: 'mud',
          water_crossing_depth_cm: 80,
          f_road_level: 'F208',
        },
      },
    ];

    await ctrl.predictStream(
      {
        shadowMode: true,
        samples: samples as any,
        edges: edges as any,
        envDefaults: { weatherRisk01: 0.2, windSpeedMs: 18.2 },
        alpha: 0.95,
        beta: 0.5,
        targetReducedN: 10,
        topMEdges: 1,
        context: { userId: 'u1', region: 'Iceland_South', countryCode: 'IS', month: 4, vehicleClass: 'SUV' },
      },
      res,
    );

    const out = res.chunks.join('');
    expect(out).toMatch(/"stage":"SUMMARY"/);
    expect(out).toMatch(/"stage":"DIAGNOSTICS"/);
    expect(out).toMatch(/\[SHADOW\]/);
    expect(audit.logShadowDecision).toHaveBeenCalled();
    expect(audit.logShadowDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          payloadVersion: 2,
          trace: expect.objectContaining({ schemaVersion: 1, context: expect.any(Object) }),
        }),
      }),
    );
    await kernelSvc.kernel.close();
  }, 60000);
});

