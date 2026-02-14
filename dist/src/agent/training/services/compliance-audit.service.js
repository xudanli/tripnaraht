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
var ComplianceAuditService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ComplianceAuditService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
const crypto_1 = require("crypto");
let ComplianceAuditService = ComplianceAuditService_1 = class ComplianceAuditService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(ComplianceAuditService_1.name);
        this.auditRecords = new Map();
    }
    async recordDecision(requestId, decisionType, decisionResult, constraintCheckResult, context, riskEvent) {
        this.logger.debug(`[ComplianceAudit] 记录决策审计: requestId=${requestId}, decisionType=${decisionType}`);
        const evidenceChain = await this.buildEvidenceChain(requestId, constraintCheckResult, riskEvent);
        const record = {
            audit_id: `audit_${(0, crypto_1.randomUUID)()}`,
            request_id: requestId,
            decision_type: decisionType,
            decision_result: decisionResult,
            decision_time: new Date().toISOString(),
            constraint_check_result: constraintCheckResult,
            risk_event: riskEvent,
            context,
            evidence_chain: evidenceChain,
            metadata: {},
        };
        this.auditRecords.set(record.audit_id, record);
        this.logger.log(`[ComplianceAudit] 决策审计已记录: auditId=${record.audit_id}`);
        return record;
    }
    async buildEvidenceChain(requestId, constraintCheckResult, riskEvent) {
        const chain = [];
        chain.push({
            evidence_id: `evidence_constraint_${(0, crypto_1.randomUUID)()}`,
            evidence_type: 'CONSTRAINT_CHECK',
            evidence_data: {
                violations: constraintCheckResult.violations,
                warnings: constraintCheckResult.warnings,
                sev_level: constraintCheckResult.sev_level,
            },
            timestamp: new Date().toISOString(),
            source: 'ConstraintsEngineService',
        });
        if (riskEvent) {
            chain.push({
                evidence_id: `evidence_risk_${(0, crypto_1.randomUUID)()}`,
                evidence_type: 'COMPLIANCE_CHECK',
                evidence_data: {
                    event_id: riskEvent.event_id,
                    sev_level: riskEvent.sev_level,
                    category: riskEvent.category,
                    violations: riskEvent.violations,
                },
                timestamp: riskEvent.created_at,
                source: 'RiskEventManagerService',
            });
        }
        return chain;
    }
    async generateComplianceReport(periodStart, periodEnd) {
        this.logger.log(`[ComplianceAudit] 生成合规审计报告: periodStart=${periodStart}, periodEnd=${periodEnd}`);
        const startTime = new Date(periodStart).getTime();
        const endTime = new Date(periodEnd).getTime();
        const records = Array.from(this.auditRecords.values()).filter((record) => {
            const recordTime = new Date(record.decision_time).getTime();
            return recordTime >= startTime && recordTime <= endTime;
        });
        const totalDecisions = records.length;
        const blockedDecisions = records.filter((r) => r.constraint_check_result.is_blocked).length;
        const approvedDecisions = records.filter((r) => r.decision_result === 'APPROVED').length;
        const sevBreakdown = {
            sev_1: records.filter((r) => r.constraint_check_result.sev_level === 'SEV-1').length,
            sev_2: records.filter((r) => r.constraint_check_result.sev_level === 'SEV-2').length,
            sev_3: records.filter((r) => r.constraint_check_result.sev_level === 'SEV-3').length,
            sev_4: records.filter((r) => r.constraint_check_result.sev_level === 'SEV-4').length,
        };
        const constraintViolations = {
            geographic: records.reduce((sum, r) => sum +
                r.constraint_check_result.violations.filter((v) => v.type === 'GEOGRAPHIC').length, 0),
            temporal: records.reduce((sum, r) => sum +
                r.constraint_check_result.violations.filter((v) => v.type === 'TEMPORAL').length, 0),
            compliance: records.reduce((sum, r) => sum +
                r.constraint_check_result.violations.filter((v) => v.type === 'COMPLIANCE').length, 0),
            user_preference: records.reduce((sum, r) => sum +
                r.constraint_check_result.violations.filter((v) => v.type === 'USER_PREFERENCE').length, 0),
        };
        const riskEvents = records
            .filter((r) => r.risk_event)
            .map((r) => r.risk_event)
            .filter((e) => e);
        const recommendations = this.generateRecommendations(records, sevBreakdown, constraintViolations);
        const report = {
            report_id: `report_${(0, crypto_1.randomUUID)()}`,
            period_start: periodStart,
            period_end: periodEnd,
            total_decisions: totalDecisions,
            blocked_decisions: blockedDecisions,
            approved_decisions: approvedDecisions,
            sev_breakdown: sevBreakdown,
            constraint_violations: constraintViolations,
            risk_events: riskEvents,
            recommendations,
            generated_at: new Date().toISOString(),
        };
        this.logger.log(`[ComplianceAudit] 合规审计报告已生成: reportId=${report.report_id}, totalDecisions=${totalDecisions}`);
        return report;
    }
    generateRecommendations(records, sevBreakdown, constraintViolations) {
        const recommendations = [];
        if (sevBreakdown.sev_1 > 0) {
            recommendations.push(`发现${sevBreakdown.sev_1}个SEV-1级别风险事件，建议立即审查并加强相关约束规则`);
        }
        if (constraintViolations.geographic > 0) {
            recommendations.push(`发现${constraintViolations.geographic}次地理约束违反，建议更新危险区域数据库`);
        }
        if (constraintViolations.compliance > 0) {
            recommendations.push(`发现${constraintViolations.compliance}次合规约束违反，建议加强合规检查流程`);
        }
        return recommendations;
    }
    getAuditRecord(auditId) {
        return this.auditRecords.get(auditId);
    }
    listAuditRecords(requestId) {
        let records = Array.from(this.auditRecords.values());
        if (requestId) {
            records = records.filter((r) => r.request_id === requestId);
        }
        return records.sort((a, b) => new Date(b.decision_time).getTime() - new Date(a.decision_time).getTime());
    }
};
exports.ComplianceAuditService = ComplianceAuditService;
exports.ComplianceAuditService = ComplianceAuditService = ComplianceAuditService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ComplianceAuditService);
//# sourceMappingURL=compliance-audit.service.js.map