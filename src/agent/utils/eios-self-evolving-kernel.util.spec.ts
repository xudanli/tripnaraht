import { runEiosKernelTick } from './eios-self-evolving-kernel.util';
import { EIOS_KERNEL_TICK_SCHEMA } from '../contracts/eios-kernel.types';

function decision() {
  return {
    mode: 'RECOMPUTE' as const,
    kernel: 'REASONING_KERNEL' as const,
    features: {
      intensity: 0.7,
      entropy: 0.35,
      determinism: 0.5,
      toolDepth: 'HIGH' as const,
    },
    toolDepth: 'HIGH' as const,
    reuseArtifact: false,
    invalidationScope: 'FULL' as const,
    confidenceGate: 'LOW' as const,
  };
}

describe('eios-self-evolving-kernel.util', () => {
  it('runEiosKernelTick returns composed tick with SPCL error', () => {
    const r = runEiosKernelTick({ decision: decision(), queryId: 'q1' });
    expect(r.schema).toBe(EIOS_KERNEL_TICK_SCHEMA);
    expect(r.phiAfterCmaft.timeStep).toBe(1);
    expect(r.spclError.l2Norm).toBeGreaterThanOrEqual(0);
    expect(r.ncges_preview.schema).toBe('ncges/preview/v1');
  });

  it('accepts explicit deltaPhiExec', () => {
    const r = runEiosKernelTick({
      decision: decision(),
      queryId: 'q2',
      deltaPhiExec: { aggregate_intensity: 0.2, aggregate_entropy: 0.1 },
    });
    expect(r.deltaPhiExec.aggregate_intensity).toBe(0.2);
    expect(r.spclError.l2Norm).toBeGreaterThanOrEqual(0);
  });

  it('uses shared Kθ: linear world and linear shadow give ~zero structural ε', () => {
    const r = runEiosKernelTick({
      decision: decision(),
      queryId: 'q-lin',
      worldDynamicsMode: 'LINEAR_LAPLACIAN',
    });
    expect(r.spclError.maxAbsEpsilon).toBeLessThan(1e-9);
  });

  it('default world (message-passing) vs linear shadow yields nonzero structural ε', () => {
    const r = runEiosKernelTick({ decision: decision(), queryId: 'q-mp' });
    expect(r.spclError.l2Norm).toBeGreaterThan(1e-6);
  });
});
