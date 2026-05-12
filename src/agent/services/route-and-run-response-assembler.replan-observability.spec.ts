/**
 * PRD I3：replan 继承字段回显到 route_and_run observability
 */

import { Test, TestingModule } from '@nestjs/testing';
import { RouteAndRunResponseAssemblerService } from './route-and-run-response-assembler.service';
import { JepaProjectorService } from './jepa-projector.service';
import { TradeoffEngineService } from './tradeoff-engine.service';
import { NegotiationSessionStoreService } from './negotiation-session-store.service';
import { RouteRunItineraryPoiHydratorService } from './route-run-itinerary-poi-hydrator.service';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { OrchestrationResult } from '../interfaces/claude-orchestration.interface';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';

async function createAssembler(): Promise<RouteAndRunResponseAssemblerService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      RouteAndRunResponseAssemblerService,
      JepaProjectorService,
      {
        provide: TradeoffEngineService,
        useValue: { buildNegotiation: jest.fn().mockResolvedValue(null) },
      },
      {
        provide: NegotiationSessionStoreService,
        useValue: { set: jest.fn() },
      },
      {
        provide: RouteRunItineraryPoiHydratorService,
        useValue: {
          hydrateFromItinerary: jest.fn().mockResolvedValue({ poi_cards: [], poi_cards_by_day: [] }),
        },
      },
    ],
  }).compile();
  return module.get(RouteAndRunResponseAssemblerService);
}

describe('RouteAndRunResponseAssemblerService — replan observability', () => {
  it('echoes replan lineage on CLAUDE_SM response', async () => {
    const assembler = await createAssembler();

    const state: OrchestratorState = {
      request_id: 'req-replan-obs',
      current_step: 'DONE',
      plan_version: 5,
      plan_id: 'plan-x',
      evidence_registry: new Map(),
      decision_log: [],
      errors: [],
      metadata: {
        started_at: new Date().toISOString(),
        last_updated_at: new Date().toISOString(),
        replan_context: {
          previous_plan_version: 4,
          previous_world_snapshot_hash: 'sha256:' + 'a'.repeat(80),
        },
      },
    } as OrchestratorState;

    const orchestrationResult: OrchestrationResult = {
      success: true,
      answerText: 'ok',
      stepsExecuted: [],
      totalDuration: 1,
      totalCost: 0,
      decisionLog: [],
      result: {
        state,
        itinerary: { days: [] } as any,
        gate_result: { gate_result: 'ALLOW', violations: [], required_adjustments: [] } as any,
      },
    };

    const request: RouteAndRunRequestDto = {
      request_id: 'req-replan-obs',
      user_id: 'u1',
      trip_id: 'trip-1',
      message: '继续规划',
      options: {
        previous_plan_version: 4,
        previous_world_snapshot_hash: 'sha256:' + 'a'.repeat(80),
      },
    };

    const res = await assembler.assembleClaudeStateMachineResponse({
      request,
      startTime: Date.now() - 10,
      orchestrationResult,
    });

    expect(res.observability.replan_previous_plan_version).toBe(4);
    expect(res.observability.replan_new_plan_version).toBe(5);
    expect(String(res.observability.replan_previous_world_snapshot_hash_preview).length).toBe(64);
    expect(res.observability.replan_previous_world_snapshot_hash_preview).toMatch(/^sha256:aaaa/);
  });
});
