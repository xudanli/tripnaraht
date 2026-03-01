import {
  EventSourcingService,
  InMemoryEventStore,
  DecisionAggregate,
} from './event-sourcing.service';
import { DecisionEventType } from './decision-events';

describe('InMemoryEventStore', () => {
  let store: InMemoryEventStore;

  beforeEach(() => {
    store = new InMemoryEventStore();
  });

  describe('append', () => {
    it('should append events', async () => {
      await store.append([
        {
          id: 'evt-1',
          aggregateId: 'agg-1',
          aggregateType: 'Test',
          eventType: DecisionEventType.DECISION_STARTED,
          eventData: {},
          metadata: {},
          version: 1,
          timestamp: new Date().toISOString(),
        },
      ]);

      const events = await store.getEvents({ aggregateId: 'agg-1' });
      expect(events.length).toBe(1);
    });

    it('should enforce version ordering', async () => {
      await store.append([
        {
          id: 'evt-1',
          aggregateId: 'agg-1',
          aggregateType: 'Test',
          eventType: DecisionEventType.DECISION_STARTED,
          eventData: {},
          metadata: {},
          version: 1,
          timestamp: new Date().toISOString(),
        },
      ]);

      await expect(
        store.append([
          {
            id: 'evt-2',
            aggregateId: 'agg-1',
            aggregateType: 'Test',
            eventType: DecisionEventType.DECISION_COMPLETED,
            eventData: {},
            metadata: {},
            version: 3,
            timestamp: new Date().toISOString(),
          },
        ]),
      ).rejects.toThrow('Concurrency conflict');
    });
  });

  describe('getEvents', () => {
    beforeEach(async () => {
      await store.append([
        {
          id: 'evt-1',
          aggregateId: 'agg-1',
          aggregateType: 'Decision',
          eventType: DecisionEventType.DECISION_STARTED,
          eventData: {},
          metadata: {},
          version: 1,
          timestamp: '2026-01-01T00:00:00Z',
        },
      ]);
      await store.append([
        {
          id: 'evt-2',
          aggregateId: 'agg-1',
          aggregateType: 'Decision',
          eventType: DecisionEventType.DECISION_COMPLETED,
          eventData: {},
          metadata: {},
          version: 2,
          timestamp: '2026-01-02T00:00:00Z',
        },
      ]);
      await store.append([
        {
          id: 'evt-3',
          aggregateId: 'agg-2',
          aggregateType: 'Decision',
          eventType: DecisionEventType.DECISION_STARTED,
          eventData: {},
          metadata: {},
          version: 1,
          timestamp: '2026-01-03T00:00:00Z',
        },
      ]);
    });

    it('should filter by aggregateId', async () => {
      const events = await store.getEvents({ aggregateId: 'agg-1' });
      expect(events.length).toBe(2);
    });

    it('should filter by eventTypes', async () => {
      const events = await store.getEvents({
        eventTypes: [DecisionEventType.DECISION_STARTED],
      });
      expect(events.length).toBe(2);
    });

    it('should filter by version range', async () => {
      const events = await store.getEvents({
        aggregateId: 'agg-1',
        fromVersion: 2,
      });
      expect(events.length).toBe(1);
      expect(events[0].version).toBe(2);
    });

    it('should filter by timestamp range', async () => {
      const events = await store.getEvents({
        fromTimestamp: new Date('2026-01-02T00:00:00Z'),
      });
      expect(events.length).toBe(2);
    });

    it('should apply limit', async () => {
      const events = await store.getEvents({ limit: 1 });
      expect(events.length).toBe(1);
    });
  });

  describe('snapshots', () => {
    it('should save and retrieve snapshot', async () => {
      await store.saveSnapshot({
        aggregateId: 'agg-1',
        aggregateType: 'Decision',
        version: 10,
        state: { status: 'completed' },
        timestamp: new Date().toISOString(),
      });

      const snapshot = await store.getSnapshot('agg-1');

      expect(snapshot).toBeDefined();
      expect(snapshot?.version).toBe(10);
      expect(snapshot?.state).toEqual({ status: 'completed' });
    });

    it('should return null for non-existent snapshot', async () => {
      const snapshot = await store.getSnapshot('non-existent');
      expect(snapshot).toBeNull();
    });
  });

  describe('getStats', () => {
    it('should return statistics', async () => {
      await store.append([
        {
          id: 'evt-1',
          aggregateId: 'agg-1',
          aggregateType: 'Test',
          eventType: DecisionEventType.DECISION_STARTED,
          eventData: {},
          metadata: {},
          version: 1,
          timestamp: '2026-01-01T00:00:00Z',
        },
      ]);

      const stats = await store.getStats();

      expect(stats.totalEvents).toBe(1);
      expect(stats.totalAggregates).toBe(1);
    });
  });
});

describe('DecisionAggregate', () => {
  let aggregate: DecisionAggregate;

  beforeEach(() => {
    aggregate = new DecisionAggregate('req-001');
  });

  describe('startDecision', () => {
    it('should record decision started event', () => {
      aggregate.startDecision('user-001');

      const events = aggregate.getUncommittedEvents();
      expect(events.length).toBe(1);
      expect(events[0].eventType).toBe(DecisionEventType.DECISION_STARTED);

      const state = aggregate.getState();
      expect(state.status).toBe('processing');
      expect(state.userId).toBe('user-001');
    });
  });

  describe('completeDecision', () => {
    it('should record decision completed event', () => {
      aggregate.startDecision('user-001');
      aggregate.completeDecision('ACCEPT_PLAN', 0.85);

      const state = aggregate.getState();
      expect(state.status).toBe('completed');
      expect(state.action).toBe('ACCEPT_PLAN');
      expect(state.utility).toBe(0.85);
    });
  });

  describe('failDecision', () => {
    it('should record decision failed event', () => {
      aggregate.startDecision('user-001');
      aggregate.failDecision('Timeout');

      const state = aggregate.getState();
      expect(state.status).toBe('failed');
    });
  });

  describe('receiveFeedback', () => {
    it('should record feedback event', () => {
      aggregate.startDecision('user-001');
      aggregate.completeDecision('ACCEPT_PLAN', 0.85);
      aggregate.receiveFeedback(0.9);

      const state = aggregate.getState();
      expect(state.feedbackReceived).toBe(true);
      expect(state.feedbackScore).toBe(0.9);
    });
  });

  describe('history', () => {
    it('should track action history', () => {
      aggregate.startDecision('user-001');
      aggregate.completeDecision('ACCEPT_PLAN', 0.85);
      aggregate.receiveFeedback(0.9);

      const state = aggregate.getState();
      expect(state.history.length).toBe(3);
      expect(state.history.map(h => h.action)).toEqual([
        'started',
        'completed',
        'feedback',
      ]);
    });
  });

  describe('loadFromHistory', () => {
    it('should rebuild state from events', () => {
      const newAggregate = new DecisionAggregate('req-001');

      newAggregate.loadFromHistory([
        {
          id: 'evt-1',
          aggregateId: 'req-001',
          aggregateType: 'Decision',
          eventType: DecisionEventType.DECISION_STARTED,
          eventData: { userId: 'user-001' },
          metadata: {},
          version: 1,
          timestamp: new Date().toISOString(),
        },
        {
          id: 'evt-2',
          aggregateId: 'req-001',
          aggregateType: 'Decision',
          eventType: DecisionEventType.DECISION_COMPLETED,
          eventData: { action: 'ACCEPT', utility: 0.9 },
          metadata: {},
          version: 2,
          timestamp: new Date().toISOString(),
        },
      ]);

      const state = newAggregate.getState();
      expect(state.status).toBe('completed');
      expect(state.userId).toBe('user-001');
      expect(state.action).toBe('ACCEPT');
    });
  });
});

describe('EventSourcingService', () => {
  let service: EventSourcingService;
  let store: InMemoryEventStore;

  beforeEach(() => {
    store = new InMemoryEventStore();
    service = new EventSourcingService(store, { snapshotInterval: 5 });
  });

  describe('save', () => {
    it('should persist uncommitted events', async () => {
      const aggregate = new DecisionAggregate('req-001');
      aggregate.startDecision('user-001');
      aggregate.completeDecision('ACCEPT', 0.9);

      await service.save(aggregate);

      const events = await store.getEvents({ aggregateId: 'req-001' });
      expect(events.length).toBe(2);
      expect(aggregate.getUncommittedEvents().length).toBe(0);
    });

    it('should create snapshot at interval', async () => {
      const aggregate = new DecisionAggregate('req-001');

      for (let i = 0; i < 5; i++) {
        aggregate.startDecision(`user-00${i}`);
      }

      await service.save(aggregate);

      const snapshot = await store.getSnapshot('req-001');
      expect(snapshot).toBeDefined();
      expect(snapshot?.version).toBe(5);
    });
  });

  describe('load', () => {
    it('should load aggregate from events', async () => {
      const original = new DecisionAggregate('req-001');
      original.startDecision('user-001');
      original.completeDecision('ACCEPT', 0.9);
      await service.save(original);

      const loaded = await service.load(
        'req-001',
        'Decision',
        (id) => new DecisionAggregate(id),
      );

      expect(loaded.getState().status).toBe('completed');
      expect(loaded.getState().action).toBe('ACCEPT');
      expect(loaded.getVersion()).toBe(2);
    });

    it('should load from snapshot if available', async () => {
      await store.saveSnapshot({
        aggregateId: 'req-001',
        aggregateType: 'Decision',
        version: 10,
        state: {
          requestId: 'req-001',
          userId: 'user-001',
          status: 'completed',
          action: 'ACCEPT',
          utility: 0.9,
          feedbackReceived: false,
          history: [],
        },
        timestamp: new Date().toISOString(),
      });

      const loaded = await service.load(
        'req-001',
        'Decision',
        (id) => new DecisionAggregate(id),
      );

      expect(loaded.getVersion()).toBe(10);
      expect(loaded.getState().status).toBe('completed');
    });
  });

  describe('replay', () => {
    it('should replay events with callback', async () => {
      const aggregate = new DecisionAggregate('req-001');
      aggregate.startDecision('user-001');
      aggregate.completeDecision('ACCEPT', 0.9);
      await service.save(aggregate);

      const states: unknown[] = [];

      await service.replay(
        'req-001',
        'Decision',
        (id) => new DecisionAggregate(id),
        {
          onEvent: (event, state) => {
            states.push({ ...state as any });
          },
        },
      );

      expect(states.length).toBe(2);
      expect((states[0] as any).status).toBe('processing');
      expect((states[1] as any).status).toBe('completed');
    });

    it('should replay to specific version', async () => {
      const aggregate = new DecisionAggregate('req-001');
      aggregate.startDecision('user-001');
      aggregate.completeDecision('ACCEPT', 0.9);
      aggregate.receiveFeedback(0.8);
      await service.save(aggregate);

      const replayed = await service.replay(
        'req-001',
        'Decision',
        (id) => new DecisionAggregate(id),
        { toVersion: 2 },
      );

      expect(replayed.getVersion()).toBe(2);
      expect(replayed.getState().feedbackReceived).toBe(false);
    });
  });

  describe('rebuildState', () => {
    it('should rebuild state at specific version', async () => {
      const aggregate = new DecisionAggregate('req-001');
      aggregate.startDecision('user-001');
      aggregate.completeDecision('ACCEPT', 0.9);
      aggregate.receiveFeedback(0.8);
      await service.save(aggregate);

      const state = await service.rebuildState(
        'req-001',
        'Decision',
        (id) => new DecisionAggregate(id),
        2,
      );

      expect(state.status).toBe('completed');
      expect(state.feedbackReceived).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return event store statistics', async () => {
      const aggregate = new DecisionAggregate('req-001');
      aggregate.startDecision('user-001');
      await service.save(aggregate);

      const stats = await service.getStats();

      expect(stats.totalEvents).toBe(1);
      expect(stats.totalAggregates).toBe(1);
    });
  });
});
