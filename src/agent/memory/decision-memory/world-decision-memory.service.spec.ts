// src/agent/memory/decision-memory/world-decision-memory.service.spec.ts
import { WorldDecisionMemoryService } from './world-decision-memory.service';
import { buildDecisionMemory } from './decision-memory.types';

describe('WorldDecisionMemoryService', () => {
  it('appendForRequest keeps ring order and listForRequest filters by type', () => {
    const svc = new WorldDecisionMemoryService(undefined, undefined, undefined);
    const rid = 'req-test-1';
    svc.appendForRequest(
      rid,
      buildDecisionMemory({
        decisionType: 'vehicle',
        inputs: { tier: '4x4' },
        outputs: { pick: 'small_suv' },
        outcome: 'accepted',
        rationale: ['wind_yellow'],
        causedBy: [],
      }),
      10,
    );
    svc.appendForRequest(
      rid,
      buildDecisionMemory({
        decisionType: 'risk_block',
        inputs: { road: 'F35' },
        outputs: { action: 'no_entry' },
        outcome: 'rejected',
        rationale: ['closed'],
        causedBy: [],
      }),
      10,
    );
    const vehicleOnly = svc.listForRequest(rid, { decisionType: 'vehicle' });
    expect(vehicleOnly).toHaveLength(1);
    expect(vehicleOnly[0].decisionType).toBe('vehicle');
    expect(svc.listForRequest(rid)).toHaveLength(2);
    svc.clearForRequest(rid);
    expect(svc.listForRequest(rid)).toHaveLength(0);
  });

  it('appendForRequest schedules archive persist when archive enabled and memory ALS aligned', (done) => {
    const rid = 'req-archive-1';
    const persist = jest.fn().mockResolvedValue(undefined);
    const archive = {
      isEnabled: () => true,
      persist,
      listRecentForTrip: jest.fn().mockResolvedValue([]),
    };
    const memStore = {
      get: () => ({ tripId: 'trip-xyz', userId: 'user-abc', requestId: rid }),
    } as any;
    const svc = new WorldDecisionMemoryService(memStore, undefined, archive);
    const entry = buildDecisionMemory({
      decisionType: 'vehicle',
      inputs: { k: 1 },
      outputs: {},
      outcome: 'accepted',
      rationale: [],
      causedBy: [],
    });
    svc.appendForRequest(rid, entry);
    setImmediate(() => {
      expect(persist).toHaveBeenCalledTimes(1);
      expect(persist).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: rid,
          tripId: 'trip-xyz',
          userId: 'user-abc',
          entry,
        }),
      );
      done();
    });
  });
});
