import { energyPlanningKmFromSegments, estimateRouteEnergyDemand } from './iceland-route-energy-estimate.util';

describe('estimateRouteEnergyDemand', () => {
  it('uses higher burn for campervan', () => {
    const c = estimateRouteEnergyDemand(200, { type: 'campervan' });
    const t = estimateRouteEnergyDemand(200, { type: '2wd' });
    expect(c.estimatedFuelLitersGasolineEquiv).toBeGreaterThan(t.estimatedFuelLitersGasolineEquiv);
    expect(c.estimatedEvKwh).toBe(50);
  });

  it('inflates energy when gravel surface is declared on measured segments', () => {
    const plain = estimateRouteEnergyDemand(100, { type: '2wd' });
    const gravel = estimateRouteEnergyDemand(
      100,
      { type: '2wd' },
      [{ from_region: 'a', to_region: 'b', distanceKm: 100, surface: 'gravel' }],
    );
    expect(gravel.energyPlanningKm).toBeGreaterThan(100);
    expect(gravel.estimatedFuelLitersGasolineEquiv).toBeGreaterThan(plain.estimatedFuelLitersGasolineEquiv);
  });

  it('energyPlanningKmFromSegments weights only covered km', () => {
    const km = energyPlanningKmFromSegments(
      [{ from_region: 'x', to_region: 'y', distanceKm: 50, surface: 'gravel' }],
      100,
    );
    expect(km).toBeCloseTo(50 * 1.22 + 50, 5);
  });
});
