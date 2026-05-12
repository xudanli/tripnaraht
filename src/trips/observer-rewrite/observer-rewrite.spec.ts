import type { ExecutionObserver } from '../observer/observer.types';
import {
  collapseCompatibleBias,
  explainObserverEvolution,
  mutateObserver,
  observerStateToExecutionObserver,
} from './index';

describe('observer-rewrite (P23)', () => {
  const baseObserver: ExecutionObserver = {
    observerId: 'obs_a',
    attentionPolicy: {
      focusDomains: ['road', 'weather', 'hotel', 'budget'],
      temporalResolution: 'REALTIME',
      spatialResolution: 'GLOBAL',
    },
    samplingStrategy: 'FULL_TRACE',
    biasModel: 'RISK_AVOIDANT',
  };

  it('temporal drift pushes attention to WINDOWED', () => {
    const history = Array.from({ length: 5 }, () => ({ temporalSkew: 0.5 }));
    const next = mutateObserver(baseObserver, history, {});
    expect(next.attentionPolicy.temporalResolution).toBe('WINDOWED');
  });

  it('event overload narrows focus domains', () => {
    const history = Array.from({ length: 4 }, () => ({ eventCount: 20 }));
    const next = mutateObserver(baseObserver, history, {});
    expect(next.attentionPolicy.focusDomains.length).toBeLessThan(
      baseObserver.attentionPolicy.focusDomains.length,
    );
  });

  it('reality feedback evolves bias and identity', () => {
    const next = mutateObserver(
      baseObserver,
      [],
      {
        failureType: 'HIGH_RISK_OVERESTIMATION',
        embeddingShift: [0.5, -0.2, 0.1],
      },
      undefined,
    );
    expect(next.biasModel).toBe('RISK_NEUTRALIZED');
    expect(next.identityVector.length).toBe(3);

    const compat = observerStateToExecutionObserver(next);
    expect(compat.biasModel).toBe('NEUTRAL');
    expect(collapseCompatibleBias('OPPORTUNITY_AMPLIFIED')).toBe('OPPORTUNITY_SEEKING');
  });

  it('explainObserverEvolution lists deltas', () => {
    const next = mutateObserver(baseObserver, [{ temporalSkew: 0.4 }], {});
    const lines = explainObserverEvolution(baseObserver, next);
    expect(lines.some(l => l.includes('Observer'))).toBe(true);
  });
});
