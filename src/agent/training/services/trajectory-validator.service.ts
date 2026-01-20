// src/agent/training/services/trajectory-validator.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { GateResult } from '../../interfaces/trip-plan.interface';
import { ApprovalStatus } from '@prisma/client';
import {
  ComplianceResult,
  ExecutionResult,
  TrajectoryValidationResult,
} from '../interfaces/trajectory.interface';

/**
 * TrajectoryValidatorService
 * 
 * 职责：验证轨迹质量，判断是否"通过验证"
 * 
 * 验证标准：
 * 1. GateResult = ALLOW（不是 BLOCK）
 * 2. 无 CRITICAL 风险警告
 * 3. 用户审批 = APPROVED（如果存在）
 * 4. 执行成功（如果已执行）
 */
@Injectable()
export class TrajectoryValidatorService {
  private readonly logger = new Logger(TrajectoryValidatorService.name);

  /**
   * 验证轨迹
   */
  async validateTrajectory(
    gateResult: GateResult,
    complianceResult: ComplianceResult,
    userApproval?: ApprovalStatus,
    executionResult?: ExecutionResult,
  ): Promise<TrajectoryValidationResult> {
    this.logger.debug(`[TrajectoryValidator] 开始验证轨迹`);

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

    // 3. 用户审批检查
    if (userApproval !== undefined) {
      if (userApproval === ApprovalStatus.REJECTED) {
        this.logger.debug(`[TrajectoryValidator] 用户拒绝，轨迹无效`);
        return { isValid: false, score: 0, reasons: ['User rejected'] };
      }
      if (userApproval === ApprovalStatus.APPROVED) {
        score += 0.1; // 用户明确批准，加分
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
      this.logger.debug(`[TrajectoryValidator] 执行成功，加分`);
    }

    // 确保 score 在 0..1 范围内
    score = Math.max(0, Math.min(1, score));

    const result: TrajectoryValidationResult = {
      isValid: true,
      score,
      reasons,
    };

    this.logger.debug(
      `[TrajectoryValidator] 验证完成，结果: isValid=${result.isValid}, score=${result.score}`,
    );

    return result;
  }
}
