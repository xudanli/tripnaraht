/**
 * Decision OS 请求拦截器与审计日志
 * 
 * 功能：
 * - 请求/响应日志记录
 * - 性能计时
 * - 审计追踪
 * - 敏感数据脱敏
 */

import { Injectable, Logger, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, tap, catchError, throwError } from 'rxjs';
import { Request, Response } from 'express';

// ========== 类型定义 ==========

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  requestId: string;
  userId?: string;
  action: string;
  resource: string;
  method: string;
  path: string;
  statusCode?: number;
  durationMs?: number;
  ipAddress?: string;
  userAgent?: string;
  requestBody?: Record<string, unknown>;
  responseBody?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  metadata?: Record<string, unknown>;
}

export interface AuditLogConfig {
  enabled: boolean;
  logRequestBody: boolean;
  logResponseBody: boolean;
  sensitiveFields: string[];
  maxBodyLength: number;
  excludePaths: string[];
}

export interface InterceptorMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageDurationMs: number;
  p95DurationMs: number;
  p99DurationMs: number;
}

// ========== ID 生成 ==========

function generateAuditId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `audit_${timestamp}_${random}`;
}

// ========== 审计日志服务 ==========

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);
  private readonly logs: AuditLogEntry[] = [];
  private readonly maxLogs = 10000;
  private readonly config: AuditLogConfig;

  constructor(config?: Partial<AuditLogConfig>) {
    this.config = {
      enabled: config?.enabled ?? true,
      logRequestBody: config?.logRequestBody ?? true,
      logResponseBody: config?.logResponseBody ?? false,
      sensitiveFields: config?.sensitiveFields ?? [
        'password', 'token', 'apiKey', 'secret', 'authorization',
        'creditCard', 'ssn', 'accessToken', 'refreshToken',
      ],
      maxBodyLength: config?.maxBodyLength ?? 10000,
      excludePaths: config?.excludePaths ?? ['/health', '/metrics', '/favicon.ico'],
    };
  }

  log(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): AuditLogEntry {
    if (!this.config.enabled) {
      return { ...entry, id: '', timestamp: '' };
    }

    const fullEntry: AuditLogEntry = {
      ...entry,
      id: generateAuditId(),
      timestamp: new Date().toISOString(),
      requestBody: entry.requestBody ? this.sanitize(entry.requestBody) : undefined,
      responseBody: entry.responseBody ? this.sanitize(entry.responseBody) : undefined,
    };

    this.logs.push(fullEntry);

    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    this.logger.log(
      `[Audit] ${fullEntry.method} ${fullEntry.path} - ${fullEntry.statusCode ?? 'N/A'} - ${fullEntry.durationMs ?? 0}ms - User: ${fullEntry.userId ?? 'anonymous'}`,
    );

    return fullEntry;
  }

  query(filter: {
    userId?: string;
    action?: string;
    resource?: string;
    startTime?: Date;
    endTime?: Date;
    statusCode?: number;
    limit?: number;
  }): AuditLogEntry[] {
    let results = [...this.logs];

    if (filter.userId) {
      results = results.filter(log => log.userId === filter.userId);
    }

    if (filter.action) {
      results = results.filter(log => log.action === filter.action);
    }

    if (filter.resource) {
      results = results.filter(log => log.resource === filter.resource);
    }

    if (filter.startTime) {
      results = results.filter(log => new Date(log.timestamp) >= filter.startTime!);
    }

    if (filter.endTime) {
      results = results.filter(log => new Date(log.timestamp) <= filter.endTime!);
    }

    if (filter.statusCode !== undefined) {
      results = results.filter(log => log.statusCode === filter.statusCode);
    }

    const limit = filter.limit ?? 100;
    return results.slice(-limit).reverse();
  }

  getStats(): {
    totalLogs: number;
    successRate: number;
    averageDuration: number;
    topActions: Array<{ action: string; count: number }>;
    topUsers: Array<{ userId: string; count: number }>;
  } {
    const successful = this.logs.filter(log => log.statusCode && log.statusCode < 400);
    const durations = this.logs.filter(log => log.durationMs).map(log => log.durationMs!);

    const actionCounts = new Map<string, number>();
    const userCounts = new Map<string, number>();

    for (const log of this.logs) {
      actionCounts.set(log.action, (actionCounts.get(log.action) ?? 0) + 1);
      if (log.userId) {
        userCounts.set(log.userId, (userCounts.get(log.userId) ?? 0) + 1);
      }
    }

    return {
      totalLogs: this.logs.length,
      successRate: this.logs.length > 0 ? successful.length / this.logs.length : 0,
      averageDuration: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
      topActions: Array.from(actionCounts.entries())
        .map(([action, count]) => ({ action, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      topUsers: Array.from(userCounts.entries())
        .map(([userId, count]) => ({ userId, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
    };
  }

  clear(): void {
    this.logs.length = 0;
  }

  shouldExclude(path: string): boolean {
    return this.config.excludePaths.some(exclude => path.startsWith(exclude));
  }

  private sanitize(obj: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (this.config.sensitiveFields.some(field => 
        key.toLowerCase().includes(field.toLowerCase())
      )) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        sanitized[key] = this.sanitize(value as Record<string, unknown>);
      } else if (typeof value === 'string' && value.length > this.config.maxBodyLength) {
        sanitized[key] = value.substring(0, this.config.maxBodyLength) + '...[truncated]';
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }
}

// ========== 请求拦截器 ==========

@Injectable()
export class DecisionRequestInterceptor implements NestInterceptor {
  private readonly logger = new Logger(DecisionRequestInterceptor.name);
  private readonly auditService: AuditLogService;
  private readonly durations: number[] = [];
  private totalRequests = 0;
  private successfulRequests = 0;
  private failedRequests = 0;

  constructor(auditService?: AuditLogService) {
    this.auditService = auditService ?? new AuditLogService();
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    if (this.auditService.shouldExclude(request.path)) {
      return next.handle();
    }

    const startTime = Date.now();
    const requestId = (request.headers['x-request-id'] as string) ?? generateAuditId();
    const userId = (request as any).user?.id;

    this.totalRequests++;

    return next.handle().pipe(
      tap((responseBody) => {
        const durationMs = Date.now() - startTime;
        this.recordDuration(durationMs);
        this.successfulRequests++;

        this.auditService.log({
          requestId,
          userId,
          action: this.extractAction(request),
          resource: this.extractResource(request),
          method: request.method,
          path: request.path,
          statusCode: response.statusCode,
          durationMs,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
          requestBody: request.body,
          responseBody: typeof responseBody === 'object' ? responseBody : undefined,
        });
      }),
      catchError((error) => {
        const durationMs = Date.now() - startTime;
        this.recordDuration(durationMs);
        this.failedRequests++;

        this.auditService.log({
          requestId,
          userId,
          action: this.extractAction(request),
          resource: this.extractResource(request),
          method: request.method,
          path: request.path,
          statusCode: error.status ?? 500,
          durationMs,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
          requestBody: request.body,
          error: {
            name: error.name,
            message: error.message,
            stack: error.stack,
          },
        });

        return throwError(() => error);
      }),
    );
  }

  getMetrics(): InterceptorMetrics {
    const sorted = [...this.durations].sort((a, b) => a - b);
    const p95Index = Math.floor(sorted.length * 0.95);
    const p99Index = Math.floor(sorted.length * 0.99);

    return {
      totalRequests: this.totalRequests,
      successfulRequests: this.successfulRequests,
      failedRequests: this.failedRequests,
      averageDurationMs: this.durations.length > 0 
        ? this.durations.reduce((a, b) => a + b, 0) / this.durations.length 
        : 0,
      p95DurationMs: sorted[p95Index] ?? 0,
      p99DurationMs: sorted[p99Index] ?? 0,
    };
  }

  private recordDuration(durationMs: number): void {
    this.durations.push(durationMs);
    if (this.durations.length > 10000) {
      this.durations.shift();
    }
  }

  private extractAction(request: Request): string {
    const pathParts = request.path.split('/').filter(Boolean);
    const method = request.method.toLowerCase();

    if (pathParts.includes('decision')) {
      if (method === 'post') return 'MAKE_DECISION';
      if (method === 'get') return 'GET_DECISION';
    }

    if (pathParts.includes('feedback')) {
      return 'SUBMIT_FEEDBACK';
    }

    if (pathParts.includes('snapshots')) {
      if (method === 'get') return 'QUERY_SNAPSHOTS';
      if (method === 'post' && pathParts.includes('rollback')) return 'ROLLBACK_DSO';
    }

    if (pathParts.includes('training')) {
      return 'TRIGGER_TRAINING';
    }

    if (pathParts.includes('metrics')) {
      return 'GET_METRICS';
    }

    return `${method.toUpperCase()}_${pathParts.join('_').toUpperCase() || 'ROOT'}`;
  }

  private extractResource(request: Request): string {
    const pathParts = request.path.split('/').filter(Boolean);

    for (const part of ['decision', 'feedback', 'snapshots', 'training', 'metrics', 'health', 'admin']) {
      if (pathParts.includes(part)) {
        return part;
      }
    }

    return pathParts[0] ?? 'unknown';
  }
}

// ========== 响应时间拦截器 ==========

@Injectable()
export class ResponseTimeInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ResponseTimeInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const startTime = process.hrtime.bigint();

    return next.handle().pipe(
      tap(() => {
        const endTime = process.hrtime.bigint();
        const durationNs = Number(endTime - startTime);
        const durationMs = (durationNs / 1e6).toFixed(2);

        response.setHeader('X-Response-Time', `${durationMs}ms`);

        this.logger.debug(`${request.method} ${request.path} - ${durationMs}ms`);
      }),
    );
  }
}

// ========== 请求 ID 拦截器 ==========

@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    let requestId = request.headers['x-request-id'] as string;

    if (!requestId) {
      requestId = generateAuditId();
      request.headers['x-request-id'] = requestId;
    }

    response.setHeader('X-Request-Id', requestId);

    return next.handle();
  }
}
