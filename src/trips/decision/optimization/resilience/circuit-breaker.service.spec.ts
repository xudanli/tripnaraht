import {
  CircuitBreaker,
  CircuitBreakerService,
  CircuitState,
  CircuitBreakerOpenError,
  DecisionOSCircuitConfigs,
} from './circuit-breaker.service';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      name: 'test-circuit',
      config: {
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 1000,
        resetTimeout: 100,
        halfOpenMaxCalls: 2,
      },
    });
  });

  describe('initial state', () => {
    it('should start in CLOSED state', () => {
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should have zero stats initially', () => {
      const stats = breaker.getStats();
      expect(stats.failures).toBe(0);
      expect(stats.successes).toBe(0);
      expect(stats.totalCalls).toBe(0);
    });
  });

  describe('execute - success path', () => {
    it('should execute function and return result', async () => {
      const result = await breaker.execute(async () => 'success');
      expect(result).toBe('success');
    });

    it('should track successful calls', async () => {
      await breaker.execute(async () => 'ok');
      await breaker.execute(async () => 'ok');

      const stats = breaker.getStats();
      expect(stats.successes).toBe(2);
      expect(stats.totalSuccesses).toBe(2);
      expect(stats.consecutiveSuccesses).toBe(2);
    });
  });

  describe('execute - failure path', () => {
    it('should throw error on failure', async () => {
      await expect(breaker.execute(async () => {
        throw new Error('test error');
      })).rejects.toThrow('test error');
    });

    it('should track failures', async () => {
      try {
        await breaker.execute(async () => { throw new Error('fail'); });
      } catch { /* expected */ }

      const stats = breaker.getStats();
      expect(stats.failures).toBe(1);
      expect(stats.consecutiveFailures).toBe(1);
    });
  });

  describe('state transitions', () => {
    it('should transition to OPEN after threshold failures', async () => {
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => { throw new Error('fail'); });
        } catch { /* expected */ }
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });

    it('should throw CircuitBreakerOpenError when OPEN', async () => {
      breaker.forceOpen();

      await expect(breaker.execute(async () => 'ok'))
        .rejects.toThrow(CircuitBreakerOpenError);
    });

    it('should transition to HALF_OPEN after reset timeout', async () => {
      breaker.forceOpen();

      await new Promise(resolve => setTimeout(resolve, 150));

      await breaker.execute(async () => 'ok');
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
    });

    it('should transition back to CLOSED after success threshold in HALF_OPEN', async () => {
      breaker.forceOpen();
      await new Promise(resolve => setTimeout(resolve, 150));

      await breaker.execute(async () => 'ok');
      await breaker.execute(async () => 'ok');

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should transition back to OPEN on failure in HALF_OPEN', async () => {
      breaker.forceOpen();
      await new Promise(resolve => setTimeout(resolve, 150));

      try {
        await breaker.execute(async () => { throw new Error('fail'); });
      } catch { /* expected */ }

      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe('fallback', () => {
    it('should use fallback when circuit is OPEN', async () => {
      const breakerWithFallback = new CircuitBreaker({
        name: 'fallback-test',
        config: { failureThreshold: 1, resetTimeout: 1000 },
        fallback: () => 'fallback-value',
      });

      breakerWithFallback.forceOpen();

      const result = await breakerWithFallback.execute(async () => 'normal');
      expect(result).toBe('fallback-value');
    });
  });

  describe('timeout', () => {
    it('should timeout slow operations', async () => {
      const slowBreaker = new CircuitBreaker({
        name: 'slow-test',
        config: { timeout: 50 },
      });

      await expect(slowBreaker.execute(async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
        return 'done';
      })).rejects.toThrow('timed out');
    });
  });

  describe('callbacks', () => {
    it('should call onStateChange callback', async () => {
      const stateChanges: Array<{ from: CircuitState; to: CircuitState }> = [];

      const callbackBreaker = new CircuitBreaker({
        name: 'callback-test',
        config: { failureThreshold: 1 },
        onStateChange: (from, to) => stateChanges.push({ from, to }),
      });

      try {
        await callbackBreaker.execute(async () => { throw new Error('fail'); });
      } catch { /* expected */ }

      expect(stateChanges).toHaveLength(1);
      expect(stateChanges[0]).toEqual({
        from: CircuitState.CLOSED,
        to: CircuitState.OPEN,
      });
    });

    it('should call onFailure callback', async () => {
      const failures: Error[] = [];

      const callbackBreaker = new CircuitBreaker({
        name: 'failure-callback-test',
        onFailure: (error) => failures.push(error),
      });

      try {
        await callbackBreaker.execute(async () => { throw new Error('test'); });
      } catch { /* expected */ }

      expect(failures).toHaveLength(1);
      expect(failures[0].message).toBe('test');
    });

    it('should call onSuccess callback', async () => {
      let successCount = 0;

      const callbackBreaker = new CircuitBreaker({
        name: 'success-callback-test',
        onSuccess: () => successCount++,
      });

      await callbackBreaker.execute(async () => 'ok');

      expect(successCount).toBe(1);
    });
  });

  describe('reset', () => {
    it('should reset to initial state', async () => {
      breaker.forceOpen();
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      breaker.reset();

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      expect(breaker.getStats().consecutiveFailures).toBe(0);
    });
  });

  describe('forceOpen', () => {
    it('should force circuit to OPEN', () => {
      expect(breaker.getState()).toBe(CircuitState.CLOSED);

      breaker.forceOpen();

      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });
  });
});

describe('CircuitBreakerService', () => {
  let service: CircuitBreakerService;

  beforeEach(() => {
    service = new CircuitBreakerService();
  });

  describe('getOrCreate', () => {
    it('should create new circuit breaker', () => {
      const breaker = service.getOrCreate('test');

      expect(breaker).toBeInstanceOf(CircuitBreaker);
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should return existing breaker', () => {
      const breaker1 = service.getOrCreate('same-name');
      const breaker2 = service.getOrCreate('same-name');

      expect(breaker1).toBe(breaker2);
    });

    it('should use custom config', () => {
      const breaker = service.getOrCreate('custom', {
        config: { failureThreshold: 10 },
      });

      expect(breaker).toBeInstanceOf(CircuitBreaker);
    });
  });

  describe('get', () => {
    it('should return undefined for non-existent breaker', () => {
      expect(service.get('non-existent')).toBeUndefined();
    });

    it('should return existing breaker', () => {
      service.getOrCreate('existing');
      expect(service.get('existing')).toBeDefined();
    });
  });

  describe('getAll', () => {
    it('should return all breakers', () => {
      service.getOrCreate('a');
      service.getOrCreate('b');
      service.getOrCreate('c');

      const all = service.getAll();
      expect(all.size).toBe(3);
    });
  });

  describe('getAllStats', () => {
    it('should return stats for all breakers', async () => {
      const breaker = service.getOrCreate('stats-test');
      await breaker.execute(async () => 'ok');

      const stats = service.getAllStats();
      expect(stats['stats-test']).toBeDefined();
      expect(stats['stats-test'].totalSuccesses).toBe(1);
    });
  });

  describe('reset', () => {
    it('should reset specific breaker', () => {
      const breaker = service.getOrCreate('reset-test');
      breaker.forceOpen();

      const result = service.reset('reset-test');

      expect(result).toBe(true);
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should return false for non-existent breaker', () => {
      expect(service.reset('non-existent')).toBe(false);
    });
  });

  describe('resetAll', () => {
    it('should reset all breakers', () => {
      const breaker1 = service.getOrCreate('reset-all-1');
      const breaker2 = service.getOrCreate('reset-all-2');
      breaker1.forceOpen();
      breaker2.forceOpen();

      service.resetAll();

      expect(breaker1.getState()).toBe(CircuitState.CLOSED);
      expect(breaker2.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('remove', () => {
    it('should remove breaker', () => {
      service.getOrCreate('to-remove');
      expect(service.get('to-remove')).toBeDefined();

      const result = service.remove('to-remove');

      expect(result).toBe(true);
      expect(service.get('to-remove')).toBeUndefined();
    });
  });
});

describe('CircuitBreakerOpenError', () => {
  it('should create error with all properties', () => {
    const stats = {
      state: CircuitState.OPEN,
      failures: 5,
      successes: 0,
      totalCalls: 10,
      totalFailures: 5,
      totalSuccesses: 5,
      consecutiveFailures: 5,
      consecutiveSuccesses: 0,
    };

    const error = new CircuitBreakerOpenError('test', stats, 30000);

    expect(error.circuitName).toBe('test');
    expect(error.stats).toBe(stats);
    expect(error.resetTime).toBe(30000);
    expect(error.message).toContain('30');
  });
});

describe('DecisionOSCircuitConfigs', () => {
  it('should have predefined configs', () => {
    expect(DecisionOSCircuitConfigs.database).toBeDefined();
    expect(DecisionOSCircuitConfigs.redis).toBeDefined();
    expect(DecisionOSCircuitConfigs.externalApi).toBeDefined();
    expect(DecisionOSCircuitConfigs.learning).toBeDefined();
  });

  it('should have reasonable defaults', () => {
    expect(DecisionOSCircuitConfigs.database.failureThreshold).toBeGreaterThan(0);
    expect(DecisionOSCircuitConfigs.redis.timeout).toBeLessThan(10000);
  });
});
