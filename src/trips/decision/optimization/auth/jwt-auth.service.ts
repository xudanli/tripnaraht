/**
 * Decision OS JWT 认证服务
 * 
 * 提供:
 * - JWT 令牌生成和验证
 * - 认证守卫
 * - API Key 认证
 * - 权限控制
 */

import { Injectable, Logger, CanActivate, ExecutionContext, UnauthorizedException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import * as crypto from 'crypto';

// ========== 类型定义 ==========

export interface JwtPayload {
  sub: string;
  iat: number;
  exp: number;
  iss?: string;
  aud?: string;
  roles?: string[];
  permissions?: string[];
  metadata?: Record<string, unknown>;
}

export interface JwtConfig {
  secret: string;
  issuer?: string;
  audience?: string;
  expiresInSeconds: number;
  refreshExpiresInSeconds?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  tokenType: string;
}

export interface ApiKeyConfig {
  keys: Map<string, ApiKeyInfo>;
  headerName: string;
}

export interface ApiKeyInfo {
  name: string;
  roles: string[];
  permissions: string[];
  rateLimit?: number;
  expiresAt?: Date;
}

export interface AuthenticatedUser {
  id: string;
  roles: string[];
  permissions: string[];
  authMethod: 'jwt' | 'api_key';
  metadata?: Record<string, unknown>;
}

// ========== 权限常量 ==========

export const DecisionOSPermissions = {
  DECISION_READ: 'decision:read',
  DECISION_WRITE: 'decision:write',
  FEEDBACK_WRITE: 'feedback:write',
  SNAPSHOT_READ: 'snapshot:read',
  SNAPSHOT_ROLLBACK: 'snapshot:rollback',
  TRAINING_TRIGGER: 'training:trigger',
  METRICS_READ: 'metrics:read',
  ADMIN_ALL: 'admin:*',
} as const;

export const DecisionOSRoles = {
  USER: 'user',
  ADMIN: 'admin',
  SERVICE: 'service',
  READONLY: 'readonly',
} as const;

// ========== 装饰器 ==========

export const PERMISSIONS_KEY = 'permissions';
export const ROLES_KEY = 'roles';
export const PUBLIC_KEY = 'isPublic';

export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const RequireRoles = (...roles: string[]) =>
  SetMetadata(ROLES_KEY, roles);

export const Public = () => SetMetadata(PUBLIC_KEY, true);

// ========== JWT 服务 ==========

@Injectable()
export class JwtAuthService {
  private readonly logger = new Logger(JwtAuthService.name);
  private readonly config: JwtConfig;

  constructor(config?: Partial<JwtConfig>) {
    this.config = {
      secret: config?.secret ?? process.env.JWT_SECRET ?? 'decision-os-default-secret-change-me',
      issuer: config?.issuer ?? 'decision-os',
      audience: config?.audience ?? 'decision-os-api',
      expiresInSeconds: config?.expiresInSeconds ?? 3600,
      refreshExpiresInSeconds: config?.refreshExpiresInSeconds ?? 86400 * 7,
    };

    if (this.config.secret === 'decision-os-default-secret-change-me') {
      this.logger.warn('[Auth] 使用默认 JWT Secret，请在生产环境中设置 JWT_SECRET');
    }
  }

  generateToken(userId: string, options?: {
    roles?: string[];
    permissions?: string[];
    metadata?: Record<string, unknown>;
    expiresInSeconds?: number;
  }): TokenPair {
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = options?.expiresInSeconds ?? this.config.expiresInSeconds;

    const payload: JwtPayload = {
      sub: userId,
      iat: now,
      exp: now + expiresIn,
      iss: this.config.issuer,
      aud: this.config.audience,
      roles: options?.roles ?? [DecisionOSRoles.USER],
      permissions: options?.permissions ?? [DecisionOSPermissions.DECISION_READ],
      metadata: options?.metadata,
    };

    const accessToken = this.sign(payload);

    let refreshToken: string | undefined;
    if (this.config.refreshExpiresInSeconds) {
      const refreshPayload: JwtPayload = {
        ...payload,
        exp: now + this.config.refreshExpiresInSeconds,
      };
      refreshToken = this.sign(refreshPayload);
    }

    return {
      accessToken,
      refreshToken,
      expiresIn,
      tokenType: 'Bearer',
    };
  }

  verifyToken(token: string): JwtPayload | null {
    try {
      const [headerB64, payloadB64, signatureB64] = token.split('.');
      if (!headerB64 || !payloadB64 || !signatureB64) {
        return null;
      }

      const expectedSignature = this.createSignature(headerB64, payloadB64);
      if (signatureB64 !== expectedSignature) {
        this.logger.debug('[Auth] 签名验证失败');
        return null;
      }

      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as JwtPayload;

      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) {
        this.logger.debug('[Auth] 令牌已过期');
        return null;
      }

      if (this.config.issuer && payload.iss !== this.config.issuer) {
        this.logger.debug('[Auth] 发行者不匹配');
        return null;
      }

      if (this.config.audience && payload.aud !== this.config.audience) {
        this.logger.debug('[Auth] 受众不匹配');
        return null;
      }

      return payload;
    } catch (error) {
      this.logger.debug(`[Auth] 令牌解析失败: ${(error as Error).message}`);
      return null;
    }
  }

  refreshToken(refreshToken: string): TokenPair | null {
    const payload = this.verifyToken(refreshToken);
    if (!payload) {
      return null;
    }

    return this.generateToken(payload.sub, {
      roles: payload.roles,
      permissions: payload.permissions,
      metadata: payload.metadata,
    });
  }

  private sign(payload: JwtPayload): string {
    const header = { alg: 'HS256', typ: 'JWT' };
    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = this.createSignature(headerB64, payloadB64);

    return `${headerB64}.${payloadB64}.${signature}`;
  }

  private createSignature(headerB64: string, payloadB64: string): string {
    return crypto
      .createHmac('sha256', this.config.secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');
  }
}

// ========== API Key 服务 ==========

@Injectable()
export class ApiKeyAuthService {
  private readonly logger = new Logger(ApiKeyAuthService.name);
  private readonly keys: Map<string, ApiKeyInfo>;
  private readonly headerName: string;

  constructor(config?: Partial<ApiKeyConfig>) {
    this.keys = config?.keys ?? new Map();
    this.headerName = config?.headerName ?? 'x-api-key';

    if (process.env.DECISION_OS_API_KEY) {
      this.keys.set(process.env.DECISION_OS_API_KEY, {
        name: 'default',
        roles: [DecisionOSRoles.SERVICE],
        permissions: [DecisionOSPermissions.ADMIN_ALL],
      });
    }
  }

  registerKey(key: string, info: ApiKeyInfo): void {
    this.keys.set(key, info);
    this.logger.log(`[Auth] 注册 API Key: ${info.name}`);
  }

  revokeKey(key: string): boolean {
    const deleted = this.keys.delete(key);
    if (deleted) {
      this.logger.log(`[Auth] 撤销 API Key`);
    }
    return deleted;
  }

  validateKey(key: string): ApiKeyInfo | null {
    const info = this.keys.get(key);
    if (!info) {
      return null;
    }

    if (info.expiresAt && info.expiresAt < new Date()) {
      this.logger.debug(`[Auth] API Key 已过期: ${info.name}`);
      return null;
    }

    return info;
  }

  getHeaderName(): string {
    return this.headerName;
  }
}

// ========== 认证守卫 ==========

@Injectable()
export class DecisionAuthGuard implements CanActivate {
  private readonly logger = new Logger(DecisionAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtAuthService,
    private readonly apiKeyService: ApiKeyAuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = await this.authenticateRequest(request);

    if (!user) {
      throw new UnauthorizedException('认证失败');
    }

    (request as any).user = user;

    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (requiredPermissions?.length) {
      const hasPermission = this.checkPermissions(user, requiredPermissions);
      if (!hasPermission) {
        throw new UnauthorizedException('权限不足');
      }
    }

    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (requiredRoles?.length) {
      const hasRole = this.checkRoles(user, requiredRoles);
      if (!hasRole) {
        throw new UnauthorizedException('角色不足');
      }
    }

    return true;
  }

  private async authenticateRequest(request: Request): Promise<AuthenticatedUser | null> {
    const apiKey = request.headers[this.apiKeyService.getHeaderName()] as string;
    if (apiKey) {
      const keyInfo = this.apiKeyService.validateKey(apiKey);
      if (keyInfo) {
        return {
          id: `api_key:${keyInfo.name}`,
          roles: keyInfo.roles,
          permissions: keyInfo.permissions,
          authMethod: 'api_key',
        };
      }
    }

    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const payload = this.jwtService.verifyToken(token);
      if (payload) {
        return {
          id: payload.sub,
          roles: payload.roles ?? [],
          permissions: payload.permissions ?? [],
          authMethod: 'jwt',
          metadata: payload.metadata,
        };
      }
    }

    return null;
  }

  private checkPermissions(user: AuthenticatedUser, required: string[]): boolean {
    if (user.permissions.includes(DecisionOSPermissions.ADMIN_ALL)) {
      return true;
    }

    return required.every(perm => {
      if (user.permissions.includes(perm)) {
        return true;
      }

      const [resource] = perm.split(':');
      return user.permissions.includes(`${resource}:*`);
    });
  }

  private checkRoles(user: AuthenticatedUser, required: string[]): boolean {
    if (user.roles.includes(DecisionOSRoles.ADMIN)) {
      return true;
    }

    return required.some(role => user.roles.includes(role));
  }
}

// ========== 可选认证守卫 ==========

@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtAuthService,
    private readonly apiKeyService: ApiKeyAuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    const apiKey = request.headers[this.apiKeyService.getHeaderName()] as string;
    if (apiKey) {
      const keyInfo = this.apiKeyService.validateKey(apiKey);
      if (keyInfo) {
        (request as any).user = {
          id: `api_key:${keyInfo.name}`,
          roles: keyInfo.roles,
          permissions: keyInfo.permissions,
          authMethod: 'api_key',
        };
      }
    }

    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const payload = this.jwtService.verifyToken(token);
      if (payload) {
        (request as any).user = {
          id: payload.sub,
          roles: payload.roles ?? [],
          permissions: payload.permissions ?? [],
          authMethod: 'jwt',
          metadata: payload.metadata,
        };
      }
    }

    return true;
  }
}
