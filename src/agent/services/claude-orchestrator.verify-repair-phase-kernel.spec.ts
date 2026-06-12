/**
 * ClaudeOrchestratorService — executeVerifyPhase / executeRepairPhase（Kernel 原生路径）回归
 * 需 KERNEL_NATIVE_EXECUTION=true 且注入 DecisionKernelService
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ClaudeOrchestratorService } from './claude-orchestrator.service';
import { LlmService } from '../../llm/services/llm.service';
import { LlmProvider } from '../../llm/dto/llm-request.dto';
import { SKILLS_REGISTRY_TOKEN } from '../../skills/services/skills-registry.token';
import { DecisionKernelService } from '../../decision/kernel/decision-kernel.service';
import type { DecisionState } from '../../decision/kernel/decision-state.types';
import { PrismaService } from '../../prisma/prisma.service';
import { RagRealityPolicyGateService } from '../../rag/services/rag-reality-policy-gate.service';
import { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import { AgentContext } from '../interfaces/claude-orchestration.interface';
import { GateResult, OrchestratorState, TripPlanRequest } from '../interfaces/trip-plan.interface';

describe('ClaudeOrchestratorService — executeVerifyPhase / executeRepairPhase (kernel native)', () => {
  const rid = 'orch-kernel-vr-1';

  const baseTrip: TripPlanRequest = {
    request_id: rid,
    origin: 'Tokyo',
    destination: 'JP-Osaka',
    date_range: { start_date: '2026-07-01', end_date: '2026-07-05' },
  };

  const gateForRepair: GateResult = {
    gate_result: 'ADJUST_REQUIRED',
    violations: [],
    required_adjustments: [{ action: 'REPLACE_SEGMENT', why: 'kernel verify found issue' }],
    confidence: 0.75,
    evidence_refs: [],
  };

  const minimalPoiItem = (name: string) => ({
    id: `item-${name}`,
    type: 'POI' as const,
    start_window: '09:00',
    end_window: '10:00',
    location_ref: { name },
    evidence_refs: [] as string[],
    verified: false,
  });

  const itineraryBefore = {
    request_id: rid,
    days: [{ date: '2026-07-01', items: [minimalPoiItem('before')] }],
  };

  const itineraryAfter = {
    request_id: rid,
    days: [{ date: '2026-07-01', items: [minimalPoiItem('after-kernel')] }],
  };

  const buildOrchestratorState = (): OrchestratorState => ({
    request_id: rid,
    current_step: 'PLAN_GEN',
    trip_plan_request: baseTrip,
    itinerary: itineraryBefore as any,
    gate_result: gateForRepair,
    research_data: {},
    decision_log: [],
    errors: [],
    evidence_registry: new Map(),
    metadata: {
      started_at: new Date().toISOString(),
      last_updated_at: new Date().toISOString(),
    },
  });

  const minimalDso = (): DecisionState => ({
    requestId: rid,
    userIntent: {},
    tripState: {
      planDraft: itineraryBefore as any,
    },
    environmentState: {},
    confidence: 0.9,
    systemState: {
      requestId: rid,
      startedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      version: 0,
    },
  });

  let prevKernelNative: string | undefined;
  let prevKernelGray: string | undefined;

  beforeAll(() => {
    prevKernelNative = process.env.KERNEL_NATIVE_EXECUTION;
    prevKernelGray = process.env.KERNEL_NATIVE_EXECUTION_GRAY_PERCENT;
    process.env.KERNEL_NATIVE_EXECUTION = 'true';
    process.env.KERNEL_NATIVE_EXECUTION_GRAY_PERCENT = '100';
  });

  afterAll(() => {
    if (prevKernelNative === undefined) delete process.env.KERNEL_NATIVE_EXECUTION;
    else process.env.KERNEL_NATIVE_EXECUTION = prevKernelNative;
    if (prevKernelGray === undefined) delete process.env.KERNEL_NATIVE_EXECUTION_GRAY_PERCENT;
    else process.env.KERNEL_NATIVE_EXECUTION_GRAY_PERCENT = prevKernelGray;
  });

  async function createOrchestrator(decisionKernel: {
    executeVerify: jest.Mock;
    executeRepair: jest.Mock;
  }) {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClaudeOrchestratorService,
        {
          provide: LlmService,
          useValue: {
            getDefaultProvider: jest.fn().mockReturnValue(LlmProvider.ANTHROPIC),
            callLlmWithSchema: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            trip: { findUnique: jest.fn(), findFirst: jest.fn() },
            tripRun: { findUnique: jest.fn(), findFirst: jest.fn() },
          },
        },
        {
          provide: SKILLS_REGISTRY_TOKEN,
          useValue: {
            getAllSkills: jest.fn().mockReturnValue([]),
            getSkill: jest.fn().mockReturnValue(null),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'KERNEL_NATIVE_EXECUTION') return 'true';
              if (key === 'KERNEL_NATIVE_EXECUTION_GRAY_PERCENT') return '100';
              if (key === 'DECISION_KERNEL_ENABLED') return 'true';
              return undefined;
            }),
          },
        },
        { provide: DecisionKernelService, useValue: decisionKernel },
        {
          provide: RagRealityPolicyGateService,
          useValue: {
            resolve: jest.fn().mockReturnValue({ scope: 'full', policy: {} }),
            mergeChunkRetrievalParams: jest.fn((p: unknown) => p),
          },
        },
      ],
    }).compile();
    return module.get<ClaudeOrchestratorService>(ClaudeOrchestratorService);
  }

  it('Kernel 原生 VERIFY 产生 issues；随后 Kernel 原生 REPAIR 应用 itinerary', async () => {
    const dso0 = minimalDso();
    const dsoAfterVerify: DecisionState = {
      ...dso0,
      confidence: 0.75,
      systemState: {
        ...dso0.systemState!,
        currentPhase: 'VERIFY',
        lastUpdatedAt: new Date().toISOString(),
      },
    };
    const dsoAfterRepair: DecisionState = {
      ...dsoAfterVerify,
      tripState: {
        planDraft: itineraryAfter as any,
      },
      systemState: {
        ...dsoAfterVerify.systemState!,
        currentPhase: 'REPAIR',
        lastUpdatedAt: new Date().toISOString(),
      },
    };

    const decisionKernel = {
      executeVerify: jest.fn().mockResolvedValue({
        newState: dsoAfterVerify,
        issues: ['kernel-verify-issue'],
        confidenceDelta: -0.15,
      }),
      executeRepair: jest.fn().mockResolvedValue({
        newState: dsoAfterRepair,
        itinerary: itineraryAfter,
        repairApplied: true,
      }),
    };

    const orchestrator = await createOrchestrator(decisionKernel);
    const state = buildOrchestratorState();
    const req = { request_id: rid, user_id: 'u-kernel' } as RouteAndRunRequestDto;
    const ctx: AgentContext = { requestId: rid, userId: 'u-kernel' };

    const outVerify = await (orchestrator as any).executeVerifyPhase(
      dso0,
      state,
      req,
      ctx,
      LlmProvider.ANTHROPIC,
    );

    expect(decisionKernel.executeVerify).toHaveBeenCalledWith(
      dso0,
      expect.objectContaining({
        requestId: rid,
        itinerary: state.itinerary,
        researchData: state.research_data,
        tripPlanRequest: state.trip_plan_request,
      }),
    );
    expect(outVerify).toBe(dsoAfterVerify);
    expect(state.errors.some((e) => e.step === 'VERIFY' && e.error_code === 'VERIFICATION_ISSUES')).toBe(true);
    const verifyEntry = state.decision_log.filter(
      (e) => e.step === 'VERIFY' && e.inputs_summary === '检查草案的可执行性（开放时间、转乘衔接、可达性等）',
    );
    const lastVerify = verifyEntry[verifyEntry.length - 1];
    expect((lastVerify.metadata as any)?.issues?.length).toBeGreaterThan(0);
    expect(lastVerify.outputs_summary).toMatch(/共发现 \d+ 个问题/);

    const outRepair = await (orchestrator as any).executeRepairPhase(
      dsoAfterVerify,
      state,
      req,
      ctx,
      LlmProvider.ANTHROPIC,
    );

    expect(decisionKernel.executeRepair).toHaveBeenCalledWith(
      dsoAfterVerify,
      expect.objectContaining({
        requestId: rid,
        tripPlanRequest: state.trip_plan_request,
        gateResult: state.gate_result,
        itinerary: expect.any(Object),
      }),
    );
    expect(outRepair).toBe(dsoAfterRepair);
    expect(state.itinerary?.days?.[0]?.items?.[0]?.location_ref?.name).toBe('after-kernel');
    const repairEntry = state.decision_log.filter(
      (e) => e.step === 'REPAIR' && e.inputs_summary === '根据验证结果尝试自动修复行程（替换景点或改时段等）',
    );
    expect(repairEntry[repairEntry.length - 1].outputs_summary).toContain('已根据验证结果自动调整');
    expect((repairEntry[repairEntry.length - 1].metadata as any)?.repair_applied).toBe(true);
  });
});
