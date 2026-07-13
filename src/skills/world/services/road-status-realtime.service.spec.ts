// src/skills/world/services/road-status-realtime.service.spec.ts

import { RoadStatusRealtimeService } from './road-status-realtime.service';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const GAGNAVEITA_F208_PAYLOAD = [
  {
    IdButur: 913020036,
    DagsSkrad: '2026-07-10T02:55:01Z',
    StuttNafnButs: 'Búland-Eldgjá',
    FulltNafnButs: 'Fjallabaksleið nyrðri: Búland - Eldgjá',
    DagsButurBreyttist: '2025-11-20T10:47:31Z',
    AstandYfirbord: 'GREIDFAERT',
    AstandVidbotaruppl: null,
    AstandLysing: 'Greiðfært',
    AstandLysingEn: 'Easily passable',
    FrkvAudkenni: null,
    FrkvLysing: null,
    FrkvLysingEn: null,
    AsthunAudkenni: null,
    AsthunLysing: null,
    AsthunLysingEn: null,
    Snjomokstursregla: 'EKKI_MOKAD',
    DagsKeyrtUt: '2026-07-10T20:00:52Z',
  },
  {
    IdButur: 913040036,
    DagsSkrad: '2026-07-10T02:55:01Z',
    StuttNafnButs: 'Sigalda-Landmannalaugar',
    FulltNafnButs: 'Fjallabaksleið nyrðri: Sigalda - Landmannalaugar',
    DagsButurBreyttist: '2025-11-20T10:47:31Z',
    AstandYfirbord: 'FAERT_FJALLABILUM',
    AstandVidbotaruppl: 'FAERT_FJALLABILUM',
    AstandLysing: 'Fært fjallabílum',
    AstandLysingEn: 'Mountain vehicles',
    FrkvAudkenni: null,
    FrkvLysing: null,
    FrkvLysingEn: null,
    AsthunAudkenni: null,
    AsthunLysing: null,
    AsthunLysingEn: null,
    Snjomokstursregla: 'EKKI_MOKAD',
    DagsKeyrtUt: '2026-07-10T20:00:52Z',
  },
];

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
    process.env.ROAD_STATUS_LIVE_SOURCE = 'gagnaveita';
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

    it('should query Gagnaveita when cache is expired', async () => {
      mockPrisma.roadStatusRealtime.findFirst.mockResolvedValue(null);

      mockHttpClient.get.mockResolvedValue({
        status: 200,
        data: GAGNAVEITA_F208_PAYLOAD,
      });
      mockPrisma.roadStatusRealtime.create.mockResolvedValue({});

      const result = await service.getRoadStatus('F208');

      expect(result).toBeDefined();
      expect(result?.roadId).toBe('F208');
      expect(result?.currentStatus).toBe('limited');
      expect(result?.dataSource).toBe('vegagerdin_gagnaveita');
      expect(result?.seasonalFallback).toBe(false);
      expect(mockHttpClient.get).toHaveBeenCalledTimes(1);
      expect(mockPrisma.roadStatusRealtime.create).toHaveBeenCalledTimes(1);
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('[Gagnaveita Success] F208: limited'),
      );
    });
  });

  describe('getRoadStatus - Gagnaveita Integration', () => {
    beforeEach(() => {
      mockPrisma.roadStatusRealtime.findFirst.mockResolvedValue(null);
    });

    it('should handle Gagnaveita success and rollup F208 status', async () => {
      mockHttpClient.get.mockResolvedValue({
        status: 200,
        data: GAGNAVEITA_F208_PAYLOAD,
      });
      mockPrisma.roadStatusRealtime.create.mockResolvedValue({});

      const result = await service.getRoadStatus('F208');

      expect(result).toBeDefined();
      expect(result?.roadId).toBe('F208');
      expect(result?.currentStatus).toBe('limited');
      expect(result?.dataSource).toBe('vegagerdin_gagnaveita');
      expect(result?.confidence).toBe(0.88);
    });

    it('should handle Gagnaveita error and fallback to seasonal data', async () => {
      mockHttpClient.get.mockRejectedValue(new Error('Network error'));
      mockPrisma.roadStatusRealtime.create.mockResolvedValue({});
      jest.spyOn(Date.prototype, 'getMonth').mockReturnValue(1);

      const result = await service.getRoadStatus('F208');

      expect(result).toBeDefined();
      expect(result?.currentStatus).toBe('closed');
      expect(result?.dataSource).toBe('static_seasonal_data');
      expect(result?.seasonalFallback).toBe(true);
    });

    it('should handle Gagnaveita returning non-200 status code', async () => {
      mockHttpClient.get.mockResolvedValue({ status: 500, data: null });
      mockPrisma.roadStatusRealtime.create.mockResolvedValue({});

      const result = await service.getRoadStatus('F35');

      expect(result).toBeDefined();
      expect(result?.dataSource).toBe('static_seasonal_data');
      expect(result?.seasonalFallback).toBe(true);
    });

    it('should handle Gagnaveita returning empty array', async () => {
      mockHttpClient.get.mockResolvedValue({ status: 200, data: [] });
      mockPrisma.roadStatusRealtime.create.mockResolvedValue({});

      const result = await service.getRoadStatus('F910');

      expect(result).toBeDefined();
      expect(result?.dataSource).toBe('static_seasonal_data');
      expect(result?.seasonalFallback).toBe(true);
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
    it('should fetch F-roads from single Gagnaveita payload', async () => {
      mockPrisma.roadStatusRealtime.findFirst.mockResolvedValue(null);
      mockHttpClient.get.mockResolvedValue({
        status: 200,
        data: GAGNAVEITA_F208_PAYLOAD,
      });
      mockPrisma.roadStatusRealtime.create.mockResolvedValue({});

      const results = await service.getAllRoadStatuses();

      expect(results.size).toBeGreaterThan(0);
      expect(results.has('F208')).toBe(true);
      expect(mockHttpClient.get).toHaveBeenCalledTimes(1);
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('Gagnaveita'),
      );
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

  describe('Database Error Handling', () => {
    it('should continue when database read fails', async () => {
      mockPrisma.roadStatusRealtime.findFirst.mockRejectedValue(new Error('DB connection error'));
      mockHttpClient.get.mockResolvedValue({ status: 200, data: GAGNAVEITA_F208_PAYLOAD });
      mockPrisma.roadStatusRealtime.create.mockResolvedValue({});

      const result = await service.getRoadStatus('F208');

      expect(result).toBeDefined();
      expect(result?.currentStatus).toBe('limited');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('[DB Query Error]'),
        expect.any(Error),
      );
    });

    it('should continue when database write fails', async () => {
      mockPrisma.roadStatusRealtime.findFirst.mockResolvedValue(null);
      mockHttpClient.get.mockResolvedValue({ status: 200, data: GAGNAVEITA_F208_PAYLOAD });
      mockPrisma.roadStatusRealtime.create.mockRejectedValue(new Error('DB write error'));

      const result = await service.getRoadStatus('F208');

      expect(result).toBeDefined();
      expect(result?.currentStatus).toBe('limited');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('[DB Write Error]'),
        expect.any(Error),
      );
    });
  });

  describe('Evidence Chain and Confidence', () => {
    it('should return high confidence (0.88) for Gagnaveita data', async () => {
      mockPrisma.roadStatusRealtime.findFirst.mockResolvedValue(null);
      mockHttpClient.get.mockResolvedValue({ status: 200, data: GAGNAVEITA_F208_PAYLOAD });
      mockPrisma.roadStatusRealtime.create.mockResolvedValue({});

      const result = await service.getRoadStatus('F208');

      expect(result?.confidence).toBe(0.88);
      expect(result?.dataSource).toBe('vegagerdin_gagnaveita');
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

    it('should preserve rollup apiResponse for evidence chain', async () => {
      mockPrisma.roadStatusRealtime.findFirst.mockResolvedValue(null);
      mockHttpClient.get.mockResolvedValue({ status: 200, data: GAGNAVEITA_F208_PAYLOAD });
      mockPrisma.roadStatusRealtime.create.mockResolvedValue({});

      const result = await service.getRoadStatus('F208');

      expect(result?.apiResponse?.rollup).toBe(true);
      expect(result?.apiResponse?.segmentCount).toBe(2);
    });
  });
});
