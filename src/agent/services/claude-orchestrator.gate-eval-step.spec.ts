/**
 * executeGateEvalStep（降级路径）回归 — 经 gate-eval-step.runner。
 * 覆盖准备度导致的 BLOCK / NEED_USER_CONFIRM（与 GateEvalExecutorService 行为对齐）
 */

import { executeGateEvalStep } from '../orchestration/graph/nodes/gate-eval-step.runner';
import type { GateEvalStepHost } from '../orchestration/graph/nodes/gate-eval-step.host';
import { LlmProvider } from '../../llm/dto/llm-request.dto';
import { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import { AgentContext } from '../interfaces/claude-orchestration.interface';
import { OrchestratorState, TripPlanRequest } from '../interfaces/trip-plan.interface';

describe('executeGateEvalStep (readiness) via gate-eval-step.runner', () => {
  const baseTrip: TripPlanRequest = {
    request_id: 'orch-gate-1',
    origin: 'Tokyo',
    destination: 'JP-Osaka',
    date_range: { start_date: '2026-07-01', end_date: '2026-07-05' },
  };

  const minimalState = (trip: TripPlanRequest): OrchestratorState => ({
    request_id: trip.request_id,
    current_step: 'INTAKE',
    trip_plan_request: trip,
    decision_log: [],
    errors: [],
    evidence_registry: new Map(),
    metadata: {
      started_at: new Date().toISOString(),
      last_updated_at: new Date().toISOString(),
    },
  });

  const minimalRequest = (): RouteAndRunRequestDto =>
    ({
      request_id: baseTrip.request_id,
    }) as RouteAndRunRequestDto;

  const minimalContext = (): AgentContext => ({
    requestId: baseTrip.request_id,
    userId: 'u1',
  });

  let readinessMock: {
    checkFromDestination: jest.Mock;
    generateDecisionLogEntries: jest.Mock;
  };

  beforeEach(() => {
    readinessMock = {
      checkFromDestination: jest.fn(),
      generateDecisionLogEntries: jest.fn().mockReturnValue([]),
    };
  });

  function makeHost(opts: { userDecision?: boolean } = {}): GateEvalStepHost {
    return {
      logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
      readinessService: readinessMock,
      userDecisionService: opts.userDecision ? {} : undefined,
      failureRiskPredictionService: {},
      extractTripContextFromState: jest.fn(() => ({
        traveler: {},
        trip: {},
        itinerary: { countries: ['JP'] },
      })),
      generateDecisionStepForStep: jest.fn(async () => undefined),
    };
  }

  it('准备度仅有硬阻断且无 UserDecisionService 时应 BLOCK，并写入 gate_result.violations', async () => {
    const host = makeHost({ userDecision: false });
    readinessMock.checkFromDestination.mockResolvedValue({
      findings: [
        {
          blockers: [{ severity: 'HARD', message: { zh: '准备度不满足', en: 'blocked' } }],
          must: [],
        },
      ],
    });

    const state = minimalState(baseTrip);
    await executeGateEvalStep(
      host,
      minimalRequest(),
      minimalContext(),
      state,
      LlmProvider.ANTHROPIC,
    );

    expect(state.gate_result?.gate_result).toBe('BLOCK');
    expect(state.gate_result?.violations?.length).toBeGreaterThan(0);
    expect(state.gate_result?.violations?.[0]?.detail).toContain('准备度不满足');
    expect(readinessMock.generateDecisionLogEntries).toHaveBeenCalled();
    const gateEvalLogs = state.decision_log.filter((e) => e.step === 'GATE_EVAL');
    expect(gateEvalLogs.some((e) => e.outputs_summary?.includes('BLOCK'))).toBe(true);
  });

  it('准备度含 userDecision.questions 且注入 UserDecisionService 时应 NEED_USER_CONFIRM', async () => {
    const host = makeHost({ userDecision: true });
    readinessMock.checkFromDestination.mockResolvedValue({
      findings: [
        {
          blockers: [
            {
              id: 'visa-rule',
              category: 'COMPLIANCE',
              severity: 'HARD',
              message: { zh: '签证策略待确认' },
              userDecision: { questions: [{ id: 'q1', text: '是否过境签？' }] },
            },
          ],
          must: [],
        },
      ],
    });

    const state = minimalState(baseTrip);
    await executeGateEvalStep(
      host,
      minimalRequest(),
      minimalContext(),
      state,
      LlmProvider.ANTHROPIC,
    );

    expect(state.gate_result?.gate_result).toBe('NEED_USER_CONFIRM');
    expect(state.gate_result?.violations).toEqual([]);
    const g = state.gate_result;
    expect(g?.readiness_questions?.length).toBe(1);
    expect(g?.readiness_questions?.[0]?.ruleId).toBe('visa-rule');
    const gateEvalLogs = state.decision_log.filter((e) => e.step === 'GATE_EVAL');
    expect(gateEvalLogs.some((e) => e.outputs_summary?.includes('NEED_USER_CONFIRM'))).toBe(true);
  });

  it('准备度 blocker 含 userDecision.questions 为空数组时应 BLOCK（不升级为 NEED_USER_CONFIRM）', async () => {
    const host = makeHost({ userDecision: true });
    readinessMock.checkFromDestination.mockResolvedValue({
      findings: [
        {
          blockers: [
            {
              id: 'empty-q-rule',
              message: { zh: '需确认但问题列表为空' },
              userDecision: { questions: [] },
            },
          ],
          must: [],
        },
      ],
    });

    const state = minimalState(baseTrip);
    await executeGateEvalStep(
      host,
      minimalRequest(),
      minimalContext(),
      state,
      LlmProvider.ANTHROPIC,
    );

    expect(state.gate_result?.gate_result).toBe('BLOCK');
    expect(state.gate_result?.violations?.some((v) => v.detail?.includes('需确认但问题列表为空'))).toBe(true);
  });

  it('userDecision 仅 question.prompt、无 text 时仍 NEED_USER_CONFIRM 且透传 prompt', async () => {
    const host = makeHost({ userDecision: true });
    readinessMock.checkFromDestination.mockResolvedValue({
      findings: [
        {
          blockers: [
            {
              id: 'prompt-only',
              category: 'COMPLIANCE',
              severity: 'HARD',
              message: { zh: '请确认' },
              userDecision: { questions: [{ id: 'q1', prompt: '仅 prompt 文案' }] },
            },
          ],
          must: [],
        },
      ],
    });

    const state = minimalState(baseTrip);
    await executeGateEvalStep(
      host,
      minimalRequest(),
      minimalContext(),
      state,
      LlmProvider.ANTHROPIC,
    );

    expect(state.gate_result?.gate_result).toBe('NEED_USER_CONFIRM');
    const g = state.gate_result;
    expect(g?.readiness_questions?.[0]?.questions?.[0]?.prompt).toBe('仅 prompt 文案');
    expect(g?.readiness_questions?.[0]?.questions?.[0]?.text).toBeUndefined();
  });

  it('失败风险预测 HIGH 且无用户决策问题时应 BLOCK（需 route_direction_id）', async () => {
    const host = makeHost({ userDecision: false });
    readinessMock.checkFromDestination.mockResolvedValue({ findings: [] });

    const trip = { ...baseTrip, request_id: 'orch-gate-risk' };
    const state: OrchestratorState = {
      ...minimalState(trip),
      research_data: {
        failure_risk_prediction: {
          predictions: [{ day: 2, riskLevel: 'HIGH' }],
        },
      },
    };

    const req = {
      request_id: trip.request_id,
      route_direction_id: 'rd-1',
    } as RouteAndRunRequestDto;

    await executeGateEvalStep(
      host,
      req,
      { requestId: trip.request_id, userId: 'u1' },
      state,
      LlmProvider.ANTHROPIC,
    );

    expect(state.gate_result?.gate_result).toBe('BLOCK');
    expect(state.gate_result?.violations?.some((v) => v.detail?.includes('高风险'))).toBe(true);
  });
});
