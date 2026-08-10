import {
  assembleConversationTurnResult,
  buildAssembleInputFromPayloadFragments,
  buildTeamNotifyAfterApply,
  buildTripConversationContextSnapshot,
  CONVERSATION_TURN_RESULT_SCHEMA_ID,
  detectGuideToPlanImportIntentHint,
  resolveConversationLifecycle,
} from './index';

describe('ConversationTurnResult / Assembler', () => {
  it('projects DATA_LOOKUP → trip_fact', () => {
    const turn = assembleConversationTurnResult({
      request_id: 'r1',
      trip_id: 't1',
      answer_text: '第 2 天安排黄金圈。',
      delivery_verdict: 'VERIFIED',
      data_lookup: {
        answer_text: '第 2 天安排黄金圈。',
        consultation_dashboard: {
          hero: { title_zh: '行程答问' },
          summary_cards: [{ title_zh: 'Day2', body_zh: '黄金圈' }],
        },
      },
    });
    expect(turn.schema_id).toBe(CONVERSATION_TURN_RESULT_SCHEMA_ID);
    expect(turn.primary_card).toBe('trip_fact');
    expect(turn.cards[0].kind).toBe('trip_fact');
  });

  it('projects ITINERARY_ADJUST → change_draft with before/after', () => {
    const turn = assembleConversationTurnResult({
      request_id: 'r2',
      answer_text: '已生成轻松版草案',
      itinerary_adjust: {
        itinerary_adjust: {
          target_date_iso: '2026-06-02',
          before_summary_zh: ['上午蓝湖', '下午黑沙滩'],
          after_summary_zh: ['上午室内温泉', '下午短途黑沙滩'],
          draft_id: 'iad:r2:2026-06-02',
          apply_gate: { can_apply: true, apply_path: 'conversations/c1/apply-itinerary-draft' },
          primary_action: {
            action: 'apply_itinerary_adjust',
            labelCN: '确认写入',
            params: { draft_id: 'iad:r2:2026-06-02' },
          },
        },
      },
    });
    expect(turn.primary_card).toBe('change_draft');
    const card = turn.cards.find((c) => c.kind === 'change_draft');
    expect(card).toMatchObject({
      kind: 'change_draft',
      target_date_iso: '2026-06-02',
      before_summary_zh: ['上午蓝湖', '下午黑沙滩'],
    });
    expect(turn.actions.some((a) => a.kind === 'apply_itinerary_adjust')).toBe(true);
  });

  it('projects Tradeoff → decision_options', () => {
    const turn = assembleConversationTurnResult({
      request_id: 'r3',
      answer_text: '建议等待',
      tradeoff: {
        negotiation_payload: {
          hash: 'h1',
          problem_zh: '高风路段',
          recommendation_zh: '等待 1 小时',
          alternatives: [
            { id: 'a', title_zh: '等待', recommended: true },
            { id: 'b', title_zh: '绕行' },
          ],
        },
      },
    });
    expect(turn.primary_card).toBe('decision_options');
    expect(turn.actions.some((a) => a.kind === 'confirm_negotiation')).toBe(true);
  });

  it('projects Gate → gate_risk conclusion-first', () => {
    const turn = assembleConversationTurnResult({
      request_id: 'r4',
      answer_text: '长文天气…',
      prefer_primary: 'gate_risk',
      gate: {
        gate_result: 'ADJUST_REQUIRED',
        conclusion_zh: '建议 30 分钟内出发。',
        alternatives_zh: ['缩短黑沙滩 30 分钟'],
      },
    });
    expect(turn.primary_card).toBe('gate_risk');
    const g = turn.cards.find((c) => c.kind === 'gate_risk');
    expect(g).toMatchObject({
      kind: 'gate_risk',
      conclusion_zh: '建议 30 分钟内出发。',
    });
  });

  it('projects Guide-to-Plan stub on import hint', () => {
    const turn = assembleConversationTurnResult({
      request_id: 'r5',
      answer_text: '识别到订单',
      guide_to_plan: { import_intent_hint: true },
    });
    expect(turn.cards.some((c) => c.kind === 'import_preview')).toBe(true);
    expect(turn.actions.some((a) => a.kind === 'open_guide_to_plan')).toBe(true);
  });

  it('projects Team fitness → team_action', () => {
    const turn = assembleConversationTurnResult({
      request_id: 'r6',
      answer_text: '还有人未提交',
      team: {
        team_fitness_submission_status: {
          pending: [{ display_name: 'danli xu' }],
          submitted: [{ display_name: 'Danny' }],
        },
      },
    });
    expect(turn.primary_card).toBe('team_action');
  });

  it('projects Apply → apply_receipt with rollback action', () => {
    const turn = assembleConversationTurnResult({
      request_id: 'r7',
      answer_text: '已写入',
      apply: {
        applied: true,
        plan_version_from: 2,
        plan_version_to: 3,
        affected_dates_iso: ['2026-06-02'],
        changed_summary_zh: ['第2天改为轻松节奏'],
        can_rollback: true,
      },
    });
    expect(turn.primary_card).toBe('apply_receipt');
    expect(turn.actions.some((a) => a.kind === 'rollback')).toBe(true);
  });

  it('TRAVELING focus prefers gate_risk over trip_fact', () => {
    const turn = assembleConversationTurnResult({
      request_id: 'r8',
      answer_text: '今天风大',
      traveling_execution_focus: true,
      lifecycle: 'TRAVELING',
      gate: {
        conclusion_zh: '建议提前出发。',
        gate_result: 'ALLOW',
      },
      data_lookup: { answer_text: '今天风大，详细分析…' },
    });
    expect(turn.primary_card).toBe('gate_risk');
    expect(turn.lifecycle).toBe('TRAVELING');
  });

  it('buildAssembleInputFromPayloadFragments dual-write helper', () => {
    const input = buildAssembleInputFromPayloadFragments({
      request_id: 'r9',
      trip_id: 't9',
      answer_text: 'hello',
      result_status: 'OK',
      payload: {
        ui_surface: 'consultation',
        suggested_operations: [
          {
            id: 'start_silent_vote',
            label: '发起投票',
            kind: 'client_navigation',
            payload: { route: 'silent_vote_create' },
          },
        ],
      },
      trusted_delivery_v1: {
        delivery_verdict: 'VERIFIED',
        user_confirm: { required: false },
        flawed_disclosure: { present: false },
      },
    });
    const turn = assembleConversationTurnResult(input);
    expect(turn.cards.some((c) => c.kind === 'team_action')).toBe(true);
  });
});

describe('lifecycle + context + g2p hint + team notify', () => {
  it('resolveConversationLifecycle', () => {
    expect(
      resolveConversationLifecycle({ tripStatus: 'TRAVELING' }),
    ).toBe('TRAVELING');
    expect(
      resolveConversationLifecycle({
        tripStatus: 'PLANNING',
        startDate: '2026-06-01',
        endDate: '2026-06-07',
        todayYmd: '2026-06-03',
      }),
    ).toBe('TRAVELING');
    expect(
      resolveConversationLifecycle({ tripStatus: 'COMPLETED' }),
    ).toBe('COMPLETED');
  });

  it('buildTripConversationContextSnapshot', () => {
    const snap = buildTripConversationContextSnapshot({
      trip_id: 't1',
      trip_status: 'PLANNING',
      plan_version: 4,
      start_date: '2026-06-01',
      end_date: '2026-06-07',
      today_ymd: '2026-05-20',
      destination: 'Iceland',
    });
    expect(snap.lifecycle).toBe('PLANNING');
    expect(snap.plan_version).toBe(4);
  });

  it('detectGuideToPlanImportIntentHint', () => {
    expect(detectGuideToPlanImportIntentHint('上传酒店订单')).toBe(true);
    expect(detectGuideToPlanImportIntentHint('今天怎么安排')).toBe(false);
  });

  it('buildTeamNotifyAfterApply', () => {
    const n = buildTeamNotifyAfterApply({
      trip_id: 't1',
      member_ids: ['u1', 'u2'],
      change_summary_zh: '第2天轻松化',
      affected_dates_iso: ['2026-06-02'],
      plan_version_to: 5,
    });
    expect(n?.notified_member_ids).toEqual(['u1', 'u2']);
    expect(n?.notify_summary_zh).toContain('v5');
  });

  it('buildTravelingExecutionConclusion is conclusion-first', () => {
    const {
      buildTravelingExecutionConclusion,
      shouldUseTravelingExecutionFocus,
    } = require('./traveling-execution-conclusion.util') as typeof import('./traveling-execution-conclusion.util');
    const c = buildTravelingExecutionConclusion({
      suggested_depart_within_minutes: 30,
      weather_risk_zh: '预计 16:00 后阵风增强',
      alternative_shorten_zh: '缩短黑沙滩停留 30 分钟',
    });
    expect(c.conclusion_zh).toContain('30 分钟内出发');
    expect(c.alternatives_zh[0]).toContain('黑沙滩');
    expect(
      shouldUseTravelingExecutionFocus({
        lifecycle: 'TRAVELING',
        message: '今天还能去杰古沙龙吗？',
      }),
    ).toBe(true);
  });

  it('mirrors accommodation_cards into conversation_turn_result envelope', () => {
    const { attachConversationTurnResultToPayload } = require('./attach-conversation-turn.util') as typeof import('./attach-conversation-turn.util');
    const cards = [
      { id: 'h1', name: 'Hotel A', nameZh: '酒店A' },
      { id: 'h2', name: 'Hotel B', nameZh: '酒店B' },
    ];
    const out = attachConversationTurnResultToPayload({
      request_id: 'hotel-1',
      trip_id: 't1',
      answer_text: '推荐以下住宿',
      result_status: 'OK',
      payload: {
        accommodation_cards: cards,
        accommodations: cards,
        hotel_search_meta: { strategy: 'single_stay' },
        trusted_delivery_v1: { delivery_verdict: 'VERIFIED' },
      },
      trusted_delivery_v1: { delivery_verdict: 'VERIFIED' },
    });
    const turn = out.conversation_turn_result as {
      accommodation_cards?: unknown[];
      hotel_search_meta?: { strategy?: string };
      primary_card?: string;
    };
    expect(turn.primary_card).toBe('trip_fact');
    expect(turn.accommodation_cards).toHaveLength(2);
    expect(turn.hotel_search_meta?.strategy).toBe('single_stay');
  });

  it('mirrors activity_booking_cards into conversation_turn_result envelope', () => {
    const { attachConversationTurnResultToPayload } = require('./attach-conversation-turn.util') as typeof import('./attach-conversation-turn.util');
    const cards = [
      {
        id: 'glacier_hike',
        nameZh: '冰川徒步（南岸）',
        url: 'https://www.icelandicmountainguides.is/',
        cta_zh: '去预订',
      },
    ];
    const out = attachConversationTurnResultToPayload({
      request_id: 'act-1',
      trip_id: 't1',
      answer_text: '可跳转运营商预订',
      result_status: 'OK',
      payload: {
        activity_booking_cards: cards,
        activity_search_meta: { mode: 'catalog_only' },
        trusted_delivery_v1: { delivery_verdict: 'VERIFIED' },
      },
      trusted_delivery_v1: { delivery_verdict: 'VERIFIED' },
    });
    const turn = out.conversation_turn_result as {
      activity_booking_cards?: Array<{ id?: string }>;
      activity_search_meta?: { mode?: string };
    };
    expect(turn.activity_booking_cards).toHaveLength(1);
    expect(turn.activity_booking_cards?.[0]?.id).toBe('glacier_hike');
    expect(turn.activity_search_meta?.mode).toBe('catalog_only');
  });

  it('mirrors car_rental_cards into conversation_turn_result envelope', () => {
    const { attachConversationTurnResultToPayload } = require('./attach-conversation-turn.util') as typeof import('./attach-conversation-turn.util');
    const cards = [
      {
        id: 'blue',
        nameZh: 'Blue Car Rental',
        url: 'https://www.bluecarrental.is/',
        cta_zh: '打开官网',
        source: 'catalog_fallback',
      },
    ];
    const out = attachConversationTurnResultToPayload({
      request_id: 'car-1',
      trip_id: 't1',
      answer_text: '推荐以下车行',
      result_status: 'OK',
      payload: {
        car_rental_cards: cards,
        car_rentals: cards,
        car_rental_search_meta: { fallback_dates_used: true },
        trusted_delivery_v1: { delivery_verdict: 'VERIFIED' },
      },
      trusted_delivery_v1: { delivery_verdict: 'VERIFIED' },
    });
    const turn = out.conversation_turn_result as {
      car_rental_cards?: Array<{ id?: string }>;
      car_rentals?: unknown[];
      ui_surface?: string;
      schema_id?: string;
    };
    expect(turn.car_rental_cards).toHaveLength(1);
    expect(turn.car_rental_cards?.[0]?.id).toBe('blue');
    expect(turn.car_rentals).toHaveLength(1);
    expect(turn.ui_surface).toBe('car_rental_cards');
  });

  it('mirrors flight_cards into conversation_turn_result envelope', () => {
    const { attachConversationTurnResultToPayload } = require('./attach-conversation-turn.util') as typeof import('./attach-conversation-turn.util');
    const cards = [
      {
        id: 'f1',
        nameZh: '国航 CA1234 杭州→成都',
        url: 'https://example.com/f1',
        cta_zh: '去飞猪订票',
        source: 'fliggy',
      },
    ];
    const out = attachConversationTurnResultToPayload({
      request_id: 'flight-1',
      trip_id: 't1',
      answer_text: '推荐以下航班',
      result_status: 'OK',
      payload: {
        flight_cards: cards,
        flight_inventory_snapshot: { provider: 'fliggy', legs: [] },
        trusted_delivery_v1: { delivery_verdict: 'VERIFIED' },
      },
      trusted_delivery_v1: { delivery_verdict: 'VERIFIED' },
    });
    const turn = out.conversation_turn_result as {
      flight_cards?: Array<{ id?: string }>;
      ui_surface?: string;
    };
    expect(turn.flight_cards).toHaveLength(1);
    expect(turn.flight_cards?.[0]?.id).toBe('f1');
    expect(turn.ui_surface).toBe('flight_cards');
  });
});
