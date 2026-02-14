"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var AuditLogService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditLogService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let AuditLogService = AuditLogService_1 = class AuditLogService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(AuditLogService_1.name);
        this.logs = [];
        this.MAX_LOGS = 10000;
        this.stats = {
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
        this.logger.log('📝 AuditLogService 已初始化');
    }
    logStateChange(params) {
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
    logUserAction(params) {
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
    logSystemDecision(params) {
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
    logPolicyExecution(params) {
        const level = params.decision === 'deny' ? 'warn' : 'info';
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
    logConsentCheck(params) {
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
    logException(params) {
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
    logSecurityEvent(params) {
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
    query(query) {
        var _a, _b;
        let results = [...this.logs];
        if ((_a = query.types) === null || _a === void 0 ? void 0 : _a.length) {
            results = results.filter(log => query.types.includes(log.type));
        }
        if ((_b = query.levels) === null || _b === void 0 ? void 0 : _b.length) {
            results = results.filter(log => query.levels.includes(log.level));
        }
        if (query.userId) {
            results = results.filter(log => log.context.userId === query.userId);
        }
        if (query.traceId) {
            results = results.filter(log => log.traceId === query.traceId);
        }
        if (query.tripId) {
            results = results.filter(log => log.context.tripId === query.tripId);
        }
        if (query.actor) {
            results = results.filter(log => log.actor === query.actor);
        }
        if (query.action) {
            results = results.filter(log => log.action === query.action);
        }
        if (query.startTime) {
            const startTime = new Date(query.startTime).getTime();
            results = results.filter(log => new Date(log.timestamp).getTime() >= startTime);
        }
        if (query.endTime) {
            const endTime = new Date(query.endTime).getTime();
            results = results.filter(log => new Date(log.timestamp).getTime() <= endTime);
        }
        const offset = query.offset || 0;
        const limit = query.limit || 100;
        results = results.slice(offset, offset + limit);
        return results;
    }
    getTraceLog(traceId) {
        return this.query({ traceId, limit: 1000 });
    }
    getUserActions(userId, limit = 50) {
        return this.query({
            userId,
            types: ['user_action'],
            limit,
        });
    }
    getRecentExceptions(limit = 20) {
        return this.query({
            types: ['exception'],
            levels: ['error', 'critical'],
            limit,
        });
    }
    getStats() {
        return { ...this.stats };
    }
    log(entry) {
        var _a;
        const fullEntry = {
            logId: this.generateId(),
            timestamp: new Date().toISOString(),
            ...entry,
            meta: {
                environment: process.env.NODE_ENV || 'development',
                version: process.env.APP_VERSION || '1.0.0',
                ...entry.meta,
            },
        };
        this.logs.push(fullEntry);
        if (this.logs.length > this.MAX_LOGS) {
            this.logs.shift();
        }
        this.stats.totalLogs++;
        this.stats.byType[fullEntry.type]++;
        this.stats.byLevel[fullEntry.level]++;
        switch (fullEntry.level) {
            case 'critical':
            case 'error':
                this.logger.error(`[Audit] ${fullEntry.type}: ${fullEntry.action} on ${fullEntry.resource}`, (_a = fullEntry.error) === null || _a === void 0 ? void 0 : _a.stack);
                break;
            case 'warn':
                this.logger.warn(`[Audit] ${fullEntry.type}: ${fullEntry.action} on ${fullEntry.resource}`);
                break;
            default:
                this.logger.debug(`[Audit] ${fullEntry.type}: ${fullEntry.action} on ${fullEntry.resource}`);
        }
    }
    generateId() {
        return `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
};
exports.AuditLogService = AuditLogService;
exports.AuditLogService = AuditLogService = AuditLogService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AuditLogService);
//# sourceMappingURL=audit-log.service.js.map