import { runGasEvPlannerCore, routeCorridorTagsForSegments } from './iceland-gas-ev-planner-core.util';
import type { IcelandEnergyStationsPack } from './iceland-gas-ev-planner-core.util';
import { ICELAND_ENERGY_BASELINES } from './iceland-energy-baseline.util';

const miniPack: IcelandEnergyStationsPack = {
  schema_version: '0-test',
  stations: [
    {
      id: 'gas_a',
      name: 'A',
      kind: 'gas',
      lat: 64,
      lng: -21,
      region_preset: 'reykjavik',
      corridor_tags: ['ring_1'],
    },
    {
      id: 'gas_vik',
      name: 'Vík',
      kind: 'gas',
      lat: 63.42,
      lng: -19,
      region_preset: 'vik',
      corridor_tags: ['ring_1', 'south_coast', 'before_highlands'],
    },
  ],
  supply_desert_tags: {
    highlands: { relative_risk: 'extreme', rationale: 'test' },
    westfjords: { relative_risk: 'high', rationale: 'test' },
    eastfjords_remote: { relative_risk: 'high', rationale: 'test' },
  },
};

describe('iceland-gas-ev-planner-core', () => {
  it('tags south coast when vik in route', () => {
    const t = routeCorridorTagsForSegments([{ from_region: 'reykjavik', to_region: 'vik' }]);
    expect(t.has('south_coast')).toBe(true);
    expect(t.has('ring_1')).toBe(true);
  });

  it('tags westfjords when route uses Patreksfjörður preset (not only Ísafjörður)', () => {
    const t = routeCorridorTagsForSegments([{ from_region: 'reykjavik', to_region: 'patreksfjordur' }]);
    expect(t.has('westfjords')).toBe(true);
    expect(t.has('low_density')).toBe(true);
  });

  it('flags tank break when trip fuel exceeds usable tank', () => {
    const r = runGasEvPlannerCore({
      totalKm: 800,
      energy_mode: 'ice',
      baseline: ICELAND_ENERGY_BASELINES['2wd'],
      vehicle_class: '2wd',
      segments: [{ from_region: 'reykjavik', to_region: 'egilsstadir' }],
      pack: miniPack,
    });
    expect(r.refuel_or_charge_required).toBe(true);
    expect(r.safety_alerts.some((a) => a.includes('Range gap'))).toBe(true);
    expect(r.recommended_stops.length).toBeGreaterThan(0);
    expect(r.feasible).toBe(true);
  });

  it('requires refill anchor before highlands desert', () => {
    const r = runGasEvPlannerCore({
      totalKm: 200,
      energy_mode: 'ice',
      baseline: ICELAND_ENERGY_BASELINES['4x4'],
      vehicle_class: '4x4',
      segments: [{ from_region: 'vik', to_region: 'highlands_center' }],
      pack: miniPack,
    });
    expect(r.must_refill_before?.station_id).toBeDefined();
    expect(r.safety_alerts.some((s) => s.includes('highlands'))).toBe(true);
  });
});
