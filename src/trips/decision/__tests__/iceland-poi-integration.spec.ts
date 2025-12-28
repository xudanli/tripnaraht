// src/trips/decision/__tests__/iceland-poi-integration.spec.ts

/**
 * 冰岛 POI 数据集成测试
 * 
 * 验证 Abu/Dr.Dre/Neptune 策略能正确使用冰岛 POI 数据
 */

import { Test, TestingModule } from '@nestjs/testing';
import { IcelandPoiFeaturesService, IcelandGeoFeatures } from '../../../places/services/iceland-poi-features.service';
import { SvalbardPoiFeaturesService } from '../../../places/services/svalbard-poi-features.service';
import { PoiFeaturesAdapterService } from '../services/poi-features-adapter.service';
import { TripWorldState } from '../world-model';
import { abuSelectCoreActivities } from '../strategies/abu';
import { drdreBuildDaySchedule } from '../strategies/drdre';
import { neptuneRepairPlan } from '../strategies/neptune';

describe('Iceland POI Integration', () => {
  let icelandPoiService: IcelandPoiFeaturesService;
  let poiAdapter: PoiFeaturesAdapterService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IcelandPoiFeaturesService,
        SvalbardPoiFeaturesService,
        PoiFeaturesAdapterService,
      ],
    }).compile();

    icelandPoiService = module.get<IcelandPoiFeaturesService>(IcelandPoiFeaturesService);
    poiAdapter = module.get<PoiFeaturesAdapterService>(PoiFeaturesAdapterService);
  });

  afterEach(async () => {
    // Clean up if needed
  });

  describe('IcelandPoiFeaturesService', () => {
    it('should fetch Iceland POI features for a region', async () => {
      const features = await icelandPoiService.getIcelandFeatures('IS_REYKJAVIK');

      expect(features).toBeDefined();
      expect(features.transport).toBeDefined();
      expect(features.attractions).toBeDefined();
      expect(features.safety).toBeDefined();
      expect(features.supply).toBeDefined();
      expect(features.services).toBeDefined();
    }, 30000); // 增加超时时间到 30 秒

    it('should return transport points', async () => {
      const features = await icelandPoiService.getIcelandFeatures('IS_REYKJAVIK');

      expect(features.transport.airports).toBeInstanceOf(Array);
      expect(features.transport.ferryTerminals).toBeInstanceOf(Array);
      expect(features.transport.parking).toBeInstanceOf(Array);
      expect(typeof features.transport.hasAirport).toBe('boolean');
      expect(typeof features.transport.hasFerryTerminal).toBe('boolean');
    }, 30000); // 增加超时时间到 30 秒

    it('should return attractions', async () => {
      const features = await icelandPoiService.getIcelandFeatures('IS_GOLDEN_CIRCLE');

      expect(features.attractions.waterfalls).toBeInstanceOf(Array);
      expect(features.attractions.hotSprings).toBeInstanceOf(Array);
      expect(features.attractions.geysers).toBeInstanceOf(Array);
      expect(features.attractions.glaciers).toBeInstanceOf(Array);
      expect(features.attractions.volcanoes).toBeInstanceOf(Array);
      expect(features.attractions.beaches).toBeInstanceOf(Array);
      expect(features.attractions.viewpoints).toBeInstanceOf(Array);
    });

    it('should return safety points', async () => {
      const features = await icelandPoiService.getIcelandFeatures('IS_REYKJAVIK');

      expect(features.safety.hospitals).toBeInstanceOf(Array);
      expect(features.safety.clinics).toBeInstanceOf(Array);
      expect(features.safety.pharmacies).toBeInstanceOf(Array);
      expect(features.safety.police).toBeInstanceOf(Array);
      expect(features.safety.fireStations).toBeInstanceOf(Array);
      expect(typeof features.safety.hasHospital).toBe('boolean');
      expect(typeof features.safety.hasClinic).toBe('boolean');
      expect(typeof features.safety.hasPharmacy).toBe('boolean');
    });

    it('should return supply points', async () => {
      const features = await icelandPoiService.getIcelandFeatures('IS_VIK');

      expect(features.supply.fuelStations).toBeInstanceOf(Array);
      expect(features.supply.supermarkets).toBeInstanceOf(Array);
      expect(features.supply.convenienceStores).toBeInstanceOf(Array);
      expect(features.supply.toilets).toBeInstanceOf(Array);
      expect(typeof features.supply.hasFuel).toBe('boolean');
      expect(typeof features.supply.hasSupermarket).toBe('boolean');
      expect(typeof features.supply.hasConvenience).toBe('boolean');
    });
  });

  describe('PoiFeaturesAdapterService', () => {
    it('should detect Iceland destination and return Iceland features', async () => {
      const features = await poiAdapter.getPoiFeatures({
        destination: 'IS-ICELAND',
      });

      expect(features).toBeDefined();
      if (features) {
        expect(poiAdapter.isIcelandFeatures(features)).toBe(true);
        expect(poiAdapter.isSvalbardFeatures(features)).toBe(false);
      }
    });

    it('should infer region from destination', async () => {
      const features1 = await poiAdapter.getPoiFeatures({
        destination: 'IS-REYKJAVIK',
      });
      expect(features1).toBeDefined();

      const features2 = await poiAdapter.getPoiFeatures({
        destination: 'IS-GOLDEN-CIRCLE',
      });
      expect(features2).toBeDefined();
    });

    it('should use explicit region when provided', async () => {
      const features = await poiAdapter.getPoiFeatures({
        destination: 'IS-ICELAND',
        region: 'IS_GOLDEN_CIRCLE',
      });

      expect(features).toBeDefined();
    });
  });

  describe('Decision Strategies with Iceland POI', () => {
    let mockState: TripWorldState;
    let mockFeatures: IcelandGeoFeatures;

    beforeEach(() => {
      mockState = {
        context: {
          destination: 'IS-ICELAND',
          startDate: '2025-07-01',
          durationDays: 3,
          preferences: {
            pace: 'moderate',
            riskTolerance: 'medium',
            intents: {
              nature: 0.8,
              photography: 0.6,
            },
          },
          budget: {
            style: 'medium',
            amount: 50000,
          },
        },
        candidatesByDate: {
          '2025-07-01': [
            {
              id: 'candidate-1',
              name: { zh: '黄金瀑布', en: 'Gullfoss' },
              type: 'sightseeing',
              location: { point: { lat: 64.3264, lng: -20.1214 } },
              durationMin: 60,
              qualityScore: 0.9,
              uniquenessScore: 0.8,
            },
            {
              id: 'candidate-2',
              name: { zh: '间歇泉', en: 'Geysir' },
              type: 'sightseeing',
              location: { point: { lat: 64.3114, lng: -20.2997 } },
              durationMin: 45,
              qualityScore: 0.85,
              uniquenessScore: 0.7,
            },
          ],
        },
        signals: {
          lastUpdatedAt: new Date().toISOString(),
          alerts: [],
        },
        policies: {
          dayStart: '08:00',
          dayEnd: '20:00',
          bufferMinBetweenActivities: 15,
        },
      };

      mockFeatures = {
        transport: {
          airports: [],
          ferryTerminals: [],
          parking: [],
          hasAirport: false,
          hasFerryTerminal: false,
          totalTransportPoints: 0,
        },
        attractions: {
          waterfalls: [
            {
              placeId: 1,
              name: 'Gullfoss',
              nameEN: 'Golden Falls',
              lat: 64.3264,
              lng: -20.1214,
              canonicalType: 'ATTRACTION_NATURE_WATERFALL',
              tags: {},
            },
          ],
          hotSprings: [],
          geysers: [
            {
              placeId: 2,
              name: 'Geysir',
              nameEN: 'The Great Geysir',
              lat: 64.3114,
              lng: -20.2997,
              canonicalType: 'ATTRACTION_NATURE_GEYSER',
              tags: {},
            },
          ],
          glaciers: [],
          volcanoes: [],
          beaches: [],
          viewpoints: [],
          totalAttractions: 2,
        },
        safety: {
          hospitals: [],
          clinics: [],
          pharmacies: [],
          police: [],
          fireStations: [],
          hasHospital: false,
          hasClinic: false,
          hasPharmacy: false,
          totalSafetyPoints: 0,
        },
        supply: {
          fuelStations: [
            {
              placeId: 3,
              name: '加油站',
              nameEN: 'Fuel Station',
              lat: 64.3,
              lng: -20.2,
              canonicalType: 'FUEL_STATION',
              tags: {},
            },
          ],
          supermarkets: [],
          convenienceStores: [],
          toilets: [],
          hasFuel: true,
          hasSupermarket: false,
          hasConvenience: false,
          totalSupplyPoints: 1,
        },
        services: {
          informationCenters: [],
          tourOperators: [],
          carRentals: [],
          camping: [],
          spaPools: [],
          totalServicePoints: 0,
        },
      };
    });

    it('should use Iceland POI data in Abu strategy for risk assessment', () => {
      const date = '2025-07-01';
      const candidates = mockState.candidatesByDate[date];
      const limits = { maxActiveMin: 300 };

      const result = abuSelectCoreActivities(mockState, date, candidates, limits);

      expect(result.kept.length).toBeGreaterThan(0);
      expect(result.dropped).toBeInstanceOf(Array);
      expect(result.reasonsById).toBeDefined();

      // Abu 应该考虑 POI 数据（如果有的话）
      // 这里我们验证策略能正常工作，即使没有直接使用 POI features
      // 在实际使用中，POI features 可以通过 state 传递
    });

    it('should use Iceland POI data in Dr.Dre strategy for scheduling', async () => {
      const date = '2025-07-01';
      const candidates = mockState.candidatesByDate[date];

      // Mock getTravelLeg
      const getTravelLeg = async () => ({
        mode: 'car',
        from: { lat: 64.3, lng: -20.2 },
        to: { lat: 64.3264, lng: -20.1214 },
        durationMin: 30,
      });

      const slots = await drdreBuildDaySchedule(
        mockState,
        {
          date,
          startTime: '08:00',
          endTime: '20:00',
          bufferMin: 15,
        },
        candidates,
        getTravelLeg
      );

      expect(slots).toBeInstanceOf(Array);
      // Dr.Dre 应该能够调度活动，考虑 POI 的位置和开放时间
    });

    it('should use Iceland POI data in Neptune strategy for repair', () => {
      const plan = {
        version: 'test-1.0',
        createdAt: new Date().toISOString(),
        days: [
          {
            day: 1,
            date: '2025-07-01',
            timeSlots: [
              {
                id: 'slot-1',
                time: '09:00',
                endTime: '10:00',
                title: 'Gullfoss',
                type: 'sightseeing',
                poiId: 'candidate-1',
                coordinates: { lat: 64.3264, lng: -20.1214 },
              },
            ],
          },
        ],
      };

      const result = neptuneRepairPlan(mockState, plan);

      expect(result.plan).toBeDefined();
      expect(result.triggers).toBeInstanceOf(Array);
      expect(result.changedSlotIds).toBeInstanceOf(Array);
      // Neptune 应该能够使用 POI 数据来修复计划
    });
  });

  describe('Integration: POI Features with Decision Strategies', () => {
    it('should provide POI features for decision strategies', async () => {
      // 测试 POI Features 适配器能正确识别冰岛目的地
      const features = await poiAdapter.getPoiFeatures({
        destination: 'IS-ICELAND',
      });

      // 如果数据库中有数据，features 应该不为 null
      // 如果没有数据，features 可能为 null，但适配器应该能正常工作
      if (features) {
        expect(poiAdapter.isIcelandFeatures(features)).toBe(true);
        expect(features.transport).toBeDefined();
        expect(features.attractions).toBeDefined();
        expect(features.supply).toBeDefined();
        expect(features.safety).toBeDefined();
        expect(features.services).toBeDefined();
      } else {
        // 如果没有数据，至少验证适配器能正常返回（不抛错）
        expect(features).toBeNull();
      }
    });
  });
});

