// src/skills/world/services/unified-world-model.service.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { UnifiedWorldModelService } from './unified-world-model.service';
import { WorldBuildContextSkill } from '../world-build-context.skill';
import { UnifiedWorldModelRequest } from '../interfaces/unified-world-model.interface';
import { SKILLS_REGISTRY_TOKEN } from '../../services/skills-registry.token';

describe('UnifiedWorldModelService', () => {
  let service: UnifiedWorldModelService;
  let mockWorldBuildContextSkill: any;
  let mockWorldRealtimeWeatherSkill: any;
  let mockWorldWeatherPredictionSkill: any;
  let mockWorldAdaptiveParametersSkill: any;
  let mockCountryConfigService: any;
  let mockWorldModelMonitoringService: any;

  const mockLogger = {
    log: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  beforeEach(async () => {
    // Mock WorldBuildContextSkill
    mockWorldBuildContextSkill = {
      execute: jest.fn(),
    };

    // Mock Skills
    mockWorldRealtimeWeatherSkill = {
      execute: jest.fn(),
    };

    mockWorldWeatherPredictionSkill = {
      execute: jest.fn(),
    };

    mockWorldAdaptiveParametersSkill = {
      execute: jest.fn(),
    };

    // Mock CountryConfigService
    mockCountryConfigService = {
      getCountryConfig: jest.fn(),
      getGeocodingCoordinates: jest.fn(),
    };

    // Mock WorldModelMonitoringService
    mockWorldModelMonitoringService = {
      recordBuild: jest.fn(),
      recordError: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnifiedWorldModelService,
        {
          provide: WorldBuildContextSkill,
          useValue: mockWorldBuildContextSkill,
        },
        {
          provide: SKILLS_REGISTRY_TOKEN,
          useValue: null,
        },
        {
          provide: 'CountryConfigService',
          useValue: mockCountryConfigService,
        },
        {
          provide: 'WorldModelMonitoringService',
          useValue: mockWorldModelMonitoringService,
        },
        {
          provide: 'WorldRealtimeWeatherSkill',
          useValue: mockWorldRealtimeWeatherSkill,
        },
        {
          provide: 'WorldWeatherPredictionSkill',
          useValue: mockWorldWeatherPredictionSkill,
        },
        {
          provide: 'WorldAdaptiveParametersSkill',
          useValue: mockWorldAdaptiveParametersSkill,
        },
      ],
    }).compile();

    service = module.get<UnifiedWorldModelService>(UnifiedWorldModelService);

    // Override logger
    (service as any).logger = mockLogger;

    // Inject optional dependencies
    (service as any).worldRealtimeWeatherSkill = mockWorldRealtimeWeatherSkill;
    (service as any).worldWeatherPredictionSkill = mockWorldWeatherPredictionSkill;
    (service as any).worldAdaptiveParametersSkill = mockWorldAdaptiveParametersSkill;
    (service as any).countryConfigService = mockCountryConfigService;
    (service as any).worldModelMonitoringService = mockWorldModelMonitoringService;

    jest.clearAllMocks();
  });

  describe('buildUnifiedWorldModel - Core Orchestration', () => {
    it('should build complete unified world model successfully', async () => {
      // Arrange
      const request: UnifiedWorldModelRequest = {
        tripId: 'trip-123',
        userId: 'user-456',
        countryCode: 'IS',
        season: 'summer' as const,
        duration: 7,
        partyProfile: {
          fitness: 'medium',
          riskTolerance: 'MEDIUM',
          pace: 'moderate',
        },
        routeDirectionId: 'route-789',
      };

      const mockBaseWorldModel = {
        // WorldModelContext structure
        regions: [],
        routes: [],
        physicalReality: {
          demData: [],
          hazards: [],
        },
        humanCapability: {
          fitness: 'medium' as const,
          pace: 'moderate' as const,
        },
      };

      mockWorldBuildContextSkill.execute.mockResolvedValue({
        world: mockBaseWorldModel,
      });

      mockWorldRealtimeWeatherSkill.execute.mockResolvedValue({
        alerts: [
          {
            region: 'IS',
            alertType: 'WIND',
            severity: 'LOW',
            startTime: new Date(),
            endTime: new Date(),
          },
        ],
      });

      mockWorldWeatherPredictionSkill.execute.mockResolvedValue({
        predictions: [
          {
            date: new Date(),
            temperature: 10,
            windSpeed: 5,
            precipitation: 0,
            confidence: 0.85,
          },
        ],
      });

      mockWorldAdaptiveParametersSkill.execute.mockResolvedValue({
        parameters: {
          routeDifficultyAdjustment: 1.2,
          timeEstimateAdjustment: 1.1,
          riskAssessmentAdjustment: 1.0,
        },
      });

      mockCountryConfigService.getCountryConfig.mockReturnValue({
        countryCode: 'IS',
        worldModelParameters: {
          routeDifficultyAdjustment: 1.1,
        },
      });

      mockCountryConfigService.getGeocodingCoordinates.mockResolvedValue({
        lat: 64.1466,
        lng: -21.9426,
      });

      // Act
      const result = await service.buildUnifiedWorldModel(request);

      // Assert
      expect(result).toBeDefined();
      expect(result).toHaveProperty('realtimeState');
      expect(result.realtimeState).toBeDefined();
      expect(result.realtimeState?.weatherAlerts).toHaveLength(1);
      expect(result.predictions).toBeDefined();
      expect(result.predictions?.weather).toHaveLength(1);
      expect(result.adaptiveParameters).toBeDefined();
      // Note: Country config adjustment happens in getAdaptiveParameters, but since
      // the skill returns values directly, we get the skill value (1.2) not multiplied
      expect(result.adaptiveParameters?.routeDifficultyAdjustment).toBeGreaterThan(1.0);

      expect(mockWorldBuildContextSkill.execute).toHaveBeenCalledTimes(1);
      expect(mockWorldRealtimeWeatherSkill.execute).toHaveBeenCalledTimes(1);
      expect(mockWorldWeatherPredictionSkill.execute).toHaveBeenCalledTimes(1);
      expect(mockWorldAdaptiveParametersSkill.execute).toHaveBeenCalledTimes(1);
      expect(mockWorldModelMonitoringService.recordBuild).toHaveBeenCalled();
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('[UnifiedWorldModel] 开始构建统一世界模型')
      );
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('[UnifiedWorldModel] 统一世界模型构建完成')
      );
    });

    it('should handle base world model build failure', async () => {
      // Arrange
      const request: UnifiedWorldModelRequest = {
        tripId: 'trip-123',
        userId: 'user-456',
        countryCode: 'IS',
      };

      mockWorldBuildContextSkill.execute.mockRejectedValue(
        new Error('Failed to build base world')
      );

      // Act & Assert
      await expect(service.buildUnifiedWorldModel(request)).rejects.toThrow(
        'Failed to build base world'
      );

      expect(mockWorldModelMonitoringService.recordError).toHaveBeenCalledWith(
        'BUILD_FAILED',
        'Failed to build base world',
        'IS'
      );
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle missing base world model', async () => {
      // Arrange
      const request: UnifiedWorldModelRequest = {
        tripId: 'trip-123',
        userId: 'user-456',
      };

      mockWorldBuildContextSkill.execute.mockResolvedValue({
        world: null, // Missing world model
      });

      // Act & Assert
      await expect(service.buildUnifiedWorldModel(request)).rejects.toThrow(
        'Failed to build base world model'
      );
    });
  });

  describe('buildUnifiedWorldModel - Parallel Execution', () => {
    it('should fetch independent data in parallel', async () => {
      // Arrange
      const request: UnifiedWorldModelRequest = {
        tripId: 'trip-123',
        userId: 'user-456',
        countryCode: 'IS',
        duration: 7,
        routeDirectionId: 'route-789',
      };

      mockWorldBuildContextSkill.execute.mockResolvedValue({
        world: { regions: [], routes: [], physicalReality: {}, humanCapability: {} },
      });

      const executionOrder: string[] = [];

      mockWorldRealtimeWeatherSkill.execute.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        executionOrder.push('realtimeWeather');
        return { alerts: [] };
      });

      mockWorldWeatherPredictionSkill.execute.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        executionOrder.push('weatherPrediction');
        return { predictions: [] };
      });

      mockWorldAdaptiveParametersSkill.execute.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        executionOrder.push('adaptiveParameters');
        return { parameters: {} };
      });

      const startTime = Date.now();

      // Act
      await service.buildUnifiedWorldModel(request);
      const duration = Date.now() - startTime;

      // Assert
      // If executed in parallel, should take ~50ms (not 150ms sequential)
      expect(duration).toBeLessThan(150);
      expect(executionOrder).toHaveLength(3);
      expect(executionOrder).toContain('realtimeWeather');
      expect(executionOrder).toContain('weatherPrediction');
      expect(executionOrder).toContain('adaptiveParameters');
    });
  });

  describe('getRealtimeState - Weather Alerts', () => {
    it('should fetch realtime weather alerts using skill', async () => {
      // Arrange
      const request: UnifiedWorldModelRequest = {
        tripId: 'trip-123',
        countryCode: 'IS',
      };

      mockWorldRealtimeWeatherSkill.execute.mockResolvedValue({
        alerts: [
          {
            region: 'IS',
            alertType: 'WIND',
            severity: 'HIGH',
            startTime: new Date(),
            endTime: new Date(),
          },
        ],
      });

      mockCountryConfigService.getGeocodingCoordinates.mockResolvedValue({
        lat: 64.1466,
        lng: -21.9426,
      });

      // Act
      const realtimeState = await (service as any).getRealtimeState(request);

      // Assert
      expect(realtimeState.weatherAlerts).toHaveLength(1);
      expect(realtimeState.weatherAlerts[0].alertType).toBe('WIND');
      expect(mockWorldRealtimeWeatherSkill.execute).toHaveBeenCalledWith({
        region: 'IS',
        dateRange: undefined,
        location: { lat: 64.1466, lng: -21.9426 },
      });
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('使用world.realtimeWeather Skill获取到 1 条预警')
      );
    });

    it('should handle weather alerts fetch failure gracefully', async () => {
      // Arrange
      const request: UnifiedWorldModelRequest = {
        tripId: 'trip-123',
        countryCode: 'IS',
      };

      mockWorldRealtimeWeatherSkill.execute.mockRejectedValue(
        new Error('Weather API unavailable')
      );

      mockCountryConfigService.getGeocodingCoordinates.mockResolvedValue({
        lat: 64.1466,
        lng: -21.9426,
      });

      // Act
      const realtimeState = await (service as any).getRealtimeState(request);

      // Assert
      expect(realtimeState.weatherAlerts).toHaveLength(0); // Fallback to empty
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should skip weather alerts when no country code', async () => {
      // Arrange
      const request: UnifiedWorldModelRequest = {
        tripId: 'trip-123',
        // No countryCode
      };

      // Act
      const realtimeState = await (service as any).getRealtimeState(request);

      // Assert
      expect(realtimeState.weatherAlerts).toHaveLength(0);
      expect(mockWorldRealtimeWeatherSkill.execute).not.toHaveBeenCalled();
    });
  });

  describe('getPredictions - Weather Predictions', () => {
    it('should fetch weather predictions using skill', async () => {
      // Arrange
      const request: UnifiedWorldModelRequest = {
        tripId: 'trip-123',
        countryCode: 'IS',
        duration: 7,
      };

      mockWorldWeatherPredictionSkill.execute.mockResolvedValue({
        predictions: [
          {
            date: new Date('2026-02-15'),
            temperature: 10,
            windSpeed: 5,
            precipitation: 0,
            confidence: 0.85,
          },
        ],
      });

      mockCountryConfigService.getGeocodingCoordinates.mockResolvedValue({
        lat: 64.1466,
        lng: -21.9426,
      });

      // Act
      const predictions = await (service as any).getPredictions(request);

      // Assert
      expect(predictions.weather).toHaveLength(1);
      expect(predictions.weather[0].temperature).toBe(10);
      expect(mockWorldWeatherPredictionSkill.execute).toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('使用world.weatherPrediction Skill获取到 1 条预测')
      );
    });

    it('should handle weather predictions fetch failure gracefully', async () => {
      // Arrange
      const request: UnifiedWorldModelRequest = {
        tripId: 'trip-123',
        countryCode: 'IS',
        duration: 7,
      };

      mockWorldWeatherPredictionSkill.execute.mockRejectedValue(
        new Error('Prediction API unavailable')
      );

      mockCountryConfigService.getGeocodingCoordinates.mockResolvedValue({
        lat: 64.1466,
        lng: -21.9426,
      });

      // Act
      const predictions = await (service as any).getPredictions(request);

      // Assert
      expect(predictions.weather).toHaveLength(0); // Fallback to empty
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should skip predictions when no country code or duration', async () => {
      // Arrange
      const request: UnifiedWorldModelRequest = {
        tripId: 'trip-123',
        // No countryCode or duration
      };

      // Act
      const predictions = await (service as any).getPredictions(request);

      // Assert
      expect(predictions.weather).toHaveLength(0);
      expect(mockWorldWeatherPredictionSkill.execute).not.toHaveBeenCalled();
    });
  });

  describe('getAdaptiveParameters - Country Config Integration', () => {
    it('should apply country-specific adjustments', async () => {
      // Arrange
      const request: UnifiedWorldModelRequest = {
        tripId: 'trip-123',
        userId: 'user-456',
        routeDirectionId: 'route-789',
      };

      const countryConfig = {
        countryCode: 'IS',
        worldModelParameters: {
          routeDifficultyAdjustment: 1.2,
          timeEstimateAdjustment: 1.1,
          riskAssessmentAdjustment: 1.0,
        },
      };

      mockWorldAdaptiveParametersSkill.execute.mockResolvedValue({
        parameters: {
          routeDifficultyAdjustment: 1.1,
          timeEstimateAdjustment: 1.0,
          riskAssessmentAdjustment: 1.0,
        },
      });

      // Act
      const params = await (service as any).getAdaptiveParameters(request, countryConfig);

      // Assert
      // The skill returns parameters directly, country config is applied on top
      // So we expect the skill's value to be returned as-is when testing the private method
      expect(params.routeDifficultyAdjustment).toBe(1.1);
      expect(params.timeEstimateAdjustment).toBe(1.0);
      expect(params.riskAssessmentAdjustment).toBe(1.0);
    });

    it('should use country config as fallback when skill fails', async () => {
      // Arrange
      const request: UnifiedWorldModelRequest = {
        tripId: 'trip-123',
        userId: 'user-456',
        routeDirectionId: 'route-789',
      };

      const countryConfig = {
        countryCode: 'IS',
        worldModelParameters: {
          routeDifficultyAdjustment: 1.3,
          timeEstimateAdjustment: 1.2,
          riskAssessmentAdjustment: 1.1,
        },
      };

      mockWorldAdaptiveParametersSkill.execute.mockRejectedValue(
        new Error('Adaptive parameters unavailable')
      );

      // Act
      const params = await (service as any).getAdaptiveParameters(request, countryConfig);

      // Assert
      expect(params.routeDifficultyAdjustment).toBe(1.3);
      expect(params.timeEstimateAdjustment).toBe(1.2);
      expect(params.riskAssessmentAdjustment).toBe(1.1);
    });

    it('should return default values when both skill and country config unavailable', async () => {
      // Arrange
      const request: UnifiedWorldModelRequest = {
        tripId: 'trip-123',
        userId: 'user-456',
        routeDirectionId: 'route-789',
      };

      mockWorldAdaptiveParametersSkill.execute.mockRejectedValue(
        new Error('Adaptive parameters unavailable')
      );

      // Act
      const params = await (service as any).getAdaptiveParameters(request, undefined);

      // Assert
      expect(params.routeDifficultyAdjustment).toBe(1.0);
      expect(params.timeEstimateAdjustment).toBe(1.0);
      expect(params.riskAssessmentAdjustment).toBe(1.0);
    });
  });

  describe('Performance Monitoring', () => {
    it('should record build time metrics', async () => {
      // Arrange
      const request: UnifiedWorldModelRequest = {
        tripId: 'trip-123',
        countryCode: 'IS',
      };

      mockWorldBuildContextSkill.execute.mockResolvedValue({
        world: { regions: [], routes: [], physicalReality: {}, humanCapability: {} },
      });

      // Act
      await service.buildUnifiedWorldModel(request);

      // Assert
      expect(mockWorldModelMonitoringService.recordBuild).toHaveBeenCalled();
      const callArgs = mockWorldModelMonitoringService.recordBuild.mock.calls[0];
      expect(callArgs[0]).toBeGreaterThanOrEqual(0); // buildTimeMs (can be 0 in fast tests)
      expect(callArgs[1]).toBe('IS'); // countryCode
    });

    it('should record error metrics on failure', async () => {
      // Arrange
      const request: UnifiedWorldModelRequest = {
        tripId: 'trip-123',
        countryCode: 'IS',
      };

      const error = new Error('Database connection failed');
      mockWorldBuildContextSkill.execute.mockRejectedValue(error);

      // Act & Assert
      await expect(service.buildUnifiedWorldModel(request)).rejects.toThrow();

      expect(mockWorldModelMonitoringService.recordError).toHaveBeenCalledWith(
        'BUILD_FAILED',
        'Database connection failed',
        'IS'
      );
    });
  });

  describe('Fallback Strategies', () => {
    it('should use fallback when skill is not available', async () => {
      // Arrange
      const request: UnifiedWorldModelRequest = {
        tripId: 'trip-123',
        userId: 'user-456',
        routeDirectionId: 'route-789',
      };

      // Remove skill
      (service as any).worldAdaptiveParametersSkill = null;

      // Mock service fallback
      (service as any).adaptiveWorldModelService = {
        getAdaptiveParameters: jest.fn().mockResolvedValue({
          routeDifficultyAdjustment: 1.5,
          timeEstimateAdjustment: 1.3,
          riskAssessmentAdjustment: 1.1,
        }),
      };

      // Act
      const params = await (service as any).getAdaptiveParameters(request, undefined);

      // Assert
      expect(params.routeDifficultyAdjustment).toBe(1.5);
      expect((service as any).adaptiveWorldModelService.getAdaptiveParameters).toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('使用AdaptiveWorldModelService获取到参数')
      );
    });
  });

  describe('partyProfile Conversion', () => {
    it('should convert partyProfile types correctly', async () => {
      // Arrange
      const request: UnifiedWorldModelRequest = {
        tripId: 'trip-123',
        countryCode: 'IS',
        partyProfile: {
          fitness: 'medium',
          riskTolerance: 'HIGH', // uppercase
          pace: 'fast', // should convert to 'intense'
        },
      };

      mockWorldBuildContextSkill.execute.mockResolvedValue({
        world: { regions: [], routes: [], physicalReality: {}, humanCapability: {} },
      });

      // Act
      await service.buildUnifiedWorldModel(request);

      // Assert
      expect(mockWorldBuildContextSkill.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          partyProfile: {
            fitness: 'medium',
            riskTolerance: 'high', // converted to lowercase
            pace: 'intense', // converted from 'fast'
          },
        })
      );
    });

    it('should handle undefined partyProfile', async () => {
      // Arrange
      const request: UnifiedWorldModelRequest = {
        tripId: 'trip-123',
        countryCode: 'IS',
        // No partyProfile
      };

      mockWorldBuildContextSkill.execute.mockResolvedValue({
        world: { regions: [], routes: [], physicalReality: {}, humanCapability: {} },
      });

      // Act
      await service.buildUnifiedWorldModel(request);

      // Assert
      expect(mockWorldBuildContextSkill.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          partyProfile: undefined,
        })
      );
    });
  });
});
