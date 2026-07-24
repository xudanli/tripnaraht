/**
 * IntakeExecutorService — trip.load hydrate
 */

import { Test, TestingModule } from '@nestjs/testing';
import { IntakeExecutorService } from './intake-executor.service';
import { SkillsRegistryService } from '../../skills/services/skills-registry.service';
import { IntakeCompilerService } from './intake-compiler.service';

describe('IntakeExecutorService', () => {
  let service: IntakeExecutorService;
  let mockSkillsRegistry: { getSkill: jest.Mock };

  beforeEach(async () => {
    mockSkillsRegistry = { getSkill: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntakeExecutorService,
        IntakeCompilerService,
        { provide: SkillsRegistryService, useValue: mockSkillsRegistry },
      ],
    }).compile();
    service = module.get<IntakeExecutorService>(IntakeExecutorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('trip_id 存在时应调用 trip.load 并写入 trip_load / persisted_itinerary_items / research_data', async () => {
    const items = [{ id: 'item-1', title: 'Blue Lagoon' }];
    mockSkillsRegistry.getSkill.mockReturnValue({
      execute: jest.fn().mockResolvedValue({
        tripId: 'trip-abc',
        itemCount: 1,
        items,
      }),
    });

    const orchestratorState: { research_data?: { itinerary_items?: unknown[] } } = {};
    const tripPlanRequest = {
      trip_id: 'trip-abc',
      destination: 'Iceland',
    };

    const result = await service.execute({} as any, {
      tripPlanRequest,
      orchestratorState,
    });

    expect(mockSkillsRegistry.getSkill).toHaveBeenCalledWith('trip.load');
    expect(result.tripPlanRequest?.trip_load).toMatchObject({
      tripId: 'trip-abc',
      itemCount: 1,
    });
    expect(result.tripPlanRequest?.persisted_itinerary_items).toEqual(items);
    expect(orchestratorState.research_data?.itinerary_items).toEqual(items);
  });

  it('无 trip_id 时不应调用 trip.load', async () => {
    await service.execute({} as any, {
      tripPlanRequest: { destination: 'Iceland' },
    });
    expect(mockSkillsRegistry.getSkill).not.toHaveBeenCalled();
  });
});
