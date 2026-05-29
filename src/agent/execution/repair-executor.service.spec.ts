/**
 * RepairExecutorService 单元测试
 */

import { Test, TestingModule } from '@nestjs/testing';
import { RepairExecutorService } from './repair-executor.service';
import { SkillsRegistryService } from '../../skills/services/skills-registry.service';
import { ClaudeLocalInsightAgentService } from '../services/sub-agents/local-insight-agent.service';
import { ContextSlidingWindowAdapter } from '../context/services/context-sliding-window-adapter.service';

describe('RepairExecutorService', () => {
  let service: RepairExecutorService;
  let mockSkillsRegistry: { getSkill: jest.Mock };
  let mockLocalInsight: { suggestAlternatives: jest.Mock };

  beforeEach(async () => {
    mockSkillsRegistry = { getSkill: jest.fn() };
    mockLocalInsight = { suggestAlternatives: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RepairExecutorService,
        ContextSlidingWindowAdapter,
        { provide: SkillsRegistryService, useValue: mockSkillsRegistry },
        { provide: ClaudeLocalInsightAgentService, useValue: mockLocalInsight },
      ],
    }).compile();
    service = module.get<RepairExecutorService>(RepairExecutorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('无 tripPlanRequest 或 gateResult 应返回 repairApplied=false', async () => {
    const r1 = await service.execute({} as any, { requestId: 'r1' });
    expect(r1.repairApplied).toBe(false);

    const r2 = await service.execute({} as any, { requestId: 'r1', tripPlanRequest: {} });
    expect(r2.repairApplied).toBe(false);
  });

  it('有 gateResult 但无 required_adjustments 应跳过 repair.apply', async () => {
    const result = await service.execute(
      {} as any,
      {
        requestId: 'r1',
        tripPlanRequest: { destination: 'Iceland' },
        gateResult: { gate_result: 'ALLOW', violations: [], required_adjustments: [], confidence: 0.9 },
        itinerary: { request_id: 'r1', days: [] },
      },
    );
    expect(result.repairApplied).toBe(false);
    expect(mockSkillsRegistry.getSkill).not.toHaveBeenCalled();
  });

  it('repair.apply 返回 repaired 时应更新 itinerary', async () => {
    mockSkillsRegistry.getSkill.mockReturnValue({
      execute: jest.fn().mockResolvedValue({
        repaired: true,
        itinerary: { request_id: 'r1', days: [{ date: '2026-06-01', items: [] }] },
      }),
    });
    const result = await service.execute(
      {} as any,
      {
        requestId: 'r1',
        tripPlanRequest: { destination: 'Iceland' },
        gateResult: {
          gate_result: 'ADJUST_REQUIRED',
          violations: [],
          required_adjustments: [{ action: 'REPLACE_SEGMENT', why: 'test' }],
          confidence: 0.8,
        },
        itinerary: { request_id: 'r1', days: [] },
      },
    );
    expect(result.repairApplied).toBe(true);
    expect(result.itinerary?.days).toHaveLength(1);
  });

  it('当 persona closure 已收敛时应跳过 LocalInsight 与 REPLACE_* repair.apply', async () => {
    mockSkillsRegistry.getSkill.mockReturnValue({
      execute: jest.fn().mockResolvedValue({
        repaired: true,
        itinerary: { request_id: 'r1', days: [{ date: '2026-06-01', items: [] }] },
      }),
    });
    mockLocalInsight.suggestAlternatives.mockResolvedValue({
      alternative_pois: [{ id: 'p1' }],
      alternative_routes: [],
    });

    const audit = {
      stopReason: 'ABU_RECHECK_PASS' as const,
      totalAbuRechecks: 1,
      iters: [],
    };

    const result = await service.execute(
      { verification: { issues: [] } } as any,
      {
        requestId: 'r1',
        tripPlanRequest: { destination: 'Iceland' },
        gateResult: {
          gate_result: 'ADJUST_REQUIRED',
          violations: [],
          required_adjustments: [
            { action: 'REPLACE_SEGMENT', why: 'already fixed by Neptune closure' },
            { action: 'REDUCE_SCOPE', why: 'still needed' },
          ],
          confidence: 0.8,
          persona_closure_audit: audit,
        },
        itinerary: { request_id: 'r1', days: [] },
      },
    );

    expect(mockLocalInsight.suggestAlternatives).not.toHaveBeenCalled();
    const repairApply = mockSkillsRegistry.getSkill.mock.results.find(
      (r) => r.value?.execute,
    )?.value?.execute;
    expect(repairApply).toHaveBeenCalledWith(
      expect.objectContaining({
        adjustments: [{ action: 'REDUCE_SCOPE', why: 'still needed' }],
      }),
    );
    expect(result.repairTraces?.some((t) => t.tacticId === 'PersonaClosureConvergedSkip')).toBe(true);
    expect(result.repairApplied).toBe(true);
  });

  it('当 required_adjustments 含 REDUCE_SCOPE_OR_ADD_EVIDENCE 时应跳过 LocalInsightAgent', async () => {
    mockSkillsRegistry.getSkill.mockReturnValue({
      execute: jest.fn().mockResolvedValue({
        repaired: false,
      }),
    });

    await service.execute(
      {} as any,
      {
        requestId: 'r1',
        tripPlanRequest: { destination: 'Iceland' },
        gateResult: {
          gate_result: 'ADJUST_REQUIRED',
          violations: [],
          required_adjustments: [{ action: 'REDUCE_SCOPE_OR_ADD_EVIDENCE', why: 'low budget' }],
          confidence: 0.8,
        },
        itinerary: { request_id: 'r1', days: [] },
      },
    );

    expect(mockLocalInsight.suggestAlternatives).not.toHaveBeenCalled();
  });

  it('L3 tactic: TIME_SPACE_MAX_DRIVING_HOURS should drop or migrate an item', async () => {
    const dso: any = {
      verification: {
        issues: [
          {
            code: 'FATIGUE_OVERLOAD',
            class: 'CONFLICT',
            message:
              '[L3-PROOF|time_space.max_driving_hours|DAY:2026-06-01|cmp:LEQ|actual:11|limit:10|unit:h|slack:-1] 超时',
            source: 'ROUTE_FEASIBILITY',
            at: new Date().toISOString(),
            entityRef: { type: 'DAY', id: '2026-06-01' },
          },
        ],
      },
      poiPlanning: { poiPlan: { requiredAnchorPoiIds: [] } },
    };
    const ctx: any = {
      requestId: 'r1',
      tripPlanRequest: { destination: 'Iceland', mode: 'drive' },
      gateResult: { gate_result: 'ALLOW', violations: [], required_adjustments: [], confidence: 0.9 },
      itinerary: {
        request_id: 'r1',
        days: [
          {
            date: '2026-06-01',
            items: [
              { id: 'a', type: 'POI', metadata: { duration_minutes: 120 } },
              { id: 'b', type: 'POI', metadata: { duration_minutes: 60 } },
            ],
          },
        ],
      },
    };
    const result = await service.execute(dso, ctx);
    expect(result.repairApplied).toBe(true);
    expect(result.itinerary?.days?.[0]?.items?.length).toBeLessThan(2);
  });

  it('L3 tactic: TIME_SPACE_ETA_FEASIBILITY should shift windows', async () => {
    const dso: any = {
      verification: {
        issues: [
          {
            code: 'ROUTE_INFEASIBLE',
            class: 'CONFLICT',
            message:
              '[L3-PROOF|time_space.eta_feasibility|SEGMENT:2026-06-01|cmp:GEQ|actual:0|limit:10|unit:min|slack:-10] infeasible',
            source: 'ROUTE_FEASIBILITY',
            at: new Date().toISOString(),
            entityRef: { type: 'SEGMENT', id: '2026-06-01|a->b' },
          },
        ],
      },
    };
    const ctx: any = {
      requestId: 'r1',
      tripPlanRequest: { destination: 'Iceland', mode: 'drive' },
      gateResult: { gate_result: 'ALLOW', violations: [], required_adjustments: [], confidence: 0.9 },
      itinerary: {
        request_id: 'r1',
        days: [
          {
            date: '2026-06-01',
            items: [
              { id: 'a', type: 'POI', start_window: '10:00', end_window: '11:00', metadata: { duration_minutes: 60 } },
              { id: 'b', type: 'POI', start_window: '12:00', end_window: '13:00', metadata: { duration_minutes: 60 } },
            ],
          },
        ],
      },
    };
    const before = new Date('2026-06-01T12:00:00.000Z').getTime();
    const result = await service.execute(dso, ctx);
    expect(result.repairApplied).toBe(true);
    const shifted = new Date((result.itinerary as any).days[0].items[1].start_window).getTime();
    expect(shifted).toBeGreaterThan(before);
  });

  it('L3 tactic: TERRAIN_REROUTE should accept 40min detour under low fatigue', async () => {
    const terrainEngine = {
      findAlternativePath: jest.fn().mockResolvedValue({
        slope_ok: true,
        slope_slack_pct: 1,
        delta_drive_min: 40,
        delta_distance_km: 12,
        path_fingerprint: 'fp-lowfat-001',
        patch: { segment_id: 'seg-1', encoded_polyline: 'abc', distance_meters: 12345, eta_minutes: 70 },
      }),
    };
    const s = new (RepairExecutorService as any)(
      new ContextSlidingWindowAdapter(),
      mockSkillsRegistry,
      mockLocalInsight,
      terrainEngine,
    );
    const dso: any = {
      tripState: { fatigue: 10 }, // low fatigue -> w≈0.9
      verification: {
        issues: [
          {
            code: 'TERRAIN_STEEP_SLOPE',
            class: 'CONFLICT',
            message:
              '[L3-PROOF|terrain.max_slope_pct|SEGMENT:seg-1|cmp:LEQ|actual:16|limit:15|unit:pct|slack:-1] steep',
            source: 'ROUTE_FEASIBILITY',
            at: new Date().toISOString(),
            entityRef: { type: 'SEGMENT', id: 'seg-1' },
          },
        ],
      },
    };
    const ctx: any = {
      requestId: 'r1',
      tripPlanRequest: { destination: 'Iceland', mode: 'drive' },
      gateResult: { gate_result: 'ALLOW', violations: [], required_adjustments: [], confidence: 0.9 },
      itinerary: {
        request_id: 'r1',
        days: [{ date: '2026-06-01', items: [{ id: 'seg-1', type: 'DRIVE', metadata: { duration_minutes: 60 } }] }],
      },
    };
    const result = await s.execute(dso, ctx);
    expect(result.repairApplied).toBe(true);
    const meta = (result.itinerary as any).days[0].items[0].metadata;
    expect(meta.route_encoded_polyline).toBe('abc');
    expect(meta.route_eta_minutes).toBe(70);
  });

  it('L3 tactic: TERRAIN_REROUTE should reject 40min detour under high fatigue (effective limit suppressed)', async () => {
    const terrainEngine = {
      findAlternativePath: jest.fn().mockResolvedValue({
        slope_ok: true,
        slope_slack_pct: 1,
        delta_drive_min: 40,
        delta_distance_km: 12,
        path_fingerprint: 'fp-highfat-001',
        patch: { segment_id: 'seg-1', encoded_polyline: 'abc', distance_meters: 12345, eta_minutes: 70 },
      }),
    };
    const s = new (RepairExecutorService as any)(
      new ContextSlidingWindowAdapter(),
      mockSkillsRegistry,
      mockLocalInsight,
      terrainEngine,
    );
    const dso: any = {
      tripState: { fatigue: 80 }, // high fatigue -> w≈0.2 => effSoft≈6
      verification: {
        issues: [
          {
            code: 'TERRAIN_STEEP_SLOPE',
            class: 'CONFLICT',
            message:
              '[L3-PROOF|terrain.max_slope_pct|SEGMENT:seg-1|cmp:LEQ|actual:16|limit:15|unit:pct|slack:-1] steep',
            source: 'ROUTE_FEASIBILITY',
            at: new Date().toISOString(),
            entityRef: { type: 'SEGMENT', id: 'seg-1' },
          },
        ],
      },
    };
    const ctx: any = {
      requestId: 'r1',
      tripPlanRequest: { destination: 'Iceland', mode: 'drive' },
      gateResult: { gate_result: 'ALLOW', violations: [], required_adjustments: [], confidence: 0.9 },
      itinerary: {
        request_id: 'r1',
        days: [{ date: '2026-06-01', items: [{ id: 'seg-1', type: 'DRIVE', metadata: { duration_minutes: 60 } }] }],
      },
    };
    const result = await s.execute(dso, ctx);
    // No other tactics apply; should fall back to skill-based repair which is not configured -> false.
    expect(result.repairApplied).toBe(false);
    expect(terrainEngine.findAlternativePath).toHaveBeenCalled();
  });

  it('L3 tactic: TERRAIN_REROUTE should emit OSCILLATION_PREVENTION when path_fingerprint repeats', async () => {
    const terrainEngine = {
      findAlternativePath: jest.fn().mockResolvedValue({
        slope_ok: true,
        slope_slack_pct: 1,
        delta_drive_min: 10,
        delta_distance_km: 3,
        path_fingerprint: 'fp-repeat-001',
        patch: { segment_id: 'seg-1', encoded_polyline: 'abc', distance_meters: 12345, eta_minutes: 70 },
      }),
    };
    const s = new (RepairExecutorService as any)(
      new ContextSlidingWindowAdapter(),
      mockSkillsRegistry,
      mockLocalInsight,
      terrainEngine,
    );
    const dso: any = {
      tripState: { fatigue: 10 },
      verification: {
        issues: [
          {
            code: 'TERRAIN_STEEP_SLOPE',
            class: 'CONFLICT',
            message:
              '[L3-PROOF|terrain.max_slope_pct|SEGMENT:seg-1|cmp:LEQ|actual:16|limit:15|unit:pct|slack:-1] steep',
            source: 'ROUTE_FEASIBILITY',
            at: new Date().toISOString(),
            entityRef: { type: 'SEGMENT', id: 'seg-1' },
          },
        ],
      },
    };
    const ctx: any = {
      requestId: 'r1',
      tripPlanRequest: { destination: 'Iceland', mode: 'drive' },
      gateResult: { gate_result: 'ALLOW', violations: [], required_adjustments: [], confidence: 0.9 },
      itinerary: {
        request_id: 'r1',
        days: [
          {
            date: '2026-06-01',
            items: [{ id: 'seg-1', type: 'DRIVE', metadata: { duration_minutes: 60, reroute_path_fingerprints: ['fp-repeat-001'] } }],
          },
        ],
      },
    };
    const result = await s.execute(dso, ctx);
    expect(result.repairApplied).toBe(false);
    expect(result.repairTraces?.[0]?.reason).toBe('OSCILLATION_PREVENTION');
  });
});
