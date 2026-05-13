import type { ResearchContextMergeManifest } from './research-context.types';
import type { AccumulatedResearchFinancialReport } from './research-team-budget-ledger.util';
import type { TeamMergeSummary } from './research-team-merge-summary.util';
import { buildResearchConflictNegotiationReport, isResearchConflictNegotiationReport } from './research-conflict-negotiation.util';

describe('isResearchConflictNegotiationReport', () => {
  it('接受完整报告', () => {
    const r = buildResearchConflictNegotiationReport({ mergeLog: [], teamMergeSummary: undefined });
    expect(isResearchConflictNegotiationReport(r)).toBe(true);
  });
  it('拒绝非对象', () => {
    expect(isResearchConflictNegotiationReport(null)).toBe(false);
    expect(isResearchConflictNegotiationReport({ version: 2 })).toBe(false);
  });
});

describe('buildResearchConflictNegotiationReport', () => {
  it('空输入：无冲突，立场 BALANCED', () => {
    const r = buildResearchConflictNegotiationReport({ mergeLog: [], teamMergeSummary: undefined });
    expect(r.version).toBe(1);
    expect(r.has_conflicts).toBe(false);
    expect(r.conflict_flags).toEqual([]);
    expect(r.primary_narrative_stance).toBe('BALANCED');
    expect(r.items).toEqual([]);
  });

  it('KEY_WRITE_CONTENTION：两名 Peer Member 写同一键 → COMMERCE_OVER_EXPERIENCE（酒店 vs 目的地）', () => {
    const mergeLog: ResearchContextMergeManifest[] = [
      {
        source: 'HotelResearchMember',
        phase: 'parallel',
        keysTouched: ['hotel_pick'],
        evidenceRefsAppended: 0,
        attribution: 'MEMBER_PATCH',
      },
      {
        source: 'DestinationResearchMember',
        phase: 'parallel',
        keysTouched: ['hotel_pick'],
        evidenceRefsAppended: 0,
        attribution: 'MEMBER_PATCH',
      },
    ];
    const teamMergeSummary: TeamMergeSummary = {
      merge_strategy: 'DIFF_BASED_CLONE_MERGE',
      total_keys_touched: 1,
      scope_mutations: {
        hotel: { updated_keys: ['hotel_pick'], evidence_added_count: 0 },
        destination: { updated_keys: ['hotel_pick'], evidence_added_count: 0 },
      },
      fallback_suture_count: 0,
    };
    const r = buildResearchConflictNegotiationReport({ mergeLog, teamMergeSummary });
    expect(r.conflict_flags).toContain('KEY_WRITE_CONTENTION');
    expect(r.primary_narrative_stance).toBe('COMMERCE_OVER_EXPERIENCE');
    expect(r.items.find((i) => i.kind === 'KEY_WRITE_CONTENTION')?.detail).toMatchObject({
      key: 'hotel_pick',
      sources: ['DestinationResearchMember', 'HotelResearchMember'],
    });
  });

  it('Compliance + 商业域 → CROSS_DOMAIN_COMPLIANCE_COMMERCE + COMPLIANCE_FIRST', () => {
    const mergeLog: ResearchContextMergeManifest[] = [
      {
        source: 'HotelResearchMember',
        phase: 'parallel',
        keysTouched: ['hotel_search_meta'],
        evidenceRefsAppended: 0,
      },
      {
        source: 'ComplianceResearchMember',
        phase: 'sequential',
        keysTouched: ['safetravel_feed'],
        evidenceRefsAppended: 1,
      },
    ];
    const teamMergeSummary: TeamMergeSummary = {
      merge_strategy: 'DIFF_BASED_CLONE_MERGE',
      total_keys_touched: 2,
      scope_mutations: {
        hotel: { updated_keys: ['hotel_search_meta'], evidence_added_count: 0 },
        compliance: { updated_keys: ['safetravel_feed'], evidence_added_count: 1 },
      },
      fallback_suture_count: 0,
    };
    const r = buildResearchConflictNegotiationReport({ mergeLog, teamMergeSummary });
    expect(r.conflict_flags).toContain('CROSS_DOMAIN_COMPLIANCE_COMMERCE');
    expect(r.primary_narrative_stance).toBe('COMPLIANCE_FIRST');
  });

  it('SUTURE_COEXISTENCE：缝合次数>0 且存在 Member 写入', () => {
    const mergeLog: ResearchContextMergeManifest[] = [
      {
        source: 'HotelResearchMember',
        phase: 'parallel',
        keysTouched: ['hotel_search_meta'],
        evidenceRefsAppended: 0,
        attribution: 'MEMBER_PATCH',
      },
      {
        source: 'FALLBACK_SUTURE',
        phase: 'parallel',
        keysTouched: ['flight_search_meta'],
        evidenceRefsAppended: 0,
        attribution: 'FALLBACK_SUTURE',
      },
    ];
    const teamMergeSummary: TeamMergeSummary = {
      merge_strategy: 'DIFF_BASED_CLONE_MERGE',
      total_keys_touched: 2,
      scope_mutations: {
        hotel: { updated_keys: ['hotel_search_meta'], evidence_added_count: 0 },
        flight: { updated_keys: ['flight_search_meta'], evidence_added_count: 0 },
      },
      fallback_suture_count: 1,
    };
    const r = buildResearchConflictNegotiationReport({ mergeLog, teamMergeSummary });
    expect(r.conflict_flags).toContain('SUTURE_COEXISTENCE');
    expect(r.primary_narrative_stance).toBe('STITCH_TRANSPARENCY');
    expect(r.stitch_tactic).toBe('TRANSPARENT_SEGMENTED');
  });

  it('跨域 Compliance 启发式 + 体验轴偏负：COMPLIANCE_FIRST → BALANCED 且带 memory_replay', () => {
    const mergeLog: ResearchContextMergeManifest[] = [
      {
        source: 'HotelResearchMember',
        phase: 'parallel',
        keysTouched: ['hotel_search_meta'],
        evidenceRefsAppended: 0,
      },
      {
        source: 'ComplianceResearchMember',
        phase: 'sequential',
        keysTouched: ['safetravel_feed'],
        evidenceRefsAppended: 1,
      },
    ];
    const teamMergeSummary: TeamMergeSummary = {
      merge_strategy: 'DIFF_BASED_CLONE_MERGE',
      total_keys_touched: 2,
      scope_mutations: {
        hotel: { updated_keys: ['hotel_search_meta'], evidence_added_count: 0 },
        compliance: { updated_keys: ['safetravel_feed'], evidence_added_count: 1 },
      },
      fallback_suture_count: 0,
    };
    const userCognitiveProfile = {
      schema_version: 1 as const,
      subject_ref: 'u1',
      updated_at: '2026-01-01T00:00:00.000Z',
      evidence_weight: 3,
      compliance_experience_axis: -0.6,
      price_sensitivity_proxy: 0,
      stitch_transparency_exposure_proxy: 0,
      negative_feedback_proxy: 0,
      derivation: {
        narrate_compliance_first_hits: 0,
        narrate_commerce_over_experience_hits: 0,
        narrate_stitch_transparency_voice_hits: 0,
        mean_conflict_count_when_nonzero: null,
        memory_replay_axis_narrate_hits: 0,
        memory_replay_penalized_hits: 0,
      },
    };
    const r = buildResearchConflictNegotiationReport({ mergeLog, teamMergeSummary, userCognitiveProfile });
    expect(r.primary_narrative_stance).toBe('BALANCED');
    expect(r.memory_replay).toMatchObject({
      decision_source: 'MEMORY_REPLAY',
      softened_primary_stance: true,
      raw_primary_stance: 'COMPLIANCE_FIRST',
      final_primary_stance: 'BALANCED',
    });
  });

  it('negative_feedback_proxy 高时不软化 COMPLIANCE_FIRST（自愈）', () => {
    const mergeLog: ResearchContextMergeManifest[] = [
      {
        source: 'HotelResearchMember',
        phase: 'parallel',
        keysTouched: ['hotel_search_meta'],
        evidenceRefsAppended: 0,
      },
      {
        source: 'ComplianceResearchMember',
        phase: 'sequential',
        keysTouched: ['safetravel_feed'],
        evidenceRefsAppended: 1,
      },
    ];
    const teamMergeSummary: TeamMergeSummary = {
      merge_strategy: 'DIFF_BASED_CLONE_MERGE',
      total_keys_touched: 2,
      scope_mutations: {
        hotel: { updated_keys: ['hotel_search_meta'], evidence_added_count: 0 },
        compliance: { updated_keys: ['safetravel_feed'], evidence_added_count: 1 },
      },
      fallback_suture_count: 0,
    };
    const userCognitiveProfile = {
      schema_version: 1 as const,
      subject_ref: 'u1',
      updated_at: '2026-01-01T00:00:00.000Z',
      evidence_weight: 3,
      compliance_experience_axis: -0.6,
      price_sensitivity_proxy: 0,
      stitch_transparency_exposure_proxy: 0,
      negative_feedback_proxy: 0.6,
      derivation: {
        narrate_compliance_first_hits: 0,
        narrate_commerce_over_experience_hits: 0,
        narrate_stitch_transparency_voice_hits: 0,
        mean_conflict_count_when_nonzero: null,
        memory_replay_axis_narrate_hits: 0,
        memory_replay_penalized_hits: 0,
      },
    };
    const r = buildResearchConflictNegotiationReport({ mergeLog, teamMergeSummary, userCognitiveProfile });
    expect(r.primary_narrative_stance).toBe('COMPLIANCE_FIRST');
    expect(r.memory_replay).toBeUndefined();
  });

  it('同键 Compliance KEY_WRITE：即使体验轴偏负也不软化', () => {
    const mergeLog: ResearchContextMergeManifest[] = [
      {
        source: 'ComplianceResearchMember',
        phase: 'sequential',
        keysTouched: ['shared_alert'],
        evidenceRefsAppended: 0,
      },
      {
        source: 'HotelResearchMember',
        phase: 'parallel',
        keysTouched: ['shared_alert'],
        evidenceRefsAppended: 0,
      },
    ];
    const teamMergeSummary: TeamMergeSummary = {
      merge_strategy: 'DIFF_BASED_CLONE_MERGE',
      total_keys_touched: 1,
      scope_mutations: {
        compliance: { updated_keys: ['shared_alert'], evidence_added_count: 0 },
        hotel: { updated_keys: ['shared_alert'], evidence_added_count: 0 },
      },
      fallback_suture_count: 0,
    };
    const userCognitiveProfile = {
      schema_version: 1 as const,
      subject_ref: 'u1',
      updated_at: '2026-01-01T00:00:00.000Z',
      evidence_weight: 3,
      compliance_experience_axis: -0.9,
      price_sensitivity_proxy: 0,
      stitch_transparency_exposure_proxy: 0,
      negative_feedback_proxy: 0,
      derivation: {
        narrate_compliance_first_hits: 0,
        narrate_commerce_over_experience_hits: 0,
        narrate_stitch_transparency_voice_hits: 0,
        mean_conflict_count_when_nonzero: null,
        memory_replay_axis_narrate_hits: 0,
        memory_replay_penalized_hits: 0,
      },
    };
    const r = buildResearchConflictNegotiationReport({ mergeLog, teamMergeSummary, userCognitiveProfile });
    expect(r.conflict_flags).toContain('KEY_WRITE_CONTENTION');
    expect(r.primary_narrative_stance).toBe('COMPLIANCE_FIRST');
    expect(r.memory_replay).toBeUndefined();
  });

  it('6.0：传入 globalFinancialReport 与 trip 预算时附带 tolerance_bonus 与 mental_offset_hints', () => {
    const mergeLog: ResearchContextMergeManifest[] = [
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
    ];
    const teamMergeSummary: TeamMergeSummary = {
      merge_strategy: 'DIFF_BASED_CLONE_MERGE',
      total_keys_touched: 2,
      scope_mutations: { hotel: { updated_keys: ['a'], evidence_added_count: 0 } },
      fallback_suture_count: 1,
    };
    const userCognitiveProfile = {
      schema_version: 1 as const,
      subject_ref: 'u1',
      updated_at: '2026-01-01T00:00:00.000Z',
      evidence_weight: 3,
      compliance_experience_axis: 0,
      price_sensitivity_proxy: 0.85,
      stitch_transparency_exposure_proxy: 0,
      negative_feedback_proxy: 0,
      derivation: {
        narrate_compliance_first_hits: 0,
        narrate_commerce_over_experience_hits: 0,
        narrate_stitch_transparency_voice_hits: 0,
        mean_conflict_count_when_nonzero: null,
        memory_replay_axis_narrate_hits: 0,
        memory_replay_penalized_hits: 0,
      },
    };
    const globalFinancialReport: AccumulatedResearchFinancialReport = {
      lines: [],
      total_estimated_cost: 8000,
      budget_aggregate_savings: 2000,
      total_user_budget: 10000,
    };
    const r = buildResearchConflictNegotiationReport({
      mergeLog,
      teamMergeSummary,
      userCognitiveProfile,
      globalFinancialReport,
      researchTripTotalBudget: 10000,
    });
    expect(r.tolerance_bonus).toBeDefined();
    expect(r.tolerance_bonus).toBe(r.mental_offset_hints?.tolerance_bonus);
    expect(r.user_emotional_account?.current_tolerance_bonus).toBe(r.tolerance_bonus);
    expect(r.mental_offset_hints?.suture_aggressive_allowed).toBe(true);
    expect(r.stitch_tactic).toBe('AGGRESSIVE_COMPENSATION');
  });

  it('6.3：仅 realtimeRerollCount 也会产出 mental_offset_hints（熔断第二次重跑）', () => {
    const r = buildResearchConflictNegotiationReport({
      mergeLog: [],
      teamMergeSummary: undefined,
      realtimeRerollCount: 2,
    });
    expect(r.mental_offset_hints?.realtime_reroll_count).toBe(2);
    expect(r.mental_offset_hints?.frustration_circuit_active).toBe(true);
    expect(r.user_emotional_account?.frustration_score).toBeGreaterThan(0);
  });
});
