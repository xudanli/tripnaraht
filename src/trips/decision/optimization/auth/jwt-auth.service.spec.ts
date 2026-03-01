import {
  JwtAuthService,
  ApiKeyAuthService,
  DecisionOSPermissions,
  DecisionOSRoles,
} from './jwt-auth.service';

describe('JwtAuthService', () => {
  let service: JwtAuthService;

  beforeEach(() => {
    service = new JwtAuthService({
      secret: 'test-secret-key-for-testing',
      issuer: 'test-issuer',
      audience: 'test-audience',
      expiresInSeconds: 3600,
    });
  });

  describe('generateToken', () => {
    it('should generate access token', () => {
      const result = service.generateToken('user-001');

      expect(result.accessToken).toBeDefined();
      expect(result.tokenType).toBe('Bearer');
      expect(result.expiresIn).toBe(3600);
    });

    it('should generate refresh token', () => {
      const serviceWithRefresh = new JwtAuthService({
        secret: 'test-secret',
        expiresInSeconds: 3600,
        refreshExpiresInSeconds: 86400,
      });

      const result = serviceWithRefresh.generateToken('user-001');

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
    });

    it('should include roles in token', () => {
      const result = service.generateToken('user-001', {
        roles: [DecisionOSRoles.ADMIN],
      });

      const payload = service.verifyToken(result.accessToken);
      expect(payload?.roles).toContain(DecisionOSRoles.ADMIN);
    });

    it('should include permissions in token', () => {
      const result = service.generateToken('user-001', {
        permissions: [DecisionOSPermissions.DECISION_WRITE],
      });

      const payload = service.verifyToken(result.accessToken);
      expect(payload?.permissions).toContain(DecisionOSPermissions.DECISION_WRITE);
    });

    it('should include metadata in token', () => {
      const result = service.generateToken('user-001', {
        metadata: { tier: 'premium' },
      });

      const payload = service.verifyToken(result.accessToken);
      expect(payload?.metadata).toEqual({ tier: 'premium' });
    });
  });

  describe('verifyToken', () => {
    it('should verify valid token', () => {
      const { accessToken } = service.generateToken('user-001');

      const payload = service.verifyToken(accessToken);

      expect(payload).toBeDefined();
      expect(payload?.sub).toBe('user-001');
    });

    it('should return null for invalid token', () => {
      const payload = service.verifyToken('invalid.token.here');

      expect(payload).toBeNull();
    });

    it('should return null for tampered token', () => {
      const { accessToken } = service.generateToken('user-001');
      const tamperedToken = accessToken.slice(0, -5) + 'xxxxx';

      const payload = service.verifyToken(tamperedToken);

      expect(payload).toBeNull();
    });

    it('should return null for expired token', () => {
      const expiredService = new JwtAuthService({
        secret: 'test-secret',
        expiresInSeconds: -1,
      });

      const { accessToken } = expiredService.generateToken('user-001');
      const payload = expiredService.verifyToken(accessToken);

      expect(payload).toBeNull();
    });

    it('should return null for wrong issuer', () => {
      const otherService = new JwtAuthService({
        secret: 'test-secret-key-for-testing',
        issuer: 'other-issuer',
        audience: 'test-audience',
        expiresInSeconds: 3600,
      });

      const { accessToken } = otherService.generateToken('user-001');
      const payload = service.verifyToken(accessToken);

      expect(payload).toBeNull();
    });

    it('should return null for wrong audience', () => {
      const otherService = new JwtAuthService({
        secret: 'test-secret-key-for-testing',
        issuer: 'test-issuer',
        audience: 'other-audience',
        expiresInSeconds: 3600,
      });

      const { accessToken } = otherService.generateToken('user-001');
      const payload = service.verifyToken(accessToken);

      expect(payload).toBeNull();
    });
  });

  describe('refreshToken', () => {
    it('should refresh valid token', () => {
      const serviceWithRefresh = new JwtAuthService({
        secret: 'test-secret',
        expiresInSeconds: 3600,
        refreshExpiresInSeconds: 86400,
      });

      const { refreshToken } = serviceWithRefresh.generateToken('user-001', {
        roles: [DecisionOSRoles.USER],
      });

      const newTokens = serviceWithRefresh.refreshToken(refreshToken!);

      expect(newTokens).toBeDefined();
      expect(newTokens?.accessToken).toBeDefined();

      const payload = serviceWithRefresh.verifyToken(newTokens!.accessToken);
      expect(payload?.sub).toBe('user-001');
    });

    it('should return null for invalid refresh token', () => {
      const result = service.refreshToken('invalid-token');

      expect(result).toBeNull();
    });
  });
});

describe('ApiKeyAuthService', () => {
  let service: ApiKeyAuthService;

  beforeEach(() => {
    service = new ApiKeyAuthService();
  });

  describe('registerKey', () => {
    it('should register API key', () => {
      service.registerKey('test-key-123', {
        name: 'test-app',
        roles: [DecisionOSRoles.SERVICE],
        permissions: [DecisionOSPermissions.DECISION_READ],
      });

      const info = service.validateKey('test-key-123');

      expect(info).toBeDefined();
      expect(info?.name).toBe('test-app');
    });
  });

  describe('validateKey', () => {
    beforeEach(() => {
      service.registerKey('valid-key', {
        name: 'valid-app',
        roles: [DecisionOSRoles.USER],
        permissions: [DecisionOSPermissions.DECISION_READ],
      });

      const expiredDate = new Date();
      expiredDate.setDate(expiredDate.getDate() - 1);

      service.registerKey('expired-key', {
        name: 'expired-app',
        roles: [DecisionOSRoles.USER],
        permissions: [],
        expiresAt: expiredDate,
      });
    });

    it('should validate existing key', () => {
      const info = service.validateKey('valid-key');

      expect(info).toBeDefined();
      expect(info?.name).toBe('valid-app');
      expect(info?.roles).toContain(DecisionOSRoles.USER);
    });

    it('should return null for non-existent key', () => {
      const info = service.validateKey('non-existent');

      expect(info).toBeNull();
    });

    it('should return null for expired key', () => {
      const info = service.validateKey('expired-key');

      expect(info).toBeNull();
    });
  });

  describe('revokeKey', () => {
    it('should revoke existing key', () => {
      service.registerKey('to-revoke', {
        name: 'revoke-app',
        roles: [],
        permissions: [],
      });

      const revoked = service.revokeKey('to-revoke');

      expect(revoked).toBe(true);
      expect(service.validateKey('to-revoke')).toBeNull();
    });

    it('should return false for non-existent key', () => {
      const revoked = service.revokeKey('non-existent');

      expect(revoked).toBe(false);
    });
  });

  describe('getHeaderName', () => {
    it('should return default header name', () => {
      expect(service.getHeaderName()).toBe('x-api-key');
    });

    it('should return custom header name', () => {
      const customService = new ApiKeyAuthService({
        headerName: 'x-custom-key',
      });

      expect(customService.getHeaderName()).toBe('x-custom-key');
    });
  });
});

describe('DecisionOSPermissions', () => {
  it('should define all permissions', () => {
    expect(DecisionOSPermissions.DECISION_READ).toBe('decision:read');
    expect(DecisionOSPermissions.DECISION_WRITE).toBe('decision:write');
    expect(DecisionOSPermissions.FEEDBACK_WRITE).toBe('feedback:write');
    expect(DecisionOSPermissions.SNAPSHOT_READ).toBe('snapshot:read');
    expect(DecisionOSPermissions.SNAPSHOT_ROLLBACK).toBe('snapshot:rollback');
    expect(DecisionOSPermissions.TRAINING_TRIGGER).toBe('training:trigger');
    expect(DecisionOSPermissions.METRICS_READ).toBe('metrics:read');
    expect(DecisionOSPermissions.ADMIN_ALL).toBe('admin:*');
  });
});

describe('DecisionOSRoles', () => {
  it('should define all roles', () => {
    expect(DecisionOSRoles.USER).toBe('user');
    expect(DecisionOSRoles.ADMIN).toBe('admin');
    expect(DecisionOSRoles.SERVICE).toBe('service');
    expect(DecisionOSRoles.READONLY).toBe('readonly');
  });
});
