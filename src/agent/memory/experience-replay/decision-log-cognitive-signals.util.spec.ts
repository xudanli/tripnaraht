import { deriveUserCognitiveProfileFromDecisionSignals } from './decision-log-cognitive-signals.util';
import type { DecisionLogCognitiveSlice } from './user-cognitive-profile.types';
import { MEMORY_REPLAY_DECISION_SOURCE } from './memory-replay.constants';

describe('deriveUserCognitiveProfileFromDecisionSignals', () => {
  const now = '2026-05-13T12:00:00.000Z';

  it('空切片：轴为 0，证据权重为 0', () => {
    const p = deriveUserCognitiveProfileFromDecisionSignals('subj:test', [], { nowIso: now });
    expect(p.schema_version).toBe(1);
    expect(p.subject_ref).toBe('subj:test');
    expect(p.evidence_weight).toBe(0);
    expect(p.compliance_experience_axis).toBe(0);
    expect(p.negative_feedback_proxy).toBe(0);
    expect(p.derivation.narrate_compliance_first_hits).toBe(0);
    expect(p.derivation.memory_replay_axis_narrate_hits).toBe(0);
    expect(p.derivation.memory_replay_penalized_hits).toBe(0);
  });

  it('三次 COMPLIANCE_FIRST vs 一次 COMMERCE_OVER：轴偏向合规侧', () => {
    const slices: DecisionLogCognitiveSlice[] = [
      { step: 'NARRATE', timestamp: '1', metadata: { ebp_stance: 'COMPLIANCE_FIRST', conflict_count: 0 } },
      { step: 'NARRATE', timestamp: '2', metadata: { ebp_stance: 'COMPLIANCE_FIRST', conflict_count: 0 } },
      { step: 'NARRATE', timestamp: '3', metadata: { ebp_stance: 'COMPLIANCE_FIRST' } },
      { step: 'NARRATE', timestamp: '4', metadata: { ebp_stance: 'COMMERCE_OVER_EXPERIENCE', conflict_count: 0 } },
    ];
    const p = deriveUserCognitiveProfileFromDecisionSignals('subj:u1', slices, { nowIso: now });
    expect(p.evidence_weight).toBe(4);
    expect(p.compliance_experience_axis).toBeCloseTo((3 - 1) / 4, 5);
    expect(p.negative_feedback_proxy).toBe(0);
    expect(p.derivation.mean_conflict_count_when_nonzero).toBeNull();
    expect(p.derivation.memory_replay_axis_narrate_hits).toBe(0);
  });

  it('conflict_count>0 时降低该条 NARRATE 的置信权重', () => {
    const slices: DecisionLogCognitiveSlice[] = [
      { step: 'NARRATE', timestamp: '1', metadata: { ebp_stance: 'COMPLIANCE_FIRST', conflict_count: 5 } },
      { step: 'NARRATE', timestamp: '2', metadata: { ebp_stance: 'COMMERCE_OVER_EXPERIENCE', conflict_count: 0 } },
    ];
    const p = deriveUserCognitiveProfileFromDecisionSignals('subj:cc', slices, { nowIso: now });
    expect(p.compliance_experience_axis).toBeLessThan(0);
    expect(p.compliance_experience_axis).toBeGreaterThan(-1);
  });

  it('忽略非 NARRATE 步骤', () => {
    const slices: DecisionLogCognitiveSlice[] = [
      { step: 'RESEARCH', timestamp: '1', metadata: { ebp_stance: 'COMPLIANCE_FIRST' } },
      { step: 'NARRATE', timestamp: '2', metadata: { ebp_stance: 'COMMERCE_OVER_EXPERIENCE' } },
    ];
    const p = deriveUserCognitiveProfileFromDecisionSignals('subj:x', slices, { nowIso: now });
    expect(p.evidence_weight).toBe(1);
    expect(p.compliance_experience_axis).toBe(-1);
    expect(p.negative_feedback_proxy).toBe(0);
  });

  it('reassuring_transparency 计入 stitch 暴露代理', () => {
    const slices: DecisionLogCognitiveSlice[] = [
      { step: 'NARRATE', timestamp: '1', metadata: { effective_voice_tone: 'reassuring_transparency' } },
      { step: 'NARRATE', timestamp: '2', metadata: { effective_voice_tone: 'professional_authoritative' } },
    ];
    const p = deriveUserCognitiveProfileFromDecisionSignals('subj:y', slices, { nowIso: now });
    expect(p.stitch_transparency_exposure_proxy).toBe(0.5);
    expect(p.negative_feedback_proxy).toBe(0);
  });

  it('MEMORY_REPLAY 立场 NARRATE 之后出现否定标签：施加惩罚乘子，轴反向；negative_feedback_proxy=1', () => {
    const slices: DecisionLogCognitiveSlice[] = [
      {
        step: 'NARRATE',
        timestamp: '2026-01-01T00:00:01.000Z',
        metadata: {
          ebp_stance: 'COMPLIANCE_FIRST',
          decision_source: MEMORY_REPLAY_DECISION_SOURCE,
        },
      },
      {
        step: 'FEEDBACK',
        timestamp: '2026-01-01T00:00:02.000Z',
        metadata: { user_feedback_tags: ['USER_REJECTION'] },
      },
    ];
    const p = deriveUserCognitiveProfileFromDecisionSignals('subj:pen', slices, { nowIso: now });
    expect(p.compliance_experience_axis).toBe(-1);
    expect(p.negative_feedback_proxy).toBe(1);
    expect(p.derivation.memory_replay_axis_narrate_hits).toBe(1);
    expect(p.derivation.memory_replay_penalized_hits).toBe(1);
  });

  it('MEMORY_REPLAY 但未跟否定：不惩罚', () => {
    const slices: DecisionLogCognitiveSlice[] = [
      {
        step: 'NARRATE',
        timestamp: '2026-01-01T00:00:01.000Z',
        metadata: {
          ebp_stance: 'COMPLIANCE_FIRST',
          decision_source: MEMORY_REPLAY_DECISION_SOURCE,
        },
      },
    ];
    const p = deriveUserCognitiveProfileFromDecisionSignals('subj:ok', slices, { nowIso: now });
    expect(p.compliance_experience_axis).toBe(1);
    expect(p.negative_feedback_proxy).toBe(0);
    expect(p.derivation.memory_replay_penalized_hits).toBe(0);
  });
});
