// src/trips/decision/__tests__/dem-decision-evidence.service.spec.ts

/**
 * DEM Decision Evidence Service 单元测试
 * 
 * 测试：
 * 1. 连续疲劳检测（Rolling Window）
 * 2. 走廊质量评分
 * 3. 可解释失败生成
 */

import { Test, TestingModule } from '@nestjs/testing';
import { DemDecisionEvidenceService } from '../services/dem-decision-evidence.service';
import { DEMRouteSegmentationService } from '../services/dem-route-segmentation.service';
import { DEMDailyEnergyService } from '../services/dem-daily-energy.service';
import { TripPlan, PlanDay } from '../plan-model';
import { RouteDirectionData } from '../../../route-directions/interfaces/route-direction.interface';
import { RouteSegmentation } from '../services/dem-route-segmentation.service';

describe('DemDecisionEvidenceService', () => {
  let service: DemDecisionEvidenceService;
  let mockSegmentationService: jest.Mocked<DEMRouteSegmentationService>;
  let mockEnergyService: jest.Mocked<DEMDailyEnergyService>;

  beforeEach(async () => {
    mockSegmentationService = {
      segmentRoute: jest.fn(),
    } as any;

    mockEnergyService = {
      calculateDynamicDailyBudget: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DemDecisionEvidenceService,
        {
          provide: DEMRouteSegmentationService,
          useValue: mockSegmentationService,
        },
        {
          provide: DEMDailyEnergyService,
          useValue: mockEnergyService,
        },
      ],
    }).compile();

    service = module.get<DemDecisionEvidenceService>(DemDecisionEvidenceService);
  });

  describe('Rolling Fatigue Detection', () => {
    it('should detect rolling fatigue when 3-day ascent exceeds threshold', async () => {
      const plan: TripPlan = {
        version: '1.0',
        createdAt: new Date().toISOString(),
        days: [
          {
            day: 1,
            date: '2024-01-01',
            timeSlots: [],
            terrainFacts: {
              totalAscent: 800,
              maxElevation: 3000,
              minElevation: 2800,
            },
          },
          {
            day: 2,
            date: '2024-01-02',
            timeSlots: [],
            terrainFacts: {
              totalAscent: 700,
              maxElevation: 3200,
              minElevation: 3000,
            },
          },
          {
            day: 3,
            date: '2024-01-03',
            timeSlots: [],
            terrainFacts: {
              totalAscent: 600,
              maxElevation: 3400,
              minElevation: 3200,
            },
          },
        ],
      };

      const routeDirection: RouteDirectionData = {
        countryCode: 'NP',
        name: 'EBC Test',
        nameCN: 'EBC 测试',
        tags: ['hiking'],
        constraints: {
          soft: {
            maxDailyAscentM: 800,
          },
        },
      };

      const result = await service.generateEvidencePipeline(plan, routeDirection);

      // 应该检测到连续疲劳（3天累计爬升 2100m，超过阈值）
      expect(result.rollingFatigue?.detected).toBe(true);
      expect(result.rollingFatigue?.startDay).toBe(1);
      expect(result.rollingFatigue?.endDay).toBe(3);
      expect(result.rollingFatigue?.rollingAscent3Days).toBeGreaterThan(2000);
      expect(result.rollingFatigue?.suggestedAction).toBe('INSERT_REST_DAY');
    });

    it('should not detect rolling fatigue when ascent is within threshold', async () => {
      const plan: TripPlan = {
        version: '1.0',
        createdAt: new Date().toISOString(),
        days: [
          {
            day: 1,
            date: '2024-01-01',
            timeSlots: [],
            terrainFacts: {
              totalAscent: 300,
              maxElevation: 2000,
              minElevation: 1800,
            },
          },
          {
            day: 2,
            date: '2024-01-02',
            timeSlots: [],
            terrainFacts: {
              totalAscent: 250,
              maxElevation: 2200,
              minElevation: 2000,
            },
          },
          {
            day: 3,
            date: '2024-01-03',
            timeSlots: [],
            terrainFacts: {
              totalAscent: 200,
              maxElevation: 2400,
              minElevation: 2200,
            },
          },
        ],
      };

      const routeDirection: RouteDirectionData = {
        countryCode: 'IS',
        name: 'Iceland Test',
        nameCN: '冰岛测试',
        tags: ['road-trip'],
        constraints: {
          soft: {
            maxDailyAscentM: 500,
          },
        },
      };

      const result = await service.generateEvidencePipeline(plan, routeDirection);

      // 不应该检测到连续疲劳（3天累计爬升 750m，在阈值内）
      expect(result.rollingFatigue?.detected).toBe(false);
    });
  });

  describe('Violation Detection', () => {
    it('should detect HARD violation when elevation exceeds limit', async () => {
      const plan: TripPlan = {
        version: '1.0',
        createdAt: new Date().toISOString(),
        days: [
          {
            day: 1,
            date: '2024-01-01',
            timeSlots: [],
            terrainFacts: {
              totalAscent: 500,
              maxElevation: 5500, // 超过限制
              minElevation: 5000,
            },
          },
        ],
      };

      const routeDirection: RouteDirectionData = {
        countryCode: 'NP',
        name: 'EBC Test',
        nameCN: 'EBC 测试',
        tags: ['hiking'],
        constraints: {
          hard: {
            maxElevationM: 5000,
          },
        },
      };

      const result = await service.generateEvidencePipeline(plan, routeDirection);

      expect(result.hasHardViolation).toBe(true);
      expect(result.segmentEvidences[0].violation).toBe('HARD');
      expect(result.segmentEvidences[0].explanation).toContain('海拔');
    });

    it('should detect SOFT violation when ascent is high but within hard limit', async () => {
      const plan: TripPlan = {
        version: '1.0',
        createdAt: new Date().toISOString(),
        days: [
          {
            day: 1,
            date: '2024-01-01',
            timeSlots: [],
            terrainFacts: {
              totalAscent: 900, // 超过软限制但未超过硬限制
              maxElevation: 3000,
              minElevation: 2100,
            },
          },
        ],
      };

      const routeDirection: RouteDirectionData = {
        countryCode: 'NP',
        name: 'EBC Test',
        nameCN: 'EBC 测试',
        tags: ['hiking'],
        constraints: {
          hard: {
            maxElevationM: 5000,
          },
          soft: {
            maxDailyAscentM: 800,
          },
        },
      };

      const result = await service.generateEvidencePipeline(plan, routeDirection);

      expect(result.hasHardViolation).toBe(false);
      expect(result.hasSoftViolation).toBe(true);
      expect(result.segmentEvidences[0].violation).toBe('SOFT');
    });
  });

  describe('Explainable Failure', () => {
    it('should generate explainable failure when HARD violation exists', async () => {
      const plan: TripPlan = {
        version: '1.0',
        createdAt: new Date().toISOString(),
        days: [
          {
            day: 1,
            date: '2024-01-01',
            timeSlots: [],
            terrainFacts: {
              totalAscent: 1000,
              maxElevation: 5500,
              minElevation: 4500,
            },
          },
        ],
      };

      const routeDirection: RouteDirectionData = {
        countryCode: 'NP',
        name: 'EBC Test',
        nameCN: 'EBC 测试',
        tags: ['hiking'],
        constraints: {
          hard: {
            maxElevationM: 5000,
          },
        },
      };

      const result = await service.generateEvidencePipeline(plan, routeDirection);

      expect(result.explainableFailure?.willFail).toBe(true);
      expect(result.explainableFailure?.failureReason).toBeDefined();
      expect(result.explainableFailure?.userFriendlyExplanation).toContain('不是因为你不行');
    });

    it('should not generate explainable failure when no violations', async () => {
      const plan: TripPlan = {
        version: '1.0',
        createdAt: new Date().toISOString(),
        days: [
          {
            day: 1,
            date: '2024-01-01',
            timeSlots: [],
            terrainFacts: {
              totalAscent: 500,
              maxElevation: 3000,
              minElevation: 2500,
            },
          },
        ],
      };

      const routeDirection: RouteDirectionData = {
        countryCode: 'IS',
        name: 'Iceland Test',
        nameCN: '冰岛测试',
        tags: ['road-trip'],
        constraints: {
          hard: {
            maxElevationM: 5000,
          },
          soft: {
            maxDailyAscentM: 800,
          },
        },
      };

      const result = await service.generateEvidencePipeline(plan, routeDirection);

      expect(result.explainableFailure?.willFail).toBe(false);
    });
  });

  describe('Corridor Quality Scoring', () => {
    it('should calculate corridor quality score when route segmentation provided', async () => {
      const plan: TripPlan = {
        version: '1.0',
        createdAt: new Date().toISOString(),
        days: [
          {
            day: 1,
            date: '2024-01-01',
            timeSlots: [],
            terrainFacts: {
              totalAscent: 500,
              maxElevation: 3000,
              minElevation: 2500,
            },
          },
        ],
      };

      const routeSegmentation: RouteSegmentation = {
        elevationProfile: [
          { distance: 0, lat: 0, lng: 0, elevation: 2500, slope: 0, cumulativeAscent: 0, cumulativeEnergyCost: 0 },
          { distance: 1000, lat: 0, lng: 0, elevation: 2800, slope: 10, cumulativeAscent: 300, cumulativeEnergyCost: 30 },
          { distance: 2000, lat: 0, lng: 0, elevation: 3000, slope: 10, cumulativeAscent: 500, cumulativeEnergyCost: 50 },
        ],
        steepSections: [],
        energyBreakpoints: [],
        mandatoryRestPoints: [],
        totalDistance: 2000,
        totalAscent: 500,
        totalDescent: 0,
        maxElevation: 3000,
        minElevation: 2500,
        avgSlope: 10,
        maxSlope: 10,
      };

      const routeDirection: RouteDirectionData = {
        countryCode: 'IS',
        name: 'Iceland Test',
        nameCN: '冰岛测试',
        tags: ['road-trip'],
      };

      const result = await service.generateEvidencePipeline(
        plan,
        routeDirection,
        routeSegmentation
      );

      expect(result.corridorQuality).toBeDefined();
      if (result.corridorQuality) {
        expect(result.corridorQuality.totalScore).toBeGreaterThan(0);
        expect(result.corridorQuality.totalScore).toBeLessThanOrEqual(100);
        expect(result.corridorQuality.explanation).toBeDefined();
      }
    });
  });
});

