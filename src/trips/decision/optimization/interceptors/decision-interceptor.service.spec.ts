import { AuditLogService } from './decision-interceptor.service';

describe('AuditLogService', () => {
  let service: AuditLogService;

  beforeEach(() => {
    service = new AuditLogService();
  });

  describe('log', () => {
    it('should create audit log entry with id and timestamp', () => {
      const entry = service.log({
        requestId: 'req-001',
        userId: 'user-001',
        action: 'MAKE_DECISION',
        resource: 'decision',
        method: 'POST',
        path: '/api/v2/decision',
      });

      expect(entry.id).toMatch(/^audit_/);
      expect(entry.timestamp).toBeDefined();
      expect(entry.requestId).toBe('req-001');
      expect(entry.userId).toBe('user-001');
      expect(entry.action).toBe('MAKE_DECISION');
    });

    it('should sanitize sensitive fields', () => {
      const entry = service.log({
        requestId: 'req-001',
        action: 'LOGIN',
        resource: 'auth',
        method: 'POST',
        path: '/api/auth/login',
        requestBody: {
          username: 'testuser',
          password: 'secret123',
          token: 'abc123',
        },
      });

      expect(entry.requestBody).toBeDefined();
      expect(entry.requestBody!['username']).toBe('testuser');
      expect(entry.requestBody!['password']).toBe('[REDACTED]');
      expect(entry.requestBody!['token']).toBe('[REDACTED]');
    });

    it('should sanitize nested sensitive fields', () => {
      const entry = service.log({
        requestId: 'req-001',
        action: 'UPDATE',
        resource: 'user',
        method: 'PUT',
        path: '/api/user',
        requestBody: {
          user: {
            name: 'Test',
            apiKey: 'secret-key',
          },
        },
      });

      expect((entry.requestBody!['user'] as any)['name']).toBe('Test');
      expect((entry.requestBody!['user'] as any)['apiKey']).toBe('[REDACTED]');
    });

    it('should truncate long strings', () => {
      const longString = 'a'.repeat(20000);
      const customService = new AuditLogService({ maxBodyLength: 100 });

      const entry = customService.log({
        requestId: 'req-001',
        action: 'UPLOAD',
        resource: 'file',
        method: 'POST',
        path: '/api/upload',
        requestBody: { content: longString },
      });

      expect((entry.requestBody!['content'] as string).length).toBeLessThan(200);
      expect(entry.requestBody!['content']).toContain('[truncated]');
    });

    it('should not log when disabled', () => {
      const disabledService = new AuditLogService({ enabled: false });

      const entry = disabledService.log({
        requestId: 'req-001',
        action: 'TEST',
        resource: 'test',
        method: 'GET',
        path: '/test',
      });

      expect(entry.id).toBe('');
      expect(disabledService.query({}).length).toBe(0);
    });
  });

  describe('query', () => {
    beforeEach(() => {
      service.log({ requestId: 'req-001', userId: 'user-001', action: 'ACTION_A', resource: 'res-a', method: 'GET', path: '/a', statusCode: 200 });
      service.log({ requestId: 'req-002', userId: 'user-001', action: 'ACTION_B', resource: 'res-b', method: 'POST', path: '/b', statusCode: 201 });
      service.log({ requestId: 'req-003', userId: 'user-002', action: 'ACTION_A', resource: 'res-a', method: 'GET', path: '/a', statusCode: 404 });
      service.log({ requestId: 'req-004', userId: 'user-002', action: 'ACTION_C', resource: 'res-c', method: 'DELETE', path: '/c', statusCode: 500 });
    });

    it('should return all logs without filter', () => {
      const results = service.query({});
      expect(results.length).toBe(4);
    });

    it('should filter by userId', () => {
      const results = service.query({ userId: 'user-001' });
      expect(results.length).toBe(2);
      expect(results.every(r => r.userId === 'user-001')).toBe(true);
    });

    it('should filter by action', () => {
      const results = service.query({ action: 'ACTION_A' });
      expect(results.length).toBe(2);
      expect(results.every(r => r.action === 'ACTION_A')).toBe(true);
    });

    it('should filter by resource', () => {
      const results = service.query({ resource: 'res-a' });
      expect(results.length).toBe(2);
    });

    it('should filter by statusCode', () => {
      const results = service.query({ statusCode: 500 });
      expect(results.length).toBe(1);
      expect(results[0].requestId).toBe('req-004');
    });

    it('should respect limit', () => {
      const results = service.query({ limit: 2 });
      expect(results.length).toBe(2);
    });

    it('should return most recent first', () => {
      const results = service.query({ limit: 2 });
      expect(results[0].requestId).toBe('req-004');
      expect(results[1].requestId).toBe('req-003');
    });
  });

  describe('getStats', () => {
    beforeEach(() => {
      service.log({ requestId: 'req-001', userId: 'user-001', action: 'ACTION_A', resource: 'res', method: 'GET', path: '/a', statusCode: 200, durationMs: 100 });
      service.log({ requestId: 'req-002', userId: 'user-001', action: 'ACTION_A', resource: 'res', method: 'GET', path: '/a', statusCode: 200, durationMs: 200 });
      service.log({ requestId: 'req-003', userId: 'user-002', action: 'ACTION_B', resource: 'res', method: 'POST', path: '/b', statusCode: 500, durationMs: 300 });
    });

    it('should return total logs count', () => {
      const stats = service.getStats();
      expect(stats.totalLogs).toBe(3);
    });

    it('should calculate success rate', () => {
      const stats = service.getStats();
      expect(stats.successRate).toBeCloseTo(0.667, 2);
    });

    it('should calculate average duration', () => {
      const stats = service.getStats();
      expect(stats.averageDuration).toBe(200);
    });

    it('should return top actions', () => {
      const stats = service.getStats();
      expect(stats.topActions[0].action).toBe('ACTION_A');
      expect(stats.topActions[0].count).toBe(2);
    });

    it('should return top users', () => {
      const stats = service.getStats();
      expect(stats.topUsers[0].userId).toBe('user-001');
      expect(stats.topUsers[0].count).toBe(2);
    });
  });

  describe('shouldExclude', () => {
    it('should exclude health endpoints', () => {
      expect(service.shouldExclude('/health')).toBe(true);
      expect(service.shouldExclude('/health/live')).toBe(true);
    });

    it('should exclude metrics endpoints', () => {
      expect(service.shouldExclude('/metrics')).toBe(true);
    });

    it('should not exclude api endpoints', () => {
      expect(service.shouldExclude('/api/v2/decision')).toBe(false);
    });

    it('should respect custom excludePaths', () => {
      const customService = new AuditLogService({
        excludePaths: ['/internal', '/debug'],
      });

      expect(customService.shouldExclude('/internal/status')).toBe(true);
      expect(customService.shouldExclude('/debug/logs')).toBe(true);
      expect(customService.shouldExclude('/api/endpoint')).toBe(false);
    });
  });

  describe('clear', () => {
    it('should clear all logs', () => {
      service.log({ requestId: 'req-001', action: 'TEST', resource: 'test', method: 'GET', path: '/test' });
      service.log({ requestId: 'req-002', action: 'TEST', resource: 'test', method: 'GET', path: '/test' });

      expect(service.query({}).length).toBe(2);

      service.clear();

      expect(service.query({}).length).toBe(0);
    });
  });

  describe('max logs limit', () => {
    it('should remove oldest logs when limit exceeded', () => {
      const smallService = new (AuditLogService as any)();
      (smallService as any).maxLogs = 3;

      smallService.log({ requestId: 'req-001', action: 'A', resource: 'r', method: 'G', path: '/1' });
      smallService.log({ requestId: 'req-002', action: 'A', resource: 'r', method: 'G', path: '/2' });
      smallService.log({ requestId: 'req-003', action: 'A', resource: 'r', method: 'G', path: '/3' });
      smallService.log({ requestId: 'req-004', action: 'A', resource: 'r', method: 'G', path: '/4' });

      const results = smallService.query({});
      expect(results.length).toBe(3);
      expect(results.some((r: any) => r.requestId === 'req-001')).toBe(false);
    });
  });
});
