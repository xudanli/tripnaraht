/**
 * GateEvalExecutorService 单元测试
 */

import { Test, TestingModule } from '@nestjs/testing';
import { GateEvalExecutorService } from './gate-eval-executor.service';
import { TripContextExtractorService } from './shared/trip-context-extractor.service';
import { ReadinessService } from '../../trips/readiness/services/readiness.service';
import { UserDecisionService } from '../../trips/readiness/services/user-decision.service';
import { ClaudeGatekeeperAgentService } from '../services/sub-agents/gatekeeper-agent.service';

const minimalTripCtx = {
  destination: 'JP-Tokyo',
  date_range: { start_date: '2026-06-01', end_date: '2026-06-05' },
};

describe('GateEvalExecutorService', () => {
  let service: GateEvalExecutorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GateEvalExecutorService,
        TripContextExtractorService,
      ],
    }).compile();
    service = module.get<GateEvalExecutorService>(GateEvalExecutorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('无 tripPlanRequest 时应返回默认 ALLOW', async () => {
    const result = await service.execute({} as any, { requestId: 'r1' });
    expect(result.constraints.feasible).toBe(true);
    expect(result.gateResult.gate_result).toBe('ALLOW');
  });

  it('researchData 含高风险预测且 routeDirectionId 时应添加 BLOCK', async () => {
    const result = await service.execute(
      {} as any,
      {
        requestId: 'r1',
        routeDirectionId: 'rd-1',
        tripPlanRequest: { destination: 'Iceland' },
        researchData: {
          failure_risk_prediction: {
            predictions: [{ day: 2, riskLevel: 'HIGH' }, { day: 3, riskLevel: 'LOW' }],
          },
        },
      },
    );
    expect(result.gateResult.gate_result).toBe('BLOCK');
    expect(result.constraints.feasible).toBe(false);
    expect(result.gateResult.violations.some((v) => v.detail?.includes('高风险'))).toBe(true);
    expect(result.alternatives?.alternative_pois?.[0]).toMatchObject({
      poi_id: 'gate-block-failure_risk',
      name: '调整高风险日或路线后重试',
    });
    expect(String((result.alternatives?.alternative_pois?.[0] as { reason?: string })?.reason)).toContain('高风险');
  });

  it('无 gatekeeperAgent 且无 blocker 时应返回默认 ALLOW', async () => {
    const result = await service.execute(
      {} as any,
      {
        requestId: 'r1',
        tripPlanRequest: { destination: 'Iceland', date_range: { start_date: '2026-06-01', end_date: '2026-06-05' } },
        researchData: {},
      },
    );
    expect(result.gateResult.gate_result).toBe('ALLOW');
  });

  it('gatekeeper 返回 BLOCK 时应附带 TD-03 可读 alternatives', async () => {
    const gatekeeper = {
      evaluateGate: jest.fn().mockResolvedValue({
        gate_result: 'BLOCK',
        violations: [{ type: 'DATA_MISSING', severity: 'HARD', detail: '缺少目的地（destination）' }],
        required_adjustments: [],
        confidence: 0.9,
        evidence_refs: [],
      }),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GateEvalExecutorService,
        TripContextExtractorService,
        { provide: ClaudeGatekeeperAgentService, useValue: gatekeeper },
      ],
    }).compile();
    const svc = module.get<GateEvalExecutorService>(GateEvalExecutorService);
    const result = await svc.execute({} as any, {
      requestId: 'r-gk-block',
      tripPlanRequest: { destination: 'X', date_range: { start_date: '2026-06-01', end_date: '2026-06-05' } },
      researchData: {},
    });
    expect(result.gateResult.gate_result).toBe('BLOCK');
    expect(result.alternatives?.alternative_pois?.[0]).toMatchObject({
      poi_id: 'gate-block-gatekeeper',
      name: '按硬门控建议修改需求后重试',
    });
    expect(String((result.alternatives?.alternative_pois?.[0] as { reason?: string })?.reason)).toContain('destination');
  });
});

/** AO P0：准备度分支 — BLOCK（无用户问题）与 NEED_USER_CONFIRM（含 userDecision） */
describe('GateEvalExecutorService — readiness gate branches', () => {
  let service: GateEvalExecutorService;
  let readinessMock: { checkFromDestination: jest.Mock };

  beforeEach(async () => {
    readinessMock = { checkFromDestination: jest.fn() };
  });

  async function compileWith(opts: { userDecision?: boolean }) {
    const providers: any[] = [
      GateEvalExecutorService,
      TripContextExtractorService,
      { provide: ReadinessService, useValue: readinessMock },
    ];
    if (opts.userDecision) {
      providers.push({ provide: UserDecisionService, useValue: {} });
    }
    const module: TestingModule = await Test.createTestingModule({ providers }).compile();
    service = module.get<GateEvalExecutorService>(GateEvalExecutorService);
  }

  it('准备度 blocker 且无 UserDecisionService 时应 BLOCK（无 itinerary 前置语义）', async () => {
    await compileWith({ userDecision: false });
    readinessMock.checkFromDestination.mockResolvedValue({
      findings: [
        {
          blockers: [{ severity: 'HARD', message: { zh: '行程不可行', en: 'Not feasible' } }],
          must: [],
        },
      ],
    });
    const result = await service.execute({} as any, {
      requestId: 'r-readiness-block',
      tripPlanRequest: minimalTripCtx,
      researchData: {},
    });
    expect(result.gateResult.gate_result).toBe('BLOCK');
    expect(result.constraints.feasible).toBe(false);
    expect(result.gateResult.violations.some((v) => v.detail.includes('不可行'))).toBe(true);
    expect(result.alternatives?.alternative_pois?.[0]).toMatchObject({
      poi_id: 'gate-block-readiness',
      name: '满足准备度要求后重新规划',
    });
  });

  it('准备度 blocker 含 userDecision.questions 时应 NEED_USER_CONFIRM', async () => {
    await compileWith({ userDecision: true });
    readinessMock.checkFromDestination.mockResolvedValue({
      findings: [
        {
          blockers: [
            {
              message: { zh: '请先确认签证策略' },
              userDecision: { questions: [{ id: 'visa', prompt: '?' }] },
            },
          ],
          must: [],
        },
      ],
    });
    const result = await service.execute({} as any, {
      requestId: 'r-readiness-nuc',
      tripPlanRequest: minimalTripCtx,
      researchData: {},
    });
    expect(result.gateResult.gate_result).toBe('NEED_USER_CONFIRM');
    expect(result.gateResult.violations).toEqual([]);
    expect(result.constraints.feasible).toBe(false);
  });

  it('准备度 blocker 含 userDecision.questions 为空数组时应 BLOCK（不升级为 NEED_USER_CONFIRM）', async () => {
    await compileWith({ userDecision: true });
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
    const result = await service.execute({} as any, {
      requestId: 'r-readiness-empty-questions',
      tripPlanRequest: minimalTripCtx,
      researchData: {},
    });
    expect(result.gateResult.gate_result).toBe('BLOCK');
    expect(result.constraints.feasible).toBe(false);
    expect(result.gateResult.violations.some((v) => v.detail.includes('需确认但问题列表为空'))).toBe(true);
    expect((result.alternatives?.alternative_pois?.[0] as { poi_id?: string })?.poi_id).toBe('gate-block-readiness');
  });
});
