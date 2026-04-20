import { traceRefFromRouteAndRunObservability } from './evaluation-harness-report-refs';

describe('evaluation-harness-report-refs', () => {
  it('traceRefFromRouteAndRunObservability maps observability fields', () => {
    const row = traceRefFromRouteAndRunObservability('case-1', 'run-uuid', {
      harness_active_trace_id: 'harness-req-1',
      harness_trace_export_path: 'artifacts/trace/harness-req-1.json',
      evaluation_run_id: 'run-uuid',
    });
    expect(row).toEqual({
      caseId: 'case-1',
      runId: 'run-uuid',
      traceId: 'harness-req-1',
      path: 'artifacts/trace/harness-req-1.json',
    });
  });
});
