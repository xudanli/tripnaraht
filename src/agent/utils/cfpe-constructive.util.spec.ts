import type { CausalFieldSnapshot } from '../contracts/multi-agent-causal-field.types';
import { buildExecutionCertificate } from './pccs-ei-certificate.util';
import {
  cfpeClosureSatisfied,
  cfpeContractionAlongPath,
  classifyCfpeSystemTier,
  evaluateCfpeEngineeringWitness,
  shadowContractionEnvelopeConsistent,
} from './cfpe-constructive.util';

const K = {
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

describe('cfpe-constructive.util', () => {
  const sStar = phi(0, 0.5, 0.5);

  it('cfpeContractionAlongPath accepts geometric contraction toward sStar', () => {
    const path = [phi(1, 0.7, 0.5), phi(2, 0.55, 0.5), phi(3, 0.52, 0.5)];
    expect(cfpeContractionAlongPath(path, sStar, 0.99)).toBe(true);
  });

  it('cfpeClosureSatisfied rejects invalid phi', () => {
    expect(cfpeClosureSatisfied(phi(0, 1.5, 0))).toBe(false);
  });

  it('evaluateCfpeEngineeringWitness aggregates constraints', () => {
    const cert = buildExecutionCertificate({
      phiExec: phi(1, 0.52, 0.5),
      phiShadow: phi(1, 0.51, 0.5),
      spclSample: {
        deltaPhiExec: { aggregate_intensity: 0.01 },
        deltaPhiShadow: { aggregate_intensity: 0.01 },
      },
      causalKernel: K,
      execMode: 'EXEC',
    });
    const path = [phi(1, 0.55, 0.5), phi(2, 0.52, 0.5)];
    const w = evaluateCfpeEngineeringWitness(path, sStar, phi(2, 0.52, 0.5), {
      cert,
      lambdaMax: 0.99,
      execPathForEnvelope: [phi(0, 0.6, 0.5), phi(1, 0.55, 0.5)],
      shadowPathForEnvelope: [phi(0, 0.6, 0.5), phi(1, 0.56, 0.5)],
    });
    expect(w.schema).toBe('cfpe/engineering-witness/v1');
    expect(w.repairChannelAvailable).toBe(true);
    expect(classifyCfpeSystemTier(w)).toBeDefined();
  });

  it('shadowContractionEnvelopeConsistent compares path energies', () => {
    const exec = [phi(0, 0.5, 0.5), phi(1, 0.9, 0.9)];
    const shadow = [phi(0, 0.5, 0.5), phi(1, 0.52, 0.52)];
    expect(shadowContractionEnvelopeConsistent(exec, shadow)).toBe(true);
  });
});
