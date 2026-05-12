// src/skills/world/weather-alert.skill.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { WeatherAlertSkill } from './weather-alert.skill';
import { IcelandWeatherRealtimeService } from './services/iceland-weather-realtime.service';
import { VedurCapAlertsService } from './services/vedur-cap-alerts.service';

describe('WeatherAlertSkill', () => {
  let skill: WeatherAlertSkill;

  const mockWeatherService = {
    getWeatherByLocation: jest.fn(),
    getNearestWeatherStation: jest.fn(),
  };

  const mockVedurCap = {
    fetchActiveCapAlerts: jest.fn().mockResolvedValue({
      ok: false,
      items: [],
      fetchedAt: new Date(),
      sourcePath: '',
    }),
    fetchCapAlertsNear: jest.fn().mockResolvedValue({
      ok: false,
      items: [],
      fetchedAt: new Date(),
      sourcePath: '',
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WeatherAlertSkill,
        {
          provide: IcelandWeatherRealtimeService,
          useValue: mockWeatherService,
        },
        {
          provide: VedurCapAlertsService,
          useValue: mockVedurCap,
        },
      ],
    }).compile();

    skill = module.get<WeatherAlertSkill>(WeatherAlertSkill);

    jest.clearAllMocks();
    mockVedurCap.fetchActiveCapAlerts.mockResolvedValue({
      ok: false,
      items: [],
      fetchedAt: new Date(),
      sourcePath: '',
    });
    mockVedurCap.fetchCapAlertsNear.mockResolvedValue({
      ok: false,
      items: [],
      fetchedAt: new Date(),
      sourcePath: '',
    });
  });

  describe('execute - Low Risk Scenario', () => {
    it('should return ALLOW for safe weather conditions', async () => {
      // Arrange
      const input = {
        locations: [
          { lat: 64.1466, lng: -21.9426, name: 'Reykjavík', type: 'start' as const },
          { lat: 64.1355, lng: -21.8954, name: 'Perlan', type: 'end' as const },
        ],
        dateRange: {
          start: new Date('2026-07-15'),
          end: new Date('2026-07-16'),
        },
        riskTolerance: 'medium' as const,
      };

      mockWeatherService.getWeatherByLocation.mockResolvedValue({
        regionKey: 'reykjavik',
        regionName: 'Reykjavík',
        temperature: 12.0,
        windSpeed: 5.0,
        visibility: 20000,
        conditions: 'Partly cloudy',
        weatherCode: '2',
        warnings: [],
        risks: [],
      });

      // Act
      const result = await skill.execute(input);

      // Assert
      expect(result.overallRisk).toBe('safe');
      expect(result.gateRecommendation).toBe('ALLOW');
      expect(result.locationWeather).toHaveLength(2);
      expect(result.locationWeather[0].risk).toBe('safe');
      expect(result.adjustments).toHaveLength(0);
    });
  });

  describe('execute - High Risk Scenario', () => {
    it('should return BLOCK for extreme wind conditions', async () => {
      // Arrange
      const input = {
        locations: [
          { lat: 64.75, lng: -18.0, name: 'Highlands', type: 'end' as const },
        ],
        dateRange: {
          start: new Date('2026-02-15'),
          end: new Date('2026-02-16'),
        },
        riskTolerance: 'medium' as const,
      };

      mockWeatherService.getNearestWeatherStation.mockResolvedValue({
        regionKey: 'highlands_center',
        regionName: 'Highlands Center',
        temperature: -12.6,
        windSpeed: 25.0, // > 20 m/s = extreme
        visibility: 2000, // < 5km
        conditions: 'Heavy snow',
        weatherCode: '85',
        warnings: ['Extreme wind conditions (25.0 m/s)', 'Low visibility (<5km): 2km'],
        risks: [{ type: 'EXTREME_WIND' }, { type: 'LOW_VISIBILITY' }],
      });

      // Act
      const result = await skill.execute(input);

      // Assert
      expect(result.overallRisk).toBe('extreme');
      expect(result.gateRecommendation).toBe('BLOCK');
      expect(result.locationWeather[0].risk).toBe('extreme');
      expect(result.locationWeather[0].blockers.length).toBeGreaterThan(0);
      expect(result.adjustments).toContain('Consider postponing travel until weather improves');
    });
  });

  describe('execute - Moderate Risk Scenario', () => {
    it('should return ADJUST_REQUIRED for moderate wind', async () => {
      // Arrange
      const input = {
        locations: [
          { lat: 64.75, lng: -18.0, name: 'Highlands', type: 'waypoint' as const },
        ],
        dateRange: {
          start: new Date('2026-07-15'),
          end: new Date('2026-07-16'),
        },
        riskTolerance: 'medium' as const,
      };

      mockWeatherService.getNearestWeatherStation.mockResolvedValue({
        regionKey: 'highlands_center',
        regionName: 'Highlands Center',
        temperature: 8.0,
        windSpeed: 16.0, // 15-20 m/s = moderate
        visibility: 8000,
        conditions: 'Windy',
        weatherCode: '3',
        warnings: ['Moderate wind conditions (16.0 m/s)'],
        risks: [{ type: 'MODERATE_WIND' }],
      });

      // Act
      const result = await skill.execute(input);

      // Assert
      expect(result.overallRisk).toBe('moderate');
      expect(result.gateRecommendation).toBe('ADJUST_REQUIRED');
      expect(result.locationWeather[0].warnings).toContain('Moderate wind conditions (16.0 m/s)');
    });
  });

  describe('execute - Risk Tolerance Adjustment', () => {
    it('should apply low risk tolerance (stricter)', async () => {
      // Arrange
      const input = {
        locations: [
          { lat: 64.1466, lng: -21.9426, name: 'Reykjavík', type: 'start' as const },
        ],
        dateRange: {
          start: new Date('2026-07-15'),
          end: new Date('2026-07-16'),
        },
        riskTolerance: 'low' as const, // Strict
      };

      mockWeatherService.getWeatherByLocation.mockResolvedValue({
        regionKey: 'reykjavik',
        regionName: 'Reykjavík',
        temperature: 10.0,
        windSpeed: 13.0, // Would be OK for medium, but warning for low
        visibility: 10000,
        conditions: 'Cloudy',
        weatherCode: '3',
        warnings: [],
        risks: [],
      });

      // Act
      const result = await skill.execute(input);

      // Assert
      expect(result.gateRecommendation).toBe('ADJUST_REQUIRED'); // Stricter threshold
    });

    it('should apply high risk tolerance (more lenient)', async () => {
      // Arrange
      const input = {
        locations: [
          { lat: 64.1466, lng: -21.9426, name: 'Reykjavík', type: 'start' as const },
        ],
        dateRange: {
          start: new Date('2026-07-15'),
          end: new Date('2026-07-16'),
        },
        riskTolerance: 'high' as const, // Lenient
      };

      mockWeatherService.getWeatherByLocation.mockResolvedValue({
        regionKey: 'reykjavik',
        regionName: 'Reykjavík',
        temperature: 10.0,
        windSpeed: 17.0, // Would be warning for medium, but OK for high
        visibility: 10000,
        conditions: 'Windy',
        weatherCode: '3',
        warnings: [],
        risks: [],
      });

      // Act
      const result = await skill.execute(input);

      // Assert
      expect(result.gateRecommendation).toBe('ALLOW'); // More lenient
    });
  });

  describe('execute - Evidence Chain', () => {
    it('should include complete evidence references', async () => {
      // Arrange
      const input = {
        locations: [
          { lat: 64.1466, lng: -21.9426, name: 'Reykjavík', type: 'start' as const },
        ],
        dateRange: {
          start: new Date('2026-07-15'),
          end: new Date('2026-07-16'),
        },
        riskTolerance: 'medium' as const,
      };

      mockWeatherService.getWeatherByLocation.mockResolvedValue({
        regionKey: 'reykjavik',
        regionName: 'Reykjavík',
        temperature: 12.0,
        windSpeed: 5.0,
        visibility: 20000,
        conditions: 'Clear',
        weatherCode: '0',
        warnings: [],
        risks: [],
      });

      // Act
      const result = await skill.execute(input);

      // Assert
      expect(result.evidenceRefs).toBeDefined();
      expect(result.evidenceRefs.length).toBeGreaterThan(0);
      expect(result.evidenceRefs[0]).toHaveProperty('location');
      expect(result.evidenceRefs[0]).toHaveProperty('source', 'iceland-weather-realtime-service');
      expect(result.evidenceRefs[0]).toHaveProperty('timestamp');
      expect(result.evidenceRefs[0]).toHaveProperty('confidence', 0.85);
    });
  });

  describe('execute - Vedur CAP merge', () => {
    it('merges active CAP headlines into warnings and exposes vedurCap', async () => {
      mockVedurCap.fetchActiveCapAlerts.mockResolvedValue({
        ok: true,
        items: [{ identifier: 'x1', headline: 'Orange wind warning — South', severity: 'orange' }],
        fetchedAt: new Date('2026-07-15T08:00:00Z'),
        sourcePath: '/v1/meteoalarm/active',
      });

      mockWeatherService.getWeatherByLocation.mockResolvedValue({
        regionKey: 'reykjavik',
        regionName: 'Reykjavík',
        forecastTime: new Date('2026-07-15'),
        validFrom: new Date('2026-07-15'),
        validUntil: new Date('2026-07-16'),
        location: { lat: 64.1466, lng: -21.9426 },
        temperature: 12.0,
        windSpeed: 5.0,
        visibility: 20000,
        conditions: 'Partly cloudy',
        weatherCode: '2',
        warnings: [],
        hazards: [],
        dataSource: 'open-meteo',
        confidence: 0.85,
      });

      const input = {
        locations: [{ lat: 64.1466, lng: -21.9426, name: 'Reykjavík', type: 'start' as const }],
        dateRange: { start: new Date('2026-07-15'), end: new Date('2026-07-16') },
        riskTolerance: 'medium' as const,
      };

      const result = await skill.execute(input);

      expect(result.vedurCap?.ok).toBe(true);
      expect(result.vedurCap?.items.length).toBe(1);
      expect(result.evidenceRefs.some((r) => r.type === 'vedur_cap_alerts')).toBe(true);
      expect(result.locationWeather[0].warnings.some((w) => w.includes('Veðurstofa'))).toBe(true);
    });

    it('prefers geographic CAP near point over national list', async () => {
      mockVedurCap.fetchActiveCapAlerts.mockResolvedValue({
        ok: true,
        items: [{ identifier: 'nat', headline: 'National flood notice', severity: 'yellow' }],
        fetchedAt: new Date('2026-07-15T08:00:00Z'),
        sourcePath: '/v1/meteoalarm/active',
      });
      mockVedurCap.fetchCapAlertsNear.mockResolvedValue({
        ok: true,
        items: [{ identifier: 'near', headline: 'Local wind alert near point', severity: 'orange' }],
        fetchedAt: new Date('2026-07-15T08:05:00Z'),
        sourcePath: '/v1/lat/64.1466/long/-21.9426/srid/4326/distance/75000',
      });

      mockWeatherService.getWeatherByLocation.mockResolvedValue({
        regionKey: 'reykjavik',
        regionName: 'Reykjavík',
        forecastTime: new Date('2026-07-15'),
        validFrom: new Date('2026-07-15'),
        validUntil: new Date('2026-07-16'),
        location: { lat: 64.1466, lng: -21.9426 },
        temperature: 12.0,
        windSpeed: 5.0,
        visibility: 20000,
        conditions: 'Partly cloudy',
        weatherCode: '2',
        warnings: [],
        hazards: [],
        dataSource: 'open-meteo',
        confidence: 0.85,
      });

      const input = {
        locations: [{ lat: 64.1466, lng: -21.9426, name: 'Reykjavík', type: 'start' as const }],
        dateRange: { start: new Date('2026-07-15'), end: new Date('2026-07-16') },
        riskTolerance: 'medium' as const,
      };

      const result = await skill.execute(input);

      expect(result.locationWeather[0].warnings.some((w) => w.includes('Local wind alert near point'))).toBe(true);
      expect(result.locationWeather[0].warnings.some((w) => w.includes('National flood notice'))).toBe(false);
      expect(mockVedurCap.fetchCapAlertsNear).toHaveBeenCalledWith(64.1466, -21.9426);
    });
  });

  describe('execute - Error Handling', () => {
    it('should handle weather service errors gracefully', async () => {
      // Arrange
      const input = {
        locations: [
          { lat: 64.1466, lng: -21.9426, name: 'Reykjavík', type: 'start' as const },
        ],
        dateRange: {
          start: new Date('2026-07-15'),
          end: new Date('2026-07-16'),
        },
        riskTolerance: 'medium' as const,
      };

      mockWeatherService.getWeatherByLocation.mockRejectedValue(new Error('API unavailable'));

      // Act & Assert
      await expect(skill.execute(input)).rejects.toThrow();
    });
  });
});
