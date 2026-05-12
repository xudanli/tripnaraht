import {
  buildDefaultTripConsultationSuggestedOperations,
  buildDiningAnchorSuggestedOperations,
  extractSuggestedOperationsFromAnswer,
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
    const defaults = buildDefaultTripConsultationSuggestedOperations('t1', { planning_handoff_message: '问' });
    const merged = mergeSuggestedOperations(parsed, defaults);
    const timelineNavs = merged.filter((o) => o.kind === 'client_navigation' && o.payload?.route === 'timeline');
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
