/**
 * AgentController.route_and_run — AO P0 响应契约（入口层）
 * 不启动 HTTP 服务器：验证 gate_result / VERIFY 错误等经 Controller 出口仍对前端可用
 */

import { AgentController } from './agent.controller';
import { AgentService } from './services/agent.service';
import type { RouteAndRunResponseDto } from './dto/route-and-run.dto';
import type { OrchestratorState } from './interfaces/trip-plan.interface';
import { validateAo04RouteAndRunContract } from './contracts/claude-exec-route-and-run.contract';
import { validateK3RouteAndRunDecisionLogAlignment } from './contracts/route-and-run-k3-decision-log.contract';

function baseResponse(overrides: Partial<RouteAndRunResponseDto> = {}): RouteAndRunResponseDto {
  return {
    request_id: 'ao-p0-contract',
    route: { route: 'SYSTEM2_REASONING', confidence: 0.9, reasons: [], budget: {} } as any,
    result: {
      status: 'OK',
      answer_text: '',
      payload: {
        timeline: [],
        dropped_items: [],
        candidates: [],
        evidence: [],
        robustness: null,
        orchestrationResult: {},
      },
    },
    explain: { decision_log: [] },
    observability: {} as any,
    ...overrides,
  } as RouteAndRunResponseDto;
}

function orchestrationPayload(state: Partial<OrchestratorState>) {
  return baseResponse({
    result: {
      status: 'OK',
      answer_text: 'test',
      payload: {
        timeline: [],
        dropped_items: [],
        candidates: [],
        evidence: [],
        robustness: null,
        orchestrationResult: {
          state: {
            request_id: 'ao-p0-contract',
            current_step: 'GATE_EVAL',
            trip_plan_request: {
              request_id: 'ao-p0-contract',
              origin: 'A',
              destination: 'B',
            },
            decision_log: [],
            errors: [],
            evidence_registry: new Map(),
            metadata: {
              started_at: new Date().toISOString(),
              last_updated_at: new Date().toISOString(),
            },
            ...state,
          } as OrchestratorState,
        },
      },
    },
  });
}

describe('AgentController — AO P0 contract (route_and_run)', () => {
  it('透传 gate_result=BLOCK 与 violations', async () => {
    const mockService: Pick<AgentService, 'routeAndRun'> = {
      routeAndRun: jest.fn().mockResolvedValue(
        orchestrationPayload({
          gate_result: {
            gate_result: 'BLOCK',
            violations: [{ type: 'SAFETY', severity: 'HARD', detail: 'blocked' }],
            required_adjustments: [],
            confidence: 0.9,
            evidence_refs: [],
          },
        }),
      ),
    };
    const controller = new AgentController(mockService as AgentService);
    const res = await controller.routeAndRun({
      request_id: 'ao-p0-contract',
      user_id: 'u1',
      message: 'plan',
    } as any);

    const st = res.result.payload.orchestrationResult?.state;
    expect(st?.gate_result?.gate_result).toBe('BLOCK');
    expect(st?.gate_result?.violations?.[0]?.detail).toBe('blocked');
  });

  it('透传 gate_result=NEED_USER_CONFIRM 与 readiness_questions', async () => {
    const mockService: Pick<AgentService, 'routeAndRun'> = {
      routeAndRun: jest.fn().mockResolvedValue(
        orchestrationPayload({
          gate_result: {
            gate_result: 'NEED_USER_CONFIRM',
            violations: [],
            required_adjustments: [],
            confidence: 0.8,
            evidence_refs: [],
            readiness_questions: [{ ruleId: 'r1', questions: [{ id: 'q1' }] }],
          },
        }),
      ),
    };
    const controller = new AgentController(mockService as AgentService);
    const res = await controller.routeAndRun({
      request_id: 'ao-p0-contract',
      user_id: 'u1',
      message: 'plan',
    } as any);

    const g = res.result.payload.orchestrationResult?.state?.gate_result;
    expect(g?.gate_result).toBe('NEED_USER_CONFIRM');
    expect(g?.readiness_questions?.[0]?.ruleId).toBe('r1');
  });

  it('透传 gate_result=ADJUST_REQUIRED 与 required_adjustments', async () => {
    const mockService: Pick<AgentService, 'routeAndRun'> = {
      routeAndRun: jest.fn().mockResolvedValue(
        orchestrationPayload({
          gate_result: {
            gate_result: 'ADJUST_REQUIRED',
            violations: [{ type: 'TIME_CONFLICT', severity: 'SOFT', detail: 'day2 tight' }],
            required_adjustments: [{ action: 'ADD_BUFFER', why: '增加缓冲' }],
            confidence: 0.55,
            evidence_refs: [],
          },
        }),
      ),
    };
    const controller = new AgentController(mockService as AgentService);
    const res = await controller.routeAndRun({
      request_id: 'ao-p0-contract',
      user_id: 'u1',
      message: 'plan',
    } as any);

    const g = res.result.payload.orchestrationResult?.state?.gate_result;
    expect(g?.gate_result).toBe('ADJUST_REQUIRED');
    expect(g?.required_adjustments?.[0]?.action).toBe('ADD_BUFFER');
    expect(g?.violations?.[0]?.detail).toContain('tight');
  });

  it('透传 VERIFY 阶段 errors 与 decision_log 引用', async () => {
    const mockService: Pick<AgentService, 'routeAndRun'> = {
      routeAndRun: jest.fn().mockResolvedValue(
        orchestrationPayload({
          current_step: 'VERIFY',
          errors: [
            {
              step: 'VERIFY',
              error_code: 'VERIFICATION_ISSUES',
              message: '发现 1 个验证问题',
              timestamp: new Date().toISOString(),
            },
          ],
          decision_log: [
            {
              request_id: 'ao-p0-contract',
              step: 'VERIFY',
              actor: 'Orchestrator',
              inputs_summary: 'Kernel 原生 VERIFY',
              outputs_summary: '发现 1 个问题',
              evidence_refs: [],
              timestamp: new Date().toISOString(),
              metadata: { issues: ['overlap'] },
            },
          ],
        }),
      ),
    };
    const controller = new AgentController(mockService as AgentService);
    const res = await controller.routeAndRun({
      request_id: 'ao-p0-contract',
      user_id: 'u1',
      message: 'plan',
    } as any);

    const st = res.result.payload.orchestrationResult?.state;
    expect(st?.errors?.[0]?.step).toBe('VERIFY');
    expect(st?.decision_log?.some((e: any) => e.step === 'VERIFY')).toBe(true);
  });

  it('透传 VERIFY→REPAIR 的 explain.decision_log 与 orchestrationResult.decision_log（与 AgentService 组装对齐）', async () => {
    const ts = new Date().toISOString();
    const decisionLog = [
      {
        request_id: 'ao-p0-contract',
        step: 'VERIFY' as const,
        actor: 'Orchestrator' as const,
        inputs_summary: 'itinerary.verify',
        outputs_summary: '发现约束冲突',
        evidence_refs: [] as string[],
        timestamp: ts,
      },
      {
        request_id: 'ao-p0-contract',
        step: 'REPAIR' as const,
        actor: 'Orchestrator' as const,
        inputs_summary: 'repair.apply',
        outputs_summary: '已应用修复',
        evidence_refs: [] as string[],
        timestamp: ts,
      },
    ];
    const mockService: Pick<AgentService, 'routeAndRun'> = {
      routeAndRun: jest.fn().mockResolvedValue(
        baseResponse({
          result: {
            status: 'OK',
            answer_text: 'test',
            payload: {
              timeline: [],
              dropped_items: [],
              candidates: [],
              evidence: [],
              robustness: null,
              orchestrationResult: {
                state: {
                  request_id: 'ao-p0-contract',
                  current_step: 'REPAIR',
                  trip_plan_request: {
                    request_id: 'ao-p0-contract',
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
                } as OrchestratorState,
                decision_log: decisionLog,
              },
            },
          },
          explain: { decision_log: decisionLog },
        }),
      ),
    };
    const controller = new AgentController(mockService as AgentService);
    const res = await controller.routeAndRun({
      request_id: 'ao-p0-contract',
      user_id: 'u1',
      message: 'plan',
    } as any);

    const stepsFromExplain = res.explain.decision_log.map((e) => e.step);
    expect(stepsFromExplain).toContain('VERIFY');
    expect(stepsFromExplain).toContain('REPAIR');
    expect(res.result.payload.orchestrationResult?.state?.current_step).toBe('REPAIR');
    const stepsFromPayload = res.result.payload.orchestrationResult?.decision_log?.map((e) => e.step);
    expect(stepsFromPayload).toEqual(stepsFromExplain);

    const k3 = validateK3RouteAndRunDecisionLogAlignment(res as unknown);
    expect(k3.valid).toBe(true);
    expect(k3.errors).toHaveLength(0);
  });

  it('AO-04：契约样例通过 claude_exec 对齐切片校验', () => {
    const res = orchestrationPayload({
      gate_result: {
        gate_result: 'ALLOW',
        violations: [],
        required_adjustments: [],
        confidence: 1,
      },
    });
    const v = validateAo04RouteAndRunContract(res as unknown);
    expect(v.valid).toBe(true);
    expect(v.errors).toHaveLength(0);
  });
});
