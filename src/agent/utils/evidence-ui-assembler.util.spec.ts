import {
  assembleEvidenceCardUIProps,
  assembleEvidenceCardUIPropsFromState,
  extractEvidenceUIAssemblerContext,
  inferEvidenceTheme,
  tierToLayout,
} from './evidence-ui-assembler.util';
import type { DecisionEvidenceCardPayload } from './evidence-payload-assembler.util';

const windCard: DecisionEvidenceCardPayload = {
  kind: 'iron_shield_evidence',
  rule_id: 'temp_wind_speed_drive_limit_v1',
  rule_name: 'High wind warning for driving segments',
  severity: 'HARD',
  message: 'Wind message',
  narrator_hint_rendered: 'Rendered wind hint',
  persuasion_tier: 3,
  evidence: {
    type: 'weather_physics',
    source: 'segment_prediction',
    value_mps: 25,
    threshold_mps: 15,
  },
};

describe('evidence-ui-assembler.util', () => {
  it('tierToLayout maps 1/2/3', () => {
    expect(tierToLayout(1)).toBe('minimalist');
    expect(tierToLayout(2)).toBe('analytical');
    expect(tierToLayout(3)).toBe('authoritative');
  });

  it('inferEvidenceTheme reads evidence.type', () => {
    expect(inferEvidenceTheme({ type: 'weather_physics' })).toBe('weather');
    expect(inferEvidenceTheme({ type: 'solar_physics' })).toBe('solar');
    expect(inferEvidenceTheme({ type: 'other' })).toBe('road');
  });

  it('Tier 1 omits impact and social proof', () => {
    const ui = assembleEvidenceCardUIProps(
      { ...windCard, persuasion_tier: 1 },
      { wallHitDistanceMs: 3_600_000, precedentN: 9, precedentAcceptPct: 90 },
    );
    expect(ui.tier).toBe(1);
    expect(ui.layout).toBe('minimalist');
    expect(ui.impact).toBeUndefined();
    expect(ui.socialProof).toBeUndefined();
    expect(ui.policyReference).toBeUndefined();
    expect(ui.valueDisplay).toBe('25.0 m/s');
    expect(ui.benchmark).toBe('Threshold: 15.0 m/s');
  });

  it('Tier 3 includes impact, social proof, and policy reference', () => {
    const ui = assembleEvidenceCardUIProps(windCard, {
      wallHitDistanceMs: 9_000_000,
      precedentN: 8,
      precedentAcceptPct: 91,
    });
    expect(ui.tier).toBe(3);
    expect(ui.layout).toBe('authoritative');
    expect(ui.impact?.hours).toBe(2.5);
    expect(ui.socialProof).toEqual({ count: 8, percentage: 91 });
    expect(ui.policyReference).toEqual({
      ruleId: 'temp_wind_speed_drive_limit_v1',
      ruleName: 'High wind warning for driving segments',
    });
  });

  it('extractEvidenceUIAssemblerContext reads metadata + wall-hit util', () => {
    const ctx = extractEvidenceUIAssemblerContext({
      request_id: 'r1',
      current_step: 'NARRATE',
      evidence_registry: new Map(),
      decision_log: [{ metadata: { wall_hit_distance_ms: 120_000 } } as any],
      errors: [],
      metadata: {
        started_at: 't0',
        last_updated_at: 't1',
        precedent_n: 4,
        precedent_accept_pct: 87,
      },
    } as any);
    expect(ctx.wallHitDistanceMs).toBe(120_000);
    expect(ctx.precedentN).toBe(4);
    expect(ctx.precedentAcceptPct).toBe(87);
  });

  it('assembleEvidenceCardUIPropsFromState maps narration warnings', () => {
    const list = assembleEvidenceCardUIPropsFromState({
      request_id: 'r1',
      current_step: 'NARRATE',
      evidence_registry: new Map(),
      decision_log: [],
      errors: [],
      metadata: { started_at: 'a', last_updated_at: 'b', wall_hit_distance_ms: 3_600_000, precedent_n: 6, precedent_accept_pct: 92 },
      narration: {
        user_friendly_summary: 's',
        day_by_day_narrative: [],
        highlights: [],
        tips: [],
        warnings: [
          {
            kind: 'iron_shield_evidence',
            message: 'm',
            severity: 'HARD',
            rule_id: 'rule_a',
            rule_name: 'Rule A',
            persuasion_tier: 3,
            narrator_hint_rendered: 'hint',
            evidence: { type: 'weather_physics', source: 'x', value_mps: 10, threshold_mps: 8 },
          },
        ],
      },
    } as any);
    expect(list).toHaveLength(1);
    expect(list[0].tier).toBe(3);
    expect(list[0].socialProof?.count).toBe(6);
    expect(list[0].impact?.hours).toBe(1);
  });
});
