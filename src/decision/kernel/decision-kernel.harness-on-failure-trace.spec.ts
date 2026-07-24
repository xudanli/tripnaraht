/**
 * HARNESS_TRACE_MODE=on-failure — Kernel 单点收口：成功零 append，失败逆向合成。
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DecisionKernelService } from './decision-kernel.service';
import type { DecisionState } from './decision-state.types';
import { HarnessStepName } from '../../harness/contracts/harness-step.types';
import { HarnessTraceRecorderService } from '../../harness/tracing/harness-trace-recorder.service';
import { HarnessTraceFilesystemExportService } from '../../harness/tracing/harness-trace-filesystem-export.service';
import type { HarnessStepExecutionResult } from '../../harness/runtime/harness-step-runner.service';
import { HarnessFailureLevel } from '../../harness/failures/failure-level.enum';

describe('DecisionKernelService — HARNESS_TRACE_MODE=on-failure', () => {
  const prevMode = process.env.HARNESS_TRACE_MODE;
  const prevRecord = process.env.HARNESS_RECORD_TRACE;
  const prevExport = process.env.HARNESS_TRACE_EXPORT_DIR;

  let exportDir: string;

  beforeEach(() => {
    exportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-on-failure-'));
    process.env.HARNESS_TRACE_MODE = 'on-failure';
    delete process.env.HARNESS_RECORD_TRACE;
    process.env.HARNESS_TRACE_EXPORT_DIR = exportDir;
    process.env.HARNESS_TRACE_EXPORT_FLAT = '1';
  });

  afterEach(() => {
    if (prevMode === undefined) delete process.env.HARNESS_TRACE_MODE;
    else process.env.HARNESS_TRACE_MODE = prevMode;
    if (prevRecord === undefined) delete process.env.HARNESS_RECORD_TRACE;
    else process.env.HARNESS_RECORD_TRACE = prevRecord;
    if (prevExport === undefined) delete process.env.HARNESS_TRACE_EXPORT_DIR;
    else process.env.HARNESS_TRACE_EXPORT_DIR = prevExport;
    delete process.env.HARNESS_TRACE_EXPORT_FLAT;
    try {
      fs.rmSync(exportDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  const dso = (): DecisionState =>
    ({
      requestId: 'req_fail_01',
      userIntent: { destination: 'IS' },
      tripState: { planDraft: { days: [] } },
      environmentState: {},
      systemState: {
        requestId: 'req_fail_01',
        startedAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
        version: 0,
        currentPhase: 'PLAN_GEN',
      },
      harnessRuntime: { activeTraceId: 'trace-req_fail_01' },
    }) as DecisionState;

  const makeKernel = (opts: {
    runStep: jest.Mock;
    recorder?: HarnessTraceRecorderService;
  }) => {
    const recorder = opts.recorder ?? new HarnessTraceRecorderService();
    const exportSvc = new HarnessTraceFilesystemExportService(recorder);
    const runner = { runStep: opts.runStep, finalizeRecordedTrace: jest.fn() };
    const merge = jest.fn((s: DecisionState, p: Record<string, unknown>) => {
      const next = { ...s, ...p } as DecisionState;
      if (p.harnessRuntime) {
        next.harnessRuntime = {
          ...(s.harnessRuntime ?? {}),
          ...(p.harnessRuntime as object),
        } as DecisionState['harnessRuntime'];
      }
      return next;
    });
    return {
      kernel: new DecisionKernelService(
        { merge, commit: jest.fn(), appendHistoryDelta: jest.fn(), commitWithLock: jest.fn() } as any,
        { getReport: jest.fn(), getReportAsync: jest.fn() } as any,
        { getHints: jest.fn(), getHintsAsync: jest.fn() } as any,
        { buildContextPackage: jest.fn() } as any,
        { recordDecisionLog: jest.fn(), recordUserFeedback: jest.fn() } as any,
        undefined,
        undefined,
        { execute: jest.fn().mockResolvedValue({ itinerary: { days: [{ day: 1, items: [] }] } }) } as any,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        runner as any,
        recorder,
        exportSvc,
      ),
      recorder,
      runner,
    };
  };

  const failedPlanOutcome = (): HarnessStepExecutionResult => ({
    step: HarnessStepName.PLAN_GEN,
    status: 'FAILED',
    validationResults: [
      {
        passed: false,
        severity: 'L2',
        code: 'budget-overrun',
        message: 'Budget exceeding limits',
      },
    ],
    failureEvents: [
      {
        traceId: 'trace-req_fail_01',
        requestId: 'req_fail_01',
        step: HarnessStepName.PLAN_GEN,
        level: HarnessFailureLevel.LEVEL_2_LOGIC_GAP,
        type: 'LOGIC',
        code: 'budget-overrun',
        message: 'Budget exceeding limits',
        autoRecoverable: true,
        suggestedAction: 'RETURN_TO_RESEARCH',
        createdAt: new Date().toISOString(),
      },
    ],
    durationMs: 3,
  });

  it('成功路径不调用 retrofitTrajectoryOnFailure', async () => {
    const passed: HarnessStepExecutionResult = {
      step: HarnessStepName.PLAN_GEN,
      status: 'PASSED',
      validationResults: [],
      durationMs: 1,
    };
    const { kernel, recorder } = makeKernel({
      runStep: jest.fn().mockResolvedValue(passed),
    });
    const retrofitSpy = jest.spyOn(recorder, 'retrofitTrajectoryOnFailure');

    await kernel.executePlanGen(dso(), { requestId: 'req_fail_01' } as any);

    expect(retrofitSpy).not.toHaveBeenCalled();
  });

  it('PLAN_GEN Harness 失败时逆向合成并落盘', async () => {
    const { kernel, recorder } = makeKernel({
      runStep: jest.fn().mockResolvedValue(failedPlanOutcome()),
    });
    const retrofitSpy = jest.spyOn(recorder, 'retrofitTrajectoryOnFailure');

    const out = await kernel.executePlanGen(dso(), { requestId: 'req_fail_01' } as any);

    expect(retrofitSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: 'trace-req_fail_01',
        failedPhase: HarnessStepName.PLAN_GEN,
        requestId: 'req_fail_01',
      }),
    );
    expect(out.newState.harnessRuntime?.last_harness_failure_events?.[0]?.code).toBe('budget-overrun');
    expect(out.newState.harnessRuntime?.traceExportRelativePath).toBeTruthy();

    const exportFile = path.join(exportDir, 'trace-req_fail_01.json');
    expect(fs.existsSync(exportFile)).toBe(true);
    const body = JSON.parse(fs.readFileSync(exportFile, 'utf8'));
    expect(body.trace?.retrofit?.triggeredBy).toBe('ON_FAILURE_TRIGGER');
    expect(body.trace?.steps?.[0]?.step).toBe('PLAN_GEN');
  });

  it('finalizeHarnessTraceIfRecorded 在 on-failure 下为 no-op', () => {
    const finalizeSpy = jest.fn();
    const { kernel } = makeKernel({
      runStep: jest.fn(),
    });
    (kernel as any).harnessStepRunner.finalizeRecordedTraceIfStillOpen = finalizeSpy;
    kernel.finalizeHarnessTraceIfRecorded(dso(), 'DONE');
    expect(finalizeSpy).not.toHaveBeenCalled();
  });
});
