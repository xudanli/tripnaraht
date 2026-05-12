import { WorldConstraintStore } from './world-constraint.store';
import { runInteractiveWorldLoop } from './world-interactive-loop.service';

describe('runInteractiveWorldLoop', () => {
  const tripPlan = {
    version: '1',
    createdAt: 't',
    days: [
      {
        day: 1,
        date: '2026-06-01',
        timeSlots: [
          {
            id: 's1',
            time: '09:00',
            title: 'Hike',
            type: 'nature' as const,
            poiId: 'poi-x',
          },
        ],
      },
    ],
  };

  it('runs command → overlay and optional partial replan when impact', () => {
    const store = new WorldConstraintStore();
    const out = runInteractiveWorldLoop(
      store,
      {
        type: 'BLOCK_ROAD',
        roadId: 'F208',
        affectedSlotIds: ['s1'],
      },
      { tripPlan, runPartialReplan: true, atMs: 1 },
    );

    expect(out.commandResult.diff.hasImpact).toBe(true);
    expect(out.partialReplan?.updatedSlots.length).toBeGreaterThan(0);
    expect(out.worldOverlay.constraints).toBeDefined();
    expect(out.worldOverlay.version).toBe(store.version);
  });
});
