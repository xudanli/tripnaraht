import {
  buildDefaultTripConsultationSuggestedOperations,
  buildDiningAnchorSuggestedOperations,
  buildSilentVoteCreateSuggestedOperation,
  extractSuggestedOperationsFromAnswer,
  isSilentVoteCreateIntentMessage,
  mergeSuggestedOperations,
} from './trip-consultation-suggested-operations.util';

describe('trip-consultation-suggested-operations.util', () => {
  it('extracts JSON block and strips markers', () => {
    const raw = `你好。\n\n<<<SUGGESTED_OPS_JSON>>>\n[{"id":"a","label":"执行","kind":"route_and_run_message","payload":{"message":"帮我改"}}]\n<<<END_SUGGESTED_OPS_JSON>>>`;
    const { cleanText, operations } = extractSuggestedOperationsFromAnswer(raw, 'trip-1');
    expect(cleanText).toBe('你好。');
    expect(operations).toHaveLength(1);
    expect(operations[0].payload?.trip_id).toBe('trip-1');
    expect(operations[0].payload?.message).toContain('帮我改');
  });

  it('keeps silent_vote_create client_navigation from model JSON', () => {
    const raw = `<<<SUGGESTED_OPS_JSON>>>
[{"id":"start_silent_vote","label":"发起投票","kind":"client_navigation","payload":{"route":"silent_vote_create","trip_id":"ignored"}}]
<<<END_SUGGESTED_OPS_JSON>>>`;
    const { operations } = extractSuggestedOperationsFromAnswer(raw, 'trip_15c50a69931845ca');
    expect(operations).toHaveLength(1);
    expect(operations[0].payload?.route).toBe('silent_vote_create');
    expect(operations[0].payload?.action).toBe('silent_vote_create');
    expect(operations[0].payload?.trip_id).toBe('trip_15c50a69931845ca');
  });

  it('accepts vote action-only payload', () => {
    const raw = `<<<SUGGESTED_OPS_JSON>>>
[{"id":"v1","label":"团队投票","kind":"client_navigation","payload":{"action":"team.start_vote"}}]
<<<END_SUGGESTED_OPS_JSON>>>`;
    const { operations } = extractSuggestedOperationsFromAnswer(raw, 'uuid-1');
    expect(operations[0].payload?.route).toBe('silent_vote_create');
    expect(operations[0].payload?.action).toBe('team.start_vote');
  });

  it('rewrites hotel-search client_navigation mistagged as silent_vote into route_and_run_message', () => {
    const raw = `<<<SUGGESTED_OPS_JSON>>>
[{"id":"search_grund","label":"搜索格伦达菲厄泽酒店","kind":"client_navigation","payload":{"route":"silent_vote_create","trip_id":"x"}}]
<<<END_SUGGESTED_OPS_JSON>>>`;
    const { operations } = extractSuggestedOperationsFromAnswer(raw, 'trip_15c50a69931845ca');
    expect(operations).toHaveLength(1);
    expect(operations[0].kind).toBe('route_and_run_message');
    expect(operations[0].payload?.route).toBeUndefined();
    expect(operations[0].payload?.action).toBeUndefined();
    expect(String(operations[0].payload?.message)).toContain('搜索格伦达菲厄泽酒店');
  });

  it('drops non-vote client_navigation that only carries silent_vote route', () => {
    const raw = `<<<SUGGESTED_OPS_JSON>>>
[{"id":"open_x","label":"查看详情","kind":"client_navigation","payload":{"route":"silent_vote_create"}}]
<<<END_SUGGESTED_OPS_JSON>>>`;
    const { operations } = extractSuggestedOperationsFromAnswer(raw, 't1');
    expect(operations).toHaveLength(0);
  });

  it('defaults include silent vote CTA when user asks to start a vote', () => {
    expect(isSilentVoteCreateIntentMessage('帮我发起一次匿名投票')).toBe(true);
    const d = buildDefaultTripConsultationSuggestedOperations('trip_abc', {
      planning_handoff_message: '帮我发起投票',
    });
    expect(d[0].id).toBe('start_silent_vote');
    expect(d[0].payload?.route).toBe('silent_vote_create');
    expect(buildSilentVoteCreateSuggestedOperation('t')?.label).toBe('发起投票');
  });

  it('merge keeps parsed first then defaults', () => {
    const d = buildDefaultTripConsultationSuggestedOperations('t1');
    const merged = mergeSuggestedOperations([], d);
    expect(merged.length).toBeGreaterThanOrEqual(2);
  });

  it('merge dedupes client_navigation by route so model timeline + default yields one button', () => {
    const parsed = [
      {
        id: 'navigate_to_timeline',
        label: '查看当前行程时间线',
        kind: 'client_navigation' as const,
        payload: { route: 'timeline' as const, trip_id: 't1' },
      },
    ];
    const defaults = buildDefaultTripConsultationSuggestedOperations('t1', {
      planning_handoff_message: '问',
    });
    const merged = mergeSuggestedOperations(parsed, defaults);
    const timelineNavs = merged.filter(
      (o) => o.kind === 'client_navigation' && o.payload?.route === 'timeline',
    );
    expect(timelineNavs).toHaveLength(1);
    expect(timelineNavs[0].id).toBe('navigate_to_timeline');
  });

  it('planning handoff prepends route_and_run_message with intent_mode and user ask', () => {
    const d = buildDefaultTripConsultationSuggestedOperations('t2', {
      planning_handoff_message: '西峡湾想坐飞机',
    });
    expect(d[0].id).toBe('handoff_trip_planning_same_ask');
    expect(d[0].payload?.intent_mode).toBe('TRIP_PLANNING');
    expect(String(d[0].payload?.message)).toContain('西峡湾想坐飞机');
    expect(String(d[0].payload?.message)).toContain('行程规划模式');
  });

  it('buildDiningAnchorSuggestedOperations maps days to route_and_run_message', () => {
    const blob = `【当前已入库日程草案】
- 2026-06-01: X
日程项总数: 1`;
    const ops = buildDiningAnchorSuggestedOperations('trip-z', blob, 4);
    expect(ops).toHaveLength(1);
    expect(ops[0].id).toBe('dining_anchor_day_1');
    expect(ops[0].kind).toBe('route_and_run_message');
    expect(ops[0].payload?.message).toContain('第1天');
    expect(ops[0].payload?.trip_id).toBe('trip-z');
  });
});
