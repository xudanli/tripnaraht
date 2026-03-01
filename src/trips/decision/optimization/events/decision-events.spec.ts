import {
  DecisionEventBus,
  DecisionEventEmitter,
  DecisionEventType,
  DecisionStartedEvent,
  DecisionCompletedEvent,
  FeedbackReceivedEvent,
} from './decision-events';

describe('DecisionEventBus', () => {
  let eventBus: DecisionEventBus;

  beforeEach(() => {
    eventBus = new DecisionEventBus();
  });

  afterEach(() => {
    eventBus.onModuleDestroy();
  });

  describe('emit and on', () => {
    it('should emit and receive events', (done) => {
      eventBus.on<DecisionStartedEvent>(DecisionEventType.DECISION_STARTED, (event) => {
        expect(event.type).toBe(DecisionEventType.DECISION_STARTED);
        expect(event.requestId).toBe('req-001');
        done();
      });

      eventBus.emit<DecisionStartedEvent>({
        type: DecisionEventType.DECISION_STARTED,
        timestamp: new Date().toISOString(),
        requestId: 'req-001',
        userId: 'user-001',
        dsoVersion: 1,
        phase: 'PLAN_GEN',
      });
    });

    it('should add timestamp if not provided', (done) => {
      eventBus.on(DecisionEventType.DECISION_STARTED, (event) => {
        expect(event.timestamp).toBeDefined();
        done();
      });

      eventBus.emit({
        type: DecisionEventType.DECISION_STARTED,
        requestId: 'req-001',
      } as any);
    });

    it('should support wildcard listener', (done) => {
      const events: string[] = [];

      eventBus.on('*', (event) => {
        events.push(event.type);
        if (events.length === 2) {
          expect(events).toContain(DecisionEventType.DECISION_STARTED);
          expect(events).toContain(DecisionEventType.DECISION_COMPLETED);
          done();
        }
      });

      eventBus.emit({
        type: DecisionEventType.DECISION_STARTED,
        timestamp: new Date().toISOString(),
      });

      eventBus.emit({
        type: DecisionEventType.DECISION_COMPLETED,
        timestamp: new Date().toISOString(),
      } as DecisionCompletedEvent);
    });
  });

  describe('once', () => {
    it('should only trigger once', () => {
      let count = 0;

      eventBus.once(DecisionEventType.DECISION_STARTED, () => {
        count++;
      });

      eventBus.emit({ type: DecisionEventType.DECISION_STARTED, timestamp: '' });
      eventBus.emit({ type: DecisionEventType.DECISION_STARTED, timestamp: '' });

      expect(count).toBe(1);
    });
  });

  describe('subscription', () => {
    it('should unsubscribe correctly', () => {
      let count = 0;

      const subscription = eventBus.on(DecisionEventType.DECISION_STARTED, () => {
        count++;
      });

      eventBus.emit({ type: DecisionEventType.DECISION_STARTED, timestamp: '' });
      subscription.unsubscribe();
      eventBus.emit({ type: DecisionEventType.DECISION_STARTED, timestamp: '' });

      expect(count).toBe(1);
    });
  });

  describe('off', () => {
    it('should remove specific listener', () => {
      let count = 0;
      const listener = () => count++;

      eventBus.on(DecisionEventType.DECISION_STARTED, listener);
      eventBus.emit({ type: DecisionEventType.DECISION_STARTED, timestamp: '' });

      eventBus.off(DecisionEventType.DECISION_STARTED, listener);
      eventBus.emit({ type: DecisionEventType.DECISION_STARTED, timestamp: '' });

      expect(count).toBe(1);
    });
  });

  describe('removeAllListeners', () => {
    it('should remove all listeners for event type', () => {
      let count = 0;

      eventBus.on(DecisionEventType.DECISION_STARTED, () => count++);
      eventBus.on(DecisionEventType.DECISION_STARTED, () => count++);

      eventBus.removeAllListeners(DecisionEventType.DECISION_STARTED);
      eventBus.emit({ type: DecisionEventType.DECISION_STARTED, timestamp: '' });

      expect(count).toBe(0);
    });

    it('should remove all listeners when no type specified', () => {
      let count = 0;

      eventBus.on(DecisionEventType.DECISION_STARTED, () => count++);
      eventBus.on(DecisionEventType.DECISION_COMPLETED, () => count++);

      eventBus.removeAllListeners();
      eventBus.emit({ type: DecisionEventType.DECISION_STARTED, timestamp: '' });
      eventBus.emit({ type: DecisionEventType.DECISION_COMPLETED, timestamp: '' } as DecisionCompletedEvent);

      expect(count).toBe(0);
    });
  });

  describe('listenerCount', () => {
    it('should return correct count', () => {
      expect(eventBus.listenerCount(DecisionEventType.DECISION_STARTED)).toBe(0);

      eventBus.on(DecisionEventType.DECISION_STARTED, () => {});
      eventBus.on(DecisionEventType.DECISION_STARTED, () => {});

      expect(eventBus.listenerCount(DecisionEventType.DECISION_STARTED)).toBe(2);
    });
  });

  describe('event history', () => {
    it('should record history when enabled', () => {
      eventBus.enableHistoryRecording(true);

      eventBus.emit({ type: DecisionEventType.DECISION_STARTED, timestamp: '', requestId: 'req-1' });
      eventBus.emit({ type: DecisionEventType.DECISION_COMPLETED, timestamp: '', requestId: 'req-1' } as DecisionCompletedEvent);

      const history = eventBus.getEventHistory();
      expect(history).toHaveLength(2);
    });

    it('should not record history when disabled', () => {
      eventBus.enableHistoryRecording(false);

      eventBus.emit({ type: DecisionEventType.DECISION_STARTED, timestamp: '' });

      const history = eventBus.getEventHistory();
      expect(history).toHaveLength(0);
    });

    it('should filter history by type', () => {
      eventBus.enableHistoryRecording(true);

      eventBus.emit({ type: DecisionEventType.DECISION_STARTED, timestamp: '' });
      eventBus.emit({ type: DecisionEventType.DECISION_COMPLETED, timestamp: '' } as DecisionCompletedEvent);
      eventBus.emit({ type: DecisionEventType.DECISION_STARTED, timestamp: '' });

      const history = eventBus.getEventHistory({ type: DecisionEventType.DECISION_STARTED });
      expect(history).toHaveLength(2);
    });

    it('should filter history by requestId', () => {
      eventBus.enableHistoryRecording(true);

      eventBus.emit({ type: DecisionEventType.DECISION_STARTED, timestamp: '', requestId: 'req-1' });
      eventBus.emit({ type: DecisionEventType.DECISION_STARTED, timestamp: '', requestId: 'req-2' });

      const history = eventBus.getEventHistory({ requestId: 'req-1' });
      expect(history).toHaveLength(1);
    });

    it('should limit history size', () => {
      eventBus.enableHistoryRecording(true);

      const history = eventBus.getEventHistory({ limit: 5 });
      expect(history.length).toBeLessThanOrEqual(5);
    });

    it('should clear history', () => {
      eventBus.enableHistoryRecording(true);

      eventBus.emit({ type: DecisionEventType.DECISION_STARTED, timestamp: '' });
      expect(eventBus.getEventHistory()).toHaveLength(1);

      eventBus.clearHistory();
      expect(eventBus.getEventHistory()).toHaveLength(0);
    });
  });
});

describe('DecisionEventEmitter', () => {
  let eventBus: DecisionEventBus;
  let emitter: DecisionEventEmitter;

  beforeEach(() => {
    eventBus = new DecisionEventBus();
    emitter = new DecisionEventEmitter(eventBus);
  });

  afterEach(() => {
    eventBus.onModuleDestroy();
  });

  describe('decisionStarted', () => {
    it('should emit DECISION_STARTED event', (done) => {
      eventBus.on<DecisionStartedEvent>(DecisionEventType.DECISION_STARTED, (event) => {
        expect(event.requestId).toBe('req-001');
        expect(event.userId).toBe('user-001');
        expect(event.dsoVersion).toBe(1);
        expect(event.phase).toBe('PLAN_GEN');
        done();
      });

      emitter.decisionStarted('req-001', 'user-001', 1, 'PLAN_GEN');
    });
  });

  describe('decisionCompleted', () => {
    it('should emit DECISION_COMPLETED event', (done) => {
      eventBus.on<DecisionCompletedEvent>(DecisionEventType.DECISION_COMPLETED, (event) => {
        expect(event.action).toBe('ACCEPT_PLAN');
        expect(event.utility).toBe(0.85);
        expect(event.confidence).toBe(0.9);
        expect(event.latencyMs).toBe(50);
        done();
      });

      emitter.decisionCompleted('req-001', 'user-001', 'ACCEPT_PLAN', 0.85, 0.9, 50);
    });
  });

  describe('decisionFailed', () => {
    it('should emit DECISION_FAILED event', (done) => {
      eventBus.on(DecisionEventType.DECISION_FAILED, (event) => {
        expect(event.error).toBe('Test error');
        expect(event.errorCode).toBe('TEST_001');
        done();
      });

      emitter.decisionFailed('req-001', 'user-001', 'Test error', 'TEST_001');
    });
  });

  describe('snapshotRecorded', () => {
    it('should emit DSO_SNAPSHOT_RECORDED event', (done) => {
      eventBus.on(DecisionEventType.DSO_SNAPSHOT_RECORDED, (event) => {
        expect(event.version).toBe(2);
        expect(event.phase).toBe('OPTIMIZE');
        expect(event.lyapunovValue).toBe(0.3);
        done();
      });

      emitter.snapshotRecorded('req-001', 2, 'OPTIMIZE', 0.8, 0.3);
    });
  });

  describe('feedbackReceived', () => {
    it('should emit FEEDBACK_RECEIVED event', (done) => {
      eventBus.on<FeedbackReceivedEvent>(DecisionEventType.FEEDBACK_RECEIVED, (event) => {
        expect(event.decisionId).toBe('dec-001');
        expect(event.satisfactionScore).toBe(0.9);
        expect(event.feedbackType).toBe('LIKE');
        done();
      });

      emitter.feedbackReceived('req-001', 'user-001', 'dec-001', 0.9, 0.85, 'LIKE');
    });
  });

  describe('learningTriggered', () => {
    it('should emit LEARNING_TRIGGERED event', (done) => {
      eventBus.on(DecisionEventType.LEARNING_TRIGGERED, (event) => {
        expect(event.trigger).toBe('BATCH_SIZE_REACHED');
        expect(event.feedbackCount).toBe(100);
        done();
      });

      emitter.learningTriggered('req-001', 'BATCH_SIZE_REACHED', 100);
    });
  });

  describe('weightsUpdated', () => {
    it('should emit WEIGHTS_UPDATED event', (done) => {
      eventBus.on(DecisionEventType.WEIGHTS_UPDATED, (event) => {
        expect(event.previousWeights).toEqual({ time: 0.3 });
        expect(event.newWeights).toEqual({ time: 0.35 });
        expect(event.learningRate).toBe(0.01);
        done();
      });

      emitter.weightsUpdated('user-001', { time: 0.3 }, { time: 0.35 }, 0.01);
    });
  });

  describe('convergenceChanged', () => {
    it('should emit CONVERGENCE_CHANGED event', (done) => {
      eventBus.on(DecisionEventType.CONVERGENCE_CHANGED, (event) => {
        expect(event.previousStatus).toBe('LEARNING');
        expect(event.newStatus).toBe('CONVERGED');
        expect(event.cumulativeRegret).toBe(0.05);
        done();
      });

      emitter.convergenceChanged('user-001', 'LEARNING', 'CONVERGED', 0.05);
    });
  });

  describe('policyInferred', () => {
    it('should emit POLICY_INFERRED event', (done) => {
      eventBus.on(DecisionEventType.POLICY_INFERRED, (event) => {
        expect(event.selectedAction).toBe('ACCEPT_PLAN');
        expect(event.entropy).toBe(1.5);
        done();
      });

      emitter.policyInferred('req-001', 'ACCEPT_PLAN', 1.5, { ACCEPT_PLAN: 0.7 });
    });
  });

  describe('constraintViolated', () => {
    it('should emit CONSTRAINT_VIOLATED event', (done) => {
      eventBus.on(DecisionEventType.CONSTRAINT_VIOLATED, (event) => {
        expect(event.constraint).toBe('MAX_BUDGET');
        expect(event.isHard).toBe(true);
        expect(event.value).toBe(6000);
        expect(event.limit).toBe(5000);
        done();
      });

      emitter.constraintViolated('req-001', 'MAX_BUDGET', true, 6000, 5000);
    });
  });

  describe('circuitStateChanged', () => {
    it('should emit CIRCUIT_STATE_CHANGED event', (done) => {
      eventBus.on(DecisionEventType.CIRCUIT_STATE_CHANGED, (event) => {
        expect(event.circuitName).toBe('database');
        expect(event.previousState).toBe('CLOSED');
        expect(event.newState).toBe('OPEN');
        expect(event.consecutiveFailures).toBe(5);
        done();
      });

      emitter.circuitStateChanged('database', 'CLOSED', 'OPEN', 5);
    });
  });

  describe('lyapunovComputed', () => {
    it('should emit LYAPUNOV_COMPUTED event', (done) => {
      eventBus.on(DecisionEventType.LYAPUNOV_COMPUTED, (event) => {
        expect(event.value).toBe(0.25);
        expect(event.isDecreasing).toBe(true);
        expect(event.convergenceRate).toBe(0.05);
        done();
      });

      emitter.lyapunovComputed('req-001', 0.25, true, 0.05);
    });
  });
});
