import { DecisionAwarenessAugmentationService } from './decision-awareness-augmentation.service';
import { DecisionFactorFactoryService } from './decision-factor.factory';

describe('DecisionAwarenessAugmentationService', () => {
  it('returns empty when no fact', async () => {
    const resolver = {
      resolveLatestByFactKey: jest.fn().mockResolvedValue(null),
    };
    const factory = new DecisionFactorFactoryService();
    const svc = new DecisionAwarenessAugmentationService(resolver as any, factory);
    const out = await svc.buildWeatherAwarenessForCountry('IS');
    expect(out.decisionFactors).toEqual([]);
    expect(out.decisionImpacts).toEqual([]);
  });

  it('adds WARNING factor and ROUTE_CHANGE impact when wind above threshold', async () => {
    const created = new Date('2026-05-08T12:00:00Z');
    const factRow = {
      id: 'fid',
      factKey: 'country:IS:aggregated_wind_mps',
      subjectType: 'country',
      subjectId: 'IS',
      predicate: 'aggregated_wind_mps',
      valueJson: { mps: 99 },
      confidence: 0.9,
      severity: null,
      sourceType: 'research_shadow',
      sourceRef: 'r',
      validFrom: null,
      validTo: null,
      observedAt: created,
      snapshotVersion: 'v1',
      supersedesFactId: null,
      createdAt: created,
    };
    const resolver = {
      resolveLatestByFactKey: jest.fn().mockResolvedValue({
        fact: factRow,
        freshness: {
          isExpiredByValidTo: false,
          referenceTimeIso: created.toISOString(),
          ageMs: 0,
          freshnessScore: 1,
          validFromIso: null,
          validToIso: null,
        },
      }),
    };
    const factory = new DecisionFactorFactoryService();
    const svc = new DecisionAwarenessAugmentationService(resolver as any, factory);
    const out = await svc.buildWeatherAwarenessForCountry('IS');
    expect(out.decisionFactors.length).toBe(1);
    expect(out.decisionFactors[0]?.impactLevel).toBe('WARNING');
    expect(out.decisionFactors[0]?.effect).toBe('WARNING');
    expect(out.decisionFactors[0]?.target).toBe('ROUTE');
    expect(out.decisionFactors[0]?.actionHint).toBe('DEGRADE_ROUTE');
    expect(out.decisionFactors[0]?.derivedFromFactIds).toEqual(['fid']);
    expect(out.decisionImpacts.length).toBe(1);
    expect(out.decisionImpacts[0]?.impactType).toBe('ROUTE_CHANGE');
    expect(out.decisionImpacts[0]?.derivedFromFactIds).toEqual(['fid']);
  });

  it('buildRouteInteractionsAwareness merges ROAD_ACCESS when routeDirectionId set', async () => {
    const created = new Date('2026-05-08T12:00:00Z');
    const windFact = {
      id: 'w1',
      factKey: 'country:IS:aggregated_wind_mps',
      subjectType: 'country',
      subjectId: 'IS',
      predicate: 'aggregated_wind_mps',
      valueJson: { mps: 99 },
      confidence: 0.9,
      severity: null,
      sourceType: 't',
      sourceRef: null,
      validFrom: null,
      validTo: null,
      observedAt: created,
      snapshotVersion: null,
      supersedesFactId: null,
      createdAt: created,
    };
    const roadFact = {
      id: 'r1',
      factKey: 'route_direction:7:vehicle_required',
      subjectType: 'route_direction',
      subjectId: '7',
      predicate: 'vehicle_required',
      valueJson: { raw: '4WD' },
      confidence: 1,
      severity: null,
      sourceType: 't',
      sourceRef: null,
      validFrom: null,
      validTo: null,
      observedAt: created,
      snapshotVersion: null,
      supersedesFactId: null,
      createdAt: created,
    };
    const resolver = {
      resolveLatestByFactKey: jest.fn().mockImplementation((key: string) => {
        if (key.includes('aggregated_wind_mps')) {
          return {
            fact: windFact,
            freshness: { isExpiredByValidTo: false, freshnessScore: 1 },
          };
        }
        if (key.includes('vehicle_required')) {
          return {
            fact: roadFact,
            freshness: { isExpiredByValidTo: false, freshnessScore: 1 },
          };
        }
        return null;
      }),
    };
    const factory = new DecisionFactorFactoryService();
    const svc = new DecisionAwarenessAugmentationService(resolver as any, factory);
    const out = await svc.buildRouteInteractionsAwareness({
      countryCode: 'IS',
      routeDirectionId: '7',
    });
    expect(out.decisionFactors.length).toBe(2);
    expect(out.decisionFactors.some((f) => f.factorType === 'WEATHER')).toBe(true);
    expect(out.decisionFactors.some((f) => f.factorType === 'ROAD_ACCESS')).toBe(true);
  });
});
