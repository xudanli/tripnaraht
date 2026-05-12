import type { CausalFieldSnapshot } from '../contracts/multi-agent-causal-field.types';
import {
  buildGpmTrajectoryWitness,
  discreteGeodesicEnergy,
  epsilonGeomDualPaths,
  snapshotPhiRmsDistance,
  trajectoriesFromCertificateChain,
  withinGeodesicNeighborhood,
} from './gpm-ei-manifold.util';
import { buildExecutionCertificate } from './pccs-ei-certificate.util';

function phi(ts: number, a: number, b: number): CausalFieldSnapshot {
  return {
    queryId: 'q',
    timeStep: ts,
    particles: [
      { agentId: 'aggregate_intensity', phi: a },
      { agentId: 'aggregate_entropy', phi: b },
    ],
  };
}

describe('gpm-ei-manifold.util', () => {
  it('snapshotPhiRmsDistance is zero for identical snapshots', () => {
    const s = phi(0, 0.5, 0.5);
    expect(snapshotPhiRmsDistance(s, s)).toBe(0);
  });

  it('epsilonGeomDualPaths matches identical paths', () => {
    const p = [phi(0, 0.5, 0.4), phi(1, 0.52, 0.41)];
    expect(epsilonGeomDualPaths(p, p)).toBe(0);
  });

  it('discreteGeodesicEnergy accumulates squared steps', () => {
    const p = [phi(0, 0.5, 0.5), phi(1, 0.6, 0.5)];
    const e = discreteGeodesicEnergy(p);
    expect(e).toBeGreaterThan(0);
  });

  it('buildGpmTrajectoryWitness exposes epsilonGeomRms', () => {
    const exec = [phi(0, 0.7, 0.3), phi(1, 0.71, 0.31)];
    const shadow = [phi(0, 0.7, 0.3), phi(1, 0.75, 0.35)];
    const w = buildGpmTrajectoryWitness(exec, shadow);
    expect(w.schema).toBe('gpm-ei/trajectory-witness/v1');
    expect(w.epsilonGeomRms).toBeGreaterThan(0);
  });

  it('withinGeodesicNeighborhood respects budget', () => {
    const w = buildGpmTrajectoryWitness([phi(0, 0.5, 0.5)], [phi(0, 0.5, 0.5)]);
    expect(withinGeodesicNeighborhood(w, { maxEpsilonGeomRms: 1 })).toBe(true);
  });

  it('trajectoriesFromCertificateChain extracts paths', () => {
    const K = {
      agentOrder: ['aggregate_intensity', 'aggregate_entropy'],
      matrix: [
        [0, 0.1],
        [0.1, 0],
      ],
    };
    const cert = buildExecutionCertificate({
      phiExec: phi(1, 0.6, 0.4),
      phiShadow: phi(1, 0.59, 0.41),
      spclSample: {
        deltaPhiExec: { aggregate_intensity: 0.01 },
        deltaPhiShadow: { aggregate_intensity: 0.02 },
      },
      causalKernel: K,
      execMode: 'EXEC',
    });
    const { execPath, shadowPath } = trajectoriesFromCertificateChain([cert]);
    expect(execPath).toHaveLength(1);
    expect(shadowPath[0]?.particles[0]?.phi).toBeCloseTo(0.59);
  });
});
