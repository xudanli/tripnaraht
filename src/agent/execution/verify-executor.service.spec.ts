/**
 * VerifyExecutorService 单元测试
 */

import { Test, TestingModule } from '@nestjs/testing';
import { VerifyExecutorService } from './verify-executor.service';
import { SkillsRegistryService } from '../../skills/services/skills-registry.service';
import { RouteFeasibilityEngineService } from '../services/route-feasibility-engine.service';

describe('VerifyExecutorService', () => {
  let service: VerifyExecutorService;
  let mockSkillsRegistry: { getSkill: jest.Mock };
  let mockRouteFeasibility: { evaluate: jest.Mock };

  beforeEach(async () => {
    mockSkillsRegistry = {
      getSkill: jest.fn(),
    };
    mockRouteFeasibility = {
      evaluate: jest.fn().mockResolvedValue({
        issues: [],
        result: { is_feasible: true, risk_level: 10 },
      }),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VerifyExecutorService,
        { provide: SkillsRegistryService, useValue: mockSkillsRegistry },
        { provide: RouteFeasibilityEngineService, useValue: mockRouteFeasibility },
      ],
    }).compile();
    service = module.get<VerifyExecutorService>(VerifyExecutorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('无 skillsRegistry 应返回空 issues', async () => {
    const module2 = await Test.createTestingModule({
      providers: [VerifyExecutorService],
    }).compile();
    const svc = module2.get<VerifyExecutorService>(VerifyExecutorService);
    const result = await svc.execute({} as any, { requestId: 'r1', itinerary: { request_id: 'r1', days: [] } });
    expect(result.issues).toEqual([]);
    expect(result.confidenceDelta).toBe(0);
  });

  it('无 itinerary 应返回空 issues', async () => {
    const result = await service.execute({} as any, { requestId: 'r1' });
    expect(result.issues).toEqual([]);
  });

  it('过期研究证据应产出 CONFIDENCE_DEGRADED 并写入 itinerary metadata', async () => {
    mockSkillsRegistry.getSkill.mockReturnValue(undefined);
    const itinerary = { request_id: 'r1', days: [{ date: '2026-06-14', items: [] }], metadata: {} };
    const result = await service.execute(
      {} as any,
      {
        requestId: 'r1',
        itinerary,
        researchData: {
          __data_reliability_evidence: [
            {
              id: 'transport_old',
              factType: 'TRANSPORT_TIME',
              entityRef: { type: 'SEGMENT', id: 'a-b' },
              value: { duration_minutes: 45 },
              source: { provider: 'transport.search', sourceType: 'COMMERCIAL' },
              observedAt: '2026-06-13T00:00:00.000Z',
              confidence: 0.9,
              freshnessTtlSec: 60,
            },
          ],
        },
      } as any,
    );

    expect(result.issues.some((i) => i.code === 'CONFIDENCE_DEGRADED')).toBe(true);
    expect(result.confidenceDelta).toBeLessThan(0);
    expect((itinerary.metadata as any).__data_reliability.finding_count).toBeGreaterThan(0);
  });

  it('结构化风险事件应进入 VERIFY issue 并写入 risk audit', async () => {
    mockSkillsRegistry.getSkill.mockReturnValue(undefined);
    const itinerary = { request_id: 'r1', days: [{ date: '2026-06-14', items: [] }], metadata: {} };
    const result = await service.execute(
      {} as any,
      {
        requestId: 'r1',
        itinerary,
        researchData: {
          __risk_events: [
            {
              id: 'road-closed-1',
              category: 'ROAD_ACCESS',
              urgency: 5,
              entityRef: { type: 'ROAD', id: 'F208' },
              message: 'F208 临时关闭。',
              source: { provider: 'road-authority', sourceType: 'OFFICIAL' },
              observedAt: '2026-06-14T08:00:00.000Z',
              confidence: 0.9,
              suggestedAction: 'REPLACE',
            },
          ],
        },
      } as any,
    );

    expect(result.issues.some((i) => i.code === 'ROUTE_INFEASIBLE' && i.message.includes('ROAD_ACCESS'))).toBe(true);
    expect(result.confidenceDelta).toBeLessThan(0);
    expect((itinerary.metadata as any).__risk_audit.criticalRisks).toContain('road-closed-1');
  });

  it('skill 返回 issues 应正确聚合', async () => {
    mockRouteFeasibility.evaluate.mockResolvedValueOnce(null as any).mockResolvedValue({
      issues: [],
      result: { is_feasible: true, risk_level: 10 },
    });
    const moduleNoRoute = await Test.createTestingModule({
      providers: [
        VerifyExecutorService,
        { provide: SkillsRegistryService, useValue: mockSkillsRegistry },
      ],
    }).compile();
    const svcNoRoute = moduleNoRoute.get<VerifyExecutorService>(VerifyExecutorService);
    mockSkillsRegistry.getSkill.mockReturnValue({
      execute: jest.fn().mockResolvedValue({ issues: ['闭馆：问题1', '闭馆：问题2'] }),
    });
    const result = await svcNoRoute.execute(
      {} as any,
      { requestId: 'r1', itinerary: { request_id: 'r1', days: [{ date: '2026-04-21', items: [] }] }, researchData: {} },
    );
    expect(result.issues.length).toBe(2);
    expect(result.issues.every((i) => typeof i === 'object' && i.code === 'POI_CLOSED')).toBe(true);
    expect(result.confidenceDelta).toBe(-0.2);
  });

  it('skill 抛出异常应捕获并返回', async () => {
    const moduleNoRoute = await Test.createTestingModule({
      providers: [
        VerifyExecutorService,
        { provide: SkillsRegistryService, useValue: mockSkillsRegistry },
      ],
    }).compile();
    const svcNoRoute = moduleNoRoute.get<VerifyExecutorService>(VerifyExecutorService);
    mockSkillsRegistry.getSkill.mockReturnValue({
      execute: jest.fn().mockRejectedValue(new Error('verify failed')),
    });
    const result = await svcNoRoute.execute(
      {} as any,
      { requestId: 'r1', itinerary: { request_id: 'r1', days: [] } },
    );
    expect(result.issues.some((i) => (i as any).message === 'verify failed')).toBe(true);
    expect(result.confidenceDelta).toBe(-0.2);
  });

  it('RouteFeasibility 后 solveDayTimeline 日落 LIMIT 应产出 SUNSET_BREACH', async () => {
    mockSkillsRegistry.getSkill.mockReturnValue(undefined);
    const dayDate = '2026-04-21';
    const ctx = {
      requestId: 'r1',
      tripPlanRequest: { mode: 'drive' },
      itinerary: {
        request_id: 'r1',
        days: [
          {
            date: dayDate,
            items: [
              {
                id: 'a',
                type: 'POI',
                start_window: `${dayDate}T12:00:00.000Z`,
                end_window: `${dayDate}T14:00:00.000Z`,
                metadata: { duration_minutes: 120 },
                location_ref: { name: 'A', coordinates: { lat: 64.1, lng: -21.9 } },
                evidence_refs: [],
                verified: false,
              },
              {
                id: 'b',
                type: 'POI',
                start_window: `${dayDate}T12:00:00.000Z`,
                end_window: `${dayDate}T20:00:00.000Z`,
                metadata: { duration_minutes: 60, category: 'waterfall' },
                location_ref: { name: 'B', coordinates: { lat: 64.15, lng: -21.95 } },
                evidence_refs: [],
                verified: false,
              },
            ],
          },
        ],
      },
      researchData: {},
    };
    const dso = {
      environmentState: {
        daylightByDate: { [dayDate]: { sunset: `${dayDate}T12:00:00.000Z` } },
      },
    } as any;
    const result = await service.execute(dso, ctx as any);
    const sunset = result.issues.filter((i) => i.code === 'SUNSET_BREACH');
    expect(sunset.length).toBeGreaterThanOrEqual(1);
    expect(sunset[0].source).toBe('ENVIRONMENTAL_CONSTRAINTS');
    expect(sunset[0].entityRef?.type).toBe('DAY');
    expect(result.confidenceDelta).toBeLessThan(0);
  });
});
