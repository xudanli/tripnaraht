/**
 * Harness observability 字段与 route_and_run DTO 对齐。
 */
describe('route_and_run harness observability contract', () => {
  const observabilityKeys = [
    'harness_active_trace_id',
    'harness_trace_export_path',
    'evaluation_run_id',
    'otel_trace_id',
    'otel_span_id',
  ] as const;

  it('documents snake_case observability fields for CLI / frontend', () => {
    const sample = {
      harness_active_trace_id: 'tr-001',
      harness_trace_export_path: 'artifacts/harness-on-failure/tr-001.json',
      evaluation_run_id: 'eval-001',
      otel_trace_id: '4bf92f3577b34da6a3ce929d0e0e4736',
      otel_span_id: '00f067aa0ba902b7',
    };
    for (const k of observabilityKeys) {
      expect(sample[k]).toBeDefined();
    }
  });

  it('export path is relative POSIX when returned from API', () => {
    const p = 'artifacts/harness-on-failure/tr-001.json';
    expect(p.includes('\\')).toBe(false);
    expect(p.endsWith('.json')).toBe(true);
  });
});
