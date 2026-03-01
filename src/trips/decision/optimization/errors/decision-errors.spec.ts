import {
  DecisionError,
  DecisionErrorCode,
  DecisionErrorFactory,
  ValidationError,
  ConstraintViolationError,
  StateError,
  LockError,
  LearningError,
  ExternalServiceError,
  DefaultErrorHandler,
  ErrorHandlerChain,
  RetryRecoveryStrategy,
  FallbackRecoveryStrategy,
} from './decision-errors';

describe('DecisionError', () => {
  describe('constructor', () => {
    it('should create error with all properties', () => {
      const error = new DecisionError(
        'Test error',
        DecisionErrorCode.INTERNAL,
        500,
        { field: 'test' },
        true,
      );

      expect(error.message).toBe('Test error');
      expect(error.code).toBe(DecisionErrorCode.INTERNAL);
      expect(error.statusCode).toBe(500);
      expect(error.details).toEqual({ field: 'test' });
      expect(error.retryable).toBe(true);
      expect(error.timestamp).toBeDefined();
    });

    it('should be an instance of Error', () => {
      const error = new DecisionError('Test', DecisionErrorCode.UNKNOWN);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('toJSON', () => {
    it('should serialize to JSON', () => {
      const error = new DecisionError('Test', DecisionErrorCode.INTERNAL, 500, { foo: 'bar' }, true);
      const json = error.toJSON();

      expect(json.name).toBe('DecisionError');
      expect(json.code).toBe(DecisionErrorCode.INTERNAL);
      expect(json.message).toBe('Test');
      expect(json.details).toEqual({ foo: 'bar' });
    });
  });
});

describe('Specific Error Classes', () => {
  describe('ValidationError', () => {
    it('should create validation error', () => {
      const error = new ValidationError('Invalid input', { field: 'name' });

      expect(error.name).toBe('ValidationError');
      expect(error.code).toBe(DecisionErrorCode.VALIDATION_FAILED);
      expect(error.statusCode).toBe(400);
      expect(error.retryable).toBe(false);
    });
  });

  describe('ConstraintViolationError', () => {
    it('should create soft constraint error', () => {
      const error = new ConstraintViolationError('Budget exceeded', 'MAX_BUDGET', false);

      expect(error.name).toBe('ConstraintViolationError');
      expect(error.code).toBe(DecisionErrorCode.SOFT_CONSTRAINT_VIOLATED);
      expect(error.details?.constraint).toBe('MAX_BUDGET');
    });

    it('should create hard constraint error', () => {
      const error = new ConstraintViolationError('Time limit exceeded', 'TIME_LIMIT', true);

      expect(error.code).toBe(DecisionErrorCode.HARD_CONSTRAINT_VIOLATED);
    });
  });

  describe('StateError', () => {
    it('should create state error', () => {
      const error = new StateError('Invalid state transition');

      expect(error.name).toBe('StateError');
      expect(error.statusCode).toBe(409);
    });
  });

  describe('LockError', () => {
    it('should create lock error', () => {
      const error = new LockError('Lock timeout');

      expect(error.name).toBe('LockError');
      expect(error.statusCode).toBe(503);
      expect(error.retryable).toBe(true);
    });
  });

  describe('LearningError', () => {
    it('should create learning error', () => {
      const error = new LearningError('Training failed');

      expect(error.name).toBe('LearningError');
      expect(error.retryable).toBe(true);
    });
  });

  describe('ExternalServiceError', () => {
    it('should create external service error', () => {
      const error = new ExternalServiceError('Database connection failed', 'postgres');

      expect(error.name).toBe('ExternalServiceError');
      expect(error.statusCode).toBe(502);
      expect(error.details?.service).toBe('postgres');
    });
  });
});

describe('DecisionErrorFactory', () => {
  describe('validation', () => {
    it('should create validation error', () => {
      const error = DecisionErrorFactory.validation('email', 'Invalid email', 'email@test.com', 'invalid');

      expect(error).toBeInstanceOf(ValidationError);
      expect(error.details?.field).toBe('email');
      expect(error.details?.expected).toBe('email@test.com');
      expect(error.details?.actual).toBe('invalid');
    });
  });

  describe('invalidDSO', () => {
    it('should create invalid DSO error', () => {
      const error = DecisionErrorFactory.invalidDSO('missing userIntent');

      expect(error.message).toContain('无效的 DSO');
      expect(error.message).toContain('missing userIntent');
    });
  });

  describe('missingField', () => {
    it('should create missing field error', () => {
      const error = DecisionErrorFactory.missingField('requestId');

      expect(error.message).toContain('缺少必需字段');
      expect(error.details?.field).toBe('requestId');
    });
  });

  describe('constraintViolation', () => {
    it('should create constraint violation error', () => {
      const error = DecisionErrorFactory.constraintViolation('BUDGET', 'Over budget', true);

      expect(error).toBeInstanceOf(ConstraintViolationError);
      expect(error.details?.constraint).toBe('BUDGET');
    });
  });

  describe('infeasibleSolution', () => {
    it('should create infeasible solution error', () => {
      const error = DecisionErrorFactory.infeasibleSolution(['TIME', 'BUDGET']);

      expect(error.code).toBe(DecisionErrorCode.HARD_CONSTRAINT_VIOLATED);
      expect(error.details?.violations).toEqual(['TIME', 'BUDGET']);
    });
  });

  describe('dsoNotFound', () => {
    it('should create DSO not found error', () => {
      const error = DecisionErrorFactory.dsoNotFound('req-123');

      expect(error.code).toBe(DecisionErrorCode.DSO_NOT_FOUND);
      expect(error.details?.requestId).toBe('req-123');
    });
  });

  describe('versionConflict', () => {
    it('should create version conflict error', () => {
      const error = DecisionErrorFactory.versionConflict(1, 2);

      expect(error.code).toBe(DecisionErrorCode.VERSION_CONFLICT);
      expect(error.message).toContain('预期 1');
      expect(error.message).toContain('实际 2');
    });
  });

  describe('lockTimeout', () => {
    it('should create lock timeout error', () => {
      const error = DecisionErrorFactory.lockTimeout('dso:user-123', 5000);

      expect(error.code).toBe(DecisionErrorCode.LOCK_TIMEOUT);
      expect(error.details?.resource).toBe('dso:user-123');
    });
  });

  describe('lockAcquisitionFailed', () => {
    it('should create lock acquisition failed error', () => {
      const error = DecisionErrorFactory.lockAcquisitionFailed('dso:user-123');

      expect(error.code).toBe(DecisionErrorCode.LOCK_ACQUISITION_FAILED);
    });
  });

  describe('learningFailed', () => {
    it('should create learning failed error', () => {
      const error = DecisionErrorFactory.learningFailed('Gradient explosion');

      expect(error).toBeInstanceOf(LearningError);
      expect(error.message).toContain('Gradient explosion');
    });
  });

  describe('convergenceFailed', () => {
    it('should create convergence failed error', () => {
      const error = DecisionErrorFactory.convergenceFailed(100);

      expect(error.code).toBe(DecisionErrorCode.CONVERGENCE_FAILED);
      expect(error.details?.iterations).toBe(100);
    });
  });

  describe('databaseError', () => {
    it('should create database error', () => {
      const originalError = new Error('Connection refused');
      const error = DecisionErrorFactory.databaseError('INSERT', originalError);

      expect(error).toBeInstanceOf(ExternalServiceError);
      expect(error.details?.service).toBe('database');
      expect(error.details?.originalError).toBe('Connection refused');
    });
  });

  describe('cacheError', () => {
    it('should create cache error', () => {
      const error = DecisionErrorFactory.cacheError('GET');

      expect(error.details?.service).toBe('cache');
    });
  });
});

describe('ErrorHandlerChain', () => {
  describe('handle', () => {
    it('should use first matching handler', () => {
      const chain = new ErrorHandlerChain();

      const customHandler = {
        canHandle: (e: unknown) => e instanceof ValidationError,
        handle: (e: unknown) => new DecisionError('Custom handled', DecisionErrorCode.VALIDATION_FAILED, 400),
      };

      chain.addHandler(customHandler);

      const result = chain.handle(new ValidationError('Test'));

      expect(result.message).toBe('Custom handled');
    });

    it('should fall back to default handler', () => {
      const chain = new ErrorHandlerChain();
      const result = chain.handle(new Error('Generic error'));

      expect(result).toBeInstanceOf(DecisionError);
      expect(result.code).toBe(DecisionErrorCode.INTERNAL);
    });
  });
});

describe('DefaultErrorHandler', () => {
  const handler = new DefaultErrorHandler();

  it('should handle DecisionError', () => {
    const original = new DecisionError('Test', DecisionErrorCode.INTERNAL);
    const result = handler.handle(original);

    expect(result).toBe(original);
  });

  it('should wrap Error', () => {
    const original = new Error('Generic error');
    const result = handler.handle(original);

    expect(result).toBeInstanceOf(DecisionError);
    expect(result.message).toBe('Generic error');
    expect(result.code).toBe(DecisionErrorCode.INTERNAL);
  });

  it('should wrap non-Error', () => {
    const result = handler.handle('string error');

    expect(result.message).toBe('string error');
    expect(result.code).toBe(DecisionErrorCode.UNKNOWN);
  });
});

describe('RetryRecoveryStrategy', () => {
  describe('canRecover', () => {
    it('should return true for retryable errors', () => {
      const strategy = new RetryRecoveryStrategy();
      const error = new LockError('Timeout');

      expect(strategy.canRecover(error)).toBe(true);
    });

    it('should return false for non-retryable errors', () => {
      const strategy = new RetryRecoveryStrategy();
      const error = new ValidationError('Invalid');

      expect(strategy.canRecover(error)).toBe(false);
    });
  });

  describe('recover', () => {
    it('should call function after delay', async () => {
      const strategy = new RetryRecoveryStrategy(3, 10, 100);

      const fn = jest.fn(async () => 'success');

      const result = await strategy.recover(
        new LockError('Initial'),
        { fn, attempt: 0 },
      );

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should throw after max retries', async () => {
      const strategy = new RetryRecoveryStrategy(2, 10, 100);
      const error = new LockError('Persistent error');

      await expect(strategy.recover(error, { fn: async () => 'result', attempt: 2 })).rejects.toThrow();
    });

    it('should use exponential backoff delay', async () => {
      const strategy = new RetryRecoveryStrategy(3, 100, 1000);
      const startTime = Date.now();

      await strategy.recover(new LockError('Test'), { fn: async () => 'done', attempt: 1 });

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeGreaterThanOrEqual(100);
    });
  });
});

describe('FallbackRecoveryStrategy', () => {
  it('should always return fallback value', async () => {
    const strategy = new FallbackRecoveryStrategy(() => 'fallback');

    const result = await strategy.recover(new DecisionError('Error', DecisionErrorCode.INTERNAL), {});

    expect(result).toBe('fallback');
  });

  it('should always be able to recover', () => {
    const strategy = new FallbackRecoveryStrategy(() => null);
    expect(strategy.canRecover(new DecisionError('Any', DecisionErrorCode.UNKNOWN))).toBe(true);
  });
});
