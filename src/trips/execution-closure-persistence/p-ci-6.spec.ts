import type { EcoNeptuneClosureEvaluation } from '../execution-cognitive-orchestrator/execution-cognitive-orchestrator.types';
import type { TripWorldState } from '../decision/world-model';
import { applyPressureRegulation } from './pressure-regulation';
import {
  computeControlPhaseState,
  isPhaseTransition,
  applyPhaseOverridesToControlSignal,
  composeControlWithPhaseTransitionLayer,
  applyControlPhaseEngineTick,
} from './p-ci-6';
import type { PciPressure2 } from './p-ci-4';

function minimalWorld(): TripWorldState {
  return {
    context: {
      destination: 'x',
      startDate: '2026-01-01',
      durationDays: 1,
      preferences: { intents: {}, pace: 'moderate', riskTolerance: 'low' },
    },
    candidatesByDate: {},
    signals: { lastUpdatedAt: '2026-01-01T00:00:00+00:00' },
  };
}

function hotClosureEval(): EcoNeptuneClosureEvaluation {
  return {
    ecoDriftScore: 0.95,
    stabilityScore: 0.9,
    semanticConvergence: 0.05,
    shouldRerunNeptune: true,
    reasons: [],
    thresholds: { driftMax: 0.5, stabilityMin: 0.5, convergenceMin: 0.5 },
  };
}

describe('P-CI-6 phase transition field', () => {
  it('classifies SUBCRITICAL at low transition pressure', () => {
    const s = computeControlPhaseState({ energy: 0.1, gradient: 0 });
    expect(s.phase).toBe('SUBCRITICAL');
    expect(s.transitionPressure).toBeLessThan(0.3);
  });

  it('classifies SUPERCRITICAL when energy + fluctuation exceed upper band', () => {
    const s = computeControlPhaseState({ energy: 0.85, gradient: 0 });
    expect(s.phase).toBe('SUPERCRITICAL');
  });

  it('detects phase transition between snapshots', () => {
    const a = computeControlPhaseState({ energy: 0.2, gradient: 0 });
    const b = computeControlPhaseState({ energy: 0.9, gradient: 0 });
    expect(isPhaseTransition(b, a)).toBe(true);
    expect(isPhaseTransition(a, a)).toBe(false);
  });

  it('applies SUPERCRITICAL throttle cap and TRANSITIONAL guard tighten', () => {
    const permissive: import('./p-ci-4').Pci4ControlSignal = {
      ecoThrottle: 1,
      identityGuardTighten: false,
      closureRetryLimit: 3,
      neptuneRetryPolicy: 'allow',
    };

    const superCrit = applyPhaseOverridesToControlSignal(
      permissive,
      computeControlPhaseState({ energy: 0.9, gradient: 0 }),
    );
    expect(superCrit.ecoThrottle).toBeLessThanOrEqual(0.2);
    expect(superCrit.neptuneRetryPolicy).toBe('restrict');

    const trans = applyPhaseOverridesToControlSignal(
      permissive,
      computeControlPhaseState({ energy: 0.65, gradient: 0 }),
    );
    expect(trans.identityGuardTighten).toBe(true);
  });

  it('compose stacks regime then phase without replacing base rule surface', () => {
    const pci: PciPressure2 = {
      physicsPressure: 0.2,
      stability: 0.9,
      fusedPhysicsPressure: 0.2,
      fusedStability: 0.9,
    };
    const out = composeControlWithPhaseTransitionLayer(
      pci,
      { ecoDriftRate: 0.95, identityRejectRate: 0.95, closureRetryRate: 0.95 },
      null,
    );
    expect(out.phaseState.phase).toBe('SUPERCRITICAL');
    expect(out.signal.ecoThrottle).toBeLessThanOrEqual(0.2);
  });
});

describe('applyControlPhaseEngineTick', () => {
  const ENV_SNAPSHOT = {
    TRIP_PCI6_ENGINE: process.env.TRIP_PCI6_ENGINE,
    TRIP_PCI6_OVERRIDE: process.env.TRIP_PCI6_OVERRIDE,
    TRIP_SELF_REGULATE_PRESSURE: process.env.TRIP_SELF_REGULATE_PRESSURE,
  };

  afterEach(() => {
    for (const key of Object.keys(ENV_SNAPSHOT) as (keyof typeof ENV_SNAPSHOT)[]) {
      const v = ENV_SNAPSHOT[key];
      if (v === undefined) delete process.env[key];
      else process.env[key] = v;
    }
  });

  it('skips when TRIP_PCI6_ENGINE is not 1', () => {
    delete process.env.TRIP_PCI6_ENGINE;
    const state = minimalWorld();
    const r = applyControlPhaseEngineTick(state, hotClosureEval(), { stabilityScore: 0.9 });
    expect(r.applied).toBe(false);
    expect(state.signals.controlPhaseState).toBeUndefined();
  });

  it('writes audit fields when engine enabled; override off leaves pressure control unchanged', () => {
    process.env.TRIP_PCI6_ENGINE = '1';
    delete process.env.TRIP_PCI6_OVERRIDE;
    process.env.TRIP_SELF_REGULATE_PRESSURE = '1';

    const state = minimalWorld();
    applyPressureRegulation(state, { stabilityScore: 0.9 });
    const throttleBefore = state.signals.pressureRegulation!.control.ecoThrottle;

    applyControlPhaseEngineTick(state, hotClosureEval(), { stabilityScore: 0.9 });

    expect(state.signals.controlPhaseState).toBeDefined();
    expect(state.signals.controlEnergyState).toBeDefined();
    expect(state.signals.pressureRegulation!.control.ecoThrottle).toBe(throttleBefore);
  });

  it('merges phase into pressure regulation when TRIP_PCI6_OVERRIDE=1', () => {
    process.env.TRIP_PCI6_ENGINE = '1';
    process.env.TRIP_PCI6_OVERRIDE = '1';
    process.env.TRIP_SELF_REGULATE_PRESSURE = '1';

    const state = minimalWorld();
    state.signals.identityRejectionEdges = Array.from({ length: 10 }, (_, i) => ({
      fromLedgerId: 'a',
      attemptedLedgerHash: `h${i}`,
      mutationDistance: 1,
      reason: 'test',
      at: '2026-01-01T00:00:00Z',
    }));
    applyPressureRegulation(state, { stabilityScore: 0.9 });
    expect(state.signals.pressureRegulation!.control.ecoThrottle).toBe(1);

    const r = applyControlPhaseEngineTick(
      state,
      {
        ...hotClosureEval(),
        ecoDriftScore: 1,
        semanticConvergence: 0,
      },
      { stabilityScore: 0.9 },
    );

    expect(r.overrideApplied).toBe(true);
    expect(state.signals.pressureRegulation!.control.ecoThrottle).toBeLessThanOrEqual(0.2);
    expect(state.signals.pressureRegulation!.control.neptuneRetryPolicy).toBe('restrict');
  });
});
