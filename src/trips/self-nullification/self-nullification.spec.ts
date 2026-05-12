import type { ObserverState } from '../observer-rewrite/observer-rewrite-kernel.types';
import {
  classifyTerminalMode,
  computeFadeOut,
  computeNullificationPressure,
  detectSystemRedundancy,
  explainNullification,
  shiftToObserverAutonomy,
} from './index';
import type { NullificationHistoryEntry } from './nullification-history.types';

function obs(partial: Partial<ObserverState> = {}): ObserverState {
  return {
    observerId: 'o1',
    attentionPolicy: {
      focusDomains: ['a'],
      temporalResolution: 'WINDOWED',
      spatialResolution: 'GLOBAL',
    },
    biasModel: 'NEUTRAL',
    identityVector: [0.9, 0.2, 0.3],
    driftResistance: 0.92,
    samplingStrategy: 'FULL_TRACE',
    ...partial,
  };
}

describe('self-nullification (P24)', () => {
  it('computeNullificationPressure combines stability and autonomy', () => {
    const history: NullificationHistoryEntry[] = Array.from({ length: 20 }, () => ({
      success: true,
      decisionFingerprint: 'same',
      repairEvent: false,
    }));
    const state = computeNullificationPressure(history, obs({ driftResistance: 0.95 }));
    expect(state.nullificationPressure).toBeGreaterThan(0.5);
    expect(state.systemActivityLevel).toBeLessThan(0.5);
  });

  it('detectSystemRedundancy flags saturated stable loop', () => {
    const first10 = Array.from({ length: 10 }, (_, i) => ({
      success: true,
      decisionFingerprint: 'plan-a',
      repairEvent: i < 5,
    }));
    const second10 = Array.from({ length: 10 }, () => ({
      success: true,
      decisionFingerprint: 'plan-a',
      repairEvent: false,
    }));
    const rep = detectSystemRedundancy([...first10, ...second10]);
    expect(rep.redundant).toBe(true);
  });

  it('high nullification pressure triggers fade-out triad', () => {
    const s = {
      systemActivityLevel: 0.1,
      interventionIntensity: 0.2,
      autonomySufficiencyScore: 0.9,
      nullificationPressure: 0.85,
    };
    expect(computeFadeOut(s)).toEqual({
      reduceIR: true,
      reduceDAG: true,
      reduceVM: true,
    });
  });

  it('shiftToObserverAutonomy activates advisory/passive roles', () => {
    const roles = shiftToObserverAutonomy(obs({ driftResistance: 0.91 }));
    expect(roles?.systemRole).toBe('ADVISORY_ONLY');
  });

  it('explainNullification surfaces Neptune narrative', () => {
    const st = computeNullificationPressure([], obs());
    const mode = classifyTerminalMode(st, obs());
    const lines = explainNullification(st, obs(), mode);
    expect(lines.some(l => l.includes('Nullification'))).toBe(true);
  });
});
