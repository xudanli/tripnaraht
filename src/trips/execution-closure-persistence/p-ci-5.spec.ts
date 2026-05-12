import {
  computeControlEnergyField,
  deriveControlRegime,
  applyRegimeToControlSignal,
  composePci4WithPci5EnergyLayer,
} from './p-ci-5';
import type { PciPressure2 } from './p-ci-4';

describe('P-CI-5 control stability field', () => {
  it('marks CRITICAL when system energy is in the top band', () => {
    const state = computeControlEnergyField({
      ecoDriftRate: 0.95,
      identityRejectRate: 0.95,
      closureRetryRate: 0.95,
    });
    expect(state.systemEnergy).toBeGreaterThanOrEqual(0.85);
    expect(deriveControlRegime(state)).toBe('CRITICAL');
  });

  it('marks STABLE for low rates and zero gradient (first tick)', () => {
    const state = computeControlEnergyField({
      ecoDriftRate: 0.1,
      identityRejectRate: 0.05,
      closureRetryRate: 0.1,
    });
    expect(deriveControlRegime(state)).toBe('STABLE');
  });

  it('marks UNSTABLE in the mid-high band per regime ladder', () => {
    const state = computeControlEnergyField({
      ecoDriftRate: 0.8,
      identityRejectRate: 0.7,
      closureRetryRate: 0.9,
    });
    // 0.4*0.8 + 0.3*0.7 + 0.3*0.9 = 0.8 → UNSTABLE (not CRITICAL)
    expect(state.systemEnergy).toBeCloseTo(0.8, 5);
    expect(deriveControlRegime(state)).toBe('UNSTABLE');
  });

  it('exposes stabilityGradient when previous energy differs', () => {
    const first = computeControlEnergyField({
      ecoDriftRate: 0.2,
      identityRejectRate: 0.2,
      closureRetryRate: 0.2,
    });
    const second = computeControlEnergyField({
      ecoDriftRate: 0.9,
      identityRejectRate: 0.9,
      closureRetryRate: 0.9,
      prev: first,
    });
    expect(second.stabilityGradient).toBeGreaterThan(0);
  });

  it('tightens P-CI-4 signal only in CRITICAL regime', () => {
    const base = applyRegimeToControlSignal(
      {
        ecoThrottle: 1,
        identityGuardTighten: false,
        closureRetryLimit: 3,
        neptuneRetryPolicy: 'allow',
      },
      'STABLE',
    );
    expect(base.ecoThrottle).toBe(1);

    const critical = applyRegimeToControlSignal(
      {
        ecoThrottle: 0.9,
        identityGuardTighten: false,
        closureRetryLimit: 3,
        neptuneRetryPolicy: 'allow',
      },
      'CRITICAL',
    );
    expect(critical.ecoThrottle).toBeLessThanOrEqual(0.45);
    expect(critical.neptuneRetryPolicy).toBe('restrict');
    expect(critical.closureRetryLimit).toBeLessThanOrEqual(1);
    expect(critical.identityGuardTighten).toBe(true);
  });

  it('compose stacks base P-CI-4 rule with regime overlay', () => {
    const pci: PciPressure2 = {
      physicsPressure: 0.2,
      stability: 0.9,
      fusedPhysicsPressure: 0.2,
      fusedStability: 0.9,
    };
    const out = composePci4WithPci5EnergyLayer(
      pci,
      { ecoDriftRate: 0.95, identityRejectRate: 0.95, closureRetryRate: 0.95 },
      null,
    );
    expect(out.regime).toBe('CRITICAL');
    expect(out.baseSignal.ecoThrottle).toBe(1);
    expect(out.signal.ecoThrottle).toBeLessThan(1);
  });
});
