/**
 * HTTP smoke：VERIFY RETURN_TO_RESEARCH 重试计数经 route_and_run observability 透出。
 *
 * 真实 Harness + Kernel VERIFY + 重试环；`AgentService.routeAndRun` 用组装器出口（避免拉全量 DecisionRuntimeKernel DI）。
 */

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';
import { AgentController } from './agent.controller';
import { AgentService } from './services/agent.service';
import { RouteAndRunResponseAssemblerService } from './services/route-and-run-response-assembler.service';
import { JepaProjectorService } from './services/jepa-projector.service';
import { TradeoffEngineService } from './services/tradeoff-engine.service';
import type { OrchestrationResult } from './interfaces/claude-orchestration.interface';
import type { OrchestratorState } from './interfaces/trip-plan.interface';
import { summarizeP1RouteAndRunValidation } from './contracts/p1-route-and-run-validators';
import { DecisionKernelService } from '../decision/kernel/decision-kernel.service';
import { HarnessModule } from '../harness/harness.module';
import { HarnessStepRunnerService } from '../harness/runtime/harness-step-runner.service';
import { runVerifyReturnToResearchRetryLoop } from './orchestration/plan-verify-loop/verify-return-to-research-retry.runner';
import { pickVerifyHarnessSuggestedAction } from './orchestration/plan-verify-loop/plan-verify-harness-routing.util';
import type { DecisionState } from '../decision/kernel/decision-state.types';
import type { PhaseExecutorContext } from '../decision/kernel/interfaces/phase-executor.interface';
import type { PlanVerifyLoopOutcome } from './orchestration/plan-verify-loop/plan-verify-loop.types';
import type { RouteAndRunRequestDto } from './dto/route-and-run.dto';

const REQUEST_ID = 'e2e-vrtr-http';

function makePhaseCtx(): PhaseExecutorContext {
  return {
    requestId: REQUEST_ID,
    itinerary: {
      request_id: REQUEST_ID,
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

function minimalDso(): DecisionState {
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
  };
}

function makeKernelWithHarness(harnessStepRunner: HarnessStepRunnerService) {
  const merge = jest.fn((current: DecisionState, patch: Partial<DecisionState>) => ({
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
  const verifyExecutor = {
    execute: jest.fn().mockResolvedValue({ issues: [], confidenceDelta: 0 }),
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
  return { kernel, verifyExecutor };
}

async function buildHarnessRetryOrchestrationResult(
  harnessRunner: HarnessStepRunnerService,
): Promise<OrchestrationResult> {
  const { kernel } = makeKernelWithHarness(harnessRunner);
  const ctx = makePhaseCtx();
  const state = {
    request_id: REQUEST_ID,
    current_step: 'VERIFY',
    metadata: { started_at: new Date().toISOString(), last_updated_at: new Date().toISOString() },
    decision_log: [] as OrchestratorState['decision_log'],
    errors: [],
  } as OrchestratorState;

  const firstVerify = await kernel.executeVerify(minimalDso(), ctx);
  let planVerifyOutcome: PlanVerifyLoopOutcome = {
    kind: 'reroute_pre_plan',
    entry: 'research',
    decisionState: firstVerify.newState,
  };

  const retry = await runVerifyReturnToResearchRetryLoop({
    state,
    planVerifyOutcome,
    decisionState: firstVerify.newState,
    maxRetries: 1,
    onRetry: async ({ decisionState: dsFromVerify }) => {
      const bound: DecisionState = {
        ...(dsFromVerify ?? minimalDso()),
        harnessRuntime: {
          ...(dsFromVerify?.harnessRuntime ?? {}),
          researchEvidenceSnapshotId: 'snap-a',
          last_harness_failure_events: undefined,
        },
      };
      const secondVerify = await kernel.executeVerify(bound, ctx);
      state.metadata = {
        ...(state.metadata as Record<string, unknown>),
        research_scope_invalidation: {
          reason: 'RETURN_TO_RESEARCH',
          scopes: ['hotel'],
          at: new Date().toISOString(),
        },
      };
      state.decision_log.push({
        request_id: REQUEST_ID,
        step: 'VERIFY',
        actor: 'Orchestrator',
        inputs_summary: 'Harness RETURN_TO_RESEARCH → invalidate research evidence snapshot',
        outputs_summary: 'RESEARCH_SCOPE_INVALIDATION',
        evidence_refs: [],
        timestamp: new Date().toISOString(),
        metadata: { system_action: 'RETURN_TO_RESEARCH' },
      });
      return {
        planVerifyOutcome: { kind: 'continue', decisionState: secondVerify.newState },
        decisionState: secondVerify.newState,
      };
    },
  });

  const itinerary = {
    request_id: REQUEST_ID,
    days: [
      {
        date: '2026-07-01',
        items: [{ type: 'POI', title: 'A', id: 'poi-a', evidence_refs: [] as string[] }],
      },
    ],
    action_plan: [],
  };
  const gatePass = {
    gate_result: 'ALLOW' as const,
    violations: [],
    required_adjustments: [] as { action: string; why: string }[],
    confidence: 0.9,
    evidence_refs: [] as string[],
  };

  return {
    success: true,
    answerText: 'verify return to research smoke',
    stepsExecuted: [{ stepId: 'VERIFY', success: true, duration: 1 }],
    totalDuration: 1,
    decisionLog: state.decision_log,
    result: {
      state: {
        ...state,
        itinerary,
        plan_version: 1,
        trip_plan_request: { request_id: REQUEST_ID, origin: 'A', destination: 'B' },
        gate_result: gatePass,
        metadata: {
          ...(state.metadata as Record<string, unknown>),
          verify_return_to_research_count: (state.metadata as Record<string, unknown>)
            .verify_return_to_research_count,
          started_at: new Date().toISOString(),
          last_updated_at: new Date().toISOString(),
        },
      },
      decisionState: retry.decisionState,
      itinerary,
      gate_result: gatePass,
    },
  };
}

describe('POST /agent/route_and_run — VERIFY RETURN_TO_RESEARCH HTTP smoke', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let assembler: RouteAndRunResponseAssemblerService;
  let harnessRunner: HarnessStepRunnerService;
  let prevUseClaudeEnv: string | undefined;

  beforeAll(async () => {
    prevUseClaudeEnv = process.env.USE_CLAUDE_ORCHESTRATION;
    process.env.USE_CLAUDE_ORCHESTRATION = 'true';
    delete process.env.HARNESS_RELAX_VERIFY_EVIDENCE_BINDING;
    process.env.DECISION_VERIFY_RETURN_TO_RESEARCH = 'true';

    const harnessModuleRef = await Test.createTestingModule({ imports: [HarnessModule] }).compile();
    harnessRunner = harnessModuleRef.get(HarnessStepRunnerService);

    const assemblerModule = await Test.createTestingModule({
      providers: [
        RouteAndRunResponseAssemblerService,
        JepaProjectorService,
        {
          provide: TradeoffEngineService,
          useValue: { buildNegotiation: jest.fn().mockResolvedValue(null) },
        },
      ],
    }).compile();
    assembler = assemblerModule.get(RouteAndRunResponseAssemblerService);

    const mockAgentService = {
      routeAndRun: jest.fn(async (request: RouteAndRunRequestDto) => {
        const orchestrationResult = await buildHarnessRetryOrchestrationResult(harnessRunner);
        expect(pickVerifyHarnessSuggestedAction(orchestrationResult.result?.decisionState)).not.toBe(
          'RETURN_TO_RESEARCH',
        );
        return assembler.assembleClaudeStateMachineResponse({
          request,
          startTime: Date.now(),
          orchestrationResult,
        });
      }),
    };

    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true })],
      controllers: [AgentController],
      providers: [{ provide: AgentService, useValue: mockAgentService }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (prevUseClaudeEnv === undefined) delete process.env.USE_CLAUDE_ORCHESTRATION;
    else process.env.USE_CLAUDE_ORCHESTRATION = prevUseClaudeEnv;
    if (app) await app.close();
    if (moduleRef) await moduleRef.close();
  });

  it('exposes verify_return_to_research_count on observability after Harness retry', async () => {
    const body = {
      request_id: REQUEST_ID,
      user_id: 'u1',
      trip_id: 'b950dbf2-7583-4b43-b0c6-ddd947719c54',
      message: 'plan trip',
      options: {
        use_claude_orchestration: true,
        use_state_machine_orchestration: true,
        dry_run: true,
      },
    };

    const response = await request(app.getHttpServer()).post('/agent/route_and_run').send(body).expect(200);
    const p1 = summarizeP1RouteAndRunValidation(response.body);
    expect(p1.allErrors).toEqual([]);

    const obs = response.body.observability as Record<string, unknown>;
    expect(obs.verify_return_to_research_count).toBe(1);
    expect(obs.research_scope_invalidation_reason).toBe('RETURN_TO_RESEARCH');

    const stMeta = response.body.result?.payload?.orchestrationResult?.state?.metadata as Record<
      string,
      unknown
    >;
    expect(stMeta?.verify_return_to_research_count).toBe(1);
  });
});
