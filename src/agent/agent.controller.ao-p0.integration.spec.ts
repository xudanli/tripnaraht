import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AgentController } from './agent.controller';
import { AgentService } from './services/agent.service';

describe('AgentController AO P0 (integration)', () => {
  let app: INestApplication;
  const mockAgentService: Pick<AgentService, 'routeAndRun'> = {
    routeAndRun: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AgentController],
      providers: [{ provide: AgentService, useValue: mockAgentService }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('POST /agent/route_and_run should keep NEED_USER_CONFIRM gate result and readiness questions', async () => {
    mockAgentService.routeAndRun.mockResolvedValue({
      request_id: 'req-ao-int-1',
      route: {} as any,
      result: {
        status: 'OK',
        answer_text: 'need confirm',
        payload: {
          timeline: [],
          dropped_items: [],
          candidates: [],
          evidence: [],
          robustness: null,
          orchestrationResult: {
            state: {
              request_id: 'req-ao-int-1',
              current_step: 'GATE_EVAL',
              trip_plan_request: {
                request_id: 'req-ao-int-1',
                origin: 'A',
                destination: 'B',
              },
              gate_result: {
                gate_result: 'NEED_USER_CONFIRM',
                violations: [],
                required_adjustments: [],
                confidence: 0.8,
                evidence_refs: [],
                readiness_questions: [{ ruleId: 'visa-rule', questions: [{ id: 'q1' }] }],
              },
              decision_log: [],
              errors: [],
              evidence_registry: new Map(),
              metadata: {
                started_at: new Date().toISOString(),
                last_updated_at: new Date().toISOString(),
              },
            },
          },
        },
      },
      explain: { decision_log: [] },
      observability: {} as any,
    });

    const response = await request(app.getHttpServer())
      .post('/agent/route_and_run')
      .send({
        request_id: 'req-ao-int-1',
        user_id: 'u1',
        message: 'plan trip',
      })
      .expect(200);

    expect(response.body.result.payload.orchestrationResult.state.gate_result.gate_result).toBe(
      'NEED_USER_CONFIRM',
    );
    expect(
      response.body.result.payload.orchestrationResult.state.gate_result.readiness_questions[0].ruleId,
    ).toBe('visa-rule');
    expect(mockAgentService.routeAndRun).toHaveBeenCalledTimes(1);
  });

  it('POST /agent/route_and_run should expose VERIFY→REPAIR in explain.decision_log and orchestrationResult', async () => {
    const ts = new Date().toISOString();
    const decisionLog = [
      {
        request_id: 'req-ao-int-2',
        step: 'VERIFY',
        actor: 'Orchestrator',
        inputs_summary: 'itinerary.verify',
        outputs_summary: '发现约束冲突',
        evidence_refs: [],
        timestamp: ts,
      },
      {
        request_id: 'req-ao-int-2',
        step: 'REPAIR',
        actor: 'Orchestrator',
        inputs_summary: 'repair.apply',
        outputs_summary: '已应用修复',
        evidence_refs: [],
        timestamp: ts,
      },
    ];
    mockAgentService.routeAndRun.mockResolvedValue({
      request_id: 'req-ao-int-2',
      route: {} as any,
      result: {
        status: 'OK',
        answer_text: 'ok',
        payload: {
          timeline: [],
          dropped_items: [],
          candidates: [],
          evidence: [],
          robustness: null,
          orchestrationResult: {
            state: {
              request_id: 'req-ao-int-2',
              current_step: 'REPAIR',
              trip_plan_request: {
                request_id: 'req-ao-int-2',
                origin: 'A',
                destination: 'B',
              },
              decision_log: decisionLog,
              errors: [],
              evidence_registry: new Map(),
              metadata: {
                started_at: ts,
                last_updated_at: ts,
              },
            },
            decision_log: decisionLog,
          },
        },
      },
      explain: { decision_log: decisionLog },
      observability: {} as any,
    });

    const response = await request(app.getHttpServer())
      .post('/agent/route_and_run')
      .send({
        request_id: 'req-ao-int-2',
        user_id: 'u1',
        message: 'plan',
      })
      .expect(200);

    const stepsExplain = response.body.explain.decision_log.map((e: { step: string }) => e.step);
    expect(stepsExplain).toContain('VERIFY');
    expect(stepsExplain).toContain('REPAIR');
    expect(response.body.result.payload.orchestrationResult.state.current_step).toBe('REPAIR');
    const stepsPayload = response.body.result.payload.orchestrationResult.decision_log.map(
      (e: { step: string }) => e.step,
    );
    expect(stepsPayload).toEqual(stepsExplain);
    expect(mockAgentService.routeAndRun).toHaveBeenCalledTimes(1);
  });
});

