// src/data-quality/services/__tests__/geographic-data-validator.service.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { GeographicDataValidatorService } from '../geographic-data-validator.service';

describe('GeographicDataValidatorService', () => {
  let service: GeographicDataValidatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GeographicDataValidatorService],
    }).compile();

    service = module.get<GeographicDataValidatorService>(GeographicDataValidatorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateCoordinates', () => {
    it('should validate valid coordinates', () => {
      const result = service.validateCoordinates(64.1265, -21.8174);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should reject invalid latitude (too high)', () => {
      const result = service.validateCoordinates(91, -21.8174);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].field).toBe('lat');
    });

    it('should reject invalid latitude (too low)', () => {
      const result = service.validateCoordinates(-91, -21.8174);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject invalid longitude (too high)', () => {
      const result = service.validateCoordinates(64.1265, 181);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].field).toBe('lng');
    });

    it('should reject invalid longitude (too low)', () => {
      const result = service.validateCoordinates(64.1265, -181);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should warn about low precision', () => {
      const result = service.validateCoordinates(64.1, -21.8);
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should reject non-number latitude', () => {
      const result = service.validateCoordinates(NaN, -21.8174);
      expect(result.valid).toBe(false);
      expect(result.errors[0].field).toBe('lat');
    });
  });

  describe('validateSpatialRange', () => {
    it('should validate coordinates within country bounds', () => {
      const coordinates = [
        { lat: 46.5197, lng: 6.6323 }, // 日内瓦（瑞士）
        { lat: 47.3769, lng: 8.5417 }, // 苏黎世（瑞士）
      ];
      
      const result = service.validateSpatialRange(coordinates, 'CH');
      expect(result.valid).toBe(true);
    });

    it('should warn about coordinates outside country bounds', () => {
      const coordinates = [
        { lat: 46.5197, lng: 6.6323 }, // 日内瓦（瑞士）
        { lat: 59.9139, lng: 10.7522 }, // 奥斯陆（挪威）- 超出瑞士边界
      ];
      
      const result = service.validateSpatialRange(coordinates, 'CH');
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should reject empty coordinates array', () => {
      const result = service.validateSpatialRange([], 'CH');
      expect(result.valid).toBe(false);
      expect(result.errors[0].field).toBe('coordinates');
    });

    it('should warn about unknown country code', () => {
      const coordinates = [{ lat: 46.5197, lng: 6.6323 }];
      const result = service.validateSpatialRange(coordinates, 'XX');
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('validateCoordinateSystemConsistency', () => {
    it('should validate consistent coordinate system', () => {
      const data = [
        { lat: 64.1265, lng: -21.8174 },
        { lat: 65.0, lng: -20.0 },
      ];
      
      const result = service.validateCoordinateSystemConsistency(data);
      expect(result.valid).toBe(true);
    });

    it('should reject inconsistent coordinates', () => {
      const data = [
        { lat: 64.1265, lng: -21.8174 },
        { lat: 91, lng: -20.0 }, // 无效坐标
      ];
      
      const result = service.validateCoordinateSystemConsistency(data);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle empty data', () => {
      const result = service.validateCoordinateSystemConsistency([]);
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('validateSpatialTopology', () => {
    it('should validate valid GeoJSON features', () => {
      const features = [
        {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [-21.8174, 64.1265], // GeoJSON格式：[lng, lat]
          },
        },
      ];
      
      const result = service.validateSpatialTopology(features);
      expect(result.valid).toBe(true);
    });

    it('should reject features without geometry', () => {
      const features = [
        {
          type: 'Feature',
          geometry: null,
        },
      ];
      
      const result = service.validateSpatialTopology(features);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should warn about unknown geometry type', () => {
      const features = [
        {
          type: 'Feature',
          geometry: {
            type: 'UnknownType',
            coordinates: [-21.8174, 64.1265],
          },
        },
      ];
      
      const result = service.validateSpatialTopology(features);
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('validateCoordinatesBatch', () => {
    it('should validate batch of coordinates', () => {
      const coordinates = [
        { lat: 64.1265, lng: -21.8174 },
        { lat: 65.0, lng: -20.0 },
      ];
      
      const result = service.validateCoordinatesBatch(coordinates);
      expect(result.valid).toBe(true);
    });

    it('should reject batch with invalid coordinates', () => {
      const coordinates = [
        { lat: 64.1265, lng: -21.8174 },
        { lat: 91, lng: -20.0 }, // 无效坐标
      ];
      
      const result = service.validateCoordinatesBatch(coordinates);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('extractCoordinatesFromPhysicalRealityData', () => {
    it('should extract coordinates from road-status data', () => {
      const data = {
        segments: [
          {
            start: { lat: 46.5197, lng: 6.6323 },
            end: { lat: 47.3769, lng: 8.5417 },
          },
        ],
      };
      
      const coordinates = service.extractCoordinatesFromPhysicalRealityData(data);
      expect(coordinates.length).toBe(2);
      expect(coordinates[0]).toEqual({ lat: 46.5197, lng: 6.6323 });
      expect(coordinates[1]).toEqual({ lat: 47.3769, lng: 8.5417 });
    });

    it('should extract coordinates from ferry-schedules data', () => {
      const data = {
        routes: [
          {
            origin: { lat: 64.1265, lng: -21.8174 },
            destination: { lat: 65.0, lng: -20.0 },
          },
        ],
      };
      
      const coordinates = service.extractCoordinatesFromPhysicalRealityData(data);
      expect(coordinates.length).toBe(2);
    });

    it('should extract coordinates from weather-windows data', () => {
      const data = {
        regions: [
          {
            center: { lat: 64.1265, lng: -21.8174 },
          },
        ],
      };
      
      const coordinates = service.extractCoordinatesFromPhysicalRealityData(data);
      expect(coordinates.length).toBe(1);
    });

    it('should return empty array for data without coordinates', () => {
      const data = {};
      const coordinates = service.extractCoordinatesFromPhysicalRealityData(data);
      expect(coordinates.length).toBe(0);
    });
  });
});
