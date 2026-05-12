import type { CausalFieldSnapshot } from '../contracts/multi-agent-causal-field.types';
import {
  classifyCttSystemTier,
  ecpsDivergenceModeFromTier,
  judgeReplayTemporalTyping,
  judgeResidualWellFormed,
  judgeValidStateField,
  spclResidualWitness,
} from './ctt-ei-judgement.util';

function phi(ok: boolean): CausalFieldSnapshot {
  return {
    queryId: 'q',
    timeStep: 0,
    particles: ok
      ? [
          { agentId: 'a', phi: 0.5 },
          { agentId: 'b', phi: 0.3 },
        ]
      : [{ agentId: 'a', phi: NaN }],
  };
}

describe('ctt-ei-judgement.util', () => {
  it('judgeValidStateField rejects NaN φ', () => {
    const j = judgeValidStateField(phi(false));
    expect(j.holds).toBe(false);
    expect(j.violations.some((v) => v.includes('NON_FINITE'))).toBe(true);
  });

  it('judgeResidualWellFormed builds witness', () => {
    const j = judgeResidualWellFormed({
      deltaPhiExec: { a: 0.1 },
      deltaPhiShadow: { a: 0.05 },
    });
    expect(j.holds).toBe(true);
    expect(j.witness?.bundle.l2Norm).toBeGreaterThanOrEqual(0);
  });

  it('classifyCttSystemTier partitions by thresholds', () => {
    expect(classifyCttSystemTier(0.02, { tauLow: 0.05, tauHigh: 0.25 })).toBe('SYSTEM1');
    expect(classifyCttSystemTier(0.4, { tauLow: 0.05, tauHigh: 0.25 })).toBe('SYSTEM2');
    expect(classifyCttSystemTier(0.1, { tauLow: 0.05, tauHigh: 0.25 })).toBe('INTER_REGION');
  });

  it('ecpsDivergenceModeFromTier maps tiers', () => {
    expect(ecpsDivergenceModeFromTier('SYSTEM1')).toBe('LOW_DIVERGENCE');
    expect(ecpsDivergenceModeFromTier('INTER_REGION')).toBe('MIXED_DIVERGENCE');
    expect(ecpsDivergenceModeFromTier('SYSTEM2')).toBe('HIGH_DIVERGENCE');
  });

  it('judgeReplayTemporalTyping requires matching agent lattice', () => {
    const a = phi(true);
    const b: CausalFieldSnapshot = {
      ...phi(true),
      particles: [{ agentId: 'a', phi: 0.5 }],
    };
    expect(judgeReplayTemporalTyping(a, b).holds).toBe(false);
  });

  it('spclResidualWitness matches computeSpclError', () => {
    const s = { deltaPhiExec: { x: 1 }, deltaPhiShadow: { x: 0.5 } };
    const w = spclResidualWitness(s);
    expect(w.bundle.epsilonByAgent.x).toBeCloseTo(0.5);
  });
});
