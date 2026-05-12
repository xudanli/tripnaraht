import { buildConsultationDashboardFallbackFromSuggestedOperations } from './consultation-dashboard-fallback.util';

describe('consultation-dashboard-fallback', () => {
  it('builds dashboard from suggested_operations', () => {
    const d = buildConsultationDashboardFallbackFromSuggestedOperations([
      {
        id: 'open_tl',
        label: '查看时间轴',
        kind: 'client_navigation',
        payload: { trip_id: 't1', route: 'timeline' },
      },
      {
        id: 'msg',
        label: '按建议优化',
        kind: 'route_and_run_message',
        payload: { trip_id: 't1', message: '请优化行程' },
      },
    ]);
    expect(d?.version).toBe(1);
    expect(d?.dashboard_origin).toBe('fallback');
    expect(d?.summary_cards?.length).toBe(2);
    expect(d?.primary_cta_label).toBe('查看时间轴');
  });

  it('returns undefined when no operations and no enrich context', () => {
    expect(buildConsultationDashboardFallbackFromSuggestedOperations(undefined)).toBeUndefined();
    expect(buildConsultationDashboardFallbackFromSuggestedOperations([])).toBeUndefined();
  });

  it('builds from RAG citation count alone', () => {
    const d = buildConsultationDashboardFallbackFromSuggestedOperations(undefined, {
      rag_citation_count: 3,
    });
    expect(d?.headline).toBe('参考信息');
    expect(d?.summary_cards?.[0]?.title).toBe('知识依据');
    expect(d?.summary_cards?.[0]?.value).toContain('3');
    expect(d?.primary_cta_label).toBeUndefined();
  });

  it('merges ops with enrich cards', () => {
    const d = buildConsultationDashboardFallbackFromSuggestedOperations(
      [{ id: 'a', label: '优化', kind: 'route_and_run_message', payload: { message: 'x' } }],
      {
        rag_citation_count: 2,
        hotel_search_meta: { disclaimer_zh: '每晚采样仅示意' },
      },
    );
    expect(d?.summary_cards?.length).toBe(3);
    expect(d?.summary_cards?.some((c) => c.title === '知识依据')).toBe(true);
    expect(d?.summary_cards?.some((c) => c.title === '住宿检索')).toBe(true);
    expect(d?.subheadline).toContain('检索');
  });

  it('adds live_sensor_audit card with two-line hint on failures', () => {
    const d = buildConsultationDashboardFallbackFromSuggestedOperations(undefined, {
      live_sensor_audit: [
        { tool_id: 'live_tool.mcp.weather', ok: true, latency_ms: 120 },
        { tool_id: 'live_tool.mcp.hotel', ok: false, error: 'timeout' },
      ],
    });
    expect(d?.summary_cards?.[0]?.title).toBe('实时查询');
    expect(d?.summary_cards?.[0]?.tone).toBe('warning');
    const hint = d?.summary_cards?.[0]?.hint ?? '';
    expect(hint).toContain('天气');
    expect(hint).toContain('\n');
    expect(hint).toContain('失败 ·');
    expect(hint).toContain('住宿:');
    expect(hint).toContain('timeout');
  });

  it('truncates very long MCP error text in hint', () => {
    const longErr = 'x'.repeat(120);
    const d = buildConsultationDashboardFallbackFromSuggestedOperations(undefined, {
      live_sensor_audit: [{ tool_id: 'live_tool.mcp.weather', ok: false, error: longErr }],
    });
    const hint = d?.summary_cards?.[0]?.hint ?? '';
    expect(hint.length).toBeLessThanOrEqual(221);
    expect(hint).toContain('…');
  });

  it('orders ops before live before rag', () => {
    const d = buildConsultationDashboardFallbackFromSuggestedOperations(
      [{ id: 'x', label: '下一步', kind: 'route_and_run_message', payload: { message: 'm' } }],
      {
        live_sensor_audit: [{ tool_id: 'live_tool.mcp.car_rental', ok: true }],
        rag_citation_count: 1,
      },
    );
    expect(d?.summary_cards?.map((c) => c.title)).toEqual(['对话指令', '实时查询', '知识依据']);
  });
});
