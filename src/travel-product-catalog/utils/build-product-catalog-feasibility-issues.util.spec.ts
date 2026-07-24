import {
  buildProductCatalogFeasibilityIssues,
  mapBoundItemRowToInput,
} from './build-product-catalog-feasibility-issues.util';
import {
  ICELAND_GLACIER_DEMO_OFFERING,
  ICELAND_GLACIER_DEMO_SESSION,
} from '../data/iceland-glacier-hiking-demo.seed';

describe('buildProductCatalogFeasibilityIssues', () => {
  it('emits MEETING_POINT_BUFFER issue for tight transfer', () => {
    const items = [
      mapBoundItemRowToInput({
        id: 'item-1',
        dayNumber: 2,
        tripDayId: 'day-2',
        travelFromPreviousDuration: 10,
        productOfferingId: ICELAND_GLACIER_DEMO_OFFERING.id,
        productSessionId: ICELAND_GLACIER_DEMO_SESSION.id,
        ProductSession: {
          meetTimeLocal: ICELAND_GLACIER_DEMO_SESSION.meetTimeLocal,
          startTimeLocal: ICELAND_GLACIER_DEMO_SESSION.startTimeLocal,
          endTimeLocal: ICELAND_GLACIER_DEMO_SESSION.endTimeLocal,
          status: 'SCHEDULED',
        },
        ProductOffering: {
          minAge: ICELAND_GLACIER_DEMO_OFFERING.minAge,
          maxWeightKg: ICELAND_GLACIER_DEMO_OFFERING.maxWeightKg,
          fitnessRequirement: ICELAND_GLACIER_DEMO_OFFERING.fitnessRequirement,
        },
        ExperienceDefinition: { weatherDependency: 'HIGH' },
        note: JSON.stringify({ hasFallbackPlan: true }),
      }),
    ];

    const issues = buildProductCatalogFeasibilityIssues('trip-1', items);
    expect(issues.some((i) => i.issueKind === 'meeting_point_buffer')).toBe(true);
    expect(
      issues.find((i) => i.issueKind === 'meeting_point_buffer')?.semanticKey,
    ).toBe('MEETING_POINT_BUFFER_INSUFFICIENT');
  });

  it('returns empty when buffer and weather fallback ok', () => {
    const items = [
      mapBoundItemRowToInput({
        id: 'item-ok',
        dayNumber: 1,
        travelFromPreviousDuration: 45,
        ProductSession: {
          meetTimeLocal: '08:30',
          startTimeLocal: '09:00',
          endTimeLocal: '12:00',
          status: 'SCHEDULED',
        },
        ProductOffering: { minAge: 8 },
        ExperienceDefinition: { weatherDependency: 'HIGH' },
        note: JSON.stringify({ hasFallbackPlan: true, arriveLocal: '08:30' }),
      }),
    ];
    expect(buildProductCatalogFeasibilityIssues('trip-1', items)).toEqual([]);
  });
});
