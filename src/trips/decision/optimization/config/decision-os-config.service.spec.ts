import {
  DecisionOSConfigService,
  ConfigValidator,
  DecisionOSConfig,
} from './decision-os-config.service';

describe('ConfigValidator', () => {
  let validator: ConfigValidator;

  beforeEach(() => {
    validator = new ConfigValidator();
  });

  const createValidConfig = (): DecisionOSConfig => ({
    general: {
      environment: 'development',
      logLevel: 'info',
      serviceName: 'test-service',
      serviceVersion: '1.0.0',
    },
    decision: {
      defaultTimeoutMs: 5000,
      maxConcurrentDecisions: 100,
      monteCarloSamples: 1000,
      explorationRate: 0.1,
      confidenceThreshold: 0.8,
      cgusMaxIterations: 100,
      cgusConvergenceThreshold: 0.001,
      cgusMaxCandidates: 8,
      cgusRolloutTopK: 3,
      cgusRepairMaxIters: 2,
      cgusRepairTopKPerCandidate: 2,
      cgusMaxNewCandidatesPerIter: 30,
      cgusMaxPoolSize: 200,
      cgusPilotSamples: 20,
    },
    ragEvidence: {
      enabled: false,
      minQueryLength: 1,
      confidenceThreshold: 0.25,
    },
    learning: {
      enabled: true,
      learningRate: 0.001,
      batchSize: 32,
      maxIterations: 1000,
      convergenceThreshold: 0.0001,
      snapshotInterval: 100,
      autoTrainThreshold: 1000,
    },
    cache: {
      enabled: true,
      l1MaxSize: 1000,
      l1TtlSeconds: 300,
      l2Enabled: false,
      l2TtlSeconds: 3600,
    },
    database: {
      host: 'localhost',
      port: 5432,
      database: 'test',
      username: 'user',
      password: 'pass',
      poolSize: 10,
      connectionTimeoutMs: 5000,
    },
    redis: {
      enabled: false,
      host: 'localhost',
      port: 6379,
      db: 0,
      keyPrefix: 'test:',
    },
    tracing: {
      enabled: false,
      samplingRate: 0.1,
      exporterEndpoint: 'http://localhost:4318',
      serviceName: 'test',
    },
    metrics: {
      enabled: true,
      prefix: 'test',
      defaultLabels: {},
      histogramBuckets: [0.1, 1, 10],
    },
    security: {
      jwtSecret: 'a-very-long-secret-key-for-testing-purposes-only',
      jwtExpiresInSeconds: 3600,
      apiKeyHeaderName: 'x-api-key',
      corsOrigins: ['*'],
      rateLimitEnabled: true,
    },
    rateLimit: {
      windowMs: 60000,
      maxRequests: 100,
      skipSuccessfulRequests: false,
    },
    websocket: {
      enabled: true,
      heartbeatIntervalMs: 30000,
      clientTimeoutMs: 120000,
      maxClientsPerChannel: 1000,
    },
  });

  it('should validate valid config', () => {
    const config = createValidConfig();
    const result = validator.validate(config);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should detect invalid environment', () => {
    const config = createValidConfig();
    (config.general as any).environment = 'invalid';

    const result = validator.validate(config);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path === 'general.environment')).toBe(true);
  });

  it('should detect missing service name', () => {
    const config = createValidConfig();
    config.general.serviceName = '';

    const result = validator.validate(config);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path === 'general.serviceName')).toBe(true);
  });

  it('should detect invalid exploration rate', () => {
    const config = createValidConfig();
    config.decision.explorationRate = 1.5;

    const result = validator.validate(config);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path === 'decision.explorationRate')).toBe(true);
  });

  it('should detect invalid learning rate', () => {
    const config = createValidConfig();
    config.learning.learningRate = 0;

    const result = validator.validate(config);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path === 'learning.learningRate')).toBe(true);
  });

  it('should warn about low timeout', () => {
    const config = createValidConfig();
    config.decision.defaultTimeoutMs = 50;

    const result = validator.validate(config);

    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('should warn about short JWT secret', () => {
    const config = createValidConfig();
    config.security.jwtSecret = 'short';

    const result = validator.validate(config);

    expect(result.warnings.some(w => w.includes('jwtSecret'))).toBe(true);
  });
});

describe('DecisionOSConfigService', () => {
  let service: DecisionOSConfigService;

  beforeEach(() => {
    service = new DecisionOSConfigService({
      general: {
        environment: 'development',
        logLevel: 'debug',
        serviceName: 'test-service',
        serviceVersion: '1.0.0',
      },
      security: {
        jwtSecret: 'a-very-long-secret-key-for-testing-purposes',
        jwtExpiresInSeconds: 3600,
        apiKeyHeaderName: 'x-api-key',
        corsOrigins: ['*'],
        rateLimitEnabled: true,
      },
    });
  });

  describe('get', () => {
    it('should return config section', () => {
      const general = service.get('general');

      expect(general.serviceName).toBe('test-service');
      expect(general.environment).toBe('development');
    });

    it('should return defaults for unspecified sections', () => {
      const decision = service.get('decision');

      expect(decision.defaultTimeoutMs).toBeDefined();
      expect(decision.monteCarloSamples).toBeDefined();
    });
  });

  describe('getAll', () => {
    it('should return complete config', () => {
      const config = service.getAll();

      expect(config.general).toBeDefined();
      expect(config.decision).toBeDefined();
      expect(config.learning).toBeDefined();
      expect(config.cache).toBeDefined();
    });

    it('should return frozen object', () => {
      const config = service.getAll();

      expect(Object.isFrozen(config)).toBe(true);
    });
  });

  describe('update', () => {
    it('should update config section', () => {
      service.update('decision', { defaultTimeoutMs: 10000 });

      expect(service.get('decision').defaultTimeoutMs).toBe(10000);
    });

    it('should preserve other values in section', () => {
      const originalSamples = service.get('decision').monteCarloSamples;

      service.update('decision', { defaultTimeoutMs: 10000 });

      expect(service.get('decision').monteCarloSamples).toBe(originalSamples);
    });

    it('should create snapshot before update', () => {
      service.update('decision', { defaultTimeoutMs: 10000 });

      const snapshot = service.getSnapshot(0);
      expect(snapshot).toBeDefined();
    });
  });

  describe('onChange', () => {
    it('should notify listeners on update', () => {
      const callback = jest.fn();
      service.onChange('decision', callback);

      service.update('decision', { defaultTimeoutMs: 8000 });

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ defaultTimeoutMs: 8000 }),
      );
    });

    it('should return unsubscribe function', () => {
      const callback = jest.fn();
      const unsubscribe = service.onChange('decision', callback);

      unsubscribe();
      service.update('decision', { defaultTimeoutMs: 8000 });

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('validate', () => {
    it('should return validation result', () => {
      const result = service.validate();

      expect(result.valid).toBeDefined();
      expect(result.errors).toBeDefined();
      expect(result.warnings).toBeDefined();
    });
  });

  describe('snapshots', () => {
    it('should get latest snapshot', () => {
      service.update('decision', { defaultTimeoutMs: 6000 });
      service.update('decision', { defaultTimeoutMs: 7000 });

      const snapshot = service.getSnapshot();
      expect(snapshot?.decision.defaultTimeoutMs).toBe(6000);
    });

    it('should get snapshot by index', () => {
      service.update('decision', { defaultTimeoutMs: 6000 });
      service.update('decision', { defaultTimeoutMs: 7000 });

      const snapshot = service.getSnapshot(0);
      expect(snapshot).toBeDefined();
    });

    it('should get snapshot history', () => {
      service.update('decision', { defaultTimeoutMs: 6000 });
      service.update('decision', { defaultTimeoutMs: 7000 });

      const history = service.getSnapshotHistory();
      expect(history.length).toBe(2);
    });
  });

  describe('rollback', () => {
    it('should rollback to previous config', () => {
      const originalTimeout = service.get('decision').defaultTimeoutMs;

      service.update('decision', { defaultTimeoutMs: 9999 });

      const success = service.rollback(0);

      expect(success).toBe(true);
      expect(service.get('decision').defaultTimeoutMs).toBe(originalTimeout);
    });

    it('should return false for invalid index', () => {
      const success = service.rollback(999);
      expect(success).toBe(false);
    });
  });

  describe('onModuleInit', () => {
    it('should complete without error', () => {
      expect(() => service.onModuleInit()).not.toThrow();
    });

    it('should log initialization message', () => {
      const loggerSpy = jest.spyOn((service as any).logger, 'log');

      service.onModuleInit();

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Initialized'),
      );
    });
  });
});
