import {
  DecisionOSClient,
  DecisionOSError,
  createDecisionOSClient,
  DecisionRequest,
  FeedbackRequest,
} from './decision-os-client';

describe('DecisionOSClient', () => {
  let client: DecisionOSClient;
  let mockFetch: jest.Mock;

  beforeEach(() => {
    mockFetch = jest.fn();
    global.fetch = mockFetch;

    client = new DecisionOSClient({
      baseUrl: 'http://localhost:3000',
      apiKey: 'test-api-key',
      timeout: 5000,
      retries: 2,
      retryDelay: 100,
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('constructor', () => {
    it('should create client with config', () => {
      const client = createDecisionOSClient({
        baseUrl: 'http://api.example.com/',
        apiKey: 'key123',
      });

      expect(client).toBeInstanceOf(DecisionOSClient);
    });

    it('should strip trailing slash from baseUrl', () => {
      const client = new DecisionOSClient({
        baseUrl: 'http://api.example.com/',
      });

      expect((client as any).baseUrl).toBe('http://api.example.com');
    });
  });

  describe('makeDecision', () => {
    it('should make decision request', async () => {
      const mockResponse = {
        requestId: 'req-001',
        recommendedAction: 'ACCEPT_PLAN',
        actionProbabilities: { ACCEPT_PLAN: 0.8 },
        expectedUtility: 0.75,
        confidence: 0.85,
        policyEntropy: 1.2,
        dsoVersion: 1,
        latencyMs: 50,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve(mockResponse),
      });

      const request: DecisionRequest = {
        requestId: 'req-001',
        userId: 'user-001',
        dso: { userIntent: { days: 5 } },
      };

      const result = await client.makeDecision(request);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v2/user/optimization/decide',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(request),
        }),
      );

      expect(result.recommendedAction).toBe('ACCEPT_PLAN');
      expect(result.expectedUtility).toBe(0.75);
    });
  });

  describe('submitFeedback', () => {
    it('should submit feedback', async () => {
      const mockResponse = {
        processed: true,
        learningTriggered: true,
        weightsUpdated: false,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve(mockResponse),
      });

      const request: FeedbackRequest = {
        decisionId: 'req-001',
        userId: 'user-001',
        satisfactionScore: 0.9,
      };

      const result = await client.submitFeedback(request);

      expect(result.processed).toBe(true);
      expect(result.learningTriggered).toBe(true);
    });
  });

  describe('getHealth', () => {
    it('should get health status', async () => {
      const mockResponse = {
        decisionOS: {
          status: 'up',
          details: {
            uptime: 3600000,
            totalDecisions: 100,
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve(mockResponse),
      });

      const result = await client.getHealth();

      expect(result.decisionOS.status).toBe('up');
    });
  });

  describe('isAlive', () => {
    it('should return true when alive', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve({ status: 'ok' }),
      });

      const result = await client.isAlive();
      expect(result).toBe(true);
    });

    it('should return false when not alive', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await client.isAlive();
      expect(result).toBe(false);
    });
  });

  describe('isReady', () => {
    it('should return true when ready', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve({ status: 'ok', ready: true }),
      });

      const result = await client.isReady();
      expect(result).toBe(true);
    });
  });

  describe('getSnapshots', () => {
    it('should get snapshots with params', async () => {
      const mockSnapshots = [
        { requestId: 'req-001', version: 1, phase: 'PLAN_GEN' },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve(mockSnapshots),
      });

      const result = await client.getSnapshots({
        requestId: 'req-001',
        limit: 10,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('requestId=req-001'),
        expect.anything(),
      );

      expect(result).toHaveLength(1);
    });
  });

  describe('getStabilityAnalysis', () => {
    it('should get stability analysis', async () => {
      const mockAnalysis = {
        requestId: 'req-001',
        isStable: true,
        values: [],
        isDecreasing: true,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve(mockAnalysis),
      });

      const result = await client.getStabilityAnalysis('req-001');

      expect(result.isStable).toBe(true);
    });
  });

  describe('computeDiff', () => {
    it('should compute diff between versions', async () => {
      const mockDiff = {
        fromVersion: 1,
        toVersion: 2,
        changes: [
          { path: 'systemState.confidence', type: 'changed', oldValue: 0.5, newValue: 0.8 },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve(mockDiff),
      });

      const result = await client.computeDiff('req-001', 1, 2);

      expect(result.changes).toHaveLength(1);
      expect(result.changes[0].path).toBe('systemState.confidence');
    });
  });

  describe('getPrometheusMetrics', () => {
    it('should get prometheus metrics as text', async () => {
      const mockMetrics = '# HELP decision_os_decisions_total\ndecision_os_decisions_total 100';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'text/plain']]),
        text: () => Promise.resolve(mockMetrics),
      });

      const result = await client.getPrometheusMetrics();

      expect(result).toContain('decision_os_decisions_total');
    });
  });

  describe('error handling', () => {
    it('should throw DecisionOSError on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve(JSON.stringify({
          message: 'Invalid request',
          code: 'VALIDATION_ERROR',
        })),
      });

      await expect(client.makeDecision({
        requestId: '',
        userId: '',
        dso: {},
      })).rejects.toThrow(DecisionOSError);
    });

    it('should include error details', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 422,
        text: () => Promise.resolve(JSON.stringify({
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: { field: 'requestId' },
        })),
      });

      try {
        await client.makeDecision({ requestId: '', userId: '', dso: {} });
      } catch (e) {
        const error = e as DecisionOSError;
        expect(error.statusCode).toBe(422);
        expect(error.code).toBe('VALIDATION_ERROR');
        expect(error.details).toEqual({ field: 'requestId' });
      }
    });
  });

  describe('retry mechanism', () => {
    it('should retry on server error', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Internal Server Error'),
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: new Map([['content-type', 'application/json']]),
          json: () => Promise.resolve({ status: 'ok' }),
        });

      const result = await client.getHealth();

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result).toBeDefined();
    });

    it('should not retry on client error (4xx)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Bad Request'),
      });

      await expect(client.getHealth()).rejects.toThrow();
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should use exponential backoff', async () => {
      const startTime = Date.now();

      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 500, text: () => Promise.resolve('Error') })
        .mockResolvedValueOnce({ ok: false, status: 500, text: () => Promise.resolve('Error') })
        .mockResolvedValueOnce({
          ok: true,
          headers: new Map([['content-type', 'application/json']]),
          json: () => Promise.resolve({ status: 'ok' }),
        });

      await client.getHealth();

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeGreaterThanOrEqual(200);
    });
  });

  describe('timeout handling', () => {
    it('should timeout long requests', async () => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';

      mockFetch.mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(abortError), 100);
        });
      });

      const shortTimeoutClient = new DecisionOSClient({
        baseUrl: 'http://localhost:3000',
        timeout: 50,
        retries: 0,
      });

      await expect(shortTimeoutClient.getHealth()).rejects.toThrow();
    });
  });

  describe('authorization', () => {
    it('should include API key in header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve({}),
      });

      await client.getHealth();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key',
          }),
        }),
      );
    });
  });
});

describe('DecisionOSError', () => {
  it('should create error with all properties', () => {
    const error = new DecisionOSError('Test error', 400, 'TEST_ERROR', { foo: 'bar' });

    expect(error.message).toBe('Test error');
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('TEST_ERROR');
    expect(error.details).toEqual({ foo: 'bar' });
    expect(error.name).toBe('DecisionOSError');
  });
});
