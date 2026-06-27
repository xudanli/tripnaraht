import { PoiAccessCapacityEngineService } from './poi-access-capacity-engine.service';

describe('PoiAccessCapacityEngineService', () => {
  const poiAccess = { evaluate: jest.fn(), getRulesForPoiSlugs: jest.fn() };
  const prisma = { trip: { findUnique: jest.fn() } };
  let service: PoiAccessCapacityEngineService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PoiAccessCapacityEngineService(prisma as never, poiAccess as never);
  });

  it('isIcelandTrip: destination IS', () => {
    expect(service.isIcelandTrip({ destination: 'IS' })).toBe(true);
    expect(service.isIcelandTrip({ destination: 'is' })).toBe(true);
  });

  it('isIcelandTrip: Iceland / 冰岛 / metadata countryCode', () => {
    expect(service.isIcelandTrip({ destination: 'Iceland' })).toBe(true);
    expect(service.isIcelandTrip({ destination: '冰岛环岛' })).toBe(true);
    expect(service.isIcelandTrip({ destination: 'XX', metadata: { countryCode: 'IS' } })).toBe(true);
  });

  it('isIcelandTrip: non-Iceland', () => {
    expect(service.isIcelandTrip({ destination: 'JP' })).toBe(false);
  });
});
