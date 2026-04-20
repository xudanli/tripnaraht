import { Logger } from '@nestjs/common';
import { HarnessTraceRecorderService } from './harness-trace-recorder.service';
import { HarnessStepName } from '../contracts/harness-step.types';

const minimalStep = (step: HarnessStepName) => ({
  step,
  startedAt: '2026-04-17T10:00:00.000Z',
  visibleStateSnapshot: {},
  toolCalls: [] as [],
  validationResults: [] as [],
});

describe('HarnessTraceRecorderService', () => {
  it('records step with decisionJustification and validationResults（方案三.5 trace 字段）', () => {
    const recorder = new HarnessTraceRecorderService();
    recorder.ensureTrace('trace-a', 'req-a');
    recorder.appendStep('trace-a', {
      step: HarnessStepName.VERIFY,
      startedAt: '2026-04-17T10:00:00.000Z',
      endedAt: '2026-04-17T10:00:01.000Z',
      durationMs: 12,
      runStatus: 'PASSED',
      visibleStateSnapshot: { tripState: {} },
      decisionJustification: {
        summary: 'Kernel harness gate',
        createdAt: '2026-04-17T10:00:00.000Z',
      },
      toolCalls: [],
      validationResults: [
        { passed: true, severity: 'L1', code: 'EVIDENCE_OK', message: 'bound' },
      ],
      graderResults: [{ passed: true, score: 1, label: 'STUB', explanation: 'ok', severity: 'L1' }],
    });
    const t = recorder.getTrace('trace-a');
    expect(t?.steps).toHaveLength(1);
    const step = t!.steps[0];
    expect(step.step).toBe(HarnessStepName.VERIFY);
    expect(step.decisionJustification?.summary).toBe('Kernel harness gate');
    expect(step.validationResults).toHaveLength(1);
    expect(step.graderResults).toHaveLength(1);
    expect(step.durationMs).toBe(12);
    expect(step.runStatus).toBe('PASSED');
  });

  it('ensureTrace stores evaluationRunId on trace.meta', () => {
    const recorder = new HarnessTraceRecorderService();
    recorder.ensureTrace('t-meta', 'r-meta', { evaluationRunId: 'run-uuid-1' });
    expect(recorder.getTrace('t-meta')?.meta?.evaluationRunId).toBe('run-uuid-1');
  });

  it('finalizeIfStillOpen sets endedAt once and is idempotent', () => {
    const recorder = new HarnessTraceRecorderService();
    recorder.ensureTrace('t1', 'r1');
    recorder.finalizeIfStillOpen('t1', 'DONE');
    const a = recorder.getTrace('t1');
    expect(a?.endedAt).toBeDefined();
    expect(a?.finalStatus).toBe('DONE');
    const firstEnded = a?.endedAt;
    recorder.finalizeIfStillOpen('t1', 'FAILED');
    const b = recorder.getTrace('t1');
    expect(b?.endedAt).toBe(firstEnded);
    expect(b?.finalStatus).toBe('DONE');
  });

  it('finalizeIfStillOpen is no-op when trace missing', () => {
    const recorder = new HarnessTraceRecorderService();
    recorder.finalizeIfStillOpen('nope', 'DONE');
    expect(recorder.getTrace('nope')).toBeUndefined();
  });

  it('appendStep after finalize is no-op and logs warn', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    try {
      const recorder = new HarnessTraceRecorderService();
      recorder.ensureTrace('t-closed', 'r');
      recorder.appendStep('t-closed', minimalStep(HarnessStepName.INTAKE));
      recorder.finalize('t-closed', 'DONE');
      recorder.appendStep('t-closed', minimalStep(HarnessStepName.VERIFY));
      expect(recorder.getTrace('t-closed')?.steps).toHaveLength(1);
      expect(warn).toHaveBeenCalled();
      const msg = String(warn.mock.calls[0]?.[0] ?? '');
      expect(msg).toContain('appendStep ignored');
      expect(msg).toContain('t-closed');
    } finally {
      warn.mockRestore();
    }
  });

  it('appendStep is no-op when trace was not ensured', () => {
    const recorder = new HarnessTraceRecorderService();
    recorder.appendStep('missing', {
      step: HarnessStepName.INTAKE,
      startedAt: '2026-04-17T10:00:00.000Z',
      visibleStateSnapshot: {},
      toolCalls: [],
      validationResults: [],
    });
    expect(recorder.getTrace('missing')).toBeUndefined();
  });

  it('evicts oldest trace when HARNESS_TRACE_MAX_ENTRIES exceeded', () => {
    process.env.HARNESS_TRACE_MAX_ENTRIES = '2';
    try {
      const recorder = new HarnessTraceRecorderService();
      recorder.ensureTrace('t-old', 'r1');
      recorder.ensureTrace('t-mid', 'r2');
      recorder.ensureTrace('t-new', 'r3');
      expect(recorder.getTrace('t-old')).toBeUndefined();
      expect(recorder.getTrace('t-mid')).toBeDefined();
      expect(recorder.getTrace('t-new')).toBeDefined();
      expect(recorder.listTraceIds()).toEqual(['t-mid', 't-new']);
    } finally {
      delete process.env.HARNESS_TRACE_MAX_ENTRIES;
    }
  });
});
