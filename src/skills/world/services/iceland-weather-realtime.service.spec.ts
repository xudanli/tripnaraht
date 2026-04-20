// src/skills/world/services/iceland-weather-realtime.service.spec.ts

import { Logger } from '@nestjs/common';
import { IcelandWeatherRealtimeService } from './iceland-weather-realtime.service';
import axios from 'axios';

describe('IcelandWeatherRealtimeService', () => {
  let service: IcelandWeatherRealtimeService;
  let httpClient: { get: jest.Mock };

  const mockPrisma = {
    weatherForecastRealtime: {
      findFirst: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
  };

  const mockLogger = {
    log: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    httpClient = { get: jest.fn() };
    jest.spyOn(axios, 'create').mockReturnValue(httpClient as any);

    service = new IcelandWeatherRealtimeService(mockPrisma as any);
    // service 内部使用 new Logger(...)；这里替换为可断言的 mock
    (service as any).logger = mockLogger as unknown as Logger;
  });

  describe('getWeatherByLocation', () => {
    it('should return cached weather data when available', async () => {
      // Arrange
      const mockWeatherData = {
        id: 'test-id',
        regionKey: 'reykjavik',
        regionName: 'Reykjavík',
        forecastTime: new Date(),
        validFrom: new Date(),
        validUntil: new Date(Date.now() + 3600000),
        temperature: -5.9,
        windSpeed: 2.8,
        windDirection: 104,
        precipitation: 0,
        visibility: 38280,
        conditions: 'Overcast',
        weatherCode: '3',
        warnings: [],
        hazards: [],
        dataSource: 'open-meteo',
        confidence: 0.85,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.weatherForecastRealtime.findFirst.mockResolvedValue(mockWeatherData);

      // Act
      const result = await service.getWeatherByLocation(64.1466, -21.9426);

      // Assert
      expect(result).not.toBeNull();
      if (!result) throw new Error('expected cached weather');
      expect(result.regionName).toBe('Reykjavík');
      expect(result.temperature).toBe(-5.9);
      expect(result.windSpeed).toBe(2.8);
      expect(mockPrisma.weatherForecastRealtime.findFirst).toHaveBeenCalledTimes(1);
      expect(mockLogger.debug).toHaveBeenCalledWith('[DB Cache Hit] reykjavik');
    });

    it('should fetch from API when cache is expired', async () => {
      // Arrange
      mockPrisma.weatherForecastRealtime.findFirst.mockResolvedValue(null);

      httpClient.get.mockResolvedValue({
        status: 200,
        data: {
          hourly: {
            time: ['2026-02-14T18:00'],
            temperature_2m: [-5.9],
            windspeed_10m: [2.8],
            winddirection_10m: [104],
            precipitation: [0],
            visibility: [38280],
            weathercode: [3],
          },
          current_weather: {
            time: '2026-02-14T18:00',
            temperature: -5.9,
            windspeed: 2.8,
            winddirection: 104,
            weathercode: 3,
          },
        },
      });

      mockPrisma.weatherForecastRealtime.create.mockResolvedValue({
        id: 'new-id',
        regionKey: 'reykjavik',
        regionName: 'Reykjavík',
        temperature: -5.9,
      });

      // Act
      const result = await service.getWeatherByLocation(64.1466, -21.9426);

      // Assert
      expect(result).toBeDefined();
      expect(httpClient.get).toHaveBeenCalled();
      expect(mockPrisma.weatherForecastRealtime.create).toHaveBeenCalled();
    });

    it('should handle API errors gracefully', async () => {
      // Arrange
      mockPrisma.weatherForecastRealtime.findFirst.mockResolvedValue(null);
      httpClient.get.mockRejectedValue(new Error('Network error'));

      // Act & Assert（实现选择降级返回 null）
      await expect(service.getWeatherByLocation(64.1466, -21.9426)).resolves.toBeNull();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('hasHazardousWeather', () => {
    it('should return true for extreme wind conditions', async () => {
      // Arrange
      const mockWeatherData = {
        id: 'test-id',
        regionKey: 'highlands_center',
        regionName: 'Highlands Center',
        windSpeed: 25.0, // > 20 m/s
        hazards: [{ type: 'EXTREME_WIND', severity: 'high', description: 'Extreme wind' }],
        warnings: [],
        forecastTime: new Date(),
        validFrom: new Date(),
        validUntil: new Date(Date.now() + 3600000),
        dataSource: 'open-meteo',
        confidence: 0.85,
        createdAt: new Date(),
      };

      mockPrisma.weatherForecastRealtime.findFirst.mockResolvedValue(mockWeatherData);

      // Act
      const result = await service.hasHazardousWeather(64.75, -18.0);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false for safe weather conditions', async () => {
      // Arrange
      const mockWeatherData = {
        id: 'test-id',
        regionKey: 'reykjavik',
        regionName: 'Reykjavík',
        windSpeed: 2.8,
        risks: [],
        createdAt: new Date(),
      };

      mockPrisma.weatherForecastRealtime.findFirst.mockResolvedValue(mockWeatherData);

      // Act
      const result = await service.hasHazardousWeather(64.1466, -21.9426);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('getNearestWeatherStation', () => {
    it('should return nearest station based on distance', async () => {
      // Arrange
      const lat = 63.4181;
      const lng = -19.0059; // Vík

      const mockWeatherData = {
        regionKey: 'vik',
        regionName: 'Vík í Mýrdal',
        temperature: -2.0,
        windSpeed: 1.6,
      };

      mockPrisma.weatherForecastRealtime.findFirst.mockResolvedValue(mockWeatherData);

      // Act
      const result = await service.getNearestWeatherStation(lat, lng);

      // Assert
      expect(result).not.toBeNull();
      if (!result) throw new Error('expected nearest forecast');
      expect(result.regionName).toBe('Vík í Mýrdal');
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('最近的气象站'));
    });
  });

  describe('getAllRegionsWeather', () => {
    it('should return weather for all 7 regions', async () => {
      // Arrange
      const mockWeatherArray = [
        { regionKey: 'reykjavik', regionName: 'Reykjavík', temperature: -5.9 },
        { regionKey: 'akureyri', regionName: 'Akureyri', temperature: -8.0 },
        { regionKey: 'isafjordur', regionName: 'Ísafjörður', temperature: -3.0 },
        { regionKey: 'egilsstadir', regionName: 'Egilsstaðir', temperature: -6.0 },
        { regionKey: 'hofn', regionName: 'Höfn', temperature: -2.0 },
        { regionKey: 'highlands_center', regionName: 'Highlands Center', temperature: -12.6 },
        { regionKey: 'vik', regionName: 'Vík í Mýrdal', temperature: -2.0 },
      ];

      mockPrisma.weatherForecastRealtime.findFirst.mockImplementation(({ where }) => {
        return Promise.resolve(
          mockWeatherArray.find(w => w.regionKey === where.regionKey)
        );
      });

      // Act
      const result = await service.getAllRegionsWeather();

      // Assert
      expect(result.size).toBe(7);
      expect(result.get('reykjavik')?.regionName).toBe('Reykjavík');
      expect(result.get('highlands_center')?.temperature).toBe(-12.6);
    });
  });
});
