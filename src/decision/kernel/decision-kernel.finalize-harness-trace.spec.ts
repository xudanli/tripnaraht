/**
 * DecisionKernelService.finalizeHarnessTraceIfRecorded
 * — 与 Harness traceId 解析及 HARNESS_RECORD_TRACE 门控对齐
 */

import { DecisionKernelService } from './decision-kernel.service';
import type { DecisionState } from './decision-state.types';

describe('DecisionKernelService.finalizeHarnessTraceIfRecorded', () => {
  const prevTrace = process.env.HARNESS_RECORD_TRACE;
  const prevMode = process.env.HARNESS_TRACE_MODE;

  afterEach(() => {
    if (prevTrace === undefined) delete process.env.HARNESS_RECORD_TRACE;
    else process.env.HARNESS_RECORD_TRACE = prevTrace;
    if (prevMode === undefined) delete process.env.HARNESS_TRACE_MODE;
    else process.env.HARNESS_TRACE_MODE = prevMode;
  });

  const makeKernel = (harness: { finalizeRecordedTraceIfStillOpen: jest.Mock }) =>
    new DecisionKernelService(
      { merge: jest.fn(), commit: jest.fn(), appendHistoryDelta: jest.fn(), commitWithLock: jest.fn() } as any,
      { getReport: jest.fn(), getReportAsync: jest.fn() } as any,
      { getHints: jest.fn(), getHintsAsync: jest.fn() } as any,
      { buildContextPackage: jest.fn() } as any,
      { recordDecisionLog: jest.fn(), recordUserFeedback: jest.fn() } as any,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      harness as any,
    );

  const dso = (over: Partial<DecisionState> = {}): DecisionState =>
    ({
      requestId: 'rid-1',
      userIntent: {},
      tripState: {},
      environmentState: {},
      systemState: {
        requestId: 'rid-1',
        startedAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
        version: 0,
      },
      ...over,
    }) as DecisionState;

  it('no-op when trace mode is off', () => {
    delete process.env.HARNESS_RECORD_TRACE;
    delete process.env.HARNESS_TRACE_MODE;
    const finalizeIfOpen = jest.fn();
    const kernel = makeKernel({ finalizeRecordedTraceIfStillOpen: finalizeIfOpen });
    kernel.finalizeHarnessTraceIfRecorded(dso(), 'DONE');
    expect(finalizeIfOpen).not.toHaveBeenCalled();
  });

  it('delegates to runner with harness-${requestId} when activeTraceId absent (HARNESS_TRACE_MODE=full)', () => {
    process.env.HARNESS_TRACE_MODE = 'full';
    delete process.env.HARNESS_RECORD_TRACE;
    const finalizeIfOpen = jest.fn();
    const kernel = makeKernel({ finalizeRecordedTraceIfStillOpen: finalizeIfOpen });
    kernel.finalizeHarnessTraceIfRecorded(dso(), 'NEED_USER_CONFIRM');
    expect(finalizeIfOpen).toHaveBeenCalledTimes(1);
    expect(finalizeIfOpen).toHaveBeenCalledWith('harness-rid-1', 'NEED_USER_CONFIRM');
  });

  it('uses harnessRuntime.activeTraceId when set', () => {
    process.env.HARNESS_TRACE_MODE = 'full';
    const finalizeIfOpen = jest.fn();
    const kernel = makeKernel({ finalizeRecordedTraceIfStillOpen: finalizeIfOpen });
    kernel.finalizeHarnessTraceIfRecorded(
      {
        ...dso(),
        harnessRuntime: { activeTraceId: 'trace-custom', evidenceVersion: 'v1' },
      } as DecisionState,
      'BLOCKED',
    );
    expect(finalizeIfOpen).toHaveBeenCalledWith('trace-custom', 'BLOCKED');
  });

  it('returns early when requestId cannot be resolved', () => {
    process.env.HARNESS_TRACE_MODE = 'full';
    const finalizeIfOpen = jest.fn();
    const kernel = makeKernel({ finalizeRecordedTraceIfStillOpen: finalizeIfOpen });
    kernel.finalizeHarnessTraceIfRecorded(
      {
        userIntent: {},
        tripState: {},
        environmentState: {},
      } as DecisionState,
      'DONE',
    );
    expect(finalizeIfOpen).not.toHaveBeenCalled();
  });
});
