import type { ExecutionTrace } from '../contracts/execution-trace.types';
import {
  computeInformationGeometrySnapshot,
  discretePathEnergy,
  traceToTrajectory,
} from './information-geometry.util';

describe('information-geometry.util (IGL)', () => {
  it('builds trajectory with ≥2 points and finite path energy', () => {
    const tr: ExecutionTrace = {
      traceId: 't',
      artifactId: 'a',
      decision: {
        mode: 'REUSE',
        kernel: 'REFLEX_KERNEL',
        features: {
          intensity: 0.12,
          entropy: 0.05,
          determinism: 0.93,
          toolDepth: 'NONE',
        },
        toolDepth: 'NONE',
        reuseArtifact: true,
        invalidationScope: 'NONE',
        confidenceGate: 'HIGH',
      },
      engine: 'SYSTEM1',
      steps: [
        {
          stepId: '1',
          type: 'ECPS_EVAL',
          input: {},
          output: {},
          metadata: { latencyMs: 10 },
        },
        {
          stepId: '2',
          type: 'ARTIFACT_READ',
          input: {},
          output: {},
        },
      ],
      provenance: {},
      confidence: {
        score: 0.95,
        band: 'HIGH',
        factors: {
          eligibilityPrior: 1,
          anomalyPenalty: 0,
          timeDecayFactor: 1,
        },
      },
      anomalies: [],
      timestamp: 1,
    };

    const traj = traceToTrajectory(tr);
    expect(traj.states.length).toBe(3);
    expect(discretePathEnergy(traj)).toBeGreaterThanOrEqual(0);

    const snap = computeInformationGeometrySnapshot({ trace: tr });
    expect(snap.schema_version).toBe('igl/v1');
    expect(snap.trajectory_points).toBe(3);
    expect(snap.path_energy).toBe(discretePathEnergy(traj));
    expect(snap.flow_alignment).not.toBeUndefined();
  });
});
