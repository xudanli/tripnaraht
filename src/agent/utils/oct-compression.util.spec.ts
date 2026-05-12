import type { CausalFieldSnapshot, CausalInteractionKernel } from '../contracts/multi-agent-causal-field.types';
import { OCT_UNIVERSE_SCHEMA } from '../contracts/oct.types';
import { buildExecutionCertificate } from './pccs-ei-certificate.util';
import { ecusUniverseState, triadicReplayConsistency } from './ecus-synthesis.util';
import { causalWorldFrom } from './mcut-modal-universe.util';
import {
  buildOntologicalTriple,
  constraintWitnessFromPccsProof,
  octCompressFromEcusTriadic,
  octCompressFromExecutionCertificate,
  octCompressFromExecutionCertificateWithKernel,
  OCT_LAYER_ROLES,
  operatorWitness,
  stateWitness,
} from './oct-compression.util';

const K: CausalInteractionKernel = {
  agentOrder: ['aggregate_intensity', 'aggregate_entropy'],
  matrix: [
    [0, 0.2],
    [0.2, 0],
  ],
};

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

describe('oct-compression.util', () => {
  it('buildOntologicalTriple carries S, O, C', () => {
    const t = buildOntologicalTriple(
      stateWitness(phi(0, 0.5, 0.5)),
      operatorWitness('fp:1', 'EXEC', K),
      { holds: true, obligationsSatisfied: ['X'], violations: [] },
    );
    expect(t.schema).toBe(OCT_UNIVERSE_SCHEMA);
    expect(t.C.holds).toBe(true);
  });

  it('octCompressFromExecutionCertificate projects PCCS into Ω', () => {
    const cert = buildExecutionCertificate({
      phiExec: phi(1, 0.6, 0.4),
      phiShadow: phi(1, 0.59, 0.41),
      spclSample: {
        deltaPhiExec: { aggregate_intensity: 0.01 },
        deltaPhiShadow: { aggregate_intensity: 0.01 },
      },
      causalKernel: K,
      execMode: 'EXEC',
    });
    const omega = octCompressFromExecutionCertificate(cert);
    expect(omega.S.phi.particles[0]?.phi).toBeCloseTo(0.6);
    expect(omega.O.kernelFingerprint).toBeTruthy();
    expect(omega.C.obligationsSatisfied.length).toBeGreaterThanOrEqual(0);
  });

  it('octCompressFromExecutionCertificateWithKernel attaches 𝒪 carrier', () => {
    const cert = buildExecutionCertificate({
      phiExec: phi(0, 0.5, 0.5),
      phiShadow: phi(0, 0.5, 0.5),
      spclSample: {
        deltaPhiExec: { aggregate_intensity: 0 },
        deltaPhiShadow: { aggregate_intensity: 0 },
      },
      causalKernel: K,
      execMode: 'SIMULATE',
    });
    const omega = octCompressFromExecutionCertificateWithKernel(cert, K);
    expect(omega.O.causalKernel?.matrix[0]?.[1]).toBeCloseTo(0.2);
  });

  it('constraintWitnessFromPccsProof copies obligations', () => {
    const c = constraintWitnessFromPccsProof({
      schema: 'pccs-ei/proof/v1',
      holds: false,
      obligationsSatisfied: ['a'],
      violations: ['b'],
      constraintSurface: {
        cmaftNcgesDualConsistency: false,
        spclEpsilonBounded: true,
        cttStateTyping: true,
        residualWellFormed: true,
      },
      proofComplexity: 'FULL',
    });
    expect(c.violations).toContain('b');
  });

  it('OCT_LAYER_ROLES documents projections', () => {
    expect(OCT_LAYER_ROLES.PCCS).toBe('C');
    expect(OCT_LAYER_ROLES.ECUS).toBe('SOC');
  });

  it('octCompressFromEcusTriadic folds ECUS replay into 𝒞', () => {
    const u = ecusUniverseState({ masses: { w: 1 } }, K);
    const anchor = causalWorldFrom('a', phi(0, 0.5, 0.5), K);
    const we = causalWorldFrom('e', phi(1, 0.55, 0.45), K);
    const ws = causalWorldFrom('s', phi(1, 0.54, 0.46), K);
    const tri = triadicReplayConsistency(u, u, anchor, we, ws, {
      beliefL1Tol: 1,
      reachabilityScoreTol: 1,
    });
    const omega = octCompressFromEcusTriadic(phi(1, 0.55, 0.45), u, tri);
    expect(omega.C.holds).toBe(true);
  });
});
