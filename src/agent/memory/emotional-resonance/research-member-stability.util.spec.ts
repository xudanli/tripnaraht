import { FRUSTRATION_CIRCUIT_BREAKER_THRESHOLD } from './emotional-resonance.constants';
import type { UserEmotionalAccount } from './user-emotional-account.types';
import {
  applyCircuitBreakerToMetadata,
  applyResearchTraceSignalsToResearchData,
  computeResearchTraceSignalsFromNegotiation,
  RESEARCH_TRACE_SIGNALS_KEY,
  shouldEnableStabilityMode,
} from './research-member-stability.util';
import { EXPERIENCE_FLOW_RESEARCH_KEY } from '../../../trips/decision/models/experience-flow.model';

describe('research-member-stability.util', () => {
  const acct = (fr: number): UserEmotionalAccount => ({
    accumulated_goodwill: 0,
    current_tolerance_bonus: 0.3,
    frustration_score: fr,
  });

  it('挫败分低于阈值 → 不启用稳健模式', () => {
    expect(shouldEnableStabilityMode(acct(FRUSTRATION_CIRCUIT_BREAKER_THRESHOLD - 0.01))).toBe(false);
  });

  it('挫败分达到阈值 → 启用稳健模式', () => {
    expect(shouldEnableStabilityMode(acct(FRUSTRATION_CIRCUIT_BREAKER_THRESHOLD))).toBe(true);
  });

  it('computeResearchTraceSignalsFromNegotiation：低挫败 → EXPERIENCE_FIRST', () => {
    const s = computeResearchTraceSignalsFromNegotiation({
      user_emotional_account: acct(0.1),
      mental_offset_hints: {},
    });
    expect(s.frustration_circuit_triggered).toBe(false);
    expect(s.stability_mode_active).toBe(false);
    expect(s.narrative_track).toBe('EXPERIENCE_FIRST');
  });

  it('computeResearchTraceSignalsFromNegotiation：高分 → EMPATHY_RECOVERY + stability', () => {
    const s = computeResearchTraceSignalsFromNegotiation({
      user_emotional_account: acct(0.88),
      mental_offset_hints: {},
    });
    expect(s.frustration_circuit_triggered).toBe(true);
    expect(s.stability_mode_active).toBe(true);
    expect(s.narrative_track).toBe('EMPATHY_RECOVERY');
  });

  it('computeResearchTraceSignalsFromNegotiation：仅 frustration_circuit_active 提示也触发', () => {
    const s = computeResearchTraceSignalsFromNegotiation({
      user_emotional_account: acct(0.05),
      mental_offset_hints: { frustration_circuit_active: true },
    });
    expect(s.frustration_circuit_triggered).toBe(true);
    expect(s.stability_mode_active).toBe(true);
  });

  it('applyResearchTraceSignalsToResearchData / applyCircuitBreakerToMetadata 写入 __research_trace_signals', () => {
    const rd: Record<string, unknown> = {};
    applyResearchTraceSignalsToResearchData(rd, {
      user_emotional_account: acct(0.88),
    });
    expect(rd[RESEARCH_TRACE_SIGNALS_KEY]).toMatchObject({ narrative_track: 'EMPATHY_RECOVERY' });
    expect(rd[EXPERIENCE_FLOW_RESEARCH_KEY]).toMatchObject({
      tempo: 'EMPATHY_RECOVERY',
      narrativeTone: 'empathetic_reassurance',
    });
    const rd2: Record<string, unknown> = {};
    applyCircuitBreakerToMetadata(rd2, undefined);
    expect(rd2[RESEARCH_TRACE_SIGNALS_KEY]).toMatchObject({
      narrative_track: 'EXPERIENCE_FIRST',
      frustration_circuit_triggered: false,
    });
  });
});
