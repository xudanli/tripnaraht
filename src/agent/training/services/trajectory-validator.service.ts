// src/agent/training/services/trajectory-validator.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { GateResult } from '../../interfaces/trip-plan.interface';
import { ApprovalStatus } from '@prisma/client';
import {
  ComplianceResult,
  ExecutionResult,
  TrajectoryValidationResult,
  RLTrajectory,
  TripNARARLState,
  RLTrajectoryStep,
} from '../interfaces/trajectory.interface';

// ============================================================================
// TripNARA 轨迹验证拒绝原因代码
// ============================================================================

/**
 * TripNARA 特有的轨迹拒绝原因代码
 */
export enum TripNARARejectCode {
  // === 证据相关 ===
  EVIDENCE_MISSING = 'EVIDENCE_MISSING',           // 无证据引用
  EVIDENCE_STALE = 'EVIDENCE_STALE',               // 证据过期
  EVIDENCE_CONFLICT = 'EVIDENCE_CONFLICT',         // 证据冲突未解决
  EVIDENCE_INSUFFICIENT = 'EVIDENCE_INSUFFICIENT', // 证据不充分
  
  // === 门控相关 ===
  GATE_BYPASSED = 'GATE_BYPASSED',                 // 未执行门控却生成计划
  GATE_RESULT_MISSING = 'GATE_RESULT_MISSING',     // 缺少门控结果
  GATE_NOT_REPRODUCIBLE = 'GATE_NOT_REPRODUCIBLE', // 门控结果不可复现
  GATE_BLOCKED = 'GATE_BLOCKED',                   // 门控阻断
  
  // === 计划相关 ===
  NON_EXECUTABLE_PLAN = 'NON_EXECUTABLE_PLAN',     // 交通/时间窗矛盾
  TEMPORAL_CONFLICT = 'TEMPORAL_CONFLICT',         // 时间冲突
  SPATIAL_INCONSISTENCY = 'SPATIAL_INCONSISTENCY', // 空间不一致
  
  // === 风险相关 ===
  HIGH_RISK_NOT_DISCLOSED = 'HIGH_RISK_NOT_DISCLOSED',     // 高风险未提示
  NO_ALTERNATIVE_FOR_BLOCKED = 'NO_ALTERNATIVE_FOR_BLOCKED', // 阻断无替代方案
  SAFETY_OVERRIDE_UNJUSTIFIED = 'SAFETY_OVERRIDE_UNJUSTIFIED', // 安全覆盖无理由
  CRITICAL_RISK_WARNING = 'CRITICAL_RISK_WARNING',         // 严重风险警告
  
  // === 决策链相关 ===
  DECISION_CHAIN_BROKEN = 'DECISION_CHAIN_BROKEN',         // 决策链断裂
  STATE_ACTION_MISMATCH = 'STATE_ACTION_MISMATCH',         // State-Action 不匹配
  MISSING_ACTOR_ATTRIBUTION = 'MISSING_ACTOR_ATTRIBUTION', // 缺少人格归因
  
  // === 执行相关 ===
  EXECUTION_FAILED = 'EXECUTION_FAILED',           // 执行失败
  USER_REJECTED = 'USER_REJECTED',                 // 用户拒绝
}

/**
 * 拒绝原因严重级别
 */
export type RejectSeverity = 'CRITICAL' | 'MAJOR' | 'MINOR';

/**
 * 拒绝原因详情
 */
export interface RejectReason {
  code: TripNARARejectCode;
  message: string;
  severity: RejectSeverity;
  step_index?: number;  // 出问题的步骤索引
}

/**
 * 可审计性检查结果
 */
export interface AuditabilityResult {
  /** Gate 结果可复现 */
  gate_reproducible: boolean;
  /** 决策链完整 */
  decision_chain_complete: boolean;
  /** 证据覆盖率 (0-1) */
  evidence_coverage: number;
  /** State-Action 一致性 */
  state_action_consistency: boolean;
  /** 人格归因完整性 */
  actor_attribution_complete: boolean;
}

/**
 * TripNARA 轨迹验证结果
 */
export interface TripNARAValidationResult {
  /** 是否有效 */
  isValid: boolean;
  /** 验证分数 (0-1) */
  score: number;
  /** 是否可用于训练 */
  trainable: boolean;
  /** 可用于 DPO 训练 */
  trainable_for_dpo: boolean;
  /** 可用于 PPO 训练 */
  trainable_for_ppo: boolean;
  /** 拒绝原因列表 */
  rejection_reasons: RejectReason[];
  /** 可审计性检查结果 */
  auditability: AuditabilityResult;
  /** 验证元数据 */
  metadata: {
    validation_time: string;
    validator_version: string;
  };
}

/**
 * TrajectoryValidatorService
 * 
 * TripNARA v2.0 - 基于决策可审计性的轨迹验证
 * 
 * 验证标准（TripNARA 特有）：
 * 1. Gate 结果可复现（输入特征 + 规则/模型版本 + evidence）
 * 2. 决策链完整（每一步 action 与 state 变化一致）
 * 3. 证据充分（关键决策有证据支撑）
 * 4. 风险披露（高风险必须向用户披露）
 * 5. 人格归因（每个决策归因到 Abu/Dr.Dre/Neptune）
 * 
 * 注意：用户审批 ≠ 安全真值，不作为主要验证标准
 */
@Injectable()
export class TrajectoryValidatorService {
  private readonly logger = new Logger(TrajectoryValidatorService.name);
  private readonly VALIDATOR_VERSION = '2.0.0';

  // ============================================================================
  // TripNARA 增强版验证（推荐使用）
  // ============================================================================

  /**
   * TripNARA 增强版轨迹验证
   * 
   * 基于决策可审计性，而非文本质量
   */
  async validateTripNARATrajectory(
    trajectory: RLTrajectory,
  ): Promise<TripNARAValidationResult> {
    this.logger.debug(
      `[TripNARAValidator] 开始验证轨迹: ${trajectory.trajectory_id}`,
    );

    const rejections: RejectReason[] = [];

    // 1. 证据检查
    this.checkEvidence(trajectory, rejections);

    // 2. 门控检查
    this.checkGateIntegrity(trajectory, rejections);

    // 3. 风险披露检查
    this.checkRiskDisclosure(trajectory, rejections);

    // 4. 决策链完整性检查
    this.checkDecisionChain(trajectory, rejections);

    // 5. 人格归因检查
    this.checkActorAttribution(trajectory, rejections);

    // 6. 计算可审计性结果
    const auditability = this.calculateAuditability(trajectory, rejections);

    // 7. 计算最终结果
    const criticalCount = rejections.filter(r => r.severity === 'CRITICAL').length;
    const majorCount = rejections.filter(r => r.severity === 'MAJOR').length;
    const minorCount = rejections.filter(r => r.severity === 'MINOR').length;

    const isValid = criticalCount === 0;
    const trainable = criticalCount === 0 && majorCount <= 1;
    const trainable_for_dpo = criticalCount === 0; // DPO 可容忍 major 问题
    const trainable_for_ppo = criticalCount === 0 && majorCount === 0;

    // 分数计算：CRITICAL -0.3, MAJOR -0.1, MINOR -0.02
    const score = Math.max(
      0,
      1 - criticalCount * 0.3 - majorCount * 0.1 - minorCount * 0.02,
    );

    const result: TripNARAValidationResult = {
      isValid,
      score,
      trainable,
      trainable_for_dpo,
      trainable_for_ppo,
      rejection_reasons: rejections,
      auditability,
      metadata: {
        validation_time: new Date().toISOString(),
        validator_version: this.VALIDATOR_VERSION,
      },
    };

    this.logger.debug(
      `[TripNARAValidator] 验证完成: isValid=${isValid}, score=${score.toFixed(2)}, trainable=${trainable}, criticals=${criticalCount}, majors=${majorCount}`,
    );

    return result;
  }

  /**
   * 检查证据完整性
   */
  private checkEvidence(
    trajectory: RLTrajectory,
    rejections: RejectReason[],
  ): void {
    for (const step of trajectory.steps) {
      const state = step.state as TripNARARLState;

      // 检查是否为增强版 State
      if (!state.evidence) {
        // 旧版 State，跳过证据检查但记录警告
        if (step.step_index === 0) {
          this.logger.debug(
            `[TripNARAValidator] 轨迹使用旧版 RLState，跳过证据检查`,
          );
        }
        continue;
      }

      // 检查证据是否存在
      if (state.evidence.length === 0) {
        rejections.push({
          code: TripNARARejectCode.EVIDENCE_MISSING,
          message: `Step ${step.step_index}: 无证据引用`,
          severity: 'CRITICAL',
          step_index: step.step_index,
        });
      }

      // 检查证据新鲜度
      const expiredEvidence = state.evidence.filter(e => e.freshness === 'EXPIRED');
      if (expiredEvidence.length > 0) {
        rejections.push({
          code: TripNARARejectCode.EVIDENCE_STALE,
          message: `Step ${step.step_index}: ${expiredEvidence.length} 条证据已过期`,
          severity: 'MAJOR',
          step_index: step.step_index,
        });
      }

      // 检查不确定性
      if (state.uncertainty_flags) {
        if (state.uncertainty_flags.confidence_level === 'INSUFFICIENT') {
          rejections.push({
            code: TripNARARejectCode.EVIDENCE_INSUFFICIENT,
            message: `Step ${step.step_index}: 置信度不足 - ${state.uncertainty_flags.uncertainty_reasons?.join(', ')}`,
            severity: 'MAJOR',
            step_index: step.step_index,
          });
        }

        if (state.uncertainty_flags.conflicting_evidence.length > 0) {
          rejections.push({
            code: TripNARARejectCode.EVIDENCE_CONFLICT,
            message: `Step ${step.step_index}: 证据冲突未解决 - ${state.uncertainty_flags.conflicting_evidence.join(', ')}`,
            severity: 'MAJOR',
            step_index: step.step_index,
          });
        }
      }
    }
  }

  /**
   * 检查门控完整性
   */
  private checkGateIntegrity(
    trajectory: RLTrajectory,
    rejections: RejectReason[],
  ): void {
    const hasGateCheck = trajectory.steps.some(
      s => s.action.action_type === 'GATE_CHECK',
    );
    const hasPlanGenerate = trajectory.steps.some(
      s => s.action.action_type === 'PLAN_GENERATE',
    );

    // 生成计划前必须有门控检查
    if (hasPlanGenerate && !hasGateCheck) {
      rejections.push({
        code: TripNARARejectCode.GATE_BYPASSED,
        message: '生成计划前未执行门控检查',
        severity: 'CRITICAL',
      });
    }

    // 检查门控结果
    for (const step of trajectory.steps) {
      const state = step.state as TripNARARLState;

      // 检查 gate_result 是否存在
      if (step.action.action_type === 'PLAN_GENERATE') {
        if (!state.gate_result) {
          rejections.push({
            code: TripNARARejectCode.GATE_RESULT_MISSING,
            message: `Step ${step.step_index}: PLAN_GENERATE 缺少 gate_result`,
            severity: 'CRITICAL',
            step_index: step.step_index,
          });
        } else if (state.gate_result.gate_result === 'BLOCK') {
          rejections.push({
            code: TripNARARejectCode.GATE_BLOCKED,
            message: `Step ${step.step_index}: 门控阻断但仍生成计划`,
            severity: 'CRITICAL',
            step_index: step.step_index,
          });
        }
      }

      // 检查 gate_context（如果是增强版 State）
      if ((state as TripNARARLState).gate_context) {
        const gateContext = (state as TripNARARLState).gate_context;
        if (
          gateContext.gate_evidence_refs.length === 0 &&
          step.action.action_type === 'GATE_CHECK'
        ) {
          rejections.push({
            code: TripNARARejectCode.GATE_NOT_REPRODUCIBLE,
            message: `Step ${step.step_index}: 门控决策无证据引用，不可复现`,
            severity: 'MAJOR',
            step_index: step.step_index,
          });
        }
      }
    }
  }

  /**
   * 检查风险披露
   */
  private checkRiskDisclosure(
    trajectory: RLTrajectory,
    rejections: RejectReason[],
  ): void {
    for (const step of trajectory.steps) {
      const state = step.state as TripNARARLState;

      // 检查是否为增强版 State
      if (!state.risk_summary) {
        continue;
      }

      const overallRisk = state.risk_summary.overall_risk_level;
      const weatherRisk = state.risk_summary.weather?.risk_level;

      // 高风险必须披露
      if (overallRisk === 'HIGH' || overallRisk === 'CRITICAL' ||
          weatherRisk === 'HIGH' || weatherRisk === 'CRITICAL') {
        // 检查后续步骤是否有风险披露
        const hasRiskDisclosure = trajectory.steps.some(
          s =>
            s.step_index > step.step_index &&
            (s.action.action_params?.risk_disclosed === true ||
              s.action.action_type === 'USER_CLARIFICATION'),
        );

        if (!hasRiskDisclosure) {
          rejections.push({
            code: TripNARARejectCode.HIGH_RISK_NOT_DISCLOSED,
            message: `Step ${step.step_index}: 高风险(${overallRisk || weatherRisk})未向用户披露`,
            severity: 'CRITICAL',
            step_index: step.step_index,
          });
        }
      }

      // 检查阻断路线是否有替代方案
      if (state.risk_summary.road_conditions) {
        const closedRoads = Object.entries(state.risk_summary.road_conditions.f_road_status)
          .filter(([_, status]) => status === 'CLOSED')
          .map(([road]) => road);

        if (closedRoads.length > 0) {
          const hasAlternative = trajectory.steps.some(
            s =>
              s.action.action_type === 'ROUTE_ADJUST' &&
              s.action.action_params?.alternative_route,
          );

          if (!hasAlternative) {
            rejections.push({
              code: TripNARARejectCode.NO_ALTERNATIVE_FOR_BLOCKED,
              message: `Step ${step.step_index}: 道路关闭(${closedRoads.join(', ')})但无替代方案`,
              severity: 'MAJOR',
              step_index: step.step_index,
            });
          }
        }
      }
    }
  }

  /**
   * 检查决策链完整性
   */
  private checkDecisionChain(
    trajectory: RLTrajectory,
    rejections: RejectReason[],
  ): void {
    for (let i = 1; i < trajectory.steps.length; i++) {
      const prevStep = trajectory.steps[i - 1];
      const currStep = trajectory.steps[i];

      // 检查 State 变化是否与 Action 一致
      if (!this.isStateTransitionValid(prevStep, currStep)) {
        rejections.push({
          code: TripNARARejectCode.STATE_ACTION_MISMATCH,
          message: `Step ${i}: State 变化与前一步 Action(${prevStep.action.action_type}) 不一致`,
          severity: 'MAJOR',
          step_index: i,
        });
      }
    }

    // 检查决策链是否有断裂（跳过关键步骤）
    const actionSequence = trajectory.steps.map(s => s.action.action_type);
    
    // 如果有 PLAN_GENERATE，前面应该有 GATE_CHECK
    const planIndex = actionSequence.indexOf('PLAN_GENERATE');
    const gateIndex = actionSequence.indexOf('GATE_CHECK');
    
    if (planIndex !== -1 && (gateIndex === -1 || gateIndex > planIndex)) {
      rejections.push({
        code: TripNARARejectCode.DECISION_CHAIN_BROKEN,
        message: 'PLAN_GENERATE 前应有 GATE_CHECK',
        severity: 'MAJOR',
      });
    }
  }

  /**
   * 检查人格归因
   */
  private checkActorAttribution(
    trajectory: RLTrajectory,
    rejections: RejectReason[],
  ): void {
    const missingActorSteps = trajectory.steps.filter(s => !s.action.actor);

    if (missingActorSteps.length > 0) {
      // 超过 50% 的步骤缺少归因，标记为 MAJOR
      const missingRatio = missingActorSteps.length / trajectory.steps.length;
      const severity: RejectSeverity = missingRatio > 0.5 ? 'MAJOR' : 'MINOR';

      rejections.push({
        code: TripNARARejectCode.MISSING_ACTOR_ATTRIBUTION,
        message: `${missingActorSteps.length}/${trajectory.steps.length} 个步骤缺少人格归因(Abu/Dr.Dre/Neptune)`,
        severity,
      });
    }
  }

  /**
   * 验证 State 转换是否有效
   */
  private isStateTransitionValid(
    prevStep: RLTrajectoryStep,
    currStep: RLTrajectoryStep,
  ): boolean {
    const prevAction = prevStep.action.action_type;
    const currState = currStep.state;
    const prevState = prevStep.state;

    // 根据不同的 action 检查 state 变化
    switch (prevAction) {
      case 'GATE_CHECK':
        // Gate 检查后，gate_result 应该存在
        return !!currState.gate_result;

      case 'PLAN_GENERATE':
        // 生成计划后，current_itinerary 应该存在或变化
        return (
          !!currState.current_itinerary ||
          currState.current_itinerary !== prevState.current_itinerary
        );

      case 'ROUTE_ADJUST':
      case 'PACE_ADJUST':
      case 'POI_SELECT':
        // 调整后，itinerary 应该变化
        return true; // 简化检查

      default:
        return true;
    }
  }

  /**
   * 计算可审计性结果
   */
  private calculateAuditability(
    trajectory: RLTrajectory,
    rejections: RejectReason[],
  ): AuditabilityResult {
    // Gate 可复现性
    const gateReproducible = !rejections.some(
      r =>
        r.code === TripNARARejectCode.GATE_NOT_REPRODUCIBLE ||
        r.code === TripNARARejectCode.GATE_BYPASSED ||
        r.code === TripNARARejectCode.GATE_RESULT_MISSING,
    );

    // 决策链完整性
    const decisionChainComplete = !rejections.some(
      r =>
        r.code === TripNARARejectCode.DECISION_CHAIN_BROKEN ||
        r.code === TripNARARejectCode.STATE_ACTION_MISMATCH,
    );

    // 证据覆盖率
    const evidenceCoverage = this.calculateEvidenceCoverage(trajectory);

    // State-Action 一致性
    const stateActionConsistency = !rejections.some(
      r => r.code === TripNARARejectCode.STATE_ACTION_MISMATCH,
    );

    // 人格归因完整性
    const actorAttributionComplete = !rejections.some(
      r =>
        r.code === TripNARARejectCode.MISSING_ACTOR_ATTRIBUTION &&
        r.severity !== 'MINOR',
    );

    return {
      gate_reproducible: gateReproducible,
      decision_chain_complete: decisionChainComplete,
      evidence_coverage: evidenceCoverage,
      state_action_consistency: stateActionConsistency,
      actor_attribution_complete: actorAttributionComplete,
    };
  }

  /**
   * 计算证据覆盖率
   */
  private calculateEvidenceCoverage(trajectory: RLTrajectory): number {
    let totalSteps = 0;
    let stepsWithEvidence = 0;

    for (const step of trajectory.steps) {
      const state = step.state as TripNARARLState;
      totalSteps++;

      if (state.evidence && state.evidence.length > 0) {
        stepsWithEvidence++;
      }
    }

    return totalSteps > 0 ? stepsWithEvidence / totalSteps : 0;
  }

  // ============================================================================
  // [Legacy] 基础版验证（保持兼容性）
  // ============================================================================

  /**
   * [Legacy] 基础版轨迹验证
   * 
   * @deprecated 建议使用 validateTripNARATrajectory()
   */
  async validateTrajectory(
    gateResult: GateResult,
    complianceResult: ComplianceResult,
    userApproval?: ApprovalStatus,
    executionResult?: ExecutionResult,
  ): Promise<TrajectoryValidationResult> {
    this.logger.debug(`[TrajectoryValidator] [Legacy] 开始验证轨迹`);

    const reasons: string[] = [];
    let score = 1.0;

    // 1. Gate 检查
    if (gateResult.gate_result === 'BLOCK') {
      this.logger.debug(`[TrajectoryValidator] Gate BLOCK，轨迹无效`);
      return { isValid: false, score: 0, reasons: ['Gate BLOCK'] };
    }
    if (gateResult.gate_result === 'ADJUST_REQUIRED') {
      score -= 0.2;
      reasons.push('Gate ADJUST_REQUIRED');
      this.logger.debug(`[TrajectoryValidator] Gate ADJUST_REQUIRED，扣分 0.2`);
    }

    // 2. Compliance 检查
    const criticalWarnings = complianceResult.risk_warnings.filter(
      (w) => w.level === 'CRITICAL',
    );
    if (criticalWarnings.length > 0) {
      this.logger.debug(
        `[TrajectoryValidator] 发现 ${criticalWarnings.length} 个 CRITICAL 风险警告，轨迹无效`,
      );
      return {
        isValid: false,
        score: 0,
        reasons: ['CRITICAL risk warnings'],
      };
    }

    // 3. 用户审批检查（注意：用户审批 ≠ 安全真值）
    if (userApproval !== undefined) {
      if (userApproval === ApprovalStatus.REJECTED) {
        this.logger.debug(`[TrajectoryValidator] 用户拒绝，轨迹标记为负样本`);
        // Legacy contract (tests/CI): REJECTED marks trajectory invalid for this validator.
        return { isValid: false, score: 0, reasons: ['User rejected'] };
      }
      if (userApproval === ApprovalStatus.APPROVED) {
        score += 0.1;
        reasons.push('User approved');
        this.logger.debug(`[TrajectoryValidator] 用户批准，加分 0.1`);
      }
    }

    // 4. 执行结果检查
    if (executionResult) {
      if (!executionResult.success) {
        this.logger.debug(`[TrajectoryValidator] 执行失败，轨迹无效`);
        return { isValid: false, score: 0, reasons: ['Execution failed'] };
      }
      reasons.push('Execution succeeded');
      this.logger.debug(`[TrajectoryValidator] 执行成功`);
    }

    // 确保 score 在 0..1 范围内
    score = Math.max(0, Math.min(1, score));

    const result: TrajectoryValidationResult = {
      isValid: score > 0.5, // 调整判定标准
      score,
      reasons,
    };

    this.logger.debug(
      `[TrajectoryValidator] [Legacy] 验证完成: isValid=${result.isValid}, score=${result.score}`,
    );

    return result;
  }
}
