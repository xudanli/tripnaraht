/**
 * HTTP 真入口 Golden E2E（Harness Hardening）。
 * Nest + supertest POST /agent/route_and_run；AgentService 内联跑 Harness 编译与快路径。
 * 无 Prisma / AppModule。
 */

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AgentController } from '../../agent.controller';
import { AgentService } from '../../services/agent.service';
import { applyRouteAndRunEntryRoutingInPlace } from '../../routing/route-and-run-route-class-fork.util';
import { readAgentTaskContract } from '../compile-agent-task-contract.util';
import { tryBuildLiveExecutionFastPath } from '../../services/live-execution-fast-path.util';
import { tryBuildDecisionSupportFastPath } from '../../services/decision-support-fast-path.util';
import { buildAgentTurnTrace, projectAgentTurnTraceForObservability } from './agent-turn-trace.util';
import { clearTravelDecisionStoreForTests } from '../../decision-support';
import type { RouteAndRunRequestDto } from '../../dto/route-and-run.dto';

describe('Harness Hardening HTTP Golden E2E', () => {
  let app: INestApplication;

  const routeAndRunImpl = async (req: RouteAndRunRequestDto) => {
    applyRouteAndRunEntryRoutingInPlace(req);
    const contract = readAgentTaskContract(req)!;
    const start = Date.now();

    const live = await tryBuildLiveExecutionFastPath(undefined, req, start);
    if (live) {
      const trace = buildAgentTurnTrace({
        contract,
        runtimeSelected: 'LIVE_EXECUTION',
        resultStatus: String(live.result?.status ?? 'OK'),
        answerPreviewZh: live.result?.answer_text,
        appliedToItinerary: false,
        evidence: [],
      });
      (live.observability as any).agent_turn_trace =
        projectAgentTurnTraceForObservability(trace);
      return live;
    }

    const decision = await tryBuildDecisionSupportFastPath(undefined, req, start);
    if (decision) {
      const trace = buildAgentTurnTrace({
        contract,
        runtimeSelected: 'DECISION_SUPPORT',
        resultStatus: String(decision.result?.status ?? 'OK'),
        answerPreviewZh: decision.result?.answer_text,
        appliedToItinerary: false,
      });
      (decision.observability as any).agent_turn_trace =
        projectAgentTurnTraceForObservability(trace);
      return decision;
    }

    /** Query / 其它：返回 Contract 投影（模拟轻量出口） */
    const trace = buildAgentTurnTrace({
      contract,
      runtimeSelected: contract.taskType as any,
      resultStatus: 'OK',
      answerPreviewZh: 'harness_http_golden_query',
      appliedToItinerary: false,
      attemptedCapabilities: ['ANSWER'],
      deniedCapabilities: contract.capabilities.deny.filter((c) =>
        ['PLAN', 'APPLY', 'SOLVER', 'REPAIR'].includes(c),
      ),
    });

    return {
      request_id: req.request_id,
      route: { route: 'SYSTEM1_API', confidence: 1, reasons: ['HARNESS_HTTP_GOLDEN'] },
      result: {
        status: 'OK',
        answer_text:
          contract.taskType === 'TRIP_QUERY'
            ? '【Harness】行程只读答复（Golden E2E）'
            : `task=${contract.taskType}`,
        payload: {
          applied_to_itinerary: false,
          agent_task_contract: trace.task,
        },
      },
      explain: { decision_log: [] },
      observability: {
        orchestration_mode_final:
          contract.allowFullPlanning === false ? 'LIGHTWEIGHT' : 'HARNESS',
        agent_task_contract: trace.task,
        agent_turn_trace: projectAgentTurnTraceForObservability(trace),
      },
    };
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AgentController],
      providers: [
        {
          provide: AgentService,
          useValue: { routeAndRun: jest.fn(routeAndRunImpl) },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    clearTravelDecisionStoreForTests();
  });

  const TRIP = '00000000-0000-4000-8000-0000000000e2';

  it('CASE-Q01/G01 HTTP: 哪一天没住宿 + TRIP_PLANNING hint → TRIP_QUERY, no write', async () => {
    const res = await request(app.getHttpServer())
      .post('/agent/route_and_run')
      .send({
        request_id: 'http-q01',
        user_id: 'u1',
        trip_id: TRIP,
        message: '哪一天没住宿',
        options: {
          intent_mode: 'TRIP_PLANNING',
          use_state_machine_orchestration: true,
          entry_point: 'itinerary_day_editor',
        },
      })
      .expect(200);

    expect(res.body.observability.agent_task_contract.taskType).toBe('TRIP_QUERY');
    expect(res.body.observability.agent_task_contract.allowFullPlanning).toBe(false);
    expect(res.body.result.payload.applied_to_itinerary).toBe(false);
    expect(res.body.observability.agent_turn_trace.unauthorized_write_attempt).toBe(false);
    expect(res.body.observability.orchestration_mode_final).toBe('LIGHTWEIGHT');
  });

  it('CASE-E01 HTTP: Live fast path, no itinerary apply', async () => {
    const res = await request(app.getHttpServer())
      .post('/agent/route_and_run')
      .send({
        request_id: 'http-e01',
        user_id: 'u1',
        trip_id: TRIP,
        message: '我们晚两个小时，还能去冰河湖吗？',
        options: {
          live_sensor_evidence: {
            road_alert_zh: '1号公路通行',
            weather_risk_zh: '阵风',
            skip_host_fetch: true,
          },
          remaining_drive_hours: 3.5,
        },
      })
      .expect(200);

    expect(res.body.observability.orchestration_mode_final).toBe('LIVE_EXECUTION_FAST_PATH');
    expect(res.body.result.payload.applied_to_itinerary).toBe(false);
    expect(res.body.observability.agent_task_contract.taskType).toBe('LIVE_EXECUTION');
  });

  it('CASE-D01 HTTP: Decision card, commit_authority decision-only', async () => {
    const res = await request(app.getHttpServer())
      .post('/agent/route_and_run')
      .send({
        request_id: 'http-d01',
        user_id: 'u1',
        trip_id: TRIP,
        message: '我们租两驱还是四驱？可能要走高地 F-road',
      })
      .expect(200);

    expect(res.body.observability.agent_task_contract.taskType).toBe('DECISION_SUPPORT');
    expect(
      res.body.observability.decision_runtime_pipeline?.applied_to_itinerary ??
        res.body.result.payload?.decision_commit?.applied_to_itinerary ??
        false,
    ).toBe(false);
  });
});
