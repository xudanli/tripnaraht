import type { CausalFieldSnapshot, CausalInteractionKernel } from '../contracts/multi-agent-causal-field.types';
import { DEFAULT_CAUSAL_FIELD_DYNAMICS } from './cognitive-execution-pipeline.util';
import { causalOperatorFieldFromKernel } from './coft-ei-operator-field.util';
import { ofdlHelloWorldDualProjection } from './ofdl-runtime.util';
import {
  buildExecutionCertificate,
  classifyPccsSystemTier,
  fingerprintCausalKernel,
  proofRepairNeeded,
  validExecutionCertificate,
} from './pccs-ei-certificate.util';

const K: CausalInteractionKernel = {
  agentOrder: ['aggregate_intensity', 'aggregate_entropy'],
  matrix: [
    [0, 0.35],
    [0.35, 0],
  ],
};

describe('pccs-ei-certificate.util', () => {
  it('buildExecutionCertificate attaches π_proof and Kθ trace', () => {
    const phi: CausalFieldSnapshot = {
      queryId: 'q',
      timeStep: 0,
      particles: [
        { agentId: 'aggregate_intensity', phi: 0.7 },
        { agentId: 'aggregate_entropy', phi: 0.35 },
      ],
    };
    const field = causalOperatorFieldFromKernel(K);
    const dual = ofdlHelloWorldDualProjection(phi, field, DEFAULT_CAUSAL_FIELD_DYNAMICS, 'EXEC');
    const cert = buildExecutionCertificate({
      phiExec: dual.phiExec,
      phiShadow: dual.phiShadow,
      spclSample: dual.spclSample,
      causalKernel: K,
      execMode: 'EXEC',
      options: { spclMaxAbsEpsilon: 10 },
    });
    expect(cert.schema).toBe('pccs-ei/execution-certificate/v1');
    expect(cert.piProof.schema).toBe('pccs-ei/proof/v1');
    expect(cert.kThetaTrace.kernelFingerprint).toBe(fingerprintCausalKernel(K));
    expect(cert.kThetaTrace.shadowMode).toBe('SHADOW');
    expect(cert.epsilon.l2Norm).toBeGreaterThanOrEqual(0);
  });

  it('validExecutionCertificate follows piProof.holds', () => {
    const phi = {
      queryId: 'q',
      timeStep: 0,
      particles: [{ agentId: 'a', phi: NaN }],
    } as CausalFieldSnapshot;
    const cert = buildExecutionCertificate({
      phiExec: phi,
      phiShadow: phi,
      spclSample: { deltaPhiExec: { a: 0 }, deltaPhiShadow: { a: 0 } },
      causalKernel: K,
      execMode: 'EXEC',
    });
    expect(validExecutionCertificate(cert)).toBe(false);
    expect(proofRepairNeeded(cert)).toBe(true);
  });

  it('classifyPccsSystemTier maps SHORT proof to SYSTEM1 when holds', () => {
    const phi: CausalFieldSnapshot = {
      queryId: 'q',
      timeStep: 0,
      particles: [
        { agentId: 'aggregate_intensity', phi: 0.5 },
        { agentId: 'aggregate_entropy', phi: 0.5 },
      ],
    };
    const field = causalOperatorFieldFromKernel(K);
    const dual = ofdlHelloWorldDualProjection(phi, field, DEFAULT_CAUSAL_FIELD_DYNAMICS, 'SIMULATE');
    const cert = buildExecutionCertificate({
      phiExec: dual.phiExec,
      phiShadow: dual.phiShadow,
      spclSample: dual.spclSample,
      causalKernel: K,
      execMode: 'SIMULATE',
      options: { spclMaxAbsEpsilon: 10 },
    });
    if (cert.piProof.holds && cert.piProof.proofComplexity === 'SHORT') {
      expect(classifyPccsSystemTier(cert)).toBe('SYSTEM1');
    }
  });
});
