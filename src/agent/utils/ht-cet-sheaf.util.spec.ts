import type { CausalFieldSnapshot } from '../contracts/multi-agent-causal-field.types';
import {
  admitsGlobalSectionStub,
  buildCausalSheafBundle,
  checkSheafPatchConsistency,
  cohomologyObstructionDigest,
  execShadowGluingResidual,
} from './ht-cet-sheaf.util';
import { buildExecutionCertificate } from './pccs-ei-certificate.util';
import { buildGpmTrajectoryWitness } from './gpm-ei-manifold.util';

function phi(a: number, b: number): CausalFieldSnapshot {
  return {
    queryId: 'q',
    timeStep: 0,
    particles: [
      { agentId: 'aggregate_intensity', phi: a },
      { agentId: 'aggregate_entropy', phi: b },
    ],
  };
}

describe('ht-cet-sheaf.util', () => {
  it('checkSheafPatchConsistency is zero for identical overlaps', () => {
    const p = phi(0.5, 0.4);
    const w = checkSheafPatchConsistency(
      [
        { siteId: 's1', phi: p },
        { siteId: 's2', phi: p },
      ],
      1e-9,
    );
    expect(w.gluingResidualMax).toBe(0);
    expect(w.locallyGluable).toBe(true);
  });

  it('admitsGlobalSectionStub fails on mismatched lattices', () => {
    const b = buildCausalSheafBundle([
      { siteId: 'a', phi: phi(0.5, 0.5) },
      {
        siteId: 'b',
        phi: {
          queryId: 'q',
          timeStep: 0,
          particles: [{ agentId: 'only', phi: 1 }],
        },
      },
    ]);
    expect(admitsGlobalSectionStub(b, 0.01)).toBe(false);
  });

  it('cohomologyObstructionDigest collapses when ε tiny', () => {
    const d = cohomologyObstructionDigest({
      epsilonByAgent: {},
      l2Norm: 1e-9,
      maxAbsEpsilon: 0,
    });
    expect(d.collapsesToZero).toBe(true);
  });

  it('execShadowGluingResidual combines PCCS and GPM', () => {
    const K = {
      agentOrder: ['aggregate_intensity', 'aggregate_entropy'],
      matrix: [
        [0, 0.1],
        [0.1, 0],
      ],
    };
    const cert = buildExecutionCertificate({
      phiExec: phi(0.6, 0.4),
      phiShadow: phi(0.59, 0.41),
      spclSample: {
        deltaPhiExec: { aggregate_intensity: 0.01 },
        deltaPhiShadow: { aggregate_intensity: 0 },
      },
      causalKernel: K,
      execMode: 'EXEC',
    });
    const gpm = buildGpmTrajectoryWitness([phi(0.5, 0.5)], [phi(0.55, 0.55)]);
    const r = execShadowGluingResidual(cert, gpm);
    expect(r).toBeGreaterThanOrEqual(cert.epsilon.l2Norm);
  });
});
