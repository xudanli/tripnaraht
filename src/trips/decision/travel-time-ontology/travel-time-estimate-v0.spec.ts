import { estimateTravelTimeHeuristicV0, impliedSpeedKmhV0, wrapRoutingProviderMinutes } from './travel-time-estimate-v0';
import { TRAVEL_TIME_ONTOLOGY_SCHEMA } from './travel-time-ontology.types';

describe('travel-time-estimate-v0', () => {
  it('impliedSpeedKmhV0 uses winter/summer paved spread', () => {
    const winter = impliedSpeedKmhV0({ distanceKm: 100, mode: 'drive', season: 'winter', roadNetworkClass: 'paved' });
    const summer = impliedSpeedKmhV0({ distanceKm: 100, mode: 'drive', season: 'summer', roadNetworkClass: 'paved' });
    expect(winter).toBe(50);
    expect(summer).toBe(60);
  });

  it('gravel winter slower than paved winter', () => {
    const g = impliedSpeedKmhV0({ distanceKm: 10, mode: 'drive', season: 'winter', roadNetworkClass: 'gravel' });
    const p = impliedSpeedKmhV0({ distanceKm: 10, mode: 'drive', season: 'winter', roadNetworkClass: 'paved' });
    expect(g).toBeLessThan(p);
  });

  it('estimateTravelTimeHeuristicV0 marks degraded when inputs missing', () => {
    const est = estimateTravelTimeHeuristicV0({ distanceKm: 100, mode: 'drive' });
    expect(est.schema).toBe(TRAVEL_TIME_ONTOLOGY_SCHEMA);
    expect(est.degradedWorldModel).toBe(true);
    expect(est.inputsResolved.season).toBe('unknown');
    expect(est.pointEstimateMinutes).toBe(120); // 100/50 h -> 120 min
  });

  it('wrapRoutingProviderMinutes preserves provider minutes', () => {
    const w = wrapRoutingProviderMinutes({ durationMinutes: 87, distanceKm: 120, sourceLabel: 'smart_routes' });
    expect(w.pointEstimateMinutes).toBe(87);
    expect(w.provenance).toBe('ROUTING_PROVIDER');
  });
});
