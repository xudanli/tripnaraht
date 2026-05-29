/**
 * Phase 2 阶梯防御 — 连点时序 E2E 集成测试
 *
 * 验证：Request A 持 trip 写锁并推高 DSO 版本后，Request B（相同 client_dso_version）
 * 在锁队列醒来时于 post_lock 触发 STALE_PLAN_VERSION（409），且不进入编排主链。
 *
 * 不测完整 LLM/状态机；`runRouteAndRunMainChain` 替换为可控延迟桩，锁与版本解析为真实实现。
 */

import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionGatewayService } from './services/execution-gateway.service';
import { TripOrchestrationLockService } from './services/trip-orchestration-lock.service';
import { DistributedLockService } from '../redis/distributed-lock.service';
import { TripRunManagerService } from './services/trip-run-manager.service';
import { AgentService } from './services/agent.service';
import { RequestDeduplicationService } from './services/request-deduplication.service';
import type { RouteAndRunRequestDto, RouteAndRunResponseDto } from './dto/route-and-run.dto';

const TRIP_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

/** 可变服务端 DSO 版本（模拟 TripRun checkpoint 在 A commit 后 +1） */
const tripServerState = { dsoVersion: 10 };

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function writeRouteRequest(
  requestId: string,
  clientDsoVersion?: number,
): RouteAndRunRequestDto {
  return {
    request_id: requestId,
    user_id: 'phase2-e2e-user',
    trip_id: TRIP_ID,
    message: '请把第2天改成博物馆为主，并收紧步行强度',
    options: {
      client_dso_version: clientDsoVersion,
      max_seconds: 60,
      dry_run: false,
    },
  } as RouteAndRunRequestDto;
}

function minimalRouteResponse(
  request: RouteAndRunRequestDto,
  dsoVersion: number,
): RouteAndRunResponseDto {
  return {
    request_id: request.request_id,
    route: { route: 'CLAUDE_SM', confidence: 1, reasons: ['e2e-mock'], budget: {} },
    result: { status: 'OK', answer_text: 'mock', payload: {} },
    explain: {
      decision_log: [],
      kernel_explainability: { dso_version: String(dsoVersion) },
    },
    observability: {
      latency_ms: 0,
      router_ms: 0,
      system_mode: 'SYSTEM2',
      tool_calls: 0,
      browser_steps: 0,
      tokens_est: 0,
      cost_est_usd: 0,
      fallback_used: false,
      dso_version: String(dsoVersion),
    },
  } as RouteAndRunResponseDto;
}

const orchestrationCalls: string[] = [];

/**
 * 确定性 trip 互斥（单进程 E2E）：避免 cache-manager 伪 Redis 锁在 Jest 下不稳定导致 BUSY 误报。
 */
function createDeterministicTripLock() {
  const owners = new Map<string, string>();
  return {
    withLock: async <T>(
      resourceId: string,
      callback: () => Promise<T>,
      config?: { retryCount?: number; retryDelayMs?: number },
    ): Promise<{ success: boolean; result?: T; error?: string }> => {
      const maxAttempts = config?.retryCount ?? 80;
      const waitMs = config?.retryDelayMs ?? 25;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (!owners.has(resourceId)) {
          owners.set(resourceId, resourceId);
          try {
            const result = await callback();
            return { success: true, result };
          } finally {
            owners.delete(resourceId);
          }
        }
        await delay(waitMs);
      }
      return { success: false, error: 'deterministic lock timeout' };
    },
  };
}

jest.mock('./services/execution-gateway.route-and-run.orchestration', () => ({
  runRouteAndRunMainChain: jest.fn(
    async (
      _agent: unknown,
      _gateway: unknown,
      request: RouteAndRunRequestDto,
    ): Promise<RouteAndRunResponseDto> => {
      orchestrationCalls.push(request.request_id);
      if (request.request_id === 'req-phase2-a') {
        await delay(200);
        tripServerState.dsoVersion = 11;
        return minimalRouteResponse(request, 11);
      }
      return minimalRouteResponse(request, tripServerState.dsoVersion);
    },
  ),
}));

function extractConflictBody(err: unknown): Record<string, unknown> {
  expect(err).toBeInstanceOf(HttpException);
  const ex = err as HttpException;
  expect(ex.getStatus()).toBe(HttpStatus.CONFLICT);
  return ex.getResponse() as Record<string, unknown>;
}

describe('ExecutionGateway — Phase 2 连点阶梯防御 (E2E integration)', () => {
  let moduleRef: TestingModule;
  let gateway: ExecutionGatewayService;
  let prevLockEnv: string | undefined;

  const tripRunManagerMock = {
    resolveLatestServerDsoVersionForTrip: jest.fn(async () => tripServerState.dsoVersion),
  };

  beforeAll(async () => {
    prevLockEnv = process.env.TRIP_ORCHESTRATION_LOCK_ENABLED;
    process.env.TRIP_ORCHESTRATION_LOCK_ENABLED = '1';

    moduleRef = await Test.createTestingModule({
      providers: [
        ExecutionGatewayService,
        TripOrchestrationLockService,
        {
          provide: DistributedLockService,
          useValue: createDeterministicTripLock() as unknown as DistributedLockService,
        },
        { provide: TripRunManagerService, useValue: tripRunManagerMock },
        { provide: AgentService, useValue: {} },
        {
          provide: RequestDeduplicationService,
          useValue: {
            generateRequestHash: jest.fn(),
            checkDuplicate: jest.fn().mockReturnValue(null),
          },
        },
      ],
    }).compile();

    gateway = moduleRef.get(ExecutionGatewayService);
  });

  afterAll(async () => {
    if (prevLockEnv === undefined) delete process.env.TRIP_ORCHESTRATION_LOCK_ENABLED;
    else process.env.TRIP_ORCHESTRATION_LOCK_ENABLED = prevLockEnv;
    await moduleRef?.close();
  });

  beforeEach(() => {
    tripServerState.dsoVersion = 10;
    orchestrationCalls.length = 0;
    tripRunManagerMock.resolveLatestServerDsoVersionForTrip.mockClear();
    const { runRouteAndRunMainChain } = jest.requireMock(
      './services/execution-gateway.route-and-run.orchestration',
    );
    runRouteAndRunMainChain.mockReset();
    runRouteAndRunMainChain.mockImplementation(
      async (_a: unknown, _g: unknown, request: RouteAndRunRequestDto) => {
        orchestrationCalls.push(request.request_id);
        if (request.request_id.includes('req-phase2-a')) {
          await delay(180);
          tripServerState.dsoVersion = 11;
          return minimalRouteResponse(request, 11);
        }
        return minimalRouteResponse(request, tripServerState.dsoVersion);
      },
    );
  });

  it('Request B 排队醒来后应 STALE_PLAN_VERSION，且不得进入编排主链', async () => {
    const reqA = writeRouteRequest('req-phase2-a', 10);
    const reqB = writeRouteRequest('req-phase2-b', 10);

    let releaseAEntered!: () => void;
    const aEntered = new Promise<void>((r) => {
      releaseAEntered = r;
    });

    const { runRouteAndRunMainChain } = jest.requireMock(
      './services/execution-gateway.route-and-run.orchestration',
    );
    runRouteAndRunMainChain.mockImplementation(
      async (_a: unknown, _g: unknown, request: RouteAndRunRequestDto) => {
        orchestrationCalls.push(request.request_id);
        if (request.request_id === 'req-phase2-a') {
          releaseAEntered();
          await delay(180);
          tripServerState.dsoVersion = 11;
          return minimalRouteResponse(request, 11);
        }
        return minimalRouteResponse(request, tripServerState.dsoVersion);
      },
    );

    const promiseA = gateway.runRouteAndRun(reqA);

    await aEntered;
    await delay(30);
    const promiseB = gateway.runRouteAndRun(reqB).then(
      () => {
        throw new Error('expected STALE_PLAN_VERSION for Request B');
      },
      (err) => err,
    );

    const [resA, errB] = await Promise.all([promiseA, promiseB]);

    expect(resA.explain?.kernel_explainability?.dso_version).toBe('11');
    expect(tripServerState.dsoVersion).toBe(11);

    const body = extractConflictBody(errB);
    expect(body).toMatchObject({
      code: 'STALE_PLAN_VERSION',
      trip_id: TRIP_ID,
      request_id: 'req-phase2-b',
      client_dso_version: 10,
      server_dso_version: 11,
      reason: 'client_dso_version=10 < server_dso_version=11',
    });

    expect(orchestrationCalls).toEqual(['req-phase2-a']);
    expect(tripRunManagerMock.resolveLatestServerDsoVersionForTrip).toHaveBeenCalled();
  });

  it('服务端已领先时 Request B 应在抢锁前 pre_lock 熔断（0 编排调用）', async () => {
    tripServerState.dsoVersion = 11;
    const reqB = writeRouteRequest('req-phase2-b-pre', 10);

    await expect(gateway.runRouteAndRun(reqB)).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'STALE_PLAN_VERSION',
        server_dso_version: 11,
        client_dso_version: 10,
      }),
    });

    expect(orchestrationCalls).toHaveLength(0);
  });

  it('client_dso_version 与服务器一致时第二笔应进入编排（版本对齐，串行）', async () => {
    tripServerState.dsoVersion = 10;
    const resA = await gateway.runRouteAndRun(writeRouteRequest('req-phase2-a2', 10));
    expect(resA.explain?.kernel_explainability?.dso_version).toBe('11');
    expect(tripServerState.dsoVersion).toBe(11);

    const resB = await gateway.runRouteAndRun(writeRouteRequest('req-phase2-b2', 11));
    expect(resB.explain?.kernel_explainability?.dso_version).toBe('11');
    expect(orchestrationCalls).toContain('req-phase2-a2');
    expect(orchestrationCalls).toContain('req-phase2-b2');
  });
});

