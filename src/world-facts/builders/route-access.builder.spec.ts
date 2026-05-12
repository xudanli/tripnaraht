import { DecisionFactorFactoryService } from '../decision-factor.factory';
import { routeVehicleFactKey } from './route-access.builder';

describe('route-access.builder', () => {
  it('routeVehicleFactKey matches ingest convention', () => {
    expect(routeVehicleFactKey('42')).toBe('route_direction:42:vehicle_required');
  });

  it('factory maps resolved fact to ROAD_ACCESS DecisionFactor', () => {
    const created = new Date('2026-05-08T12:00:00Z');
    const resolved = {
      fact: {
        id: 'rid',
        valueJson: { raw: '4WD' },
        confidence: 0.9,
        observedAt: created,
        createdAt: created,
      },
      freshness: {
        isExpiredByValidTo: false,
        freshnessScore: 1,
      },
    } as any;
    const factory = new DecisionFactorFactoryService();
    const factors = factory.decisionFactorsFromRouteVehicleResolved(resolved, '42');
    expect(factors).toHaveLength(1);
    expect(factors[0]?.factorType).toBe('ROAD_ACCESS');
    expect(factors[0]?.derivedFromFactIds).toEqual(['rid']);
    expect(factors[0]?.impactLevel).toBe('WARNING');
    expect(factors[0]?.effect).toBe('WARNING');
    expect(factors[0]?.target).toBe('SEGMENT');
    expect(factors[0]?.actionHint).toBe('ADD_CAUTION');
  });
});
