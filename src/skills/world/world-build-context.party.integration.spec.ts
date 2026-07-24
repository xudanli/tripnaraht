/**
 * world.buildContext — 派对聚合集成（演进线 2）。
 * 最小 Nest 模块 + stub 依赖，验证 has_elderly 写入 partyAggregation。
 */
import { Test, TestingModule } from '@nestjs/testing';
import { WorldBuildContextSkill } from './world-build-context.skill';
import { PrismaService } from '../../prisma/prisma.service';
import { RouteDirectionsService } from '../../route-directions/route-directions.service';

describe('WorldBuildContextSkill — party aggregation integration', () => {
  let skill: WorldBuildContextSkill;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorldBuildContextSkill,
        {
          provide: PrismaService,
          useValue: { isDbConnected: () => false, trip: { findUnique: jest.fn() } },
        },
        {
          provide: RouteDirectionsService,
          useValue: {
            findRouteDirectionsByCountry: jest.fn(async () => ({
              active: [
                {
                  id: 'is-ring',
                  uuid: 'is-ring',
                  name: 'Iceland Ring',
                  countryCode: 'IS',
                  tags: [],
                },
              ],
            })),
          },
        },
      ],
    }).compile();

    skill = module.get(WorldBuildContextSkill);
  });

  it('writes partyAggregation when partyComposition.has_elderly is true', async () => {
    const result = await skill.execute({
      countryCode: 'IS',
      season: 10,
      duration: 5,
      partyProfile: { fitness: 'medium', riskTolerance: 'low', pace: 'relaxed' },
      partyComposition: { count: 2, has_elderly: true },
    });

    const world = result.world;
    expect(world.partyPersonas?.length).toBeGreaterThanOrEqual(2);
    expect(world.partyAggregation?.effectiveCapability.maxDailyAscentM).toBeLessThanOrEqual(250);
    expect(world.partyAggregation?.effectiveExperienceFlow.tempo).toBe('EMPATHY_RECOVERY');
    expect(world.human.maxDailyAscentM).toBeLessThanOrEqual(250);
    expect(world.experienceFlow?.tempo).toBe('EMPATHY_RECOVERY');
  });

  it('skips party aggregation for solo traveler without elderly/children', async () => {
    const result = await skill.execute({
      countryCode: 'IS',
      season: 10,
      partyProfile: { fitness: 'high', riskTolerance: 'medium', pace: 'moderate' },
      partyComposition: { count: 1 },
    });

    expect(result.world.partyAggregation).toBeUndefined();
    expect(result.world.partyPersonas).toBeUndefined();
  });
});
