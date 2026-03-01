import {
  WebSocketManager,
  DecisionWebSocketService,
  DecisionOSChannels,
  MessageType,
} from './decision-websocket.gateway';

describe('WebSocketManager', () => {
  let manager: WebSocketManager;

  beforeEach(() => {
    manager = new WebSocketManager({
      heartbeatIntervalMs: 100000,
      clientTimeoutMs: 50000,
    });
  });

  afterEach(() => {
    manager.onModuleDestroy();
  });

  describe('registerClient', () => {
    it('should register new client', () => {
      const client = manager.registerClient('client-1', 'user-1');

      expect(client.id).toBe('client-1');
      expect(client.userId).toBe('user-1');
      expect(client.subscriptions.size).toBe(0);
    });

    it('should track client activity', () => {
      const client = manager.registerClient('client-1');
      expect(client.lastActivity).toBeInstanceOf(Date);
    });
  });

  describe('unregisterClient', () => {
    it('should remove client and subscriptions', () => {
      manager.registerClient('client-1');
      manager.subscribe('client-1', 'channel-1');
      manager.unregisterClient('client-1');

      expect(manager.getClient('client-1')).toBeUndefined();
      expect(manager.getChannelSubscribers('channel-1')).toHaveLength(0);
    });

    it('should handle unknown client gracefully', () => {
      expect(() => manager.unregisterClient('unknown')).not.toThrow();
    });
  });

  describe('subscribe', () => {
    beforeEach(() => {
      manager.registerClient('client-1');
    });

    it('should subscribe client to channel', () => {
      const result = manager.subscribe('client-1', 'channel-1');

      expect(result).toBe(true);
      expect(manager.getChannelSubscribers('channel-1')).toContain('client-1');
    });

    it('should return false for unknown client', () => {
      const result = manager.subscribe('unknown', 'channel-1');
      expect(result).toBe(false);
    });

    it('should update client last activity', () => {
      const client = manager.getClient('client-1')!;
      const before = client.lastActivity;

      manager.subscribe('client-1', 'channel-1');

      expect(client.lastActivity.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('should respect max clients per channel', () => {
      const smallManager = new WebSocketManager({ maxClientsPerChannel: 2 });

      smallManager.registerClient('c1');
      smallManager.registerClient('c2');
      smallManager.registerClient('c3');

      expect(smallManager.subscribe('c1', 'limited')).toBe(true);
      expect(smallManager.subscribe('c2', 'limited')).toBe(true);
      expect(smallManager.subscribe('c3', 'limited')).toBe(false);

      smallManager.onModuleDestroy();
    });
  });

  describe('unsubscribe', () => {
    beforeEach(() => {
      manager.registerClient('client-1');
      manager.subscribe('client-1', 'channel-1');
    });

    it('should unsubscribe client from channel', () => {
      const result = manager.unsubscribe('client-1', 'channel-1');

      expect(result).toBe(true);
      expect(manager.getChannelSubscribers('channel-1')).not.toContain('client-1');
    });

    it('should return false for unknown client', () => {
      const result = manager.unsubscribe('unknown', 'channel-1');
      expect(result).toBe(false);
    });
  });

  describe('publish', () => {
    it('should publish to subscribed clients', () => {
      manager.registerClient('client-1');
      manager.registerClient('client-2');
      manager.subscribe('client-1', 'channel-1');
      manager.subscribe('client-2', 'channel-1');

      const count = manager.publish('channel-1', { data: 'test' });

      expect(count).toBe(2);
    });

    it('should return 0 for empty channel', () => {
      const count = manager.publish('empty-channel', { data: 'test' });
      expect(count).toBe(0);
    });

    it('should emit message event', (done) => {
      manager.registerClient('client-1');
      manager.subscribe('client-1', 'channel-1');

      manager.onMessage((message, clientIds) => {
        expect(message.type).toBe(MessageType.PUBLISH);
        expect(message.channel).toBe('channel-1');
        expect(message.payload).toEqual({ value: 42 });
        expect(clientIds).toContain('client-1');
        done();
      });

      manager.publish('channel-1', { value: 42 });
    });
  });

  describe('broadcast', () => {
    it('should broadcast to all clients', () => {
      manager.registerClient('client-1');
      manager.registerClient('client-2');
      manager.registerClient('client-3');

      const count = manager.broadcast({ event: 'system' });

      expect(count).toBe(3);
    });

    it('should exclude specified clients', () => {
      manager.registerClient('client-1');
      manager.registerClient('client-2');
      manager.registerClient('client-3');

      const count = manager.broadcast({ event: 'system' }, ['client-2']);

      expect(count).toBe(2);
    });
  });

  describe('heartbeat', () => {
    it('should update client activity', () => {
      manager.registerClient('client-1');
      const client = manager.getClient('client-1')!;
      const before = client.lastActivity;

      manager.heartbeat('client-1');

      expect(client.lastActivity.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('should return false for unknown client', () => {
      const result = manager.heartbeat('unknown');
      expect(result).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return manager statistics', () => {
      manager.registerClient('client-1');
      manager.registerClient('client-2');
      manager.subscribe('client-1', 'channel-1');
      manager.subscribe('client-2', 'channel-1');
      manager.subscribe('client-1', 'channel-2');

      const stats = manager.getStats();

      expect(stats.totalClients).toBe(2);
      expect(stats.totalChannels).toBe(2);
      expect(stats.channelStats.get('channel-1')).toBe(2);
      expect(stats.channelStats.get('channel-2')).toBe(1);
    });
  });
});

describe('DecisionWebSocketService', () => {
  let service: DecisionWebSocketService;
  let manager: WebSocketManager;

  beforeEach(() => {
    manager = new WebSocketManager();
    service = new DecisionWebSocketService(manager);

    manager.registerClient('test-client');
  });

  afterEach(() => {
    manager.onModuleDestroy();
  });

  describe('publishDecisionUpdate', () => {
    it('should publish to decision updates channel', () => {
      manager.subscribe('test-client', DecisionOSChannels.DECISION_UPDATES);

      const count = service.publishDecisionUpdate({
        requestId: 'req-1',
        phase: 'OPTIMIZE',
        progress: 0.5,
      });

      expect(count).toBe(1);
    });
  });

  describe('publishDecisionCompleted', () => {
    it('should publish to decision completed channel', () => {
      manager.subscribe('test-client', DecisionOSChannels.DECISION_COMPLETED);

      const count = service.publishDecisionCompleted({
        requestId: 'req-1',
        action: 'ACCEPT',
        utility: 0.85,
        durationMs: 150,
      });

      expect(count).toBe(1);
    });
  });

  describe('publishLearningProgress', () => {
    it('should publish learning progress', () => {
      manager.subscribe('test-client', DecisionOSChannels.LEARNING_PROGRESS);

      const count = service.publishLearningProgress({
        iteration: 10,
        totalIterations: 100,
        loss: 0.05,
        accuracy: 0.92,
        phase: 'training',
      });

      expect(count).toBe(1);
    });
  });

  describe('publishMetrics', () => {
    it('should publish metrics stream', () => {
      manager.subscribe('test-client', DecisionOSChannels.METRICS_STREAM);

      const count = service.publishMetrics({
        timestamp: new Date().toISOString(),
        metrics: [
          { name: 'latency', value: 0.15 },
          { name: 'throughput', value: 100 },
        ],
      });

      expect(count).toBe(1);
    });
  });

  describe('publishSystemStatus', () => {
    it('should publish system status', () => {
      manager.subscribe('test-client', DecisionOSChannels.SYSTEM_STATUS);

      const count = service.publishSystemStatus({
        health: 'healthy',
        uptime: 3600,
        activeConnections: 5,
        pendingDecisions: 2,
        lastUpdate: new Date().toISOString(),
      });

      expect(count).toBe(1);
    });
  });

  describe('publishDSOSnapshot', () => {
    it('should publish DSO snapshot', () => {
      manager.subscribe('test-client', DecisionOSChannels.DSO_SNAPSHOTS);

      const count = service.publishDSOSnapshot({
        requestId: 'req-1',
        version: 3,
        phase: 'OPTIMIZE',
        confidence: 0.9,
      });

      expect(count).toBe(1);
    });
  });

  describe('publishError', () => {
    it('should publish error', () => {
      manager.subscribe('test-client', DecisionOSChannels.ERRORS);

      const count = service.publishError({
        code: 'TIMEOUT',
        message: 'Request timed out',
        requestId: 'req-1',
      });

      expect(count).toBe(1);
    });
  });

  describe('subscription helpers', () => {
    it('should subscribe to decision updates', () => {
      const result = service.subscribeToDecisionUpdates('test-client');

      expect(result).toBe(true);
      expect(manager.getChannelSubscribers(DecisionOSChannels.DECISION_UPDATES))
        .toContain('test-client');
    });

    it('should subscribe to learning progress', () => {
      const result = service.subscribeToLearningProgress('test-client');

      expect(result).toBe(true);
      expect(manager.getChannelSubscribers(DecisionOSChannels.LEARNING_PROGRESS))
        .toContain('test-client');
    });

    it('should subscribe to metrics', () => {
      const result = service.subscribeToMetrics('test-client');

      expect(result).toBe(true);
      expect(manager.getChannelSubscribers(DecisionOSChannels.METRICS_STREAM))
        .toContain('test-client');
    });

    it('should subscribe to system status', () => {
      const result = service.subscribeToSystemStatus('test-client');

      expect(result).toBe(true);
      expect(manager.getChannelSubscribers(DecisionOSChannels.SYSTEM_STATUS))
        .toContain('test-client');
    });
  });

  describe('getChannelStats', () => {
    it('should return channel statistics', () => {
      service.subscribeToDecisionUpdates('test-client');
      service.subscribeToMetrics('test-client');

      const stats = service.getChannelStats();

      expect(stats[DecisionOSChannels.DECISION_UPDATES]).toBe(1);
      expect(stats[DecisionOSChannels.METRICS_STREAM]).toBe(1);
    });
  });
});
