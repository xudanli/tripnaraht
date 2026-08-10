import {
  resolveOrchestrateEntry,
  resolveStateMachineEntryRedirect,
} from './request-router.util';

describe('resolveOrchestrateEntry', () => {
  it('routes bound-trip day view to lightweight', () => {
    const d = resolveOrchestrateEntry({
      tripId: 't1',
      message: '查看第三天的行程',
      routingTaskType: 'TRIP_PLANNING',
    });
    expect(d).toMatchObject({
      mode: 'LIGHTWEIGHT',
      handler: 'itinerary_day_view',
      tracePath: 'LIGHTWEIGHT',
      decisionDepth: 'REALITY_ONLY',
    });
  });

  it('routes light task types to knowledge_query', () => {
    const d = resolveOrchestrateEntry({
      tripId: undefined,
      message: '冰岛签证要多久',
      routingTaskType: 'DATA_LOOKUP',
    });
    expect(d).toMatchObject({
      mode: 'LIGHTWEIGHT',
      handler: 'knowledge_query',
      reason: 'routing_task_type_DATA_LOOKUP',
      decisionDepth: 'REALITY_ONLY',
    });
  });

  it('overrides light taskType to state machine for bound-trip adjust', () => {
    const d = resolveOrchestrateEntry({
      tripId: 't1',
      message: '把第2天行程轻松一点，少开车',
      routingTaskType: 'GENERIC_QA',
    });
    expect(d.mode).toBe('PLANNING_STATE_MACHINE');
    if (d.mode === 'PLANNING_STATE_MACHINE') {
      expect(d.entry).toBe('bound_trip_itinerary_adjust');
    }
  });

  it('routes bound TRIP_PLANNING to state machine', () => {
    const d = resolveOrchestrateEntry({
      tripId: 't1',
      message: '帮我完善整个行程',
      routingTaskType: 'TRIP_PLANNING',
    });
    expect(d).toMatchObject({
      mode: 'PLANNING_STATE_MACHINE',
      entry: 'bound_trip_planning',
    });
  });

  it('routes weather-impact ASSESS into SM (bypass admission / light taskType)', () => {
    const d = resolveOrchestrateEntry({
      tripId: 't1',
      message: '明天天气会影响行程吗？',
      routingTaskType: 'DATA_LOOKUP',
    });
    expect(d).toMatchObject({
      mode: 'PLANNING_STATE_MACHINE',
      reason: 'unified_intent_assess_impact_takeover',
      decisionDepth: 'FOCUSED_DECISION',
    });
  });

  it('P2 CONSULT takeover: 总体行程 → LIGHTWEIGHT（非 FULL_PLAN）', () => {
    const d = resolveOrchestrateEntry({
      tripId: 't1',
      message: '我的总体行程怎么样？',
      routingTaskType: 'TRIP_PLANNING',
    });
    expect(d.mode).toBe('LIGHTWEIGHT');
    expect(d).toMatchObject({
      handler: 'knowledge_query',
      reason: 'unified_intent_consult_readonly_takeover',
      decisionDepth: 'REALITY_ONLY',
    });
  });

  it('P2 CONSULT takeover: 午餐推荐 → LIGHTWEIGHT', () => {
    const d = resolveOrchestrateEntry({
      tripId: 't1',
      message: 'Day 3 附近有什么午餐推荐？',
      routingTaskType: 'TRIP_PLANNING',
    });
    expect(d.mode).toBe('LIGHTWEIGHT');
    expect((d as { reason: string }).reason).toBe('unified_intent_consult_readonly_takeover');
  });

  it('P3 LOCAL_EDIT 接管：安排午餐 → SM itinerary_adjust + FOCUSED_DECISION', () => {
    const d = resolveOrchestrateEntry({
      tripId: 't1',
      message: 'Day3行程我要安排午餐',
      routingTaskType: 'DATA_LOOKUP',
    });
    expect(d).toMatchObject({
      mode: 'PLANNING_STATE_MACHINE',
      entry: 'bound_trip_itinerary_adjust',
      reason: 'unified_intent_local_edit_takeover',
      decisionDepth: 'FOCUSED_DECISION',
    });
  });

  it('P3 SM redirect：LOCAL_EDIT 即使 taskType=DATA_LOOKUP 也不降轻量', () => {
    const r = resolveStateMachineEntryRedirect({
      tripId: 't1',
      message: 'Day3行程我要安排午餐',
      routingTaskType: 'DATA_LOOKUP',
    });
    expect(r.redirect).toBe(false);
    expect(r.reason).toBe('unified_intent_local_edit_takeover');
  });

  it('routes new trip with country to state machine', () => {
    const d = resolveOrchestrateEntry({
      tripId: '',
      message: '规划冰岛7日行程',
      routingTaskType: 'TRIP_PLANNING',
      extractCountryCode: () => 'IS',
    });
    expect(d).toMatchObject({
      mode: 'PLANNING_STATE_MACHINE',
      entry: 'new_trip_with_country',
      countryCode: 'IS',
      decisionDepth: 'FULL_SIMULATION',
    });
  });

  it('asks for destination when new trip lacks country', () => {
    const d = resolveOrchestrateEntry({
      tripId: '',
      message: '帮我规划一个行程',
      routingTaskType: 'TRIP_PLANNING',
      extractCountryCode: () => undefined,
    });
    expect(d.mode).toBe('NEED_DESTINATION_COUNTRY');
  });

  it('defaults to DYNAMIC_DAG', () => {
    const d = resolveOrchestrateEntry({
      tripId: undefined,
      message: 'hello',
      routingTaskType: undefined,
    });
    expect(d).toMatchObject({
      mode: 'DYNAMIC_DAG',
      tracePath: 'CLAUDE_DYNAMIC',
    });
  });

  it('routes Australia travel plan into SM with AU', () => {
    const d = resolveOrchestrateEntry({
      tripId: '',
      message: 'Australia travel plan',
      routingTaskType: 'TRIP_PLANNING',
    });
    expect(d).toMatchObject({
      mode: 'PLANNING_STATE_MACHINE',
      entry: 'new_trip_with_country',
      countryCode: 'AU',
    });
  });

  it('soft-clarifies Alps region instead of inventing country AL', () => {
    const d = resolveOrchestrateEntry({
      tripId: '',
      message: '阿尔卑斯 7 日自驾',
      routingTaskType: 'TRIP_PLANNING',
    });
    expect(d).toMatchObject({
      mode: 'NEED_DESTINATION_COUNTRY',
      reason: 'new_trip_region_needs_country',
      regionCode: 'ALPS',
    });
  });

  it('does not hard-reject generic trip planning tips without destination', () => {
    const d = resolveOrchestrateEntry({
      tripId: '',
      message: 'tell me about trip planning tips',
      routingTaskType: undefined,
    });
    expect(d.mode).not.toBe('NEED_DESTINATION_COUNTRY');
    expect(['DYNAMIC_DAG', 'LIGHTWEIGHT']).toContain(d.mode);
  });

  it('bare Day pace complaint stays light consult; adjust verb goes SM', () => {
    const consult = resolveOrchestrateEntry({
      tripId: 't1',
      message: '第三天太赶了',
      routingTaskType: 'TRIP_PLANNING',
    });
    expect(consult.mode).toBe('LIGHTWEIGHT');

    const adjust = resolveOrchestrateEntry({
      tripId: 't1',
      message: '第三天太赶了，轻松一点',
      routingTaskType: 'TRIP_PLANNING',
    });
    expect(adjust.mode).toBe('PLANNING_STATE_MACHINE');
    if (adjust.mode === 'PLANNING_STATE_MACHINE') {
      expect(adjust.entry).toBe('bound_trip_itinerary_adjust');
    }
  });
});

describe('resolveStateMachineEntryRedirect', () => {
  it('redirects light task types to dynamic light path', () => {
    expect(
      resolveStateMachineEntryRedirect({
        routingTaskType: 'DATA_LOOKUP',
        message: 'q',
      }),
    ).toMatchObject({
      redirect: true,
      to: 'CLAUDE_DYNAMIC_LIGHT',
    });
  });

  it('continues SM for TRIP_PLANNING', () => {
    expect(
      resolveStateMachineEntryRedirect({
        tripId: 't1',
        routingTaskType: 'TRIP_PLANNING',
        message: '完善行程',
      }),
    ).toEqual({ redirect: false, reason: 'sm_entry_continue' });
  });
});
