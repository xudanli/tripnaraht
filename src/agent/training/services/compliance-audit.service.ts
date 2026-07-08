// src/agent/training/services/compliance-audit.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  ComplianceAuditRecord,
  ComplianceAuditReport,
  EvidenceLink,
  ConstraintCheckResult,
  RiskEvent,
} from '../interfaces/safety-compliance.interface';
import { randomUUID } from 'crypto';
import { resolveConstraintBlockedForAudit } from '../../../decision-runtime/constraints/constraint-agent-narrate-only.util';

/**
 * ComplianceAuditService
 * 
 * 职责：实现合规审计字段与证据链要求
 * 
 * 功能：
 * 1. recordDecision() - 记录决策审计信息
 * 2. buildEvidenceChain() - 构建证据链
 * 3. generateComplianceReport() - 生成合规审计报告
 */
@Injectable()
export class ComplianceAuditService {
  private readonly logger = new Logger(ComplianceAuditService.name);
  private readonly auditRecords: Map<string, ComplianceAuditRecord> = new Map();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 记录决策审计信息
   */
  async recordDecision(
    requestId: string,
    decisionType: string,
    decisionResult: string,
    constraintCheckResult: ConstraintCheckResult,
    context: {
      user_input: string;
      planning_request: Record<string, any>;
      model_version: string;
      experiment_id?: string;
    },
    riskEvent?: RiskEvent,
  ): Promise<ComplianceAuditRecord> {
    this.logger.debug(
      `[ComplianceAudit] 记录决策审计: requestId=${requestId}, decisionType=${decisionType}`,
    );

    // 构建证据链
    const evidenceChain = await this.buildEvidenceChain(
      requestId,
      constraintCheckResult,
      riskEvent,
    );

    const record: ComplianceAuditRecord = {
      audit_id: `audit_${randomUUID()}`,
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

    this.logger.log(
      `[ComplianceAudit] 决策审计已记录: auditId=${record.audit_id}`,
    );

    return record;
  }

  /**
   * 构建证据链
   */
  async buildEvidenceChain(
    requestId: string,
    constraintCheckResult: ConstraintCheckResult,
    riskEvent?: RiskEvent,
  ): Promise<EvidenceLink[]> {
    const chain: EvidenceLink[] = [];

    // 1. 约束检查结果
    chain.push({
      evidence_id: `evidence_constraint_${randomUUID()}`,
      evidence_type: 'CONSTRAINT_CHECK',
      evidence_data: {
        violations: constraintCheckResult.violations,
        warnings: constraintCheckResult.warnings,
        sev_level: constraintCheckResult.sev_level,
      },
      timestamp: new Date().toISOString(),
      source: 'ConstraintsEngineService',
    });

    // 2. 风险事件（如果有）
    if (riskEvent) {
      chain.push({
        evidence_id: `evidence_risk_${randomUUID()}`,
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

  /**
   * 生成合规审计报告
   */
  async generateComplianceReport(
    periodStart: string,
    periodEnd: string,
  ): Promise<ComplianceAuditReport> {
    this.logger.log(
      `[ComplianceAudit] 生成合规审计报告: periodStart=${periodStart}, periodEnd=${periodEnd}`,
    );

    const startTime = new Date(periodStart).getTime();
    const endTime = new Date(periodEnd).getTime();

    // 筛选时间范围内的记录
    const records = Array.from(this.auditRecords.values()).filter((record) => {
      const recordTime = new Date(record.decision_time).getTime();
      return recordTime >= startTime && recordTime <= endTime;
    });

    // 统计信息
    const totalDecisions = records.length;
    const blockedDecisions = records.filter((r) =>
      resolveConstraintBlockedForAudit(r.constraint_check_result),
    ).length;
    const approvedDecisions = records.filter(
      (r) => r.decision_result === 'APPROVED',
    ).length;

    // SEV级别统计
    const sevBreakdown = {
      sev_1: records.filter((r) => r.constraint_check_result.sev_level === 'SEV-1').length,
      sev_2: records.filter((r) => r.constraint_check_result.sev_level === 'SEV-2').length,
      sev_3: records.filter((r) => r.constraint_check_result.sev_level === 'SEV-3').length,
      sev_4: records.filter((r) => r.constraint_check_result.sev_level === 'SEV-4').length,
    };

    // 约束违反统计
    const constraintViolations = {
      geographic: records.reduce(
        (sum, r) =>
          sum +
          r.constraint_check_result.violations.filter((v) => v.type === 'GEOGRAPHIC').length,
        0,
      ),
      temporal: records.reduce(
        (sum, r) =>
          sum +
          r.constraint_check_result.violations.filter((v) => v.type === 'TEMPORAL').length,
        0,
      ),
      compliance: records.reduce(
        (sum, r) =>
          sum +
          r.constraint_check_result.violations.filter((v) => v.type === 'COMPLIANCE').length,
        0,
      ),
      user_preference: records.reduce(
        (sum, r) =>
          sum +
          r.constraint_check_result.violations.filter((v) => v.type === 'USER_PREFERENCE').length,
        0,
      ),
    };

    // 风险事件
    const riskEvents = records
      .filter((r) => r.risk_event)
      .map((r) => r.risk_event!)
      .filter((e) => e);

    // 生成建议
    const recommendations = this.generateRecommendations(
      records,
      sevBreakdown,
      constraintViolations,
    );

    const report: ComplianceAuditReport = {
      report_id: `report_${randomUUID()}`,
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

    this.logger.log(
      `[ComplianceAudit] 合规审计报告已生成: reportId=${report.report_id}, totalDecisions=${totalDecisions}`,
    );

    return report;
  }

  /**
   * 生成建议
   */
  private generateRecommendations(
    records: ComplianceAuditRecord[],
    sevBreakdown: ComplianceAuditReport['sev_breakdown'],
    constraintViolations: ComplianceAuditReport['constraint_violations'],
  ): string[] {
    const recommendations: string[] = [];

    // SEV-1事件建议
    if (sevBreakdown.sev_1 > 0) {
      recommendations.push(
        `发现${sevBreakdown.sev_1}个SEV-1级别风险事件，建议立即审查并加强相关约束规则`,
      );
    }

    // 地理约束违反建议
    if (constraintViolations.geographic > 0) {
      recommendations.push(
        `发现${constraintViolations.geographic}次地理约束违反，建议更新危险区域数据库`,
      );
    }

    // 合规约束违反建议
    if (constraintViolations.compliance > 0) {
      recommendations.push(
        `发现${constraintViolations.compliance}次合规约束违反，建议加强合规检查流程`,
      );
    }

    return recommendations;
  }

  /**
   * 获取审计记录
   */
  getAuditRecord(auditId: string): ComplianceAuditRecord | undefined {
    return this.auditRecords.get(auditId);
  }

  /**
   * 列出审计记录
   */
  listAuditRecords(requestId?: string): ComplianceAuditRecord[] {
    let records = Array.from(this.auditRecords.values());

    if (requestId) {
      records = records.filter((r) => r.request_id === requestId);
    }

    return records.sort(
      (a, b) =>
        new Date(b.decision_time).getTime() - new Date(a.decision_time).getTime(),
    );
  }
}
