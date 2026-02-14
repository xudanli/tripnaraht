// src/skills/world/services/road-status-realtime.service.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { RoadStatusRealtimeService, RoadStatus } from './road-status-realtime.service';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('RoadStatusRealtimeService', () => {
  let service: RoadStatusRealtimeService;
  let mockPrisma: any;
  let mockHttpClient: any;

  const mockLogger = {
    log: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  beforeEach(async () => {
    // Mock Prisma
    mockPrisma = {
      roadStatusRealtime: {
        findFirst: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
    };

    // Mock HTTP Client
    mockHttpClient = {
      get: jest.fn(),
    };

    // Mock axios.create
    mockedAxios.create = jest.fn().mockReturnValue(mockHttpClient);

    // Create service with mocked dependencies
    service = new RoadStatusRealtimeService(mockPrisma as PrismaClient);

    // Override logger
    (service as any).logger = mockLogger;

    jest.clearAllMocks();
  });

  describe('getRoadStatus - Database Cache', () => {
    it('should return cached data when available and fresh', async () => {
      // Arrange
      const mockCachedData = {
        id: 'test-id',
        roadId: 'F208',
        roadName: 'Fjallabaksleið nyrðri',
        currentStatus: 'open',
        statusMessage: 'Road is open and passable',
        lastVerifiedAt: new Date(),
        dataSource: 'road.is_api',
        apiResponse: null,
        hazards: [],
        confidence: 0.9,
        seasonalFallback: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.roadStatusRealtime.findFirst.mockResolvedValue(mockCachedData);

      // Act
      const result = await service.getRoadStatus('F208');

      // Assert
      expect(result).toBeDefined();
      expect(result?.roadId).toBe('F208');
      expect(result?.currentStatus).toBe('open');
      expect(result?.confidence).toBe(0.9);
      expect(mockPrisma.roadStatusRealtime.findFirst).toHaveBeenCalledTimes(1);
      expect(mockHttpClient.get).not.toHaveBeenCalled(); // API not called
      expect(mockLogger.debug).toHaveBeenCalledWith('[DB Cache Hit] F208: open');
    });

    it('should query API when cache is expired', async () => {
      // Arrange
      mockPrisma.roadStatusRealtime.findFirst.mockResolvedValue(null); // Cache miss

      const mockApiResponse = {
        status: 200,
        data: {
          results: [
            {
              road_number: 'F208',
              road_name: 'Fjallabaksleið nyrðri',
              status: 'open',
              status_text: 'Opinn',
              status_text_en: 'Open',
              last_updated: '2026-02-14T10:00:00Z',
              warnings: [],
            },
          ],
        },
      };

      mockHttpClient.get.mockResolvedValue(mockApiResponse);
      mockPrisma.roadStatusRealtime.create.mockResolvedValue({});

      // Act
      const result = await service.getRoadStatus('F208');

      // Assert
      expect(result).toBeDefined();
      expect(result?.roadId).toBe('F208');
      expect(result?.currentStatus).toBe('open');
      expect(result?.dataSource).toBe('road.is_api');
      expect(result?.seasonalFallback).toBe(false);
      expect(mockHttpClient.get).toHaveBeenCalledTimes(1);
      expect(mockPrisma.roadStatusRealtime.create).toHaveBeenCalledTimes(1);
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('[API Success] F208: open')
      );
    });
  });

  describe('getRoadStatus - API Integration', () => {
    beforeEach(() => {
      mockPrisma.roadStatusRealtime.findFirst.mockResolvedValue(null); // Force API call
    });

    it('should handle API success and map data correctly', async () => {
      // Arrange
      const mockApiResponse = {
        status: 200,
        data: {
          results: [
            {
              road_number: 'F26',
              road_name: 'Sprengisandur',
              status: 'closed',
              status_text: 'Lokað',
              status_text_en: 'Closed for winter',
              last_updated: '2026-02-14T10:00:00Z',
              warnings: [
                {
                  type: 'SNOW',
                  severity: 'high',
                  message: 'Heavy snow conditions',
                },
              ],
              conditions: {
                surface: 'snow',
                visibility: 'poor',
                wind_speed_ms: 15,
                temperature_c: -10,
              },
            },
          ],
        },
      };

      mockHttpClient.get.mockResolvedValue(mockApiResponse);
      mockPrisma.roadStatusRealtime.create.mockResolvedValue({});

      // Act
      const result = await service.getRoadStatus('F26');

      // Assert
      expect(result).toBeDefined();
      expect(result?.roadId).toBe('F26');
      expect(result?.roadName).toBe('Sprengisandur');
      expect(result?.currentStatus).toBe('closed');
      expect(result?.statusMessage).toBe('Closed for winter');
      expect(result?.hazards).toHaveLength(1);
      expect(result?.hazards[0].type).toBe('SNOW');
      expect(result?.hazards[0].severity).toBe('high');
      expect(result?.conditions?.windSpeedMs).toBe(15);
      expect(result?.conditions?.temperatureC).toBe(-10);
      expect(result?.confidence).toBe(0.9);
    });

    it('should handle API error and fallback to seasonal data', async () => {
      // Arrange
      mockHttpClient.get.mockRejectedValue(new Error('Network error'));
      mockPrisma.roadStatusRealtime.create.mockResolvedValue({});

      // Mock current month to winter (February)
      jest.spyOn(Date.prototype, 'getMonth').mockReturnValue(1); // February (0-indexed)

      // Act
      const result = await service.getRoadStatus('F208');

      // Assert
      expect(result).toBeDefined();
      expect(result?.roadId).toBe('F208');
      expect(result?.currentStatus).toBe('closed'); // Winter = closed for highland roads
      expect(result?.dataSource).toBe('static_seasonal_data');
      expect(result?.seasonalFallback).toBe(true);
      expect(result?.confidence).toBe(0.6);
      expect(result?.hazards.some(h => h.type === 'UNVERIFIED_STATUS')).toBe(true);
      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('降级到静态数据源'));
    });

    it('should handle API returning non-200 status code', async () => {
      // Arrange
      mockHttpClient.get.mockResolvedValue({
        status: 500,
        data: null,
      });
      mockPrisma.roadStatusRealtime.create.mockResolvedValue({});

      // Act
      const result = await service.getRoadStatus('F35');

      // Assert
      expect(result).toBeDefined();
      expect(result?.dataSource).toBe('static_seasonal_data');
      expect(result?.seasonalFallback).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('API 返回错误状态码: 500')
      );
    });

    it('should handle API returning empty results', async () => {
      // Arrange
      mockHttpClient.get.mockResolvedValue({
        status: 200,
        data: { results: [] },
      });
      mockPrisma.roadStatusRealtime.create.mockResolvedValue({});

      // Act
      const result = await service.getRoadStatus('F910');

      // Assert
      expect(result).toBeDefined();
      expect(result?.dataSource).toBe('static_seasonal_data');
      expect(result?.seasonalFallback).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('API 未返回 F910 的数据')
      );
    });
  });

  describe('getRoadStatus - Seasonal Fallback Logic', () => {
    beforeEach(() => {
      mockPrisma.roadStatusRealtime.findFirst.mockResolvedValue(null);
      mockHttpClient.get.mockRejectedValue(new Error('API unavailable'));
      mockPrisma.roadStatusRealtime.create.mockResolvedValue({});
    });

    it('should return "closed" for highland roads in winter (Feb)', async () => {
      // Arrange
      jest.spyOn(Date.prototype, 'getMonth').mockReturnValue(1); // February

      // Act
      const result = await service.getRoadStatus('F208');

      // Assert
      expect(result?.currentStatus).toBe('closed');
      expect(result?.statusMessage).toContain('Typically closed in winter');
      expect(result?.hazards.some(h => h.type === 'MANUAL_VERIFICATION_REQUIRED')).toBe(true);
    });

    it('should return "limited" for highland roads in summer (July)', async () => {
      // Arrange
      jest.spyOn(Date.prototype, 'getMonth').mockReturnValue(6); // July (0-indexed)

      // Act
      const result = await service.getRoadStatus('F208');

      // Assert
      expect(result?.currentStatus).toBe('limited');
      expect(result?.statusMessage).toContain('Typically open in summer');
      expect(result?.hazards.some(h => h.type === 'UNVERIFIED_STATUS')).toBe(true);
    });

    it('should include known road information for F208', async () => {
      // Arrange
      jest.spyOn(Date.prototype, 'getMonth').mockReturnValue(6); // July

      // Act
      const result = await service.getRoadStatus('F208');

      // Assert
      expect(result?.roadName).toBe('Fjallabaksleið nyrðri');
      expect(result?.hazards.some(h => h.description.includes('Late June - Early September'))).toBe(true);
    });
  });

  describe('getAllRoadStatuses - Batch Processing', () => {
    it('should fetch all F-roads with batch processing', async () => {
      // Arrange
      mockPrisma.roadStatusRealtime.findFirst.mockResolvedValue(null);

      // Mock API responses for first batch (5 roads)
      mockHttpClient.get.mockResolvedValue({
        status: 200,
        data: {
          results: [
            {
              road_number: 'F208',
              road_name: 'Fjallabaksleið nyrðri',
              status: 'open',
              status_text_en: 'Open',
              last_updated: '2026-02-14T10:00:00Z',
              warnings: [],
            },
          ],
        },
      });

      mockPrisma.roadStatusRealtime.create.mockResolvedValue({});

      // Mock setTimeout to avoid actual delays
      jest.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
        callback();
        return {} as any;
      });

      // Act
      const results = await service.getAllRoadStatuses();

      // Assert
      expect(results.size).toBeGreaterThan(0);
      expect(results.has('F208')).toBe(true);
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('开始获取')
      );
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('成功获取')
      );

      // Cleanup
      (global.setTimeout as jest.Mock).mockRestore();
    });
  });

  describe('isRoadOpen / isRoadClosed', () => {
    it('should return true when road is open', async () => {
      // Arrange
      mockPrisma.roadStatusRealtime.findFirst.mockResolvedValue({
        roadId: 'F208',
        currentStatus: 'open',
        lastVerifiedAt: new Date(),
        hazards: [],
      });

      // Act
      const result = await service.isRoadOpen('F208');

      // Assert
      expect(result).toBe(true);
    });

    it('should return false when road is closed', async () => {
      // Arrange
      mockPrisma.roadStatusRealtime.findFirst.mockResolvedValue({
        roadId: 'F208',
        currentStatus: 'closed',
        lastVerifiedAt: new Date(),
        hazards: [],
      });

      // Act
      const result = await service.isRoadOpen('F208');

      // Assert
      expect(result).toBe(false);
    });

    it('should return true when road is closed (isRoadClosed)', async () => {
      // Arrange
      mockPrisma.roadStatusRealtime.findFirst.mockResolvedValue({
        roadId: 'F26',
        currentStatus: 'closed',
        lastVerifiedAt: new Date(),
        hazards: [],
      });

      // Act
      const result = await service.isRoadClosed('F26');

      // Assert
      expect(result).toBe(true);
    });
  });

  describe('normalizeStatus / normalizeSeverity', () => {
    it('should normalize various status formats', async () => {
      // Test via mapToTripNARAFormat (private method accessed through public API)
      mockPrisma.roadStatusRealtime.findFirst.mockResolvedValue(null);

      const testCases = [
        { input: 'OPEN', expected: 'open' },
        { input: 'closed', expected: 'closed' },
        { input: 'LIMITED', expected: 'limited' },
        { input: 'unknown_status', expected: 'unknown' },
      ];

      for (const testCase of testCases) {
        mockHttpClient.get.mockResolvedValue({
          status: 200,
          data: {
            results: [
              {
                road_number: 'TEST',
                status: testCase.input,
                status_text_en: 'Test',
                last_updated: '2026-02-14T10:00:00Z',
                warnings: [],
              },
            ],
          },
        });

        mockPrisma.roadStatusRealtime.create.mockResolvedValue({});

        const result = await service.getRoadStatus('TEST');
        expect(result?.currentStatus).toBe(testCase.expected);
      }
    });
  });

  describe('Database Error Handling', () => {
    it('should continue when database read fails', async () => {
      // Arrange
      mockPrisma.roadStatusRealtime.findFirst.mockRejectedValue(new Error('DB connection error'));

      mockHttpClient.get.mockResolvedValue({
        status: 200,
        data: {
          results: [
            {
              road_number: 'F208',
              status: 'open',
              status_text_en: 'Open',
              last_updated: '2026-02-14T10:00:00Z',
              warnings: [],
            },
          ],
        },
      });

      mockPrisma.roadStatusRealtime.create.mockResolvedValue({});

      // Act
      const result = await service.getRoadStatus('F208');

      // Assert
      expect(result).toBeDefined();
      expect(result?.currentStatus).toBe('open');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('[DB Query Error]'),
        expect.any(Error)
      );
    });

    it('should continue when database write fails', async () => {
      // Arrange
      mockPrisma.roadStatusRealtime.findFirst.mockResolvedValue(null);

      mockHttpClient.get.mockResolvedValue({
        status: 200,
        data: {
          results: [
            {
              road_number: 'F208',
              status: 'open',
              status_text_en: 'Open',
              last_updated: '2026-02-14T10:00:00Z',
              warnings: [],
            },
          ],
        },
      });

      mockPrisma.roadStatusRealtime.create.mockRejectedValue(new Error('DB write error'));

      // Act
      const result = await service.getRoadStatus('F208');

      // Assert
      expect(result).toBeDefined();
      expect(result?.currentStatus).toBe('open');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('[DB Write Error]'),
        expect.any(Error)
      );
    });
  });

  describe('Evidence Chain and Confidence', () => {
    it('should return high confidence (0.9) for API data', async () => {
      // Arrange
      mockPrisma.roadStatusRealtime.findFirst.mockResolvedValue(null);

      mockHttpClient.get.mockResolvedValue({
        status: 200,
        data: {
          results: [
            {
              road_number: 'F208',
              status: 'open',
              status_text_en: 'Open',
              last_updated: '2026-02-14T10:00:00Z',
              warnings: [],
            },
          ],
        },
      });

      mockPrisma.roadStatusRealtime.create.mockResolvedValue({});

      // Act
      const result = await service.getRoadStatus('F208');

      // Assert
      expect(result?.confidence).toBe(0.9);
      expect(result?.dataSource).toBe('road.is_api');
      expect(result?.seasonalFallback).toBe(false);
    });

    it('should return low confidence (0.6) for fallback data', async () => {
      // Arrange
      mockPrisma.roadStatusRealtime.findFirst.mockResolvedValue(null);
      mockHttpClient.get.mockRejectedValue(new Error('API error'));
      mockPrisma.roadStatusRealtime.create.mockResolvedValue({});

      // Act
      const result = await service.getRoadStatus('F208');

      // Assert
      expect(result?.confidence).toBe(0.6);
      expect(result?.dataSource).toBe('static_seasonal_data');
      expect(result?.seasonalFallback).toBe(true);
    });

    it('should preserve full API response for evidence chain', async () => {
      // Arrange
      mockPrisma.roadStatusRealtime.findFirst.mockResolvedValue(null);

      const fullApiResponse = {
        results: [
          {
            road_number: 'F208',
            status: 'open',
            status_text_en: 'Open',
            last_updated: '2026-02-14T10:00:00Z',
            warnings: [],
          },
        ],
      };

      mockHttpClient.get.mockResolvedValue({
        status: 200,
        data: fullApiResponse,
      });

      mockPrisma.roadStatusRealtime.create.mockResolvedValue({});

      // Act
      const result = await service.getRoadStatus('F208');

      // Assert
      expect(result?.apiResponse).toEqual(fullApiResponse);
    });
  });
});
