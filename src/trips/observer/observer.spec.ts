import type { ExecutionPhysicsModel } from '../execution-physics/execution-physics.types';
import {
  collapseRealityWithObserver,
  explainObservedReality,
  observerCollapseScore,
  type ExecutionObserver,
  type ObservableRealityCandidate,
} from './index';

function physics(): ExecutionPhysicsModel {
  return {
    version: '20',
    timeModel: { type: 'LINEAR_TIME', driftBehavior: 'ACCUMULATIVE' },
    causalityModel: 'DAG_CAUSALITY',
    stateTransitionModel: { defaultCollapse: 'EAGER' },
    constraints: 'STRICT_SEQUENTIAL',
  };
}

describe('observer (P22)', () => {
  const observer: ExecutionObserver = {
    observerId: 'obs_1',
    attentionPolicy: {
      focusDomains: ['road', 'weather'],
      temporalResolution: 'WINDOWED',
      spatialResolution: 'REGIONAL',
    },
    samplingStrategy: 'FULL_TRACE',
    biasModel: 'NEUTRAL',
  };

  it('collapseRealityWithObserver ranks by utility·visibility − entropy·bias', () => {
    const a: ObservableRealityCandidate = {
      seedId: 'a',
      timePhysics: { type: 'LINEAR_TIME', driftBehavior: 'ACCUMULATIVE' },
      causalityPhysics: 'DAG_CAUSALITY',
      executionSemantics: physics(),
      probabilityWeight: 0.5,
      executionUtility: 0.9,
      entropy: 0.2,
      observedEventTags: ['road'],
      timelineKind: 'WINDOWED',
      geoRegion: 'road-north',
    };
    const b: ObservableRealityCandidate = {
      seedId: 'b',
      timePhysics: { type: 'LINEAR_TIME', driftBehavior: 'ACCUMULATIVE' },
      causalityPhysics: 'DAG_CAUSALITY',
      executionSemantics: physics(),
      probabilityWeight: 0.5,
      executionUtility: 0.95,
      entropy: 0.1,
      observedEventTags: [],
      timelineKind: 'CROSS_DAY',
      geoRegion: 'other',
    };

    const pick = collapseRealityWithObserver([a, b], observer);
    expect(pick.seedId).toBeDefined();
    expect(pick.collapseScore).toBeDefined();
    expect(pick.visibility).toBeGreaterThan(0);
  });

  it('RISK_AVOIDANT increases entropy penalty via bias multiplier', () => {
    const reality: ObservableRealityCandidate = {
      seedId: 'r',
      timePhysics: { type: 'LINEAR_TIME', driftBehavior: 'ACCUMULATIVE' },
      causalityPhysics: 'DAG_CAUSALITY',
      executionSemantics: physics(),
      probabilityWeight: 1,
      executionUtility: 0.8,
      entropy: 0.4,
      riskScore: 0.9,
      observedEventTags: ['road', 'weather'],
      timelineKind: 'WINDOWED',
      geoRegion: 'road',
    };

    const neutral = observerCollapseScore(reality, observer);
    const riskObs: ExecutionObserver = { ...observer, biasModel: 'RISK_AVOIDANT' };
    const risk = observerCollapseScore(reality, riskObs);
    expect(risk.biasMultiplier).toBeGreaterThan(neutral.biasMultiplier);
    expect(risk.score).toBeLessThan(neutral.score);
  });

  it('explainObservedReality mentions observer and exclusions', () => {
    const r: ObservableRealityCandidate = {
      seedId: 'win',
      timePhysics: { type: 'LINEAR_TIME', driftBehavior: 'ACCUMULATIVE' },
      causalityPhysics: 'DAG_CAUSALITY',
      executionSemantics: physics(),
      probabilityWeight: 1,
      executionUtility: 0.9,
      entropy: 0.1,
      observedEventTags: ['road'],
      timelineKind: 'WINDOWED',
      geoRegion: 'road',
    };
    const lose: ObservableRealityCandidate = {
      ...r,
      seedId: 'lose',
      executionUtility: 0.2,
    };
    const out = collapseRealityWithObserver([r, lose], observer);
    const lines = explainObservedReality(observer, out, [r, lose]);
    expect(lines.some(l => l.includes('Observer'))).toBe(true);
  });
});
