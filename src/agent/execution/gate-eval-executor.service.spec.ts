/**
 * GateEvalExecutorService 单元测试
 */

import { Test, TestingModule } from '@nestjs/testing';
import { GateEvalExecutorService } from './gate-eval-executor.service';
import { TripContextExtractorService } from './shared/trip-context-extractor.service';
import { ReadinessService } from '../../trips/readiness/services/readiness.service';
import { UserDecisionService } from '../../trips/readiness/services/user-decision.service';
import { ClaudeGatekeeperAgentService } from '../services/sub-agents/gatekeeper-agent.service';
import { PrismaService } from '../../prisma/prisma.service';

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

describe('GateEvalExecutorService — conflict matrix from DB', () => {
  it('loads CONFLICT_MATRIX rule from DB and blocks on match', async () => {
    const prismaMock = {
      physicalDomainConstraintConfig: {
        findMany: jest.fn().mockResolvedValue([
          {
            ruleId: 'db_froad_visibility_block_v1',
            enabled: true,
            params: {
              kind: 'CONFLICT_MATRIX',
              conditions: ['segment.type = F_ROAD', 'weather.visibilityMeters < 100'],
              effect: 'HARD_BLOCK',
              priority: 120,
            },
            updatedAt: new Date(),
          },
        ]),
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GateEvalExecutorService,
        TripContextExtractorService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    const svc = module.get<GateEvalExecutorService>(GateEvalExecutorService);
    const result = await svc.execute({} as any, {
      requestId: 'r-conflict-db-1',
      tripPlanRequest: {
        destination: 'Iceland',
        constraints: { vehicle_type: '2WD' },
        date_range: { start_date: '2026-06-01', end_date: '2026-06-02' },
      },
      researchData: {
        world: {
          physical: {
            roadStates: [{ metadata: { segmentType: 'F_ROAD' } }],
            prefetched_evidence: [
              {
                kind: 'environment_overrides_v1',
                overrides: {
                  weather: {
                    forecastSeries: [
                      {
                        start: '2026-06-01T00:00:00.000Z',
                        end: '2026-06-01T06:00:00.000Z',
                        visibility_m: 80,
                        confidenceScore: 0.9,
                      },
                    ],
                  },
                },
              },
            ],
          },
        },
      },
    } as any);
    expect(result.gateResult.gate_result).toBe('BLOCK');
    expect(result.gateResult.violations.some((v) => String(v.detail).includes('db_froad_visibility_block_v1'))).toBe(true);
  });
});

describe('GateEvalExecutorService — vehicle party constraints', () => {
  let service: GateEvalExecutorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GateEvalExecutorService, TripContextExtractorService],
    }).compile();
    service = module.get<GateEvalExecutorService>(GateEvalExecutorService);
  });

  it('长辈 + 多行李 + 紧凑型租车应 HARD 拒绝', async () => {
    const result = await service.execute({} as any, {
      requestId: 'r-vehicle-party',
      tripPlanRequest: {
        destination: 'Iceland',
        party: { count: 4, has_elderly: true },
        ontology_context: { party: { luggage_count: 4 } },
        date_range: { start_date: '2026-06-01', end_date: '2026-06-05' },
      },
      researchData: {
        car_rentals: [{ vehicle_name: 'Toyota Yaris Compact', car_class: 'COMPACT' }],
      },
    });
    expect(result.gateResult.violations.some((v) => v.type === 'VEHICLE_SPACE_INSUFFICIENT')).toBe(true);
    expect(result.gateResult.violations.some((v) => v.severity === 'HARD' && v.detail.includes('紧凑型'))).toBe(true);
  });

  it('无空间压力时不应触发 VEHICLE_SPACE_INSUFFICIENT', async () => {
    const result = await service.execute({} as any, {
      requestId: 'r-vehicle-ok',
      tripPlanRequest: {
        destination: 'Iceland',
        party: { count: 2 },
        date_range: { start_date: '2026-06-01', end_date: '2026-06-05' },
      },
      researchData: {
        car_rentals: [{ vehicle_name: 'Toyota Yaris Compact', car_class: 'COMPACT' }],
      },
    });
    expect(result.gateResult.violations.some((v) => v.type === 'VEHICLE_SPACE_INSUFFICIENT')).toBe(false);
  });

  describe('Phase 6 formal BLOCK delegation', () => {
    const originalPhase6 = process.env.PHASE6_LEGACY_DEPRECATION;

    afterEach(() => {
      if (originalPhase6 === undefined) delete process.env.PHASE6_LEGACY_DEPRECATION;
      else process.env.PHASE6_LEGACY_DEPRECATION = originalPhase6;
    });

    it('CAS-094: readiness failure risk BLOCK softens to ADJUST_REQUIRED when Phase 6 on', async () => {
      process.env.PHASE6_LEGACY_DEPRECATION = '1';
      const result = await service.execute(
        {} as any,
        {
          requestId: 'r1',
          routeDirectionId: 'rd-1',
          tripPlanRequest: { destination: 'Iceland' },
          researchData: {
            failure_risk_prediction: {
              predictions: [{ day: 2, riskLevel: 'HIGH' }],
            },
          },
        },
      );
      expect(result.gateResult.gate_result).toBe('ADJUST_REQUIRED');
      expect(result.constraints.feasible).toBe(false);
    });
  });
});
