/**
 * 真实 Harness E2E：VERIFY 证据绑定失败 → Kernel 持久化 failure events → plan-verify 图 RETURN_TO_RESEARCH
 *
 * 不走 mock `last_harness_failure_events`；使用 HarnessModule + DecisionKernelService + HarnessStepRunnerService。
 * 勿设置 HARNESS_RELAX_VERIFY_EVIDENCE_BINDING=1。
 */

import { Test } from '@nestjs/testing';
import { DecisionKernelService } from '../../../decision/kernel/decision-kernel.service';
import type { DecisionState } from '../../../decision/kernel/decision-state.types';
import type { PhaseExecutorContext } from '../../../decision/kernel/interfaces/phase-executor.interface';
import { HarnessModule } from '../../../harness/harness.module';
import { HarnessStepName } from '../../../harness/contracts/harness-step.types';
import { HarnessStepRunnerService } from '../../../harness/runtime/harness-step-runner.service';
import { HarnessFailureLevel } from '../../../harness/failures/failure-level.enum';
import { buildVerifyPhaseVerdict } from '../graph/nodes/verify-verdict.util';
import { pickVerifyHarnessSuggestedAction } from './plan-verify-harness-routing.util';
import { runPlanVerifyOptimizeRepairLoop } from './plan-verify-loop.runner';
import type { PlanVerifyLoopHost } from './plan-verify-loop.host';
import type { PlanVerifyLoopRunParams } from './plan-verify-loop.types';

const REQUEST_ID = 'req-harness-e2e-1';

function minimalDso(over?: Partial<DecisionState>): DecisionState {
  return {
    userIntent: {},
    tripState: {
      planDraft: {
        request_id: REQUEST_ID,
        days: [{ date: '2026-07-01', items: [{ type: 'POI', title: 'A' }] }],
      },
    },
    environmentState: {},
    systemState: { requestId: REQUEST_ID },
    confidence: 0.9,
    ...over,
  };
}

function makePhaseCtx(requestId = REQUEST_ID): PhaseExecutorContext {
  return {
    requestId,
    itinerary: {
      request_id: requestId,
      days: [{ date: '2026-07-01', items: [{ type: 'POI', title: 'A' }] }],
    },
    tripPlanRequest: {
      destination: 'JP-Osaka',
      date_range: { start_date: '2026-07-01', end_date: '2026-07-05' },
    },
    gateResult: { gate_result: 'PASS', violations: [], confidence: 0.9 },
    researchData: {},
  } as PhaseExecutorContext;
}

function makeKernelMerge() {
  return jest.fn((current: DecisionState, patch: Partial<DecisionState>) => ({
    ...current,
    ...patch,
    tripState: { ...(current.tripState ?? {}), ...(patch.tripState ?? {}) },
    systemState: { ...(current.systemState ?? {}), ...(patch.systemState ?? {}) },
    harnessRuntime: {
      ...(current.harnessRuntime ?? {}),
      ...(patch.harnessRuntime ?? {}),
    },
    verification: patch.verification ?? current.verification,
  }));
}

function makeKernelWithHarness(
  harnessStepRunner: HarnessStepRunnerService,
  merge = makeKernelMerge(),
) {
  const verifyExecutor = {
    execute: jest.fn().mockResolvedValue({
      issues: [{ code: 'SHOULD_NOT_RUN', class: 'CONFLICT', message: 'verify executor after harness pass' }],
      confidenceDelta: -0.5,
    }),
  };
  const kernel = new DecisionKernelService(
    { merge, commit: jest.fn(), appendHistoryDelta: jest.fn(), commitWithLock: jest.fn() } as never,
    { getReport: jest.fn(), getReportAsync: jest.fn() } as never,
    { getHints: jest.fn(), getHintsAsync: jest.fn() } as never,
    { buildContextPackage: jest.fn() } as never,
    { recordDecisionLog: jest.fn(), recordUserFeedback: jest.fn() } as never,
    undefined,
    undefined,
    undefined,
    verifyExecutor as never,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    harnessStepRunner,
  );
  return { kernel, verifyExecutor, merge };
}

function planVerifyBaseParams(): PlanVerifyLoopRunParams {
  return {
    request: { request_id: REQUEST_ID, user_id: 'u', message: 'plan' } as PlanVerifyLoopRunParams['request'],
    context: {} as PlanVerifyLoopRunParams['context'],
    state: {
      request_id: REQUEST_ID,
      current_step: 'VERIFY',
      metadata: { last_updated_at: new Date().toISOString() },
      decision_log: [],
      errors: [],
      gate_result: { gate_result: 'PASS' },
    } as PlanVerifyLoopRunParams['state'],
    decisionState: minimalDso(),
    llmProvider: 'deepseek' as PlanVerifyLoopRunParams['llmProvider'],
    startTime: Date.now(),
  };
}

describe('VERIFY RETURN_TO_RESEARCH harness E2E', () => {
  let harnessRunner: HarnessStepRunnerService;

  beforeEach(async () => {
    delete process.env.HARNESS_RELAX_VERIFY_EVIDENCE_BINDING;
    process.env.DECISION_VERIFY_RETURN_TO_RESEARCH = 'true';

    const moduleRef = await Test.createTestingModule({
      imports: [HarnessModule],
    }).compile();
    harnessRunner = moduleRef.get(HarnessStepRunnerService);
  });

  it('HarnessStepRunner VERIFY 无快照绑定时产出 EVIDENCE_SNAPSHOT_UNBOUND + RETURN_TO_RESEARCH', async () => {
    const res = await harnessRunner.runStep(
      HarnessStepName.VERIFY,
      minimalDso(),
      { traceId: 'e2e-harness', requestId: REQUEST_ID },
      { skipTrace: true },
    );
    expect(res.status).toBe('FAILED');
    expect(res.validationResults.some((v) => v.code === 'EVIDENCE_SNAPSHOT_UNBOUND')).toBe(true);
    expect(res.graderResults).toBeUndefined();

    const ev = res.failureEvents?.find((e) => e.code === 'EVIDENCE_SNAPSHOT_UNBOUND');
    expect(ev).toBeDefined();
    expect(ev!.suggestedAction).toBe('RETURN_TO_RESEARCH');
    expect(ev!.level).toBe(HarnessFailureLevel.LEVEL_2_LOGIC_GAP);
  });

  it('DecisionKernel.executeVerify 经真实 Harness 写入 last_harness_failure_events 且不调用 verifyExecutor', async () => {
    const { kernel, verifyExecutor } = makeKernelWithHarness(harnessRunner);
    const dso = minimalDso();
    const ctx = makePhaseCtx();

    const result = await kernel.executeVerify(dso, ctx);

    expect(verifyExecutor.execute).not.toHaveBeenCalled();
    expect(result.confidenceDelta).toBe(0);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues.every((i) => i.source === 'HARNESS')).toBe(true);

    const persisted = result.newState.harnessRuntime?.last_harness_failure_events;
    expect(persisted?.length).toBeGreaterThan(0);
    const binding = persisted!.find((e) => e.code === 'EVIDENCE_SNAPSHOT_UNBOUND');
    expect(binding).toMatchObject({
      step: 'VERIFY',
      code: 'EVIDENCE_SNAPSHOT_UNBOUND',
      severity: HarnessFailureLevel.LEVEL_2_LOGIC_GAP,
      suggestedAction: 'RETURN_TO_RESEARCH',
    });

    expect(pickVerifyHarnessSuggestedAction(result.newState)).toBe('RETURN_TO_RESEARCH');
  });

  it('plan-verify 子图经真实 Kernel VERIFY 得到 reroute_pre_plan(entry=research)', async () => {
    const { kernel } = makeKernelWithHarness(harnessRunner);
    const params = planVerifyBaseParams();

    const applyReturnToResearchInvalidation = jest.fn(
      async (_state, ds: DecisionState | undefined) => {
        if (!ds) return ds;
        return {
          ...ds,
          harnessRuntime: {
            ...(ds.harnessRuntime ?? {}),
            researchEvidenceSnapshotId: undefined,
            evidenceVersion: undefined,
          },
        };
      },
    );

    const host: PlanVerifyLoopHost = {
      touchAsyncTaskProgress: jest.fn(),
      maybeSnapshot: jest.fn(),
      runOptimizePhase: jest.fn(async (_s, ds) => ds),
      tryPlanGenEmptyDraftTerminal: jest.fn(async () => null),
      runVerifyPhase: jest.fn(async (ds, state) => {
        const { newState } = await kernel.executeVerify(ds ?? minimalDso(), makePhaseCtx());
        return {
          decisionState: newState,
          verdict: buildVerifyPhaseVerdict(state, newState),
        };
      }),
      syncConfidenceAfterVerify: jest.fn((_s, ds) => ds),
      buildErrorResult: jest.fn(() => ({ status: 'FAILED' }) as ReturnType<PlanVerifyLoopHost['buildErrorResult']>),
      runRepairPhase: jest.fn(async (ds) => ds),
      computeRepairFatigue: jest.fn(() => undefined),
      buildClarificationResult: jest.fn(() => ({ status: 'NEED_USER_CONFIRMATION' }) as ReturnType<PlanVerifyLoopHost['buildErrorResult']>),
      persistHarnessTraceOnReturnToResearch: jest.fn(),
      runPlanGenWithEmptyDraftGuard: jest.fn(),
      applyReturnToResearchInvalidation,
      executePlanGenPhase: jest.fn(async (ds) => ds),
    };

    const out = await runPlanVerifyOptimizeRepairLoop(host, params);

    expect(out.kind).toBe('reroute_pre_plan');
    if (out.kind === 'reroute_pre_plan') {
      expect(out.entry).toBe('research');
      expect(pickVerifyHarnessSuggestedAction(out.decisionState)).toBe('RETURN_TO_RESEARCH');
      expect(out.decisionState?.harnessRuntime?.researchEvidenceSnapshotId).toBeUndefined();
    }
    expect(applyReturnToResearchInvalidation).toHaveBeenCalled();
  });

  it('second kernel executeVerify passes Harness when researchEvidenceSnapshotId is bound', async () => {
    const { kernel, verifyExecutor } = makeKernelWithHarness(harnessRunner);
    const first = await kernel.executeVerify(minimalDso(), makePhaseCtx());
    expect(pickVerifyHarnessSuggestedAction(first.newState)).toBe('RETURN_TO_RESEARCH');
    verifyExecutor.execute.mockClear();

    const bound: DecisionState = {
      ...first.newState,
      harnessRuntime: {
        ...(first.newState.harnessRuntime ?? {}),
        researchEvidenceSnapshotId: 'snap-a',
        last_harness_failure_events: undefined,
      },
    };
    const second = await kernel.executeVerify(bound, makePhaseCtx());
    expect(verifyExecutor.execute).toHaveBeenCalled();
    expect(
      second.newState.harnessRuntime?.last_harness_failure_events?.some(
        (e) => e.code === 'EVIDENCE_SNAPSHOT_UNBOUND',
      ),
    ).not.toBe(true);
  });
});
