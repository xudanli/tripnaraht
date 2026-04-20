import { Test } from '@nestjs/testing';
import type { DecisionState } from '../../decision/kernel/decision-state.types';
import { HarnessModule } from '../harness.module';
import { HarnessStepName } from '../contracts/harness-step.types';
import { HarnessStepRunnerService } from './harness-step-runner.service';
import { HarnessTraceRecorderService } from '../tracing/harness-trace-recorder.service';

function minimalDso(over?: Partial<DecisionState>): DecisionState {
  return {
    userIntent: {},
    tripState: {},
    environmentState: {},
    systemState: { requestId: 'req-harness-1' },
    ...over,
  };
}

describe('HarnessStepRunnerService', () => {
  let runner: HarnessStepRunnerService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [HarnessModule],
    }).compile();
    runner = moduleRef.get(HarnessStepRunnerService);
  });

  it('PLAN_GEN passes when gate ALLOW and idempotency key present', async () => {
    const state = minimalDso({
      constraints: {
        feasible: true,
        violations: [],
        gateOutcome: 'ALLOW',
      },
    });
    const res = await runner.runStep(
      HarnessStepName.PLAN_GEN,
      state,
      {
        traceId: 't1',
        requestId: 'req-harness-1',
        idempotencyKey: 'plan-1',
      },
      { skipTrace: true },
    );
    expect(res.status).toBe('PASSED');
    expect(res.validationResults.every((v) => v.passed)).toBe(true);
    expect(res.graderResults?.some((g) => g.label === 'PACING_SKIPPED')).toBe(true);
  });

  it('PLAN_GEN FAILED when pacing heuristic sees overpacked day', async () => {
    const many = Array.from({ length: 26 }, (_, i) => ({ id: `x${i}` }));
    const state = minimalDso({
      constraints: {
        feasible: true,
        violations: [],
        gateOutcome: 'ALLOW',
      },
      tripState: {
        planDraft: { days: [{ date: '2026-01-01', items: many }] },
      },
    });
    const res = await runner.runStep(
      HarnessStepName.PLAN_GEN,
      state,
      {
        traceId: 't1b',
        requestId: 'req-harness-1',
        idempotencyKey: 'plan-1b',
      },
      { skipTrace: true },
    );
    expect(res.status).toBe('FAILED');
    expect(res.graderResults?.some((g) => g.label === 'PACING_OVERPACKED')).toBe(true);
    expect(res.failureEvents?.some((e) => e.code === 'GRADER_PACING_OVERPACKED')).toBe(true);
  });

  it('validateStepAdmission 与 runStep 对齐并给出 suggested_fallback_step', async () => {
    const many = Array.from({ length: 26 }, (_, i) => ({ id: `z${i}` }));
    const state = minimalDso({
      constraints: {
        feasible: true,
        violations: [],
        gateOutcome: 'ALLOW',
      },
      tripState: {
        planDraft: { days: [{ date: '2026-01-01', items: many }] },
      },
    });
    const adm = await runner.validateStepAdmission(state, HarnessStepName.PLAN_GEN, {
      traceId: 't-adm',
      requestId: 'req-harness-1',
      idempotencyKey: 'adm-1',
    });
    expect(adm.passed).toBe(false);
    expect(adm.harness_step).toBe(HarnessStepName.PLAN_GEN);
    expect(adm.suggested_fallback_step).toBe(HarnessStepName.GATE_EVAL);
  });

  it('PLAN_GEN skips inferential when HARNESS_SKIP_INFERENTIAL=1 even if overpacked', async () => {
    process.env.HARNESS_SKIP_INFERENTIAL = '1';
    try {
      const many = Array.from({ length: 26 }, (_, i) => ({ id: `x${i}` }));
      const state = minimalDso({
        constraints: {
          feasible: true,
          violations: [],
          gateOutcome: 'ALLOW',
        },
        tripState: {
          planDraft: { days: [{ date: '2026-01-01', items: many }] },
        },
      });
      const res = await runner.runStep(
        HarnessStepName.PLAN_GEN,
        state,
        {
          traceId: 't1c',
          requestId: 'req-harness-1',
          idempotencyKey: 'plan-1c',
        },
        { skipTrace: true },
      );
      expect(res.status).toBe('PASSED');
      expect(res.graderResults).toBeUndefined();
    } finally {
      delete process.env.HARNESS_SKIP_INFERENTIAL;
    }
  });

  it('PLAN_GEN BLOCKED when gate BLOCK', async () => {
    const state = minimalDso({
      constraints: {
        feasible: false,
        violations: [],
        gateOutcome: 'BLOCK',
      },
    });
    const res = await runner.runStep(
      HarnessStepName.PLAN_GEN,
      state,
      {
        traceId: 't2',
        requestId: 'req-harness-1',
        idempotencyKey: 'plan-2',
      },
      { skipTrace: true },
    );
    expect(res.status).toBe('BLOCKED');
    expect(res.failureEvents?.some((e) => e.code === 'GATE_BLOCK')).toBe(true);
  });

  it('PLAN_GEN does not run inferential graders when deterministic fails (方案四.3)', async () => {
    const many = Array.from({ length: 26 }, (_, i) => ({ id: `x${i}` }));
    const state = minimalDso({
      constraints: {
        feasible: false,
        violations: [],
        gateOutcome: 'BLOCK',
      },
      tripState: {
        planDraft: { days: [{ date: '2026-01-01', items: many }] },
      },
    });
    const res = await runner.runStep(
      HarnessStepName.PLAN_GEN,
      state,
      {
        traceId: 't-det-before-inf',
        requestId: 'req-harness-1',
        idempotencyKey: 'plan-det-inf',
      },
      { skipTrace: true },
    );
    expect(res.status).toBe('BLOCKED');
    expect(res.validationResults.some((r) => !r.passed)).toBe(true);
    expect(res.graderResults).toBeUndefined();
  });

  it('VERIFY does not run inferential when evidence binding fails (方案四.3)', async () => {
    const state = minimalDso({});
    const res = await runner.runStep(
      HarnessStepName.VERIFY,
      state,
      { traceId: 't-verify-det', requestId: 'req-harness-1' },
      { skipTrace: true },
    );
    expect(res.status).toBe('FAILED');
    expect(res.validationResults.some((r) => !r.passed)).toBe(true);
    expect(res.graderResults).toBeUndefined();
  });

  it('VERIFY FAILED when research snapshot not bound', async () => {
    const state = minimalDso({});
    const res = await runner.runStep(
      HarnessStepName.VERIFY,
      state,
      { traceId: 't3', requestId: 'req-harness-1' },
      { skipTrace: true },
    );
    expect(res.status).toBe('FAILED');
    expect(
      res.validationResults.some((v) => v.code === 'EVIDENCE_SNAPSHOT_UNBOUND'),
    ).toBe(true);
  });

  it('VERIFY FAILED when systemState.requestId mismatches harness context', async () => {
    const state = minimalDso({
      harnessRuntime: { researchEvidenceSnapshotId: 'snap-a' },
      systemState: { requestId: 'wrong-req' },
    });
    const res = await runner.runStep(
      HarnessStepName.VERIFY,
      state,
      { traceId: 't-sys-mis', requestId: 'req-harness-1' },
      { skipTrace: true },
    );
    expect(res.status).toBe('FAILED');
    expect(res.validationResults.some((r) => r.code === 'SYSTEM_REQUEST_ID_MISMATCH')).toBe(true);
  });

  it('GATE_EVAL FAILED when research evidence snapshot missing', async () => {
    const state = minimalDso();
    const res = await runner.runStep(
      HarnessStepName.GATE_EVAL,
      state,
      { traceId: 't-gate', requestId: 'req-harness-1' },
      { skipTrace: true },
    );
    expect(res.status).toBe('FAILED');
    expect(res.validationResults.some((r) => r.code === 'RESEARCH_SNAPSHOT_MISSING')).toBe(true);
  });

  it('GATE_EVAL passes when harnessRuntime.researchEvidenceSnapshotId set', async () => {
    const state = minimalDso({
      harnessRuntime: { researchEvidenceSnapshotId: 'research_abc' },
    });
    const res = await runner.runStep(
      HarnessStepName.GATE_EVAL,
      state,
      { traceId: 't-gate2', requestId: 'req-harness-1' },
      { skipTrace: true },
    );
    expect(res.status).toBe('PASSED');
  });

  it('GATE_EVAL passes without snapshot when HARNESS_RELAX_GATE_RESEARCH_SNAPSHOT=1', async () => {
    process.env.HARNESS_RELAX_GATE_RESEARCH_SNAPSHOT = '1';
    try {
      const state = minimalDso();
      const res = await runner.runStep(
        HarnessStepName.GATE_EVAL,
        state,
        { traceId: 't-relax-gate', requestId: 'req-harness-1' },
        { skipTrace: true },
      );
      expect(res.status).toBe('PASSED');
      expect(res.validationResults.some((r) => r.code === 'RESEARCH_SNAPSHOT_RELAXED')).toBe(true);
    } finally {
      delete process.env.HARNESS_RELAX_GATE_RESEARCH_SNAPSHOT;
    }
  });

  it('VERIFY passes without bound snapshot when HARNESS_RELAX_VERIFY_EVIDENCE_BINDING=1', async () => {
    process.env.HARNESS_RELAX_VERIFY_EVIDENCE_BINDING = '1';
    try {
      const state = minimalDso();
      const res = await runner.runStep(
        HarnessStepName.VERIFY,
        state,
        { traceId: 't-relax-verify', requestId: 'req-harness-1' },
        { skipTrace: true },
      );
      expect(res.status).toBe('PASSED');
      expect(res.validationResults.some((r) => r.code === 'EVIDENCE_BINDING_RELAXED')).toBe(true);
    } finally {
      delete process.env.HARNESS_RELAX_VERIFY_EVIDENCE_BINDING;
    }
  });

  it('VERIFY FAILED when itinerary dates are not consecutive calendar days', async () => {
    const state = minimalDso({
      harnessRuntime: { researchEvidenceSnapshotId: 'snap-a' },
      tripState: {
        planDraft: {
          days: [
            { date: '2026-06-01', items: [] },
            { date: '2026-06-03', items: [] },
          ],
        },
      },
    });
    const res = await runner.runStep(
      HarnessStepName.VERIFY,
      state,
      { traceId: 't-verify-gap', requestId: 'req-harness-1' },
      { skipTrace: true },
    );
    expect(res.status).toBe('FAILED');
    expect(res.validationResults.some((r) => r.code === 'DATE_CONTINUITY_GAP')).toBe(true);
    expect(res.graderResults).toBeUndefined();
  });

  it('VERIFY passes date gap when HARNESS_DATE_CONTINUITY_ALLOW_GAPS=1', async () => {
    process.env.HARNESS_DATE_CONTINUITY_ALLOW_GAPS = '1';
    try {
      const state = minimalDso({
        harnessRuntime: { researchEvidenceSnapshotId: 'snap-a' },
        tripState: {
          planDraft: {
            days: [
              { date: '2026-06-01', items: [] },
              { date: '2026-06-03', items: [] },
            ],
          },
        },
      });
      const res = await runner.runStep(
        HarnessStepName.VERIFY,
        state,
        { traceId: 't-verify-gap-ok', requestId: 'req-harness-1' },
        { skipTrace: true },
      );
      expect(res.status).toBe('PASSED');
      expect(res.validationResults.some((r) => r.code === 'DATE_CONTINUITY_OK')).toBe(true);
    } finally {
      delete process.env.HARNESS_DATE_CONTINUITY_ALLOW_GAPS;
    }
  });

  it('VERIFY skips date continuity when HARNESS_RELAX_VERIFY_DATE_CONTINUITY=1', async () => {
    process.env.HARNESS_RELAX_VERIFY_DATE_CONTINUITY = '1';
    try {
      const state = minimalDso({
        harnessRuntime: { researchEvidenceSnapshotId: 'snap-a' },
        tripState: {
          planDraft: {
            days: [{ date: '2026-06-01' }, { date: '2026-06-10' }],
          },
        },
      });
      const res = await runner.runStep(
        HarnessStepName.VERIFY,
        state,
        { traceId: 't-relax-date', requestId: 'req-harness-1' },
        { skipTrace: true },
      );
      expect(res.status).toBe('PASSED');
      expect(res.validationResults.some((r) => r.code === 'DATE_CONTINUITY_RELAXED')).toBe(true);
    } finally {
      delete process.env.HARNESS_RELAX_VERIFY_DATE_CONTINUITY;
    }
  });

  it('VERIFY FAILED when tripState.budgetOverrun out of [0,1] range', async () => {
    const state = minimalDso({
      harnessRuntime: { researchEvidenceSnapshotId: 'snap-a' },
      tripState: {
        budgetOverrun: 1.4,
        planDraft: {
          days: [
            { date: '2026-06-01', items: [] },
            { date: '2026-06-02', items: [] },
          ],
        },
      },
    });
    const res = await runner.runStep(
      HarnessStepName.VERIFY,
      state,
      { traceId: 't-budget', requestId: 'req-harness-1' },
      { skipTrace: true },
    );
    expect(res.status).toBe('FAILED');
    expect(res.validationResults.some((r) => r.code === 'BUDGET_OVERRUN_OUT_OF_RANGE')).toBe(true);
  });

  it('VERIFY FAILED when budgetOverrun exceeds HARNESS_VERIFY_BUDGET_OVERRUN_MAX', async () => {
    process.env.HARNESS_VERIFY_BUDGET_OVERRUN_MAX = '0.5';
    try {
      const state = minimalDso({
        harnessRuntime: { researchEvidenceSnapshotId: 'snap-a' },
        tripState: {
          budgetOverrun: 0.55,
          planDraft: {
            days: [
              { date: '2026-06-01', items: [] },
              { date: '2026-06-02', items: [] },
            ],
          },
        },
      });
      const res = await runner.runStep(
        HarnessStepName.VERIFY,
        state,
        { traceId: 't-budget-cap', requestId: 'req-harness-1' },
        { skipTrace: true },
      );
      expect(res.status).toBe('FAILED');
      expect(res.validationResults.some((r) => r.code === 'BUDGET_OVERRUN_EXCEEDS_CAP')).toBe(true);
    } finally {
      delete process.env.HARNESS_VERIFY_BUDGET_OVERRUN_MAX;
    }
  });

  it('VERIFY passes with relax when HARNESS_RELAX_VERIFY_BUDGET_OVERRUN=1', async () => {
    process.env.HARNESS_RELAX_VERIFY_BUDGET_OVERRUN = '1';
    try {
      const state = minimalDso({
        harnessRuntime: { researchEvidenceSnapshotId: 'snap-a' },
        tripState: {
          budgetOverrun: 9,
          planDraft: { days: [{ date: '2026-06-01', items: [] }] },
        },
      });
      const res = await runner.runStep(
        HarnessStepName.VERIFY,
        state,
        { traceId: 't-budget-relax', requestId: 'req-harness-1' },
        { skipTrace: true },
      );
      expect(res.status).toBe('PASSED');
      expect(res.validationResults.some((r) => r.code === 'BUDGET_OVERRUN_RELAXED')).toBe(true);
    } finally {
      delete process.env.HARNESS_RELAX_VERIFY_BUDGET_OVERRUN;
    }
  });

  it('finalizeRecordedTrace closes trace via public API', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [HarnessModule] }).compile();
    const localRunner = moduleRef.get(HarnessStepRunnerService);
    const trace = moduleRef.get(HarnessTraceRecorderService);
    trace.ensureTrace('tid-pub', 'r');
    localRunner.finalizeRecordedTrace('tid-pub', 'DONE');
    expect(trace.getTrace('tid-pub')?.finalStatus).toBe('DONE');
    trace.clearTrace('tid-pub');
  });

  it('finalizeRecordedTraceIfStillOpen does not overwrite closed trace', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [HarnessModule] }).compile();
    const localRunner = moduleRef.get(HarnessStepRunnerService);
    const trace = moduleRef.get(HarnessTraceRecorderService);
    trace.ensureTrace('tid-open', 'r');
    localRunner.finalizeRecordedTrace('tid-open', 'FAILED');
    localRunner.finalizeRecordedTraceIfStillOpen('tid-open', 'DONE');
    expect(trace.getTrace('tid-open')?.finalStatus).toBe('FAILED');
    trace.clearTrace('tid-open');
  });

  it('finalizeTrace option closes trace when recording', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [HarnessModule] }).compile();
    const localRunner = moduleRef.get(HarnessStepRunnerService);
    const trace = moduleRef.get(HarnessTraceRecorderService);
    const state = minimalDso({});
    await localRunner.runStep(
      HarnessStepName.VERIFY,
      state,
      { traceId: 't-finalize', requestId: 'req-harness-1' },
      { skipTrace: false, finalizeTrace: 'FAILED' },
    );
    const t = trace.getTrace('t-finalize');
    expect(t?.finalStatus).toBe('FAILED');
    expect(t?.endedAt).toBeDefined();
    trace.clearTrace('t-finalize');
  });

  it('PLAN_GEN FAILED when requiredInput constraints missing on DSO', async () => {
    const state = minimalDso();
    delete (state as { constraints?: unknown }).constraints;
    const res = await runner.runStep(
      HarnessStepName.PLAN_GEN,
      state,
      {
        traceId: 't-req-in',
        requestId: 'req-harness-1',
        idempotencyKey: 'plan-req',
      },
      { skipTrace: true },
    );
    expect(res.status).toBe('FAILED');
    expect(res.validationResults.some((r) => r.code === 'REQUIRED_INPUT_MISSING')).toBe(true);
    expect(res.validationResults.some((r) => (r.details as { path?: string })?.path === 'constraints')).toBe(
      true,
    );
  });

  it('NARRATE FAILED without idempotency key', async () => {
    const state = minimalDso();
    const res = await runner.runStep(
      HarnessStepName.NARRATE,
      state,
      { traceId: 't-narr', requestId: 'req-harness-1' },
      { skipTrace: true },
    );
    expect(res.status).toBe('FAILED');
    expect(res.validationResults.some((r) => r.code === 'IDEMPOTENCY_KEY_MISSING')).toBe(true);
  });

  it('NARRATE passes with idempotency key', async () => {
    const state = minimalDso();
    const res = await runner.runStep(
      HarnessStepName.NARRATE,
      state,
      {
        traceId: 't-narr2',
        requestId: 'req-harness-1',
        idempotencyKey: 'narrate:req-harness-1',
      },
      { skipTrace: true },
    );
    expect(res.status).toBe('PASSED');
  });

  it('INTAKE requires idempotency key', async () => {
    const state = minimalDso();
    const res = await runner.runStep(
      HarnessStepName.INTAKE,
      state,
      { traceId: 't-intake', requestId: 'req-harness-1' },
      { skipTrace: true },
    );
    expect(res.status).toBe('FAILED');
    expect(res.validationResults.some((r) => r.code === 'IDEMPOTENCY_KEY_MISSING')).toBe(true);
  });

  it('INTAKE FAILED when userIntent.budget is non-positive', async () => {
    const state = minimalDso({ userIntent: { budget: -1 } });
    const res = await runner.runStep(
      HarnessStepName.INTAKE,
      state,
      { traceId: 't-intake-bud', requestId: 'req-harness-1', idempotencyKey: 'intake:req-harness-1' },
      { skipTrace: true },
    );
    expect(res.status).toBe('FAILED');
    expect(res.validationResults.some((r) => r.code === 'USER_INTENT_BUDGET_NON_POSITIVE')).toBe(true);
  });

  it('RESEARCH passes harness when userIntent.budget is numeric string', async () => {
    const state = minimalDso({ userIntent: { budget: '3200' } });
    const res = await runner.runStep(
      HarnessStepName.RESEARCH,
      state,
      {
        traceId: 't-research-bstr',
        requestId: 'req-harness-1',
        idempotencyKey: 'research:req-harness-1',
      },
      { skipTrace: true },
    );
    expect(res.status).toBe('PASSED');
    expect(res.validationResults.some((r) => r.code === 'USER_INTENT_BUDGET_OK')).toBe(true);
  });

  it('PLAN_GEN FAILED when userIntent.budget is not finite', async () => {
    const state = minimalDso({
      constraints: { feasible: true, violations: [], gateOutcome: 'ALLOW' },
      userIntent: { budget: Number.NaN },
    });
    const res = await runner.runStep(
      HarnessStepName.PLAN_GEN,
      state,
      { traceId: 't-plan-bud', requestId: 'req-harness-1', idempotencyKey: 'plan-bud' },
      { skipTrace: true },
    );
    expect(res.status).toBe('FAILED');
    expect(res.validationResults.some((r) => r.code === 'USER_INTENT_BUDGET_INVALID_TYPE')).toBe(true);
    expect(res.graderResults).toBeUndefined();
  });

  it('VERIFY passes when harnessRuntime.researchEvidenceSnapshotId set', async () => {
    const state = minimalDso({
      harnessRuntime: { researchEvidenceSnapshotId: 'snap-a' },
    });
    const res = await runner.runStep(
      HarnessStepName.VERIFY,
      state,
      { traceId: 't4', requestId: 'req-harness-1' },
      { skipTrace: true },
    );
    expect(res.status).toBe('PASSED');
    expect(res.graderResults?.some((g) => g.label === 'STUB_PASS')).toBe(true);
  });
});
