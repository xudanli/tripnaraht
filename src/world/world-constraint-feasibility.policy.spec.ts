import { snapshotWorldConstraintStore } from './world-snapshot';
import { WorldConstraintStore } from './world-constraint.store';
import {
  evaluateConstraintFeasibility,
  evaluateConstraintFeasibilityForSlot,
} from './world-constraint-feasibility.policy';

describe('evaluateConstraintFeasibility', () => {
  it('BLOCK when any road is CLOSED in snapshot', () => {
    const store = new WorldConstraintStore();
    store.upsert({
      id: 'F208',
      type: 'ROAD',
      state: 'CLOSED',
      severity: 90,
      temporalScope: { start: '2026-01-01', end: '2026-01-01' },
      impactWeight: 1,
      version: 0,
    });
    const r = evaluateConstraintFeasibility({
      snapshot: snapshotWorldConstraintStore(store),
    });
    expect(r.verdict).toBe('BLOCK');
    expect(r.codes).toContain('ROAD_CLOSED_HARD');
  });

  it('ALLOW when roads empty / open', () => {
    const store = new WorldConstraintStore();
    const r = evaluateConstraintFeasibility({
      snapshot: snapshotWorldConstraintStore(store),
    });
    expect(r.verdict).toBe('ALLOW');
  });
});

describe('evaluateConstraintFeasibilityForSlot', () => {
  it('BLOCK when a CLOSED road lists this slot in affectedSlotIds', () => {
    const store = new WorldConstraintStore();
    store.upsert({
      id: 'F208',
      type: 'ROAD',
      state: 'CLOSED',
      severity: 90,
      temporalScope: { start: '2026-01-01', end: '2026-01-01' },
      impactWeight: 1,
      version: 0,
      affectedSlotIds: ['s1'],
    });
    const r = evaluateConstraintFeasibilityForSlot({
      snapshot: snapshotWorldConstraintStore(store),
      slotId: 's1',
    });
    expect(r.verdict).toBe('BLOCK');
  });

  it('DEGRADE when CLOSED exists but not mapped to slot', () => {
    const store = new WorldConstraintStore();
    store.upsert({
      id: 'F208',
      type: 'ROAD',
      state: 'CLOSED',
      severity: 90,
      temporalScope: { start: '2026-01-01', end: '2026-01-01' },
      impactWeight: 1,
      version: 0,
    });
    const r = evaluateConstraintFeasibilityForSlot({
      snapshot: snapshotWorldConstraintStore(store),
      slotId: 's1',
    });
    expect(r.verdict).toBe('DEGRADE');
  });
});
