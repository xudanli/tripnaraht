// src/trips/readiness/services/capability-pack-evaluator.service.spec.ts

/**
 * Capability Pack Evaluator Service 测试
 */

import { Test, TestingModule } from '@nestjs/testing';
import { CapabilityPackEvaluatorService } from './capability-pack-evaluator.service';
import { RuleEngine } from '../engine/rule-engine';
import { TripContext } from '../types/trip-context.types';
import { seasonalRoadPack } from '../packs';

describe('CapabilityPackEvaluatorService', () => {
  let service: CapabilityPackEvaluatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CapabilityPackEvaluatorService,
        {
          provide: RuleEngine,
          useValue: {
            evaluate: jest.fn((condition, context) => {
              // 简化的规则评估逻辑
              if (condition.eq) {
                return context.itinerary?.season === condition.eq.value;
              }
              return false;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<CapabilityPackEvaluatorService>(
      CapabilityPackEvaluatorService
    );
  });

  describe('evaluatePack', () => {
    it('应该正确评估季节性封路 Pack', () => {
      const context: TripContext = {
        traveler: {},
        trip: {},
        itinerary: {
          countries: ['NO'],
          season: 'winter',
        },
        geo: {
          mountains: {
            inMountain: true,
          },
        },
      };

      const result = service.evaluatePack(seasonalRoadPack, context);

      expect(result.packType).toBe('seasonal_road');
      expect(result.triggered).toBe(true);
    });

    it('应该在不满足条件时不触发', () => {
      const context: TripContext = {
        traveler: {},
        trip: {},
        itinerary: {
          countries: ['NO'],
          season: 'summer', // 不是冬季
        },
        geo: {
          mountains: {
            inMountain: true,
          },
        },
      };

      const result = service.evaluatePack(seasonalRoadPack, context);

      expect(result.triggered).toBe(false);
    });
  });

  describe('convertToReadinessPack', () => {
    it('应该正确转换为 Readiness Pack', () => {
      const pack = seasonalRoadPack;
      const destinationId = 'NO-NORWAY';
      const geo = {
        mountains: {
          inMountain: true,
        },
      };

      const result = service.convertToReadinessPack(pack, destinationId, geo);

      expect(result.packId).toBe('capability.seasonal_road');
      expect(result.destinationId).toBe(destinationId);
      expect(result.rules).toBeDefined();
      expect(result.rules.length).toBeGreaterThan(0);
    });
  });
});

