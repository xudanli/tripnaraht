import { computeControlSignal } from './p-ci-4';
import type { EcoClosurePolicy } from '../execution-cognitive-orchestrator/execution-cognitive-orchestrator.types';
import type { PciPressure2, RuntimeSignals } from './p-ci-4';

const stable: PciPressure2 = {
  physicsPressure: 0.2,
  stability: 0.9,
  fusedPhysicsPressure: 0.2,
  fusedStability: 0.9,
};

describe('P-CI-4 control signal', () => {
  it('stays permissive under stable conditions (interior of allow region)', () => {
    const signal = computeControlSignal(stable);
    expect(signal.ecoThrottle).toBe(1);
    expect(signal.identityGuardTighten).toBe(false);
    expect(signal.neptuneRetryPolicy).toBe('allow');
    expect(signal.closureRetryLimit).toBe(3);
  });

  it('restricts when fused stability is below default instability threshold', () => {
    const signal = computeControlSignal({
      physicsPressure: 0.8,
      stability: 0.4,
      fusedPhysicsPressure: 0.85,
      fusedStability: 0.4,
    });
    expect(signal.ecoThrottle).toBeLessThan(1);
    expect(signal.identityGuardTighten).toBe(true);
    expect(signal.neptuneRetryPolicy).toBe('restrict');
    expect(signal.closureRetryLimit).toBe(1);
  });

  it('amplifies lane pressure when runtime signals push fusedPressure over risk threshold', () => {
    const base: PciPressure2 = {
      physicsPressure: 0.4,
      stability: 0.8,
      fusedPhysicsPressure: 0.4,
      fusedStability: 0.8,
    };
    const noRt = computeControlSignal(base);
    const runtime: RuntimeSignals = {
      ecoDriftRate: 1,
      identityRejectRate: 1,
      closureRetryRate: 1,
    };
    const withRt = computeControlSignal(base, runtime);
    // 0.4 + 0.35*1 = 0.75 > 0.7 default riskThreshold
    expect(noRt.neptuneRetryPolicy).toBe('allow');
    expect(withRt.neptuneRetryPolicy).toBe('restrict');
    expect(withRt.ecoThrottle).toBeLessThan(1);
  });

  it('respects policy pci4PressureControl threshold overrides', () => {
    const policy: EcoClosurePolicy = {
      pci4PressureControl: {
        controlAlpha: 0.35,
        instabilityThreshold: 0.8,
        riskThreshold: 0.2,
      },
    };
    const signal = computeControlSignal(
      {
        physicsPressure: 0.3,
        stability: 0.7,
        fusedPhysicsPressure: 0.3,
        fusedStability: 0.7,
      },
      undefined,
      policy,
    );
    // fusedPressure 0.3 > riskThreshold 0.2 → restrict branch
    expect(signal.neptuneRetryPolicy).toBe('restrict');
  });

  it('is monotonic in pressure: higher fused physics / lower stability does not increase ecoThrottle', () => {
    const low = computeControlSignal({
      physicsPressure: 0.2,
      stability: 0.9,
      fusedPhysicsPressure: 0.2,
      fusedStability: 0.9,
    });
    const high = computeControlSignal({
      physicsPressure: 0.9,
      stability: 0.3,
      fusedPhysicsPressure: 0.9,
      fusedStability: 0.3,
    });
    expect(high.ecoThrottle).toBeLessThanOrEqual(low.ecoThrottle);
  });

  it('does not flip retry policy for tiny perturbations inside the stable region', () => {
    const a = computeControlSignal({
      physicsPressure: 0.45,
      stability: 0.75,
      fusedPhysicsPressure: 0.45,
      fusedStability: 0.75,
    });
    const b = computeControlSignal({
      physicsPressure: 0.46,
      stability: 0.75,
      fusedPhysicsPressure: 0.46,
      fusedStability: 0.75,
    });
    expect(a.neptuneRetryPolicy).toBe(b.neptuneRetryPolicy);
    expect(a.neptuneRetryPolicy).toBe('allow');
  });
});
