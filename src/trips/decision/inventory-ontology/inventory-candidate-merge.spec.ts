import type { ActivityCandidate } from '../world-model';
import { INVENTORY_REALITY_SCHEMA } from './inventory-reality.types';
import {
  inventoryRiskBandFromSupplyRisk,
  mergeSupplySnapshotIntoCandidate,
} from './inventory-candidate-merge';

describe('inventory-candidate-merge', () => {
  const base: ActivityCandidate = {
    id: 'h1',
    name: { en: 'Test Hotel' },
    type: 'hotel',
    durationMin: 0,
  };

  it('mergeSupplySnapshotIntoCandidate attaches schema and clamps risk', () => {
    const snap = {
      schema: INVENTORY_REALITY_SCHEMA,
      kind: 'hotel_room' as const,
      observed_at: new Date().toISOString(),
      supply_risk: 1.5,
      source: 'provider_api' as const,
    };
    const out = mergeSupplySnapshotIntoCandidate(base, snap);
    expect(out.supplySnapshot?.supply_risk).toBe(1);
    expect(out.supplySnapshot?.kind).toBe('hotel_room');
  });

  it('inventoryRiskBandFromSupplyRisk maps bands', () => {
    expect(inventoryRiskBandFromSupplyRisk(0.1)).toBe(1);
    expect(inventoryRiskBandFromSupplyRisk(0.95)).toBe(5);
  });
});
