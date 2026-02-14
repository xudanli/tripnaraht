// src/skills/world/avalanche-risk-assessment.skill.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { AvalancheRiskAssessmentSkill } from './avalanche-risk-assessment.skill';
import { PrismaService } from '../../prisma/prisma.service';
import { IcelandWeatherRealtimeService } from './services/iceland-weather-realtime.service';

describe('AvalancheRiskAssessmentSkill', () => {
  let skill: AvalancheRiskAssessmentSkill;
  let prisma: PrismaService;
  let weatherService: IcelandWeatherRealtimeService;

  const mockPrisma = {
    $queryRawUnsafe: jest.fn(),
  };

  const mockWeatherService = {
    getWeatherByLocation: jest.fn(),
  };

  const mockLogger = {
    log: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AvalancheRiskAssessmentSkill,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: IcelandWeatherRealtimeService,
          useValue: mockWeatherService,
        },
        {
          provide: Logger,
          useValue: mockLogger,
        },
      ],
    }).compile();

    skill = module.get<AvalancheRiskAssessmentSkill>(AvalancheRiskAssessmentSkill);
    prisma = module.get<PrismaService>(PrismaService);
    weatherService = module.get<IcelandWeatherRealtimeService>(IcelandWeatherRealtimeService);

    jest.clearAllMocks();
  });

  describe('execute - Safe Scenario (Summer, No Hazard Zones)', () => {
    it('should return ALLOW for safe summer route with no avalanche zones', async () => {
      // Arrange
      const input = {
        request_id: 'test-001',
        route: [
          { lat: 64.1466, lng: -21.9426, name: 'Reykjavík' },
          { lat: 63.4181, lng: -19.0106, name: 'Vík' },
        ],
        countryCode: 'IS',
        month: 7, // July - summer
        dateRange: {
          start: new Date('2024-07-15'),
          end: new Date('2024-07-20'),
        },
        riskTolerance: 'MEDIUM' as const,
      };

      // Mock: No avalanche zones found
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

      // Mock: Good weather
      mockWeatherService.getWeatherByLocation.mockResolvedValue({
        regionKey: 'south_coast',
        regionName: 'South Coast',
        temperature: 12.0,
        windSpeed: 8.0,
        precipitation: 1.0,
        forecastTime: new Date(),
        validFrom: new Date(),
        validUntil: new Date(Date.now() + 12 * 60 * 60 * 1000),
      });

      // Act
      const result = await skill.execute(input);

      // Assert
      expect(result.overallRisk).toBe('safe');
      expect(result.gateRecommendation).toBe('ALLOW');
      expect(result.hazardZones).toHaveLength(0);
      expect(result.riskAssessment.hasHighRisk).toBe(false);
      expect(result.riskAssessment.hasMediumRisk).toBe(false);
      expect(result.blockers).toHaveLength(0);
      expect(result.adjustments).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('execute - Low Risk Scenario', () => {
    it('should return ALLOW for route with low-risk avalanche zones', async () => {
      // Arrange
      const input = {
        request_id: 'test-002',
        route: [
          { lat: 64.1466, lng: -21.9426, name: 'Reykjavík' },
          { lat: 64.75, lng: -18.0, name: 'Highlands' },
        ],
        countryCode: 'IS',
        month: 8, // August
        riskTolerance: 'MEDIUM' as const,
      };

      // Mock: 1 low-risk zone
      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        {
          zoneId: 'AVL-IS-LOW-001',
          type: 'AVALANCHE',
          level: 'LOW',
          lat: 64.5,
          lng: -18.5,
          distance: 1500, // 1.5km
          seasonality: JSON.stringify({
            highRiskMonths: [11, 12, 1, 2, 3],
            lowRiskMonths: [6, 7, 8, 9],
          }),
          description: 'Low-risk summer avalanche zone',
        },
      ]);

      // Mock: Good weather
      mockWeatherService.getWeatherByLocation.mockResolvedValue({
        temperature: 10.0,
        windSpeed: 7.0,
        precipitation: 0.5,
        forecastTime: new Date(),
        validFrom: new Date(),
        validUntil: new Date(Date.now() + 12 * 60 * 60 * 1000),
      });

      // Act
      const result = await skill.execute(input);

      // Assert
      expect(result.overallRisk).toBe('low');
      expect(result.gateRecommendation).toBe('ALLOW');
      expect(result.hazardZones).toHaveLength(1);
      expect(result.riskAssessment.totalHazards).toBe(1);
      // Low-risk zones don't generate warnings (only medium/high do)
      expect(result.summary).toContain('low avalanche risk');
    });
  });

  describe('execute - Medium Risk Scenario', () => {
    it('should return NEED_USER_CONFIRM for medium-risk zones with good weather', async () => {
      // Arrange
      const input = {
        request_id: 'test-003',
        route: [
          { lat: 65.6835, lng: -18.1123, name: 'Akureyri' },
          { lat: 65.5908, lng: -16.9909, name: 'Mývatn' },
        ],
        countryCode: 'IS',
        month: 10, // October
        riskTolerance: 'MEDIUM' as const,
      };

      // Mock: 1 medium-risk zone
      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        {
          zoneId: 'AVL-IS-MED-001',
          type: 'AVALANCHE',
          level: 'MEDIUM',
          lat: 65.6,
          lng: -17.5,
          distance: 800,
          seasonality: JSON.stringify({
            highRiskMonths: [10, 11, 12, 1, 2, 3, 4],
            lowRiskMonths: [6, 7, 8],
          }),
          description: 'Medium-risk mountain pass',
        },
      ]);

      // Mock: Moderate weather
      mockWeatherService.getWeatherByLocation.mockResolvedValue({
        temperature: 5.0,
        windSpeed: 10.0,
        precipitation: 3.0,
        forecastTime: new Date(),
        validFrom: new Date(),
        validUntil: new Date(Date.now() + 12 * 60 * 60 * 1000),
      });

      // Act
      const result = await skill.execute(input);

      // Assert
      expect(result.overallRisk).toBe('medium');
      expect(result.gateRecommendation).toBe('NEED_USER_CONFIRM');
      expect(result.hazardZones).toHaveLength(1);
      expect(result.riskAssessment.hasMediumRisk).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.adjustments.length).toBeGreaterThan(0);
      // Check that adjustments array contains the local guide recommendation
      expect(result.adjustments.some(adj => adj.includes('local guide'))).toBe(true);
    });

    it('should return ADJUST_REQUIRED for medium-risk zones with high weather risk', async () => {
      // Arrange
      const input = {
        request_id: 'test-004',
        route: [
          { lat: 65.6835, lng: -18.1123, name: 'Akureyri' },
          { lat: 65.5908, lng: -16.9909, name: 'Mývatn' },
        ],
        countryCode: 'IS',
        month: 12, // December
        riskTolerance: 'MEDIUM' as const,
      };

      // Mock: 1 medium-risk zone
      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        {
          zoneId: 'AVL-IS-MED-002',
          type: 'AVALANCHE',
          level: 'MEDIUM',
          lat: 65.6,
          lng: -17.5,
          distance: 600,
          description: 'Medium-risk winter route',
        },
      ]);

      // Mock: High weather risk (recent snowfall + warming)
      mockWeatherService.getWeatherByLocation.mockResolvedValue({
        temperature: 3.0, // Warming (0-10°C)
        windSpeed: 17.0, // High winds (> 15 m/s)
        precipitation: 12.0, // Heavy snowfall (> 10mm)
        forecastTime: new Date(),
        validFrom: new Date(),
        validUntil: new Date(Date.now() + 12 * 60 * 60 * 1000),
      });

      // Act
      const result = await skill.execute(input);

      // Assert
      // Medium geographic risk + high weather risk stays medium (not escalated to high)
      // because logic is: medium + high weather → still medium (only extreme weather escalates)
      expect(result.overallRisk).toBe('medium');
      expect(result.gateRecommendation).toBe('ADJUST_REQUIRED'); // medium + high weather → ADJUST_REQUIRED
      expect(result.weatherFactors?.recentSnowfall).toBe(true);
      expect(result.weatherFactors?.temperatureWarming).toBe(true);
      expect(result.weatherFactors?.highWinds).toBe(true);
      expect(result.weatherFactors?.weatherRiskLevel).toBe('high');
    });
  });

  describe('execute - High Risk Scenario', () => {
    it('should return ADJUST_REQUIRED for high-risk zones with good weather', async () => {
      // Arrange
      const input = {
        request_id: 'test-005',
        route: [
          { lat: 64.1466, lng: -21.9426, name: 'Reykjavík' },
          { lat: 64.75, lng: -18.0, name: 'Highlands F26' },
        ],
        countryCode: 'IS',
        month: 3, // March
        riskTolerance: 'MEDIUM' as const,
      };

      // Mock: 1 high-risk zone
      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        {
          zoneId: 'AVL-IS-HIGH-001',
          type: 'AVALANCHE',
          level: 'HIGH',
          lat: 64.75,
          lng: -18.0,
          distance: 200,
          seasonality: JSON.stringify({
            highRiskMonths: [11, 12, 1, 2, 3, 4, 5],
            lowRiskMonths: [7, 8],
          }),
          description: 'High-risk highlands avalanche zone',
        },
      ]);

      // Mock: Moderate weather
      mockWeatherService.getWeatherByLocation.mockResolvedValue({
        temperature: -2.0,
        windSpeed: 12.0,
        precipitation: 5.0,
        forecastTime: new Date(),
        validFrom: new Date(),
        validUntil: new Date(Date.now() + 12 * 60 * 60 * 1000),
      });

      // Act
      const result = await skill.execute(input);

      // Assert
      expect(result.overallRisk).toBe('high');
      expect(result.gateRecommendation).toBe('ADJUST_REQUIRED');
      expect(result.hazardZones).toHaveLength(1);
      expect(result.riskAssessment.hasHighRisk).toBe(true);
      expect(result.blockers).toHaveLength(0); // No blockers for ADJUST_REQUIRED
      expect(result.adjustments.length).toBeGreaterThan(0);
    });

    it('should return BLOCK for high-risk zones with extreme weather', async () => {
      // Arrange
      const input = {
        request_id: 'test-006',
        route: [
          { lat: 64.1466, lng: -21.9426, name: 'Reykjavík' },
          { lat: 64.75, lng: -18.0, name: 'Highlands F26' },
        ],
        countryCode: 'IS',
        month: 1, // January - winter
        riskTolerance: 'MEDIUM' as const,
      };

      // Mock: 2 high-risk zones
      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        {
          zoneId: 'AVL-IS-HIGH-001',
          type: 'AVALANCHE',
          level: 'HIGH',
          lat: 64.75,
          lng: -18.0,
          distance: 200,
          description: 'High-risk zone 1',
        },
        {
          zoneId: 'AVL-IS-HIGH-002',
          type: 'AVALANCHE',
          level: 'HIGH',
          lat: 64.70,
          lng: -18.2,
          distance: 500,
          description: 'High-risk zone 2',
        },
      ]);

      // Mock: Extreme weather (snowfall + warming + high winds)
      mockWeatherService.getWeatherByLocation.mockResolvedValue({
        temperature: 2.0, // Warming
        windSpeed: 22.0, // Extreme winds
        precipitation: 18.0, // Heavy snowfall
        forecastTime: new Date(),
        validFrom: new Date(),
        validUntil: new Date(Date.now() + 12 * 60 * 60 * 1000),
      });

      // Act
      const result = await skill.execute(input);

      // Assert
      // High geographic + extreme weather (snowfall + warming + winds) = extreme overall
      expect(result.overallRisk).toBe('extreme');
      expect(result.gateRecommendation).toBe('BLOCK');
      expect(result.hazardZones).toHaveLength(2);
      expect(result.riskAssessment.hasHighRisk).toBe(true);
      expect(result.blockers.length).toBeGreaterThan(0);
      expect(result.blockers[0]).toContain('Extreme avalanche risk');
      expect(result.weatherFactors?.weatherRiskLevel).toBe('extreme');
      expect(result.evidence_refs.length).toBeGreaterThan(0);
    });
  });

  describe('execute - Risk Tolerance Adjustment', () => {
    it('should escalate risk with LOW tolerance', async () => {
      // Arrange
      const input = {
        request_id: 'test-007',
        route: [
          { lat: 64.1466, lng: -21.9426, name: 'Reykjavík' },
          { lat: 64.5, lng: -18.5, name: 'Route Point' },
        ],
        countryCode: 'IS',
        month: 10,
        riskTolerance: 'LOW' as const, // Strict
      };

      // Mock: 1 medium-risk zone
      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        {
          zoneId: 'AVL-IS-MED-003',
          type: 'AVALANCHE',
          level: 'MEDIUM',
          lat: 64.5,
          lng: -18.5,
          distance: 300,
          description: 'Medium-risk zone',
        },
      ]);

      mockWeatherService.getWeatherByLocation.mockResolvedValue({
        temperature: 8.0,
        windSpeed: 10.0,
        precipitation: 2.0,
        forecastTime: new Date(),
        validFrom: new Date(),
        validUntil: new Date(Date.now() + 12 * 60 * 60 * 1000),
      });

      // Act
      const result = await skill.execute(input);

      // Assert
      expect(result.overallRisk).toBe('high'); // Escalated from medium
      expect(result.gateRecommendation).toBe('ADJUST_REQUIRED');
    });

    it('should de-escalate risk with HIGH tolerance', async () => {
      // Arrange
      const input = {
        request_id: 'test-008',
        route: [
          { lat: 64.1466, lng: -21.9426, name: 'Reykjavík' },
          { lat: 64.5, lng: -18.5, name: 'Route Point' },
        ],
        countryCode: 'IS',
        month: 10,
        riskTolerance: 'HIGH' as const, // Lenient
      };

      // Mock: 1 medium-risk zone
      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        {
          zoneId: 'AVL-IS-MED-004',
          type: 'AVALANCHE',
          level: 'MEDIUM',
          lat: 64.5,
          lng: -18.5,
          distance: 300,
          description: 'Medium-risk zone',
        },
      ]);

      mockWeatherService.getWeatherByLocation.mockResolvedValue({
        temperature: 8.0,
        windSpeed: 10.0,
        precipitation: 2.0,
        forecastTime: new Date(),
        validFrom: new Date(),
        validUntil: new Date(Date.now() + 12 * 60 * 60 * 1000),
      });

      // Act
      const result = await skill.execute(input);

      // Assert
      expect(result.overallRisk).toBe('low'); // De-escalated from medium
      expect(result.gateRecommendation).toBe('ALLOW');
    });
  });

  describe('execute - Weather Factor Analysis', () => {
    it('should detect recent snowfall (precipitation > 10mm && temp < 5°C)', async () => {
      // Arrange
      const input = {
        request_id: 'test-009',
        route: [{ lat: 64.75, lng: -18.0, name: 'Highlands' }],
        countryCode: 'IS',
        month: 2,
        riskTolerance: 'MEDIUM' as const,
      };

      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

      mockWeatherService.getWeatherByLocation.mockResolvedValue({
        temperature: 2.0, // < 5°C
        windSpeed: 8.0,
        precipitation: 12.0, // > 10mm
        forecastTime: new Date(),
        validFrom: new Date(),
        validUntil: new Date(Date.now() + 12 * 60 * 60 * 1000),
      });

      // Act
      const result = await skill.execute(input);

      // Assert
      expect(result.weatherFactors?.recentSnowfall).toBe(true);
    });

    it('should detect temperature warming (0°C < temp < 10°C)', async () => {
      // Arrange
      const input = {
        request_id: 'test-010',
        route: [{ lat: 64.75, lng: -18.0, name: 'Highlands' }],
        countryCode: 'IS',
        month: 4,
        riskTolerance: 'MEDIUM' as const,
      };

      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

      mockWeatherService.getWeatherByLocation.mockResolvedValue({
        temperature: 5.0, // 0-10°C
        windSpeed: 8.0,
        precipitation: 1.0,
        forecastTime: new Date(),
        validFrom: new Date(),
        validUntil: new Date(Date.now() + 12 * 60 * 60 * 1000),
      });

      // Act
      const result = await skill.execute(input);

      // Assert
      expect(result.weatherFactors?.temperatureWarming).toBe(true);
    });

    it('should detect high winds (> 15 m/s)', async () => {
      // Arrange
      const input = {
        request_id: 'test-011',
        route: [{ lat: 64.75, lng: -18.0, name: 'Highlands' }],
        countryCode: 'IS',
        month: 11,
        riskTolerance: 'MEDIUM' as const,
      };

      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

      mockWeatherService.getWeatherByLocation.mockResolvedValue({
        temperature: -5.0,
        windSpeed: 18.0, // > 15 m/s
        precipitation: 3.0,
        forecastTime: new Date(),
        validFrom: new Date(),
        validUntil: new Date(Date.now() + 12 * 60 * 60 * 1000),
      });

      // Act
      const result = await skill.execute(input);

      // Assert
      expect(result.weatherFactors?.highWinds).toBe(true);
    });

    it('should classify extreme weather (snowfall + warming)', async () => {
      // Arrange
      const input = {
        request_id: 'test-012',
        route: [{ lat: 64.75, lng: -18.0, name: 'Highlands' }],
        countryCode: 'IS',
        month: 3,
        riskTolerance: 'MEDIUM' as const,
      };

      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

      mockWeatherService.getWeatherByLocation.mockResolvedValue({
        temperature: 4.0, // Warming
        windSpeed: 12.0,
        precipitation: 15.0, // Heavy snowfall
        forecastTime: new Date(),
        validFrom: new Date(),
        validUntil: new Date(Date.now() + 12 * 60 * 60 * 1000),
      });

      // Act
      const result = await skill.execute(input);

      // Assert
      expect(result.weatherFactors?.weatherRiskLevel).toBe('extreme');
      expect(result.weatherFactors?.recentSnowfall).toBe(true);
      expect(result.weatherFactors?.temperatureWarming).toBe(true);
    });
  });

  describe('execute - Evidence Chain', () => {
    it('should include complete evidence references', async () => {
      // Arrange
      const input = {
        request_id: 'test-013',
        route: [
          { lat: 64.1466, lng: -21.9426, name: 'Reykjavík' },
          { lat: 64.75, lng: -18.0, name: 'Highlands' },
        ],
        countryCode: 'IS',
        month: 7,
        riskTolerance: 'MEDIUM' as const,
      };

      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        {
          zoneId: 'AVL-IS-LOW-002',
          type: 'AVALANCHE',
          level: 'LOW',
          lat: 64.5,
          lng: -18.5,
          distance: 1200,
          description: 'Low-risk zone',
        },
      ]);

      mockWeatherService.getWeatherByLocation.mockResolvedValue({
        temperature: 12.0,
        windSpeed: 7.0,
        precipitation: 1.0,
        forecastTime: new Date(),
        validFrom: new Date(),
        validUntil: new Date(Date.now() + 12 * 60 * 60 * 1000),
      });

      // Act
      const result = await skill.execute(input);

      // Assert
      expect(result.evidence_refs).toBeDefined();
      expect(result.evidence_refs.length).toBeGreaterThan(0);

      // Check hazard zones evidence
      const hazardEvidence = result.evidence_refs.find(ref =>
        ref.evidence_id === 'test-013-avalanche-zones'
      );
      expect(hazardEvidence).toBeDefined();
      expect(hazardEvidence?.source).toBe('hazard_zones_database');
      expect(hazardEvidence?.confidence).toBe(0.9);
      expect(hazardEvidence?.data).toHaveProperty('total_zones', 1);

      // Check weather evidence
      const weatherEvidence = result.evidence_refs.find(ref =>
        ref.evidence_id === 'test-013-avalanche-weather'
      );
      expect(weatherEvidence).toBeDefined();
      expect(weatherEvidence?.source).toBe('iceland_weather_realtime');
      expect(weatherEvidence?.confidence).toBe(0.8);
    });
  });

  describe('execute - Degradation Strategy', () => {
    it('should return degraded response when database query fails', async () => {
      // Arrange
      const input = {
        request_id: 'test-014',
        route: [{ lat: 64.1466, lng: -21.9426, name: 'Reykjavík' }],
        countryCode: 'IS',
        month: 7,
        riskTolerance: 'MEDIUM' as const,
      };

      mockPrisma.$queryRawUnsafe.mockRejectedValue(new Error('Database connection timeout'));

      // Act
      const result = await skill.execute(input);

      // Assert
      expect(result.overallRisk).toBe('medium'); // Conservative estimate
      expect(result.gateRecommendation).toBe('NEED_USER_CONFIRM');
      expect(result.hazardZones).toHaveLength(0);
      expect(result.warnings).toContain('Avalanche risk assessment service unavailable');
      expect(result.adjustments).toContain(
        expect.stringContaining('check local avalanche bulletin')
      );
      expect(result.evidence_refs[0].confidence).toBe(0.3); // Low confidence
      expect(result.evidence_refs[0].data).toHaveProperty('degraded', true);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle weather service failure gracefully', async () => {
      // Arrange
      const input = {
        request_id: 'test-015',
        route: [{ lat: 64.1466, lng: -21.9426, name: 'Reykjavík' }],
        countryCode: 'IS',
        month: 7,
        riskTolerance: 'MEDIUM' as const,
      };

      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
      mockWeatherService.getWeatherByLocation.mockRejectedValue(
        new Error('Weather service unavailable')
      );

      // Act
      const result = await skill.execute(input);

      // Assert
      expect(result.weatherFactors).toBeUndefined(); // No weather data
      expect(result.overallRisk).toBe('safe'); // Based on geographic data only
      expect(result.gateRecommendation).toBe('ALLOW');
    });
  });

  describe('execute - PostGIS Spatial Query', () => {
    it('should use correct SQL query with ST_DWithin', async () => {
      // Arrange
      const input = {
        request_id: 'test-016',
        route: [
          { lat: 64.1466, lng: -21.9426, name: 'Point A' },
          { lat: 64.5, lng: -18.5, name: 'Point B' },
        ],
        countryCode: 'IS',
        month: 7,
        bufferRadius: 3000, // 3km custom buffer
      };

      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
      mockWeatherService.getWeatherByLocation.mockResolvedValue({
        temperature: 12.0,
        windSpeed: 7.0,
        precipitation: 1.0,
        forecastTime: new Date(),
        validFrom: new Date(),
        validUntil: new Date(Date.now() + 12 * 60 * 60 * 1000),
      });

      // Act
      await skill.execute(input);

      // Assert
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalled();
      const sqlQuery = mockPrisma.$queryRawUnsafe.mock.calls[0][0];

      // Verify SQL contains PostGIS functions
      expect(sqlQuery).toContain('ST_DWithin'); // Spatial query
      expect(sqlQuery).toContain('3000'); // Custom buffer radius
      expect(sqlQuery).toContain("countryCode = 'IS'"); // Country filter
      expect(sqlQuery).toContain("type = 'AVALANCHE'"); // Type filter
      expect(sqlQuery).toContain('LIMIT 50'); // Result limit
    });
  });

  describe('execute - Summary Generation', () => {
    it('should generate appropriate summary for ALLOW', async () => {
      const input = {
        request_id: 'test-017',
        route: [{ lat: 64.1466, lng: -21.9426, name: 'Reykjavík' }],
        countryCode: 'IS',
        month: 7,
        riskTolerance: 'MEDIUM' as const,
      };

      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
      mockWeatherService.getWeatherByLocation.mockResolvedValue({
        temperature: 12.0,
        windSpeed: 7.0,
        precipitation: 1.0,
        forecastTime: new Date(),
        validFrom: new Date(),
        validUntil: new Date(Date.now() + 12 * 60 * 60 * 1000),
      });

      const result = await skill.execute(input);

      expect(result.summary).toContain('No significant avalanche risk detected');
      expect(result.summary).toContain('safe conditions');
    });

    it('should generate appropriate summary for BLOCK', async () => {
      const input = {
        request_id: 'test-018',
        route: [{ lat: 64.75, lng: -18.0, name: 'Highlands' }],
        countryCode: 'IS',
        month: 1,
        riskTolerance: 'MEDIUM' as const,
      };

      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        {
          zoneId: 'AVL-IS-HIGH-003',
          type: 'AVALANCHE',
          level: 'HIGH',
          lat: 64.75,
          lng: -18.0,
          distance: 100,
          description: 'High-risk zone',
        },
      ]);

      mockWeatherService.getWeatherByLocation.mockResolvedValue({
        temperature: 3.0,
        windSpeed: 20.0,
        precipitation: 15.0,
        forecastTime: new Date(),
        validFrom: new Date(),
        validUntil: new Date(Date.now() + 12 * 60 * 60 * 1000),
      });

      const result = await skill.execute(input);

      expect(result.summary).toContain('1 high-risk avalanche zone');
      expect(result.summary).toContain('extreme weather conditions');
      expect(result.summary).toContain('too dangerous');
    });
  });
});
