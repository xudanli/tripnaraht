import { EvidenceCompletenessChecker } from './evidence-completeness-checker.service';
import { EvidenceType } from '../dto/evidence.dto';
import type { Place } from '@prisma/client';

function makePlace(overrides: Partial<Place> & { id: number; nameEN: string }): Place {
  return {
    id: overrides.id,
    nameEN: overrides.nameEN,
    nameCN: overrides.nameCN ?? null,
    category: overrides.category ?? 'attraction',
    metadata: overrides.metadata ?? {},
    uuid: `place-${overrides.id}`,
    lat: 64,
    lng: -21,
    address: null,
    cityId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    googlePlaceId: null,
    rating: null,
    description: null,
    descriptionCN: null,
    imageUrl: null,
    source: null,
    timezone: null,
    countryCode: 'IS',
  } as Place;
}

describe('EvidenceCompletenessChecker', () => {
  const checker = new EvidenceCompletenessChecker();

  it('defers weather and road evidence during planning phase', () => {
    const farFutureStart = new Date();
    farFutureStart.setUTCDate(farFutureStart.getUTCDate() + 120);

    const places = [
      makePlace({
        id: 1,
        nameEN: 'Seljalandsfoss',
        nameCN: '塞里雅兰瀑布',
        metadata: { canonicalType: 'WATERFALL' },
      }),
    ];

    const result = checker.checkCompleteness(places, [], farFutureStart.toISOString());

    expect(result.completenessScore).toBe(1);
    expect(result.missingEvidence).toHaveLength(0);
    expect(result.readinessPhase).toBe('planning');
    expect(result.deferredEvidenceCount).toBeGreaterThan(0);
  });

  it('counts metadata weather as satisfied evidence', () => {
    const soonStart = new Date();
    soonStart.setUTCDate(soonStart.getUTCDate() + 7);

    const places = [
      makePlace({
        id: 2,
        nameEN: 'Thingvellir',
        nameCN: '辛格维利尔国家公园',
        metadata: { canonicalType: 'NATIONAL_PARK', weatherInfo: { temp: 5 } },
      }),
    ];

    const result = checker.checkCompleteness(places, [], soonStart.toISOString());

    const missingWeather = result.missingEvidence.flatMap((m) => m.missingTypes);
    expect(missingWeather).not.toContain(EvidenceType.WEATHER);
  });

  it('does not require opening hours for outdoor nature POIs', () => {
    const places = [
      makePlace({
        id: 3,
        nameEN: 'Geysir',
        nameCN: '盖歇尔间歇泉',
        metadata: { canonicalType: 'GEYSER' },
      }),
    ];

    const result = checker.checkCompleteness(places, [], undefined);

    expect(result.missingEvidence).toHaveLength(0);
  });
});
