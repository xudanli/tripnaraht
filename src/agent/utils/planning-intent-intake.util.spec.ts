import type { OrchestratorState, TripPlanRequest } from '../interfaces/trip-plan.interface';
import { EvidenceLevel } from './planning-intent-processor.util';
import {
  applyPlanningPhaseIntentToIntake,
  appendPlanningPhaseIntentSystemHints,
  extractContingencySegmentIds,
  inferAvailableEvidenceLevel,
} from './planning-intent-intake.util';
import { mergePlanningPhaseIntentIntoNarration } from './planning-intent-narrate.util';

describe('planning-intent-intake.util', () => {
  const baseState = (): OrchestratorState =>
    ({
      request_id: 'req-planning-intent-1',
      current_step: 'INTAKE',
      decision_log: [],
      metadata: {},
      trip_plan_request: {
        destination: '冰岛',
        ontology_context: { destination: { country_code: 'IS' } },
        message: '',
      } as TripPlanRequest,
    }) as OrchestratorState;

  it('applyPlanningPhaseIntentToIntake 写入 metadata 与 decision_log', () => {
    const state = baseState();
    const query = '如果下个月西峡湾暴雪封路了，咱们的预案能多花几天绕过去？';
    const payload = applyPlanningPhaseIntentToIntake({
      intakeMsg: query,
      state,
      trip: state.trip_plan_request,
    });

    expect(payload).not.toBeNull();
    expect(payload!.sub_signals.scenario_planning_requested).toBe(true);
    expect((state.metadata as Record<string, unknown>).planning_phase_intent).toEqual(payload);
    expect(state.decision_log.some((e) => e.metadata?.system_action === 'PLANNING_PHASE_INTENT_CLASSIFIED')).toBe(
      true,
    );
    expect(state.trip_plan_request?.message).toContain('[SYSTEM_MESSAGE][PLANNING_PHASE_INTENT]');
  });

  it('D2 100% 承诺在 L1 证据下触发 supply_chain_safety 熔断', () => {
    const state = baseState();
    const query = '智能体能否100%确保新藏线沿途充电桩不会让我趴窝？';
    const payload = applyPlanningPhaseIntentToIntake({
      intakeMsg: query,
      state,
      trip: state.trip_plan_request,
    });

    expect(payload!.sub_signals.supply_chain_verification_requested).toBe(true);
    expect(payload!.supply_chain_safety?.safeToPromise).toBe(false);
    expect(payload!.available_evidence_level).toBe(EvidenceLevel.L1_HISTORICAL_STAT);
  });

  it('inferAvailableEvidenceLevel 识别 SafeTravel L3', () => {
    const state = baseState();
    state.research_data = { safetravel_advisories: { items: [] } };
    expect(inferAvailableEvidenceLevel(state, '封路怎么办')).toBe(EvidenceLevel.L3_DETERMINISTIC);
  });

  it('extractContingencySegmentIds 从第 N 天话术提取', () => {
    const ids = extractContingencySegmentIds({
      intakeMsg: '如果 Day 3 冰川徒步取消，后面酒店会全废吗？',
    });
    expect(ids).toContain('seg_day_3');
  });

  it('D3 多人仲裁写入 party_negotiation 与组织力预演', () => {
    const state = baseState();
    const request = {
      request_id: state.request_id,
      trip_id: 'trip-is',
      options: {},
    } as import('../dto/route-and-run.dto').RouteAndRunRequestDto;
    const query =
      '我们一共 4 个人拼车去独库公路，我想特种兵流，朋友想躺平，遗憾度最低的折中排期？';
    const payload = applyPlanningPhaseIntentToIntake({
      intakeMsg: query,
      state,
      trip: state.trip_plan_request,
      tripDaySnapshots: [
        { dayNumber: 2, dateYmd: '2026-07-02', itemCount: 5, textBlob: '' },
        { dayNumber: 5, dateYmd: '2026-07-05', itemCount: 1, textBlob: '' },
      ],
      request,
    });
    expect(payload!.party_negotiation?.party_size).toBe(4);
    expect(payload!.party_negotiation!.regret_upper_bound).toBeGreaterThan(0.3);
    expect(request.options?.party_negotiation_member_profiles?.length).toBe(4);
    expect(
      payload!.party_negotiation?.organizational_robustness_preview?.organizational_robustness_score,
    ).toBeGreaterThanOrEqual(0);
  });

  it('D4 空间锚点冲突写入 spatial_intent', () => {
    const state = baseState();
    const query = '把这个机位插进 Day 4，土路经常塌方';
    const payload = applyPlanningPhaseIntentToIntake({
      intakeMsg: query,
      state,
      trip: state.trip_plan_request,
      tripDaySnapshots: [
        { dayNumber: 4, dateYmd: '2026-07-04', itemCount: 6, textBlob: '' },
        { dayNumber: 5, dateYmd: '2026-07-05', itemCount: 1, textBlob: '' },
      ],
    });
    expect(payload!.spatial_intent?.feasible).toBe(false);
    expect(payload!.spatial_intent?.suggested_day_number).toBe(5);
  });
});

describe('planning-intent-narrate.util', () => {
  it('mergePlanningPhaseIntentIntoNarration 注入供应链熔断 warning', () => {
    const state = {
      metadata: {
        planning_phase_intent: {
          sub_signals: {
            scenario_planning_requested: false,
            supply_chain_verification_requested: true,
            party_negotiation_requested: false,
            spatial_intent_capture_requested: false,
          },
          supply_chain_safety: {
            safeToPromise: false,
            enforcedLevel: EvidenceLevel.L1_HISTORICAL_STAT,
            processedResponsePrefix: '> **[Decision OS 供应链安全警告]** 系统已拦截绝对承诺',
          },
        },
      },
    } as OrchestratorState;

    const out = mergePlanningPhaseIntentIntoNarration(
      { user_friendly_summary: '', day_by_day_narrative: [], highlights: [], tips: [], warnings: [] },
      state,
    );

    expect(out.warnings?.[0]).toContain('供应链安全警告');
    expect(out.tips?.some((t) => t.includes('Gate 约束'))).toBe(true);
  });

  it('mergePlanningPhaseIntentIntoNarration 注入双轨预案 tip', () => {
    const state = {
      metadata: {
        planning_phase_intent: {
          sub_signals: {
            scenario_planning_requested: true,
            supply_chain_verification_requested: false,
            party_negotiation_requested: false,
            spatial_intent_capture_requested: false,
          },
          contingency_branches: [
            {
              trigger_condition: "segment_health:seg_day_3 === 'CRITICAL_DISRUPTION'",
              impacted_segment_ids: ['seg_day_3'],
              alternative_route_token: 'alt_token_for_seg_day_3_via_fallback_engine',
              expected_utility_ratio: 0.85,
            },
          ],
        },
      },
    } as OrchestratorState;

    const out = mergePlanningPhaseIntentIntoNarration(
      { user_friendly_summary: '行程草案', day_by_day_narrative: [], highlights: [], tips: [], warnings: [] },
      state,
    );

    expect(out.tips?.some((t) => t.includes('双轨预案'))).toBe(true);
    expect(out.user_friendly_summary).toContain('双轨');
  });

  it('mergePlanningPhaseIntentIntoNarration 注入 D3 组织力预演', () => {
    const state = {
      metadata: {
        planning_phase_intent: {
          sub_signals: {
            scenario_planning_requested: false,
            supply_chain_verification_requested: false,
            party_negotiation_requested: true,
            spatial_intent_capture_requested: false,
          },
          party_negotiation: {
            party_size: 4,
            member_profiles: [],
            aggregated_pace: 'moderate',
            aggregated_risk_tolerance: 'MEDIUM',
            regret_upper_bound: 0.55,
            requires_hitl_clarification: false,
            organizational_robustness_preview: {
              organizational_robustness_score: 0.62,
              physical_robustness_score: 0.9,
              combined_robustness_score: 0.62,
              sample_count: 15,
              peak_social_stress_day: '2026-07-02',
              bottlenecks: [],
              timeline: [],
              is_preview: true,
              source: 'intake_stub_itinerary',
            },
          },
        },
      },
    } as OrchestratorState;

    const out = mergePlanningPhaseIntentIntoNarration(
      { user_friendly_summary: '', day_by_day_narrative: [], highlights: [], tips: [], warnings: [] },
      state,
    );

    expect(out.tips?.some((t) => t.includes('搭子组织力'))).toBe(true);
    expect(out.warnings?.some((w) => typeof w === 'string' && w.includes('社交摩擦预警'))).toBe(true);
  });

  it('mergePlanningPhaseIntentIntoNarration 注入 D3/D4 文案', () => {
    const state = {
      metadata: {
        planning_phase_intent: {
          sub_signals: {
            scenario_planning_requested: false,
            supply_chain_verification_requested: false,
            party_negotiation_requested: true,
            spatial_intent_capture_requested: true,
          },
          party_negotiation: {
            party_size: 4,
            member_profiles: [],
            aggregated_pace: 'moderate',
            aggregated_risk_tolerance: 'MEDIUM',
            regret_upper_bound: 0.55,
            branch_policies: [{ trigger_condition: 'x', hold_route_token: 'h', proceed_route_token: 'p', dissent_member_ids: [] }],
            requires_hitl_clarification: true,
          },
          spatial_intent: {
            feasible: false,
            target_day_number: 4,
            conflicts: [{ type: 'TIME_WINDOW', severity: 'BLOCK', message_zh: '满' }],
            suggested_day_number: 5,
          },
        },
      },
    } as OrchestratorState;

    const out = mergePlanningPhaseIntentIntoNarration(
      { user_friendly_summary: '', day_by_day_narrative: [], highlights: [], tips: [], warnings: [] },
      state,
    );

    expect(out.tips?.some((t) => t.includes('多人仲裁'))).toBe(true);
    expect(out.warnings?.some((w) => typeof w === 'string' && w.includes('空间冲突'))).toBe(true);
  });
});

describe('appendPlanningPhaseIntentSystemHints', () => {
  it('双轨 + 供应链同时写入 SYSTEM_MESSAGE', () => {
    const trip = { message: '用户原话' } as TripPlanRequest;
    appendPlanningPhaseIntentSystemHints(trip, {
      sub_signals: {
        scenario_planning_requested: true,
        supply_chain_verification_requested: true,
        party_negotiation_requested: false,
        spatial_intent_capture_requested: false,
      },
      contingency_branches: [
        {
          trigger_condition: 'x',
          impacted_segment_ids: ['seg_day_1'],
          alternative_route_token: 'alt',
          expected_utility_ratio: 0.85,
        },
      ],
      available_evidence_level: EvidenceLevel.L1_HISTORICAL_STAT,
      supply_chain_safety: {
        safeToPromise: false,
        enforcedLevel: EvidenceLevel.L1_HISTORICAL_STAT,
        processedResponsePrefix: 'warn',
      },
    });

    expect(trip.message).toContain('PLANNING_PHASE_INTENT');
    expect(trip.message).toContain('dual-track');
    expect(trip.message).toContain('L1_HISTORICAL_STAT');
  });
});
