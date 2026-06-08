/**
 * 整段多日重规划：post_plan terminal 出口仍须 enrich 住宿 MCP 结果。
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { RagRealityPolicyGateService } from '../../rag/services/rag-reality-policy-gate.service';
import { ClaudeOrchestratorService } from './claude-orchestrator.service';
import { LlmService } from '../../llm/services/llm.service';
import { LlmProvider } from '../../llm/dto/llm-request.dto';
import { SKILLS_REGISTRY_TOKEN } from '../../skills/services/skills-registry.token';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { AgentContext } from '../interfaces/agent-context.interface';
import { ContextSlidingWindowAdapter } from '../context/services/context-sliding-window-adapter.service';

describe('ClaudeOrchestratorService — full trip replan hotel enrich', () => {
  const rid = 'orch-full-trip-hotel-1';

  async function createOrchestrator() {
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
          provide: SKILLS_REGISTRY_TOKEN,
          useValue: {
            getAllSkills: jest.fn().mockReturnValue([]),
            getSkill: jest.fn().mockReturnValue(null),
          },
        },
        { provide: PrismaService, useValue: {} },
        { provide: ContextSlidingWindowAdapter, useValue: {} },
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

  it('enrichOrchestrationResultWithFullTripReplanHotel attaches accommodations and logs sensor step', async () => {
    const orch = await createOrchestrator();
    (orch as any).mcpToolDispatcher = { executeTool: jest.fn() };
    (orch as any).runLiveHotelSensorBranch = jest.fn().mockResolvedValue({
      audits: [],
      block: null,
      hotelRouteRunUi: {
        accommodations: [{ id: 'hotel-1', name: 'Test Hotel' }],
        airbnbListings: [],
        routing: { target: 'hotel' },
        hotel_search_meta: { strategy: 'per_night_full_trip_replan', sampled_nights: [1, 2] },
      },
    });

    const state: OrchestratorState = {
      request_id: rid,
      current_step: 'DONE',
      trip_plan_request: {} as any,
      decision_log: [],
      errors: [],
      evidence_registry: new Map(),
      metadata: {
        started_at: new Date().toISOString(),
        last_updated_at: new Date().toISOString(),
        itinerary_full_trip_replan: true,
        full_trip_replan_hotel_requested: true,
        intake_user_message: '还缺住宿，请安排雷克雅未克和 Vik 过夜',
      },
    } as OrchestratorState;

    const request = {
      request_id: rid,
      trip_id: 'trip-1',
      message: '还缺住宿，请安排雷克雅未克和 Vik 过夜',
    } as RouteAndRunRequestDto;
    const context = { tripId: 'trip-1' } as AgentContext;
    const baseResult = {
      success: true,
      result: { state, decision_log: state.decision_log },
      answerText: 'ok',
      stepsExecuted: [],
      totalDuration: 1,
      decisionLog: state.decision_log,
    };

    const enriched = await (orch as any).enrichOrchestrationResultWithFullTripReplanHotel(
      request,
      context,
      state,
      baseResult,
    );

    expect((orch as any).runLiveHotelSensorBranch).toHaveBeenCalledWith(
      request,
      context,
      'trip-1',
      { fullTripReplan: true },
    );
    expect(enriched.result?.accommodations).toHaveLength(1);
    expect(
      state.decision_log.some(
        (e) => e.metadata?.system_action === 'FULL_TRIP_REPLAN_HOTEL_SENSOR',
      ),
    ).toBe(true);
  });

  it('enrichOrchestrationResultWithFullTripReplanHotel logs skip when MCP unavailable', async () => {
    const orch = await createOrchestrator();
    (orch as any).mcpToolDispatcher = undefined;

    const state: OrchestratorState = {
      request_id: rid,
      current_step: 'DONE',
      trip_plan_request: {} as any,
      decision_log: [],
      errors: [],
      evidence_registry: new Map(),
      metadata: {
        started_at: new Date().toISOString(),
        last_updated_at: new Date().toISOString(),
        itinerary_full_trip_replan: true,
        full_trip_replan_hotel_requested: true,
      },
    } as OrchestratorState;

    const request = { request_id: rid, trip_id: 'trip-1' } as RouteAndRunRequestDto;
    const context = { tripId: 'trip-1' } as AgentContext;
    const baseResult = {
      success: true,
      result: { state, decision_log: state.decision_log },
      answerText: 'ok',
      stepsExecuted: [],
      totalDuration: 1,
      decisionLog: state.decision_log,
    };

    const enriched = await (orch as any).enrichOrchestrationResultWithFullTripReplanHotel(
      request,
      context,
      state,
      baseResult,
    );

    expect(enriched.result?.accommodations).toBeUndefined();
    expect(state.decision_log[0]?.metadata?.reason).toBe('mcp_unavailable');
  });
});
