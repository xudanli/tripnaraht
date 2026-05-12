import { mergePrdTraceIntoLangGraphMetadata } from './langgraph-prd-metadata.util';

describe('langgraph-prd-metadata.util', () => {
  it('mergePrdTraceIntoLangGraphMetadata normalizes request + plan', () => {
    const m = mergePrdTraceIntoLangGraphMetadata({
      tripRunId: 'run-1',
      requestId: 'req-a',
      planVersion: 4,
    });
    expect(m?.request_id).toBe('req-a');
    expect(m?.requestId).toBe('req-a');
    expect(m?.plan_version).toBe(4);
    expect(m?.planVersion).toBe(4);
  });

  it('returns undefined for null/undefined', () => {
    expect(mergePrdTraceIntoLangGraphMetadata(null)).toBeUndefined();
    expect(mergePrdTraceIntoLangGraphMetadata(undefined)).toBeUndefined();
  });
});
