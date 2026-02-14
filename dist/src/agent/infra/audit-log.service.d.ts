import { PrismaService } from '../../prisma/prisma.service';
export type AuditLogType = 'state_change' | 'user_action' | 'system_decision' | 'policy_execution' | 'consent_check' | 'exception' | 'security_event';
export type AuditLogLevel = 'info' | 'warn' | 'error' | 'critical';
export interface AuditLogEntry {
    logId: string;
    timestamp: string;
    type: AuditLogType;
    level: AuditLogLevel;
    traceId: string;
    spanId?: string;
    context: {
        userId?: string;
        sessionId?: string;
        tripId?: string;
        stateId?: string;
        stateType?: string;
    };
    actor: string;
    action: string;
    resource: string;
    details: {
        before?: unknown;
        after?: unknown;
        params?: unknown;
        result?: unknown;
        reason?: string;
    };
    policy?: {
        policyId: string;
        policyName: string;
        decision: 'allow' | 'deny' | 'require_consent';
        conditions?: string[];
    };
    error?: {
        code: string;
        message: string;
        stack?: string;
    };
    meta: {
        ip?: string;
        userAgent?: string;
        version?: string;
        environment?: string;
    };
}
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
export interface AuditLogStats {
    totalLogs: number;
    byType: Record<AuditLogType, number>;
    byLevel: Record<AuditLogLevel, number>;
    recentErrors: number;
    policyDenials: number;
}
export declare class AuditLogService {
    private readonly prisma?;
    private readonly logger;
    private logs;
    private readonly MAX_LOGS;
    private stats;
    constructor(prisma?: PrismaService);
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
    }): void;
    logUserAction(params: {
        traceId: string;
        userId: string;
        action: string;
        resource: string;
        params?: unknown;
        result?: unknown;
        sessionId?: string;
        tripId?: string;
    }): void;
    logSystemDecision(params: {
        traceId: string;
        actor: string;
        decision: string;
        inputs: unknown;
        output: unknown;
        reason: string;
        userId?: string;
        tripId?: string;
    }): void;
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
    }): void;
    logConsentCheck(params: {
        traceId: string;
        userId: string;
        consentType: string;
        granted: boolean;
        resource: string;
        tripId?: string;
    }): void;
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
    }): void;
    logSecurityEvent(params: {
        traceId: string;
        eventType: string;
        severity: AuditLogLevel;
        actor: string;
        resource: string;
        details: unknown;
        userId?: string;
        ip?: string;
    }): void;
    query(query: AuditLogQuery): AuditLogEntry[];
    getTraceLog(traceId: string): AuditLogEntry[];
    getUserActions(userId: string, limit?: number): AuditLogEntry[];
    getRecentExceptions(limit?: number): AuditLogEntry[];
    getStats(): AuditLogStats;
    private log;
    private generateId;
}
