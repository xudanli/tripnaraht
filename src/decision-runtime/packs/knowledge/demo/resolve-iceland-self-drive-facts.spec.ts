import {
  mapProfileToRoadBaseType,
  mapVehicleClassExact,
  resolveFactsFromCaseFlags,
} from './resolve-iceland-self-drive-facts';
import type { RoadSegmentProfile } from '../../road/road-segment-profile.types';

describe('resolve-iceland-self-drive-facts', () => {
  it('maps vehicle classes by exact enum / alias, not substring scrape', () => {
    expect(mapVehicleClassExact('SUV_4WD')).toBe('SUV_4WD');
    expect(mapVehicleClassExact('4WD')).toBe('SUV_4WD');
    expect(mapVehicleClassExact('2WD')).toBe('SEDAN');
    expect(mapVehicleClassExact('CAMPERVAN')).toBe('CAMPERVAN');
  });

  it('maps pack road profiles to road base types', () => {
    const fRoad: RoadSegmentProfile = {
      roadId: 'F208',
      segmentId: 'seg',
      roadClass: 'HIGHLAND_F_ROAD',
      surfaceType: 'GRAVEL',
      terrainType: 'HIGHLAND',
      requires4wd: true,
      hasUnbridgedRiver: true,
    };
    expect(mapProfileToRoadBaseType(fRoad)).toBe('F_ROAD');
  });

  it('resolves Decision Case flags via pack profile without inventing gust', () => {
    const facts = resolveFactsFromCaseFlags({
      hasFRoad: true,
      hasGravel: false,
      highWind: true,
      vehicleType: '2WD',
      fRoadIdHint: 'F208',
    });
    expect(facts.vehicleRoadFit.roadSegmentId).toBe('F208');
    expect(facts.vehicleRoadFit.roadBaseType).toBe('F_ROAD');
    expect(facts.weather?.phenomenon).toBe('STRONG_WIND');
    expect(facts.weather?.windGustMs).toBeUndefined();
  });

  it('picks F35 profile by id instead of collapsing to F208', () => {
    const facts = resolveFactsFromCaseFlags({
      hasFRoad: true,
      hasGravel: true,
      vehicleType: 'SUV_4WD',
      fRoadIdHint: 'F35',
    });
    expect(facts.vehicleRoadFit.roadSegmentId).toBe('F35');
    expect(facts.vehicleRoadFit.hasFordCrossing).toBe(false);
  });
});
