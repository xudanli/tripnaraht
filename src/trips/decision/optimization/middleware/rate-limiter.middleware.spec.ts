import {
  MemoryRateLimitStore,
  TokenBucketLimiter,
  RateLimiterService,
  DecisionOSRateLimits,
  DecisionOSTokenBuckets,
} from './rate-limiter.middleware';

describe('MemoryRateLimitStore', () => {
  let store: MemoryRateLimitStore;

  beforeEach(() => {
    store = new MemoryRateLimitStore(60000);
  });

  afterEach(() => {
    store.destroy();
  });

  describe('get and set', () => {
    it('should store and retrieve entries', async () => {
      const entry = { count: 5, resetTime: Date.now() + 60000 };
      await store.set('key1', entry);

      const result = await store.get('key1');
      expect(result).toEqual(entry);
    });

    it('should return undefined for non-existent keys', async () => {
      const result = await store.get('non-existent');
      expect(result).toBeUndefined();
    });

    it('should return undefined for expired entries', async () => {
      const entry = { count: 5, resetTime: Date.now() - 1000 };
      await store.set('expired', entry);

      const result = await store.get('expired');
      expect(result).toBeUndefined();
    });
  });

  describe('increment', () => {
    it('should create new entry if not exists', async () => {
      const result = await store.increment('new-key', 60000);

      expect(result.count).toBe(1);
      expect(result.resetTime).toBeGreaterThan(Date.now());
    });

    it('should increment existing entry', async () => {
      await store.increment('key', 60000);
      await store.increment('key', 60000);
      const result = await store.increment('key', 60000);

      expect(result.count).toBe(3);
    });

    it('should reset count after window expires', async () => {
      const entry = { count: 5, resetTime: Date.now() - 1000 };
      await store.set('expired-key', entry);

      const result = await store.increment('expired-key', 60000);
      expect(result.count).toBe(1);
    });
  });

  describe('reset', () => {
    it('should remove entry', async () => {
      await store.increment('to-reset', 60000);
      await store.reset('to-reset');

      const result = await store.get('to-reset');
      expect(result).toBeUndefined();
    });
  });
});

describe('TokenBucketLimiter', () => {
  let limiter: TokenBucketLimiter;

  beforeEach(() => {
    limiter = new TokenBucketLimiter({
      capacity: 10,
      refillRate: 2,
      refillIntervalMs: 100,
    });
  });

  describe('tryConsume', () => {
    it('should consume tokens when available', () => {
      expect(limiter.tryConsume('user1', 5)).toBe(true);
      expect(limiter.getTokens('user1')).toBe(5);
    });

    it('should fail when not enough tokens', () => {
      limiter.tryConsume('user1', 8);
      expect(limiter.tryConsume('user1', 5)).toBe(false);
    });

    it('should refill tokens over time', async () => {
      limiter.tryConsume('user1', 10);
      expect(limiter.getTokens('user1')).toBe(0);

      await new Promise(resolve => setTimeout(resolve, 150));

      expect(limiter.getTokens('user1')).toBeGreaterThan(0);
    });

    it('should not exceed capacity', async () => {
      await new Promise(resolve => setTimeout(resolve, 500));

      expect(limiter.getTokens('user1')).toBe(10);
    });
  });

  describe('getTokens', () => {
    it('should return capacity for new keys', () => {
      expect(limiter.getTokens('new-user')).toBe(10);
    });

    it('should return remaining tokens', () => {
      limiter.tryConsume('user1', 3);
      expect(limiter.getTokens('user1')).toBe(7);
    });
  });

  describe('reset', () => {
    it('should reset bucket to capacity', () => {
      limiter.tryConsume('user1', 8);
      limiter.reset('user1');

      expect(limiter.getTokens('user1')).toBe(10);
    });
  });
});

describe('RateLimiterService', () => {
  let service: RateLimiterService;

  beforeEach(() => {
    service = new RateLimiterService();
  });

  afterEach(() => {
    (service as any).store?.destroy?.();
  });

  describe('checkLimit', () => {
    it('should return rate limit info', async () => {
      const config = { windowMs: 60000, maxRequests: 10 };
      const info = await service.checkLimit('key1', config);

      expect(info.limit).toBe(10);
      expect(info.remaining).toBe(9);
      expect(info.resetTime).toBeGreaterThan(Date.now());
      expect(info.retryAfter).toBeUndefined();
    });

    it('should track requests across calls', async () => {
      const config = { windowMs: 60000, maxRequests: 5 };

      for (let i = 0; i < 5; i++) {
        await service.checkLimit('key2', config);
      }

      const info = await service.checkLimit('key2', config);
      expect(info.remaining).toBe(0);
      expect(info.retryAfter).toBeDefined();
    });
  });

  describe('isAllowed', () => {
    it('should return true when under limit', async () => {
      const config = { windowMs: 60000, maxRequests: 10 };
      const allowed = await service.isAllowed('key3', config);

      expect(allowed).toBe(true);
    });

    it('should return false when over limit', async () => {
      const config = { windowMs: 60000, maxRequests: 2 };

      await service.checkLimit('key4', config);
      await service.checkLimit('key4', config);
      await service.checkLimit('key4', config);

      const allowed = await service.isAllowed('key4', config);
      expect(allowed).toBe(false);
    });
  });

  describe('reset', () => {
    it('should reset rate limit', async () => {
      const config = { windowMs: 60000, maxRequests: 2 };

      await service.checkLimit('key5', config);
      await service.checkLimit('key5', config);
      await service.checkLimit('key5', config);

      await service.reset('key5');

      const info = await service.checkLimit('key5', config);
      expect(info.remaining).toBe(1);
    });
  });

  describe('getTokenBucket', () => {
    it('should create and return token bucket', () => {
      const bucket = service.getTokenBucket('test', DecisionOSTokenBuckets.decision);

      expect(bucket).toBeInstanceOf(TokenBucketLimiter);
      expect(bucket.getTokens('user')).toBe(100);
    });

    it('should return same bucket for same name', () => {
      const bucket1 = service.getTokenBucket('same', DecisionOSTokenBuckets.decision);
      const bucket2 = service.getTokenBucket('same', DecisionOSTokenBuckets.decision);

      expect(bucket1).toBe(bucket2);
    });
  });
});

describe('DecisionOSRateLimits', () => {
  it('should have predefined configs', () => {
    expect(DecisionOSRateLimits.decision).toBeDefined();
    expect(DecisionOSRateLimits.feedback).toBeDefined();
    expect(DecisionOSRateLimits.admin).toBeDefined();
    expect(DecisionOSRateLimits.metrics).toBeDefined();
    expect(DecisionOSRateLimits.training).toBeDefined();
  });

  it('should have reasonable limits', () => {
    expect(DecisionOSRateLimits.decision.maxRequests).toBe(60);
    expect(DecisionOSRateLimits.admin.maxRequests).toBe(30);
    expect(DecisionOSRateLimits.training.maxRequests).toBe(10);
  });
});

describe('DecisionOSTokenBuckets', () => {
  it('should have predefined configs', () => {
    expect(DecisionOSTokenBuckets.decision).toBeDefined();
    expect(DecisionOSTokenBuckets.burst).toBeDefined();
  });

  it('should have reasonable capacities', () => {
    expect(DecisionOSTokenBuckets.decision.capacity).toBe(100);
    expect(DecisionOSTokenBuckets.burst.capacity).toBe(50);
  });
});
