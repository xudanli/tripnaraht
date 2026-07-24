describe('harness-trace-mode.util', () => {
  const prevMode = process.env.HARNESS_TRACE_MODE;
  const prevRecord = process.env.HARNESS_RECORD_TRACE;

  afterEach(() => {
    if (prevMode === undefined) delete process.env.HARNESS_TRACE_MODE;
    else process.env.HARNESS_TRACE_MODE = prevMode;
    if (prevRecord === undefined) delete process.env.HARNESS_RECORD_TRACE;
    else process.env.HARNESS_RECORD_TRACE = prevRecord;
  });

  it('maps HARNESS_RECORD_TRACE=1 to full when HARNESS_TRACE_MODE unset', async () => {
    delete process.env.HARNESS_TRACE_MODE;
    process.env.HARNESS_RECORD_TRACE = '1';
    const { getHarnessTraceMode, shouldSkipHarnessTraceAppend, shouldRecordOnFailureRetrofit } =
      await import('./harness-trace-mode.util');
    expect(getHarnessTraceMode()).toBe('full');
    expect(shouldSkipHarnessTraceAppend()).toBe(false);
    expect(shouldRecordOnFailureRetrofit()).toBe(false);
  });

  it('on-failure skips append but enables retrofit', async () => {
    process.env.HARNESS_TRACE_MODE = 'on-failure';
    delete process.env.HARNESS_RECORD_TRACE;
    const { getHarnessTraceMode, shouldSkipHarnessTraceAppend, shouldRecordOnFailureRetrofit } =
      await import('./harness-trace-mode.util');
    expect(getHarnessTraceMode()).toBe('on-failure');
    expect(shouldSkipHarnessTraceAppend()).toBe(true);
    expect(shouldRecordOnFailureRetrofit()).toBe(true);
  });
});
