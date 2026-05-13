import { buildResearchConflictNegotiationReport } from '../teams/research/research-conflict-negotiation.util';
import type { ResearchConflictNegotiationReport } from '../teams/research/research-conflict-negotiation.types';
import {
  buildEbpToneMannerInstructionZh,
  buildEmpathicValueFramingInstructionZh,
  buildMultimodalPresentationHints,
  extractBudgetAggregateSavingsFromResearchData,
  getEmotionalStance,
  mapReportToVoiceToneModifier,
  mapStanceToVoiceModifier,
  mapVoiceToneModifierForNegotiationAndBudget,
} from './narrator-ebp-tone.util';

describe('mapStanceToVoiceModifier / mapReportToVoiceToneModifier', () => {
  it('立场到语气映射', () => {
    expect(mapStanceToVoiceModifier('COMPLIANCE_FIRST')).toBe('professional_authoritative');
    expect(mapStanceToVoiceModifier('STITCH_TRANSPARENCY')).toBe('reassuring_transparency');
    expect(mapStanceToVoiceModifier('COMMERCE_OVER_EXPERIENCE')).toBe('rational_economical');
    expect(mapStanceToVoiceModifier('BALANCED')).toBeUndefined();
  });

  it('无冲突 BALANCED 报告不强加 voice', () => {
    const report = buildResearchConflictNegotiationReport({ mergeLog: [], teamMergeSummary: undefined });
    expect(mapReportToVoiceToneModifier(report)).toBeUndefined();
  });
});

describe('narrator-ebp-tone.util', () => {
  it('无冲突 BALANCED：语气块为空，多模态为默认', () => {
    const report = buildResearchConflictNegotiationReport({ mergeLog: [], teamMergeSummary: undefined });
    expect(buildEbpToneMannerInstructionZh(report)).toBe('');
    const mm = buildMultimodalPresentationHints(report);
    expect(mm.visual_hint).toContain('默认');
    expect(getEmotionalStance(report)?.stance).toBe('NONE');
  });

  it('STITCH_TRANSPARENCY：多模态含虚化与语速', () => {
    const report = buildResearchConflictNegotiationReport({
      mergeLog: [
        {
          source: 'HotelResearchMember',
          phase: 'parallel',
          keysTouched: ['a'],
          evidenceRefsAppended: 0,
          attribution: 'MEMBER_PATCH',
        },
        {
          source: 'FALLBACK_SUTURE',
          phase: 'parallel',
          keysTouched: ['b'],
          evidenceRefsAppended: 0,
          attribution: 'FALLBACK_SUTURE',
        },
      ],
      teamMergeSummary: {
        merge_strategy: 'DIFF_BASED_CLONE_MERGE',
        total_keys_touched: 2,
        scope_mutations: { hotel: { updated_keys: ['a'], evidence_added_count: 0 } },
        fallback_suture_count: 1,
      },
    });
    expect(report.primary_narrative_stance).toBe('STITCH_TRANSPARENCY');
    const zh = buildEbpToneMannerInstructionZh(report);
    expect(zh).toContain('【叙事立场·EBP】');
    expect(zh).toContain('STITCH_TRANSPARENCY');
    expect(zh).toContain('【冲突仲裁·须在用户可见叙述中体现】');
    expect(mapReportToVoiceToneModifier(report)).toBe('reassuring_transparency');
    const mm = buildMultimodalPresentationHints(report);
    expect(mm.visual_hint).toContain('虚化');
    expect(mm.audio_prosody).toContain('放缓');
  });
});

describe('5.1 budget savings → narrator tone', () => {
  it('extractBudgetAggregateSavingsFromResearchData reads global report then arbitration log', () => {
    expect(extractBudgetAggregateSavingsFromResearchData(undefined)).toBeUndefined();
    expect(
      extractBudgetAggregateSavingsFromResearchData({
        __research_global_financial_report: { budget_aggregate_savings: 120 },
      }),
    ).toBe(120);
    expect(
      extractBudgetAggregateSavingsFromResearchData({
        __research_budget_arbitration_decision_log: [
          {
            source: 'BUDGET_ARBITRATOR_ROLLBACK',
            financial_impact: { budget_savings: 80, v1_total_estimated_cost: 200, v2_total_estimated_cost: 120 },
          },
        ],
      }),
    ).toBe(80);
  });

  it('mapVoiceToneModifierForNegotiationAndBudget returns rational_frugal when savings > 0', () => {
    const report = buildResearchConflictNegotiationReport({ mergeLog: [], teamMergeSummary: undefined });
    expect(mapVoiceToneModifierForNegotiationAndBudget(report, { __research_global_financial_report: { budget_aggregate_savings: 50 } })).toBe(
      'rational_frugal',
    );
    expect(mapVoiceToneModifierForNegotiationAndBudget(report, {})).toBeUndefined();
  });

  it('buildEbpToneMannerInstructionZh appends budget block when savings present even if BALANCED', () => {
    const report = buildResearchConflictNegotiationReport({ mergeLog: [], teamMergeSummary: undefined });
    const zh = buildEbpToneMannerInstructionZh(report, { budget_savings_yuan: 99 });
    expect(zh).toContain('【预算优化·财务透明】');
    expect(zh).toContain('99');
  });
});

describe('6.1 empathic value framing & frustration circuit', () => {
  const stitchBase = (): ResearchConflictNegotiationReport => ({
    version: 1,
    has_conflicts: true,
    conflict_flags: ['SUTURE_COEXISTENCE'],
    primary_narrative_stance: 'STITCH_TRANSPARENCY',
    items: [{ kind: 'SUTURE_COEXISTENCE', summary: '缝合与实时并存' }],
  });

  it('buildEmpathicValueFramingInstructionZh：容忍度高 + 缝合 → Loss-Gain 块', () => {
    const zh = buildEmpathicValueFramingInstructionZh(
      { ...stitchBase(), tolerance_bonus: 0.35 },
      { budget_savings_yuan: 500 },
    );
    expect(zh).toContain('Loss-Gain');
    expect(zh).toContain('500');
  });

  it('buildEmpathicValueFramingInstructionZh：高挫败感 → 歉意恢复，不输出 Loss-Gain', () => {
    const report: ResearchConflictNegotiationReport = {
      ...stitchBase(),
      tolerance_bonus: 0.9,
      user_emotional_account: {
        accumulated_goodwill: 0.4,
        current_tolerance_bonus: 0.9,
        frustration_score: 0.88,
      },
    };
    expect(buildEmpathicValueFramingInstructionZh(report)).toContain('歉意恢复');
    expect(buildEmpathicValueFramingInstructionZh(report)).not.toContain('Loss-Gain');
  });

  it('mapVoiceToneModifierForNegotiationAndBudget：挫败感熔断 → empathetic_reassurance', () => {
    const report: ResearchConflictNegotiationReport = {
      ...stitchBase(),
      user_emotional_account: {
        accumulated_goodwill: 0,
        current_tolerance_bonus: 0.3,
        frustration_score: 0.88,
      },
    };
    expect(mapVoiceToneModifierForNegotiationAndBudget(report, {})).toBe('empathetic_reassurance');
  });

  it('buildEbpToneMannerInstructionZh 含 stitch_tactic=AGGRESSIVE_COMPENSATION 时追加 6.1 缝合策略行', () => {
    const zh = buildEbpToneMannerInstructionZh({
      ...stitchBase(),
      stitch_tactic: 'AGGRESSIVE_COMPENSATION',
    });
    expect(zh).toContain('AGGRESSIVE_COMPENSATION');
  });

  it('buildMultimodalPresentationHints：挫败感熔断覆盖默认多模态', () => {
    const mm = buildMultimodalPresentationHints({
      ...stitchBase(),
      user_emotional_account: {
        accumulated_goodwill: 0,
        current_tolerance_bonus: 0.2,
        frustration_score: 0.9,
      },
    });
    expect(mm.visual_hint).toContain('歉意恢复');
  });
});
