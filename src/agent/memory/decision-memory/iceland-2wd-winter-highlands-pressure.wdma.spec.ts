/**
 * WDMA v1.0 压力场景：12 月冰岛 + 经济型 2WD + Landmannalaugar（高地/F-road 意图）
 * 验证：车型仲裁 → rejected 决策记忆 → 负向 Markdown 压缩 → ContextEngineer CONSTRAINTS 块（priority 88）
 */
import { Test, TestingModule } from '@nestjs/testing';
import { collectIcelandVehicleTerrainArbitrationIssues } from '../../../skills/itinerary/iceland-vehicle-terrain-arbitrator.util';
import icelandV1 from '../../../assets/strategy/iceland-v1.json';
import type { IcelandStrategyDocumentV1 } from '../../strategy/world-strategy.types';
import { appendVehicleTerrainArbitrationTrace } from './vehicle-terrain-decision-memory.util';
import { compressOperationalNegativesFromDecisions } from '../../compression/negative-constraint-compressor.util';
import type { DecisionMemory } from './decision-memory.types';
import type { WorldDecisionMemoryService } from './world-decision-memory.service';
import { ContextEngineerService } from '../../context-engine/services/context-engineer.service';
import { AgentExecutionContextStore } from '../../runtime/agent-execution-context.store';
import { MemoryService } from '../services/memory.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { SKILLS_REGISTRY_TOKEN } from '../../../skills/services/skills-registry.token';
import { SkillsRegistryService } from '../../../skills/services/skills-registry.service';
import { RedisService } from '../../../redis/redis.service';
import { ContextMetricsService } from '../../context-engine/services/context-metrics.service';
import type { ContextPackageOptions } from '../../context-engine/types/context-package.types';

describe('WDMA Iceland 2WD winter highlands pressure', () => {
  const requestId = 'wdma-pressure-is-2wd-dec';

  const pressureItinerary = {
    request_id: requestId,
    days: [
      {
        date: '2026-12-12',
        items: [
          {
            id: 'hl1',
            type: 'TRANSPORT' as const,
            notes: 'Landmannalaugar winter highlands access via F208 corridor',
            evidence_refs: [],
          },
        ],
      },
    ],
  } as const;

  const pressureResearch = {
    country_code: 'IS',
    car_rentals: [
      { name: 'Economy sedan', vehicle_class: 'economy', category: 'SMALL_2WD', wheelIntent: 'TWO' },
    ],
  };

  const userQuery =
    '我要在 12 月去冰岛，租一辆普通经济型轿车（2WD），去 Landmannalaugar 看冬景，请规划路线。';

  it('Step A/B: arbitrator emits CRITICAL; decision ring compresses to operational negative markdown', () => {
    const terrainIssues = collectIcelandVehicleTerrainArbitrationIssues({
      itinerary: pressureItinerary as any,
      research_data: pressureResearch as any,
      user_query: userQuery,
      world_strategy: icelandV1 as IcelandStrategyDocumentV1,
    });
    expect(terrainIssues.some((i) => i.severity === 'CRITICAL')).toBe(true);
    const crit = terrainIssues.find((i) => i.severity === 'CRITICAL');
    expect(crit?.violation?.evidence?.refIds?.some((r) => r === 'strat:STRAT_ICE_001')).toBe(true);
    expect(crit?.violation?.evidence?.refIds?.some((r) => r === 'strat:STRAT_ICE_002')).toBe(true);

    const ring: DecisionMemory[] = [];
    const mockWdm = {
      append: (d: DecisionMemory) => {
        ring.push(d);
      },
      listForRequest: (_rid: string) => [...ring],
    } as unknown as WorldDecisionMemoryService;

    appendVehicleTerrainArbitrationTrace(mockWdm, {
      terrainIssues,
      itinerary: pressureItinerary as any,
      research_data: pressureResearch as any,
      user_query: userQuery,
    });

    const rejected = ring.filter((d) => d.outcome === 'rejected' && d.decisionType === 'vehicle');
    expect(rejected.length).toBeGreaterThanOrEqual(1);
    expect(rejected[0].causedBy).toContain('strat:STRAT_ICE_001');
    expect(rejected[0].causedBy).toContain('strat:STRAT_ICE_002');

    const v1 = compressOperationalNegativesFromDecisions(ring);
    expect(v1.lines.length).toBeGreaterThanOrEqual(1);
    expect(v1.markdownBlock).toContain('Operational Constraints');
    expect(v1.markdownBlock.toLowerCase()).toMatch(/2wd|f-road|f208|经济|违法|保险|高地|landmannalaugar|车型/i);
  });

  it('Step C/D: ContextEngineer buildRawBlocks injects CONSTRAINTS block when execution overlay carries markdown', async () => {
    const mdHeader = '### Operational Constraints (From Previous Decisions In This Request)\n';
    const mdBody = '- [Vehicle] Prior attempt outcome=rejected: F-road vs 2WD winter highlands (mock trace line)';
    const fullMd = `${mdHeader}${mdBody}\n`;

    const mockPrisma = {
      trip: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'wdma-trip-ctx',
          destination: 'IS',
          startDate: new Date('2026-12-01'),
          endDate: new Date('2026-12-14'),
          TripDay: [],
        }),
      },
      tripDay: { findMany: jest.fn().mockResolvedValue([]) },
      itineraryItem: { findMany: jest.fn().mockResolvedValue([]) },
      readinessPack: { findFirst: jest.fn().mockResolvedValue(null) },
      countryPack: { findFirst: jest.fn().mockResolvedValue(null) },
      tripRun: { upsert: jest.fn() },
      tripAttempt: { upsert: jest.fn() },
    };

    const mockSkillsRegistry = {
      getSkill: jest.fn(),
      getAllSkills: jest.fn().mockReturnValue([]),
    };

    const mockRedis = { get: jest.fn(), set: jest.fn(), del: jest.fn(), exists: jest.fn() };
    const mockMetrics = { recordMetrics: jest.fn(), getMetricsSummary: jest.fn(), getRecentMetrics: jest.fn() };

    const execStore = {
      get: jest.fn().mockReturnValue({
        requestId: 'ctx-req-1',
        snapshotId: 'snap-1',
        snapshotVersion: 1,
        executionBinding: {
          snapshot_id: 'snap-1',
          snapshot_version: 1,
          request_id: 'ctx-req-1',
        },
        operationalNegativeConstraintsMarkdown: fullMd,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: MemoryService,
          useValue: {
            getUserTravelProfile: jest.fn().mockResolvedValue(null),
            getUserRouteDirectionDecisions: jest.fn().mockResolvedValue([]),
          },
        },
        ContextEngineerService,
        { provide: 'PrismaService', useValue: mockPrisma },
        { provide: SKILLS_REGISTRY_TOKEN, useValue: mockSkillsRegistry },
        { provide: RedisService, useValue: mockRedis },
        { provide: ContextMetricsService, useValue: mockMetrics },
        { provide: AgentExecutionContextStore, useValue: execStore },
      ],
    }).compile();

    const service = module.get(ContextEngineerService);
    const options: ContextPackageOptions = {
      tripId: 'wdma-trip-ctx',
      phase: 'planning',
      agent: 'PLANNER',
      userQuery: userQuery,
      tokenBudget: 8000,
      destinationCountryCode: 'IS',
      requiredTopics: ['SAFETY'],
    };

    const { blocks } = await service.buildRawBlocks(options);
    const constraint = blocks.find((b) => b.key === 'tripnara.operational_negative_constraints.v1');
    expect(constraint).toBeDefined();
    expect(constraint?.type).toBe('CONSTRAINTS');
    expect(constraint?.priority).toBe(88);
    expect(constraint?.visibility).toBe('public');
    expect(constraint?.text).toContain('Operational Constraints');
    expect(constraint?.text).toContain('Prior attempt outcome=rejected');
  });
});
