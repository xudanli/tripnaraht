// src/agent/infra/audit-log.service.ts
/**
 * AuditLogService - 审计日志服务
 * 
 * V2.1 架构核心服务，职责：
 * - 记录所有重要操作
 * - 提供合规审计能力
 * - 支持问题排查与根因分析
 * - 记录用户同意与策略执行
 * 
 * 架构位置：Agent Infra 层
 * 
 * 记录类型：
 * - 状态变更（StateChange）
 * - 用户操作（UserAction）
 * - 系统决策（SystemDecision）
 * - 策略执行（PolicyExecution）
 * - 异常事件（Exception）
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// ============== 类型定义 ==============

/**
 * 审计日志类型
 */
export type AuditLogType = 
  | 'state_change'        // 状态变更
  | 'user_action'         // 用户操作
  | 'system_decision'     // 系统决策
  | 'policy_execution'    // 策略执行
  | 'consent_check'       // 同意检查
  | 'exception'           // 异常事件
  | 'security_event';     // 安全事件

/**
 * 审计日志级别
 */
export type AuditLogLevel = 'info' | 'warn' | 'error' | 'critical';

/**
 * 审计日志条目
 */
export interface AuditLogEntry {
  logId: string;
  timestamp: string;
  
  // 分类
  type: AuditLogType;
  level: AuditLogLevel;
  
  // 追踪
  traceId: string;
  spanId?: string;
  
  // 上下文
  context: {
    userId?: string;
    sessionId?: string;
    tripId?: string;
    stateId?: string;
    stateType?: string;
  };
  
  // 操作信息
  actor: string;           // 执行者（用户ID 或 服务名称）
  action: string;          // 操作类型
  resource: string;        // 资源标识
  
  // 详情
  details: {
    before?: unknown;      // 变更前状态
    after?: unknown;       // 变更后状态
    params?: unknown;      // 操作参数
    result?: unknown;      // 操作结果
    reason?: string;       // 原因说明
  };
  
  // 策略相关
  policy?: {
    policyId: string;
    policyName: string;
    decision: 'allow' | 'deny' | 'require_consent';
    conditions?: string[];
  };
  
  // 异常信息
  error?: {
    code: string;
    message: string;
    stack?: string;
  };
  
  // 元数据
  meta: {
    ip?: string;
    userAgent?: string;
    version?: string;
    environment?: string;
  };
}

/**
 * 审计日志查询条件
 */
export interface AuditLogQuery {
  types?: AuditLogType[];
  levels?: AuditLogLevel[];
  userId?: string;
  traceId?: string;
  tripId?: string;
  actor?: string;
  action?: string;
  startTime?: string;
  endTime?: string;
  limit?: number;
  offset?: number;
}

/**
 * 审计日志统计
 */
export interface AuditLogStats {
  totalLogs: number;
  byType: Record<AuditLogType, number>;
  byLevel: Record<AuditLogLevel, number>;
  recentErrors: number;
  policyDenials: number;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);
  
  // 日志存储（生产环境应使用数据库 + 日志系统）
  private logs: AuditLogEntry[] = [];
  
  // 最大日志数量（内存限制）
  private readonly MAX_LOGS = 10000;
  
  // 统计数据
  private stats: AuditLogStats = {
    totalLogs: 0,
    byType: {
      state_change: 0,
      user_action: 0,
      system_decision: 0,
      policy_execution: 0,
      consent_check: 0,
      exception: 0,
      security_event: 0,
    },
    byLevel: {
      info: 0,
      warn: 0,
      error: 0,
      critical: 0,
    },
    recentErrors: 0,
    policyDenials: 0,
  };

  constructor(
    @Optional() private readonly prisma?: PrismaService,
  ) {
    this.logger.log('📝 AuditLogService 已初始化');
  }

  // ============== 日志记录方法 ==============

  /**
   * 记录状态变更
   */
  logStateChange(params: {
    traceId: string;
    stateId: string;
    stateType: string;
    actor: string;
    action: string;
    before?: unknown;
    after?: unknown;
    reason?: string;
    userId?: string;
    tripId?: string;
  }): void {
    this.log({
      type: 'state_change',
      level: 'info',
      traceId: params.traceId,
      context: {
        userId: params.userId,
        tripId: params.tripId,
        stateId: params.stateId,
        stateType: params.stateType,
      },
      actor: params.actor,
      action: params.action,
      resource: `${params.stateType}:${params.stateId}`,
      details: {
        before: params.before,
        after: params.after,
        reason: params.reason,
      },
    });
  }

  /**
   * 记录用户操作
   */
  logUserAction(params: {
    traceId: string;
    userId: string;
    action: string;
    resource: string;
    params?: unknown;
    result?: unknown;
    sessionId?: string;
    tripId?: string;
  }): void {
    this.log({
      type: 'user_action',
      level: 'info',
      traceId: params.traceId,
      context: {
        userId: params.userId,
        sessionId: params.sessionId,
        tripId: params.tripId,
      },
      actor: params.userId,
      action: params.action,
      resource: params.resource,
      details: {
        params: params.params,
        result: params.result,
      },
    });
  }

  /**
   * 记录系统决策
   */
  logSystemDecision(params: {
    traceId: string;
    actor: string;
    decision: string;
    inputs: unknown;
    output: unknown;
    reason: string;
    userId?: string;
    tripId?: string;
  }): void {
    this.log({
      type: 'system_decision',
      level: 'info',
      traceId: params.traceId,
      context: {
        userId: params.userId,
        tripId: params.tripId,
      },
      actor: params.actor,
      action: 'decision',
      resource: params.decision,
      details: {
        params: params.inputs,
        result: params.output,
        reason: params.reason,
      },
    });
  }

  /**
   * 记录策略执行
   */
  logPolicyExecution(params: {
    traceId: string;
    policyId: string;
    policyName: string;
    decision: 'allow' | 'deny' | 'require_consent';
    conditions?: string[];
    actor: string;
    resource: string;
    userId?: string;
    tripId?: string;
  }): void {
    const level: AuditLogLevel = params.decision === 'deny' ? 'warn' : 'info';
    
    if (params.decision === 'deny') {
      this.stats.policyDenials++;
    }

    this.log({
      type: 'policy_execution',
      level,
      traceId: params.traceId,
      context: {
        userId: params.userId,
        tripId: params.tripId,
      },
      actor: params.actor,
      action: 'policy_check',
      resource: params.resource,
      details: {
        result: params.decision,
      },
      policy: {
        policyId: params.policyId,
        policyName: params.policyName,
        decision: params.decision,
        conditions: params.conditions,
      },
    });
  }

  /**
   * 记录同意检查
   */
  logConsentCheck(params: {
    traceId: string;
    userId: string;
    consentType: string;
    granted: boolean;
    resource: string;
    tripId?: string;
  }): void {
    this.log({
      type: 'consent_check',
      level: params.granted ? 'info' : 'warn',
      traceId: params.traceId,
      context: {
        userId: params.userId,
        tripId: params.tripId,
      },
      actor: params.userId,
      action: 'consent_check',
      resource: params.resource,
      details: {
        params: { consentType: params.consentType },
        result: { granted: params.granted },
      },
    });
  }

  /**
   * 记录异常
   */
  logException(params: {
    traceId: string;
    actor: string;
    action: string;
    resource: string;
    error: {
      code: string;
      message: string;
      stack?: string;
    };
    userId?: string;
    tripId?: string;
    level?: AuditLogLevel;
  }): void {
    const level = params.level || 'error';
    
    if (level === 'error' || level === 'critical') {
      this.stats.recentErrors++;
    }

    this.log({
      type: 'exception',
      level,
      traceId: params.traceId,
      context: {
        userId: params.userId,
        tripId: params.tripId,
      },
      actor: params.actor,
      action: params.action,
      resource: params.resource,
      details: {},
      error: params.error,
    });
  }

  /**
   * 记录安全事件
   */
  logSecurityEvent(params: {
    traceId: string;
    eventType: string;
    severity: AuditLogLevel;
    actor: string;
    resource: string;
    details: unknown;
    userId?: string;
    ip?: string;
  }): void {
    this.log({
      type: 'security_event',
      level: params.severity,
      traceId: params.traceId,
      context: {
        userId: params.userId,
      },
      actor: params.actor,
      action: params.eventType,
      resource: params.resource,
      details: {
        params: params.details,
      },
      meta: {
        ip: params.ip,
      },
    });
  }

  // ============== 查询方法 ==============

  /**
   * 查询日志
   */
  query(query: AuditLogQuery): AuditLogEntry[] {
    let results = [...this.logs];

    // 类型过滤
    if (query.types?.length) {
      results = results.filter(log => query.types!.includes(log.type));
    }

    // 级别过滤
    if (query.levels?.length) {
      results = results.filter(log => query.levels!.includes(log.level));
    }

    // 用户过滤
    if (query.userId) {
      results = results.filter(log => log.context.userId === query.userId);
    }

    // TraceId 过滤
    if (query.traceId) {
      results = results.filter(log => log.traceId === query.traceId);
    }

    // TripId 过滤
    if (query.tripId) {
      results = results.filter(log => log.context.tripId === query.tripId);
    }

    // Actor 过滤
    if (query.actor) {
      results = results.filter(log => log.actor === query.actor);
    }

    // Action 过滤
    if (query.action) {
      results = results.filter(log => log.action === query.action);
    }

    // 时间范围过滤
    if (query.startTime) {
      const startTime = new Date(query.startTime).getTime();
      results = results.filter(log => new Date(log.timestamp).getTime() >= startTime);
    }
    if (query.endTime) {
      const endTime = new Date(query.endTime).getTime();
      results = results.filter(log => new Date(log.timestamp).getTime() <= endTime);
    }

    // 分页
    const offset = query.offset || 0;
    const limit = query.limit || 100;
    results = results.slice(offset, offset + limit);

    return results;
  }

  /**
   * 获取 Trace 的所有日志
   */
  getTraceLog(traceId: string): AuditLogEntry[] {
    return this.query({ traceId, limit: 1000 });
  }

  /**
   * 获取用户的最近操作
   */
  getUserActions(userId: string, limit = 50): AuditLogEntry[] {
    return this.query({
      userId,
      types: ['user_action'],
      limit,
    });
  }

  /**
   * 获取最近的异常
   */
  getRecentExceptions(limit = 20): AuditLogEntry[] {
    return this.query({
      types: ['exception'],
      levels: ['error', 'critical'],
      limit,
    });
  }

  /**
   * 获取统计数据
   */
  getStats(): AuditLogStats {
    return { ...this.stats };
  }

  // ============== 私有方法 ==============

  private log(entry: Omit<AuditLogEntry, 'logId' | 'timestamp' | 'meta'> & { meta?: Partial<AuditLogEntry['meta']> }): void {
    const fullEntry: AuditLogEntry = {
      logId: this.generateId(),
      timestamp: new Date().toISOString(),
      ...entry,
      meta: {
        environment: process.env.NODE_ENV || 'development',
        version: process.env.APP_VERSION || '1.0.0',
        ...entry.meta,
      },
    };

    // 添加到内存存储
    this.logs.push(fullEntry);
    
    // 限制日志数量
    if (this.logs.length > this.MAX_LOGS) {
      this.logs.shift();
    }

    // 更新统计
    this.stats.totalLogs++;
    this.stats.byType[fullEntry.type]++;
    this.stats.byLevel[fullEntry.level]++;

    // 输出到控制台（根据级别）
    switch (fullEntry.level) {
      case 'critical':
      case 'error':
        this.logger.error(`[Audit] ${fullEntry.type}: ${fullEntry.action} on ${fullEntry.resource}`, fullEntry.error?.stack);
        break;
      case 'warn':
        this.logger.warn(`[Audit] ${fullEntry.type}: ${fullEntry.action} on ${fullEntry.resource}`);
        break;
      default:
        this.logger.debug(`[Audit] ${fullEntry.type}: ${fullEntry.action} on ${fullEntry.resource}`);
    }

    // TODO: 生产环境应异步写入数据库或日志系统
    // this.persistLog(fullEntry);
  }

  private generateId(): string {
    return `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
