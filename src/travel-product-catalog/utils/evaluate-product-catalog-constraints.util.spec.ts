import {
  evaluateProductCatalogConstraints,
  localTimeToMinutes,
} from './evaluate-product-catalog-constraints.util';
import {
  ICELAND_GLACIER_DEMO_OFFERING,
  ICELAND_GLACIER_DEMO_SESSION,
} from '../data/iceland-glacier-hiking-demo.seed';

describe('evaluateProductCatalogConstraints', () => {
  const session = {
    meetTimeLocal: ICELAND_GLACIER_DEMO_SESSION.meetTimeLocal,
    startTimeLocal: ICELAND_GLACIER_DEMO_SESSION.startTimeLocal,
    endTimeLocal: ICELAND_GLACIER_DEMO_SESSION.endTimeLocal,
    status: ICELAND_GLACIER_DEMO_SESSION.status,
  };

  it('parses local times', () => {
    expect(localTimeToMinutes('08:30')).toBe(510);
    expect(localTimeToMinutes('9:00')).toBe(540);
  });

  it('passes a well-formed glacier hike binding', () => {
    const v = evaluateProductCatalogConstraints({
      itemStartLocal: '09:00',
      itemEndLocal: '12:00',
      arriveLocal: '08:30',
      session,
      travelFromPreviousMinutes: 45,
      offering: {
        minAge: ICELAND_GLACIER_DEMO_OFFERING.minAge,
        maxWeightKg: ICELAND_GLACIER_DEMO_OFFERING.maxWeightKg,
        fitnessRequirement: ICELAND_GLACIER_DEMO_OFFERING.fitnessRequirement,
      },
      participants: [{ memberId: 'u1', age: 30, fitnessKg: 75, fitnessLevel: 'MODERATE' }],
      weatherDependency: 'HIGH',
      hasFallbackPlan: true,
    });
    expect(v).toEqual([]);
  });

  it('blocks late arrival at meeting point', () => {
    const v = evaluateProductCatalogConstraints({
      itemStartLocal: '09:00',
      itemEndLocal: '12:00',
      arriveLocal: '08:50',
      session,
    });
    expect(v.some((x) => x.constraintKey === 'PRODUCT_SESSION_TIME_WINDOW')).toBe(true);
  });

  it('blocks insufficient meeting buffer', () => {
    const v = evaluateProductCatalogConstraints({
      itemStartLocal: '09:00',
      itemEndLocal: '12:00',
      arriveLocal: '08:30',
      session,
      travelFromPreviousMinutes: 10,
      minBufferMinutes: 30,
    });
    expect(v.some((x) => x.constraintKey === 'MEETING_POINT_BUFFER')).toBe(true);
  });

  it('blocks under-age participants', () => {
    const v = evaluateProductCatalogConstraints({
      session,
      offering: { minAge: 8 },
      participants: [{ memberId: 'kid', age: 6 }],
    });
    expect(v.some((x) => x.constraintKey === 'PRODUCT_PARTICIPANT_ELIGIBILITY')).toBe(true);
  });

  it('warns on high weather dependency without fallback', () => {
    const v = evaluateProductCatalogConstraints({
      session,
      weatherDependency: 'HIGH',
      hasFallbackPlan: false,
    });
    expect(v.some((x) => x.constraintKey === 'PRODUCT_WEATHER_DEPENDENCY')).toBe(true);
  });
});
