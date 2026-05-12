/**
 * 强制契约：route_and_run 响应 observability.memory_contract 必须可由前置装载回显，
 * 防止 Memory DI 静默失效后无从观测。
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { AgentService } from './services/agent.service';
import { RouterService } from './services/router.service';
import { AgentStateService } from './services/agent-state.service';
import { System1ExecutorService } from './services/system1-executor.service';
import { OrchestratorService } from './services/orchestrator.service';
import { EventTelemetryService } from './services/event-telemetry.service';
import { RequestDeduplicationService } from './services/request-deduplication.service';
import { ExecutionGatewayService } from './services/execution-gateway.service';
import { ROUTE_AND_RUN_MEMORY_TEST_PROVIDERS } from './memory/testing/route-and-run-memory.providers';

describe('route_and_run memory contract', () => {
  it('attachObservability merges memory_contract from request snapshot', async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true })],
      providers: [
        ...ROUTE_AND_RUN_MEMORY_TEST_PROVIDERS,
        ExecutionGatewayService,
        AgentService,
        { provide: RouterService, useValue: { route: jest.fn() } },
        {
          provide: AgentStateService,
          useValue: {
            createInitialState: jest.fn(),
            getState: jest.fn(),
            update: jest.fn(),
          },
        },
        { provide: System1ExecutorService, useValue: { execute: jest.fn() } },
        { provide: OrchestratorService, useValue: { execute: jest.fn() } },
        { provide: EventTelemetryService, useValue: { recordRouterDecision: jest.fn(), recordAgentComplete: jest.fn() } },
        {
          provide: RequestDeduplicationService,
          useValue: { checkDuplicate: jest.fn(), cacheResponse: jest.fn() },
        },
      ],
    }).compile();

    const agentService = moduleRef.get(AgentService);
    const req = {
      request_id: 'mc-contract',
      __memoryContractObs: {
        revision: 'v1',
        loaded: true,
        layers: ['L1_user_profile'],
        user_id_present: true,
        snapshot_id: 'snap-1',
        snapshot_version: 1,
        loaded_at_iso: new Date(Date.now() - 50).toISOString(),
      },
      __memoryExecutionBinding: {
        snapshot_id: 'snap-1',
        snapshot_version: 1,
        request_id: 'mc-contract',
      },
    };
    const resp = {
      observability: {
        latency_ms: 1,
        router_ms: 0,
        system_mode: 'SYSTEM1' as const,
        tool_calls: 0,
        browser_steps: 0,
        tokens_est: 0,
        cost_est_usd: 0,
        fallback_used: false,
      },
    };
    const merged = (agentService as any).attachObservability(resp, { mode_final: 'LEGACY' }, req as any);
    expect((merged.observability as { memory_contract?: { loaded: boolean } }).memory_contract?.loaded).toBe(true);
    expect(
      (merged.observability as { execution_memory_binding?: { snapshot_id: string } }).execution_memory_binding
        ?.snapshot_id,
    ).toBe('snap-1');
    expect((merged.observability as { memory_contract?: { layers?: string[] } }).memory_contract?.layers).toContain(
      'L1_user_profile',
    );

    await moduleRef.close();
  });
});
