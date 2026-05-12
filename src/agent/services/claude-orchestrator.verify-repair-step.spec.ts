/**
 * ClaudeOrchestratorService — executeVerifyStep / executeRepairStep（降级路径）回归
 * 覆盖 VERIFY -> REPAIR -> 再次 VERIFY 的最小闭环
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ClaudeOrchestratorService } from './claude-orchestrator.service';
import { LlmService } from '../../llm/services/llm.service';
import { LlmProvider } from '../../llm/dto/llm-request.dto';
import { SKILLS_REGISTRY_TOKEN } from '../../skills/services/skills-registry.token';
import { PrismaService } from '../../prisma/prisma.service';
import { RagRealityPolicyGateService } from '../../rag/services/rag-reality-policy-gate.service';
import { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import { AgentContext } from '../interfaces/claude-orchestration.interface';
import { GateResult, OrchestratorState, TripPlanRequest } from '../interfaces/trip-plan.interface';

const minimalPoiItem = (name: string) => ({
  id: `item-${name}`,
  type: 'POI' as const,
  start_window: '09:00',
  end_window: '10:00',
  location_ref: { name },
  evidence_refs: [] as string[],
  verified: false,
});

describe('ClaudeOrchestratorService — executeVerifyStep / executeRepairStep (skills loop)', () => {
  const baseTrip: TripPlanRequest = {
    request_id: 'orch-vr-1',
    origin: 'Tokyo',
    destination: 'JP-Osaka',
    date_range: { start_date: '2026-07-01', end_date: '2026-07-05' },
  };

  const gateForRepair: GateResult = {
    gate_result: 'ADJUST_REQUIRED',
    violations: [],
    required_adjustments: [{ action: 'REPLACE_SEGMENT', why: 'verify found overlap' }],
    confidence: 0.75,
    evidence_refs: [],
  };

  const buildState = (trip: TripPlanRequest): OrchestratorState => ({
    request_id: trip.request_id,
    current_step: 'PLAN_GEN',
    trip_plan_request: trip,
    itinerary: {
      request_id: trip.request_id,
      days: [{ date: '2026-07-01', items: [minimalPoiItem('before-repair')] }],
    },
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

  const minimalRequest = (requestId: string): RouteAndRunRequestDto =>
    ({ request_id: requestId }) as RouteAndRunRequestDto;

  const minimalContext = (requestId: string): AgentContext => ({
    requestId,
    userId: 'u1',
  });

  let verifyRound = 0;

  function createSkillsRegistryMock() {
    verifyRound = 0;
    return {
      getAllSkills: jest.fn().mockReturnValue([]),
      getSkill: jest.fn((name: string) => {
        if (name === 'itinerary.verify') {
          return {
            execute: jest.fn().mockImplementation(async () => {
              verifyRound += 1;
              if (verifyRound === 1) {
                return { issues: ['slot overlap'] };
              }
              return { issues: [] };
            }),
          };
        }
        if (name === 'repair.apply') {
          return {
            execute: jest.fn().mockResolvedValue({
              repaired: true,
              itinerary: {
                request_id: baseTrip.request_id,
                days: [{ date: '2026-07-01', items: [minimalPoiItem('after-repair')] }],
              },
            }),
          };
        }
        return null;
      }),
    };
  }

  async function createOrchestrator(skillsRegistry: ReturnType<typeof createSkillsRegistryMock>) {
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
        { provide: SKILLS_REGISTRY_TOKEN, useValue: skillsRegistry },
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

  it('VERIFY 发现问题 -> REPAIR 应用修复 -> 再次 VERIFY 应通过', async () => {
    const skillsRegistry = createSkillsRegistryMock();
    const orchestrator = await createOrchestrator(skillsRegistry);
    const state = buildState(baseTrip);
    const req = minimalRequest(baseTrip.request_id);
    const ctx = minimalContext(baseTrip.request_id);

    await (orchestrator as any).executeVerifyStep(req, ctx, state, LlmProvider.ANTHROPIC);
    expect(state.errors.some((e) => e.step === 'VERIFY' && e.error_code === 'VERIFICATION_ISSUES')).toBe(true);
    const verifyLogs1 = state.decision_log.filter((e) => e.step === 'VERIFY');
    expect(verifyLogs1[verifyLogs1.length - 1].outputs_summary).toContain('发现');
    expect((verifyLogs1[verifyLogs1.length - 1].metadata as any)?.issues).toContain('slot overlap');

    await (orchestrator as any).executeRepairStep(req, ctx, state, LlmProvider.ANTHROPIC);
    expect(state.itinerary?.days?.[0]?.items?.[0]?.location_ref?.name).toBe('after-repair');
    const repairLogs = state.decision_log.filter((e) => e.step === 'REPAIR');
    expect(repairLogs[repairLogs.length - 1].outputs_summary).not.toContain('无需修复或修复失败');
    expect((repairLogs[repairLogs.length - 1].metadata as any)?.repair_applied).toBe(true);

    await (orchestrator as any).executeVerifyStep(req, ctx, state, LlmProvider.ANTHROPIC);
    const verifyLogs2 = state.decision_log.filter((e) => e.step === 'VERIFY');
    expect(verifyLogs2[verifyLogs2.length - 1].outputs_summary).toContain('验证通过');
    expect(skillsRegistry.getSkill).toHaveBeenCalledWith('itinerary.verify');
    expect(skillsRegistry.getSkill).toHaveBeenCalledWith('repair.apply');
  });
});
