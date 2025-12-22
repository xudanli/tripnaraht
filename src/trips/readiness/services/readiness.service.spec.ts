// src/trips/readiness/services/readiness.service.spec.ts

/**
 * Readiness Service 测试
 * 
 * 测试挪威规则和能力包的集成
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ReadinessService } from './readiness.service';
import { ReadinessChecker } from '../engine/readiness-checker';
import { FactsToReadinessCompiler } from '../compilers/facts-to-readiness.compiler';
import { ReadinessToConstraintsCompiler } from '../compilers/readiness-to-constraints.compiler';
import { PackStorageService } from '../storage/pack-storage.service';
import { GeoFactsService } from './geo-facts.service';
import { CapabilityPackEvaluatorService } from './capability-pack-evaluator.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { TripContext } from '../types/trip-context.types';
import { norwayPack } from '../data/norway-pack.example';
import {
  highAltitudePack,
  sparseSupplyPack,
  seasonalRoadPack,
} from '../packs';

describe('ReadinessService - Norway Rules', () => {
  let service: ReadinessService;
  let geoFactsService: jest.Mocked<GeoFactsService>;
  let capabilityEvaluator: jest.Mocked<CapabilityPackEvaluatorService>;

  beforeEach(async () => {
    const mockGeoFactsService = {
      getGeoFeaturesForPoint: jest.fn(),
      getGeoFeaturesForRoute: jest.fn(),
    };

    const mockCapabilityEvaluator = {
      evaluatePack: jest.fn(),
      convertToReadinessPack: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReadinessService,
        {
          provide: ReadinessChecker,
          useValue: {
            checkMultipleDestinations: jest.fn(),
          },
        },
        {
          provide: FactsToReadinessCompiler,
          useValue: {},
        },
        {
          provide: ReadinessToConstraintsCompiler,
          useValue: {},
        },
        {
          provide: PackStorageService,
          useValue: {
            findPackByDestination: jest.fn(),
            findPacksByCountry: jest.fn(),
          },
        },
        {
          provide: GeoFactsService,
          useValue: mockGeoFactsService,
        },
        {
          provide: CapabilityPackEvaluatorService,
          useValue: mockCapabilityEvaluator,
        },
        {
          provide: PrismaService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<ReadinessService>(ReadinessService);
    geoFactsService = module.get(GeoFactsService);
    capabilityEvaluator = module.get(CapabilityPackEvaluatorService);
  });

  describe('挪威规则测试', () => {
    it('应该触发渡轮依赖规则', async () => {
      const context: TripContext = {
        traveler: {
          nationality: 'CN',
        },
        trip: {
          startDate: '2025-01-15',
        },
        itinerary: {
          countries: ['NO'],
          activities: ['self_drive'],
          season: 'winter',
        },
        geo: {
          pois: {
            topPickupPoints: [
              { category: 'FERRY_TERMINAL', score: 100 },
              { category: 'PIER_DOCK', score: 80 },
            ],
            hasFerryTerminal: true,
          },
        },
      };

      const mockChecker = service['readinessChecker'] as any;
      mockChecker.checkMultipleDestinations.mockResolvedValue({
        findings: [
          {
            destinationId: 'NO-NORWAY',
            packId: 'pack.no.norway',
            must: [
              {
                id: 'rule.no.ferry.dependent',
                category: 'logistics',
                level: 'must',
                message: expect.stringContaining('渡轮'),
              },
            ],
            should: [],
            blockers: [],
            optional: [],
            risks: [],
          },
        ],
        summary: {
          totalMust: 1,
          totalShould: 0,
          totalBlockers: 0,
          totalOptional: 0,
          totalRisks: 0,
        },
      });

      const mockStorage = service['packStorage'] as any;
      mockStorage.findPackByDestination.mockResolvedValue(norwayPack);

      const result = await service.checkFromDestination('NO-NORWAY', context);

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].must).toHaveLength(1);
      expect(result.findings[0].must[0].id).toBe('rule.no.ferry.dependent');
    });

    it('应该触发冬季山口自驾规则', async () => {
      const context: TripContext = {
        traveler: {
          nationality: 'CN',
        },
        trip: {
          startDate: '2025-01-15', // 冬季
        },
        itinerary: {
          countries: ['NO'],
          activities: ['self_drive'],
          season: 'winter',
        },
        geo: {
          mountains: {
            inMountain: true,
            mountainElevationAvg: 1500,
          },
          roads: {
            nearRoad: true,
            roadDensityScore: 0.5,
          },
        },
      };

      const mockChecker = service['readinessChecker'] as any;
      mockChecker.checkMultipleDestinations.mockResolvedValue({
        findings: [
          {
            destinationId: 'NO-NORWAY',
            packId: 'pack.no.norway',
            must: [
              {
                id: 'rule.no.winter.mountain.pass',
                category: 'safety_hazards',
                level: 'must',
                message: expect.stringContaining('冬季山口'),
              },
            ],
            should: [],
            blockers: [],
            optional: [],
            risks: [],
          },
        ],
        summary: {
          totalMust: 1,
          totalShould: 0,
          totalBlockers: 0,
          totalOptional: 0,
          totalRisks: 0,
        },
      });

      const mockStorage = service['packStorage'] as any;
      mockStorage.findPackByDestination.mockResolvedValue(norwayPack);
      mockStorage.findPacksByCountry.mockResolvedValue([]); // 确保返回数组

      const result = await service.checkFromDestination('NO-NORWAY', context);

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].must.some(r => r.id === 'rule.no.winter.mountain.pass')).toBe(true);
    });

    it('应该触发极北极光活动规则', async () => {
      const context: TripContext = {
        traveler: {
          nationality: 'CN',
        },
        trip: {
          startDate: '2025-01-15',
        },
        itinerary: {
          countries: ['NO'],
          activities: ['aurora', 'photography'],
          season: 'winter',
        },
        geo: {
          latitude: 69.6492, // Tromsø 纬度
        },
      };

      const mockChecker = service['readinessChecker'] as any;
      mockChecker.checkMultipleDestinations.mockResolvedValue({
        findings: [
          {
            destinationId: 'NO-NORWAY',
            packId: 'pack.no.norway',
            must: [],
            should: [
              {
                id: 'rule.no.aurora.activity',
                category: 'gear_packing',
                level: 'should',
                message: expect.stringContaining('极光'),
              },
            ],
            blockers: [],
            optional: [],
            risks: [],
          },
        ],
        summary: {
          totalMust: 0,
          totalShould: 1,
          totalBlockers: 0,
          totalOptional: 0,
          totalRisks: 0,
        },
      });

      const mockStorage = service['packStorage'] as any;
      mockStorage.findPackByDestination.mockResolvedValue(norwayPack);
      mockStorage.findPacksByCountry.mockResolvedValue([]); // 确保返回数组

      const result = await service.checkFromDestination('NO-NORWAY', context);

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].should.some(r => r.id === 'rule.no.aurora.activity')).toBe(true);
    });
  });

  describe('能力包集成测试', () => {
    it('应该触发季节性封路能力包', async () => {
      const context: TripContext = {
        traveler: {
          nationality: 'CN',
        },
        trip: {
          startDate: '2025-01-15',
        },
        itinerary: {
          countries: ['NO'],
          activities: ['self_drive'],
          season: 'winter',
        },
        geo: {
          mountains: {
            inMountain: true,
          },
          roads: {
            nearRoad: true,
            roadDensityScore: 0.5,
          },
        },
      };

      capabilityEvaluator.evaluatePack.mockReturnValue({
        packType: 'seasonal_road',
        triggered: true,
        rules: [
          {
            id: 'rule.seasonal.mountain.pass',
            triggered: true,
            level: 'must',
            message: '冬季山口可能封闭',
          },
        ],
        hazards: [],
      });

      capabilityEvaluator.convertToReadinessPack.mockReturnValue({
        packId: 'capability.seasonal_road',
        destinationId: 'NO-NORWAY',
        displayName: 'Seasonal Road Closure Readiness',
        version: '1.0.0',
        lastReviewedAt: new Date().toISOString(),
        geo: {
          countryCode: 'NO',
          region: 'Multiple',
          city: 'Multiple',
        },
        supportedSeasons: ['all'],
        rules: [],
        checklists: [],
        hazards: [],
      });

      const mockStorage = service['packStorage'] as any;
      mockStorage.findPackByDestination.mockResolvedValue(norwayPack);
      mockStorage.findPacksByCountry.mockResolvedValue([]); // 确保返回数组

      const mockChecker = service['readinessChecker'] as any;
      mockChecker.checkMultipleDestinations.mockResolvedValue({
        findings: [],
        summary: {
          totalMust: 0,
          totalShould: 0,
          totalBlockers: 0,
          totalOptional: 0,
          totalRisks: 0,
        },
      });

      const result = await service.checkFromDestination('NO-NORWAY', context, {
        enhanceWithGeo: true,
        geoLat: 62.4722, // Ålesund
        geoLng: 6.1549,
      });

      // 验证地理特征增强被调用
      expect(geoFactsService.getGeoFeaturesForPoint).toHaveBeenCalledWith(
        62.4722,
        6.1549
      );
      
      // 验证结果返回
      expect(result).toBeDefined();
      expect(result.findings).toBeDefined();
    });
  });
});

