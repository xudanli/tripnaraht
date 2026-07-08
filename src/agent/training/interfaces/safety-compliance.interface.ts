// src/agent/training/interfaces/safety-compliance.interface.ts

import { RiskCategory, RiskEventStatus } from './enums.interface';

/**
 * 安全合规相关接口定义
 */

/**
 * 约束类型
 */
export type ConstraintType = 'GEOGRAPHIC' | 'TEMPORAL' | 'COMPLIANCE' | 'USER_PREFERENCE';

/**
 * 约束严重程度
 */
export type ConstraintSeverity = 'HARD' | 'SOFT';

/**
 * SEV级别
 */
export type SEVLevel = 'SEV-1' | 'SEV-2' | 'SEV-3' | 'SEV-4';

/**
 * 约束规则
 */
export interface ConstraintRule {
  id: string;
  name: string;
  type: ConstraintType;
  severity: ConstraintSeverity;
  condition: string; // 规则条件（JSON或表达式）
  action: 'BLOCK' | 'WARN' | 'REQUIRE_APPROVAL';
  sev_level: SEVLevel;
  metadata?: Record<string, any>;
}

/**
 * 约束违反
 */
export interface ConstraintViolation {
  rule_id: string;
  rule_name: string;
  type: ConstraintType;
  severity: ConstraintSeverity;
  sev_level: SEVLevel;
  message: string;
  details: Record<string, any>;
  timestamp: string;
}

/**
 * 约束警告
 */
export interface ConstraintWarning {
  rule_id: string;
  rule_name: string;
  type: ConstraintType;
  message: string;
  details: Record<string, any>;
  timestamp: string;
}

/**
 * 约束检查结果
 */
export interface ConstraintCheckResult {
  violations: ConstraintViolation[];
  warnings: ConstraintWarning[];
  is_blocked: boolean;
  sev_level: SEVLevel;
  requires_approval: boolean;
  /** Phase 2c — when `gateway`, formal BLOCK authority is delegated to ConstraintEvaluationGateway */
  block_authority?: 'agent' | 'gateway';
  /** Phase 6 — Agent engine emits violations/warnings for narration only; no independent gate */
  narrate_only?: boolean;
  /** Phase 6 — formal approval authority when narrate_only */
  approval_authority?: 'agent' | 'gateway';
}

/**
 * 风险事件
 */
export interface RiskEvent {
  event_id: string;
  request_id: string;
  sev_level: SEVLevel;
  category: RiskCategory;
  description: string;
  violations: ConstraintViolation[];
  status: RiskEventStatus;
  created_at: string;
  resolved_at?: string;
  resolved_by?: string;
  metadata: Record<string, any>;
}

/**
 * 合规审计记录
 */
export interface ComplianceAuditRecord {
  audit_id: string;
  request_id: string;
  decision_type: string;
  decision_result: string;
  decision_time: string;
  constraint_check_result: ConstraintCheckResult;
  risk_event?: RiskEvent;
  context: {
    user_input: string;
    planning_request: Record<string, any>;
    model_version: string;
    experiment_id?: string;
  };
  evidence_chain: EvidenceLink[];
  metadata: Record<string, any>;
}

/**
 * 证据链链接
 */
export interface EvidenceLink {
  evidence_id: string;
  evidence_type: 'GATE_RESULT' | 'COMPLIANCE_CHECK' | 'CONSTRAINT_CHECK' | 'USER_APPROVAL' | 'MODEL_DECISION';
  evidence_data: Record<string, any>;
  timestamp: string;
  source: string;
}

/**
 * 合规审计报告
 */
export interface ComplianceAuditReport {
  report_id: string;
  period_start: string;
  period_end: string;
  total_decisions: number;
  blocked_decisions: number;
  approved_decisions: number;
  sev_breakdown: {
    sev_1: number;
    sev_2: number;
    sev_3: number;
    sev_4: number;
  };
  constraint_violations: {
    geographic: number;
    temporal: number;
    compliance: number;
    user_preference: number;
  };
  risk_events: RiskEvent[];
  recommendations: string[];
  generated_at: string;
}

/**
 * 安全红队测试用例
 */
export interface SecurityRedTeamTestCase {
  test_id: string;
  name: string;
  category: 'HIGH_RISK_DESTINATION' | 'HIGH_RISK_SEASON' | 'EDGE_CASE' | 'KNOWN_VULNERABILITY';
  description: string;
  input: Record<string, any>;
  expected_result: {
    should_block: boolean;
    sev_level: SEVLevel;
    required_approval: boolean;
  };
  metadata: Record<string, any>;
}

/**
 * 安全红队测试结果
 */
export interface SecurityRedTeamTestResult {
  test_id: string;
  test_case: SecurityRedTeamTestCase;
  actual_result: {
    blocked: boolean;
    sev_level: SEVLevel;
    requires_approval: boolean;
    violations: ConstraintViolation[];
  };
  passed: boolean;
  execution_time_ms: number;
  error?: string;
}
