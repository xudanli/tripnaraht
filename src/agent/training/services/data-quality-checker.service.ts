// src/agent/training/services/data-quality-checker.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { RLTrajectory, RLTrajectoryStep } from '../interfaces/trajectory.interface';

/**
 * 数据质量检查结果
 */
export interface DataQualityResult {
  isValid: boolean;
  score: number; // 0..1
  issues: DataQualityIssue[];
  stats: {
    total_trajectories: number;
    valid_trajectories: number;
    invalid_trajectories: number;
    completeness_rate: number; // 完整率
    duplicate_rate: number; // 重复率
    anomaly_rate: number; // 异常率
    integrity_rate: number; // 完整性率（s→a→r→s'链条完整性）
  };
}

/**
 * 数据质量问题
 */
export interface DataQualityIssue {
  type: 'MISSING_FIELD' | 'DUPLICATE' | 'ANOMALY' | 'INCOMPLETE_CHAIN' | 'INVALID_FORMAT';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  trajectory_id?: string;
  step_index?: number;
  field?: string;
  message: string;
  suggestion?: string;
}

/**
 * DataQualityCheckerService
 * 
 * 职责：验证轨迹数据质量（缺字段、重复、异常、完整性）
 * 
 * 质量规则：
 * 1. 必需字段检查（trajectoryId、plan、decisionTrace等）
 * 2. 重复检查（基于trajectoryId）
 * 3. 异常检查（reward超出范围、state格式错误等）
 * 4. 完整性检查（s→a→r→s'链条完整性）
 */
@Injectable()
export class DataQualityCheckerService {
  private readonly logger = new Logger(DataQualityCheckerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 验证单个轨迹质量
   */
  async validateTrajectory(trajectory: RLTrajectory): Promise<{
    isValid: boolean;
    score: number;
    issues: DataQualityIssue[];
  }> {
    const issues: DataQualityIssue[] = [];

    // 1. 必需字段检查
    issues.push(...this.checkRequiredFields(trajectory));

    // 2. 格式验证
    issues.push(...this.checkFormat(trajectory));

    // 3. 异常检查
    issues.push(...this.checkAnomalies(trajectory));

    // 4. 完整性检查（s→a→r→s'链条）
    issues.push(...this.checkChainIntegrity(trajectory));

    // 计算质量分数
    const score = this.calculateQualityScore(issues);

    // 判断是否有效（无CRITICAL或HIGH级别问题）
    const isValid = !issues.some(
      (issue) => issue.severity === 'CRITICAL' || issue.severity === 'HIGH',
    );

    return {
      isValid,
      score,
      issues,
    };
  }

  /**
   * 验证数据集质量
   */
  async validateDataset(trajectories: RLTrajectory[]): Promise<DataQualityResult> {
    this.logger.log(
      `[DataQualityChecker] 验证数据集质量: count=${trajectories.length}`,
    );

    const allIssues: DataQualityIssue[] = [];
    let validCount = 0;
    let invalidCount = 0;

    // 验证每个轨迹
    for (const trajectory of trajectories) {
      const result = await this.validateTrajectory(trajectory);
      allIssues.push(...result.issues);

      if (result.isValid) {
        validCount++;
      } else {
        invalidCount++;
      }
    }

    // 检查重复
    const duplicateIssues = this.checkDuplicates(trajectories);
    allIssues.push(...duplicateIssues);

    // 计算统计信息
    const stats = {
      total_trajectories: trajectories.length,
      valid_trajectories: validCount,
      invalid_trajectories: invalidCount,
      completeness_rate: this.calculateCompletenessRate(trajectories, allIssues),
      duplicate_rate: duplicateIssues.length / trajectories.length,
      anomaly_rate: allIssues.filter((i) => i.type === 'ANOMALY').length / trajectories.length,
      integrity_rate: this.calculateIntegrityRate(trajectories, allIssues),
    };

    // 计算总体质量分数
    const score = this.calculateQualityScore(allIssues);

    const result: DataQualityResult = {
      isValid: stats.valid_trajectories / stats.total_trajectories >= 0.95, // 95%以上有效
      score,
      issues: allIssues,
      stats,
    };

    this.logger.log(
      `[DataQualityChecker] 质量检查完成: valid=${validCount}/${trajectories.length}, score=${score.toFixed(2)}, completeness=${(stats.completeness_rate * 100).toFixed(1)}%`,
    );

    return result;
  }

  /**
   * 检查必需字段
   */
  private checkRequiredFields(trajectory: RLTrajectory): DataQualityIssue[] {
    const issues: DataQualityIssue[] = [];
    const requiredFields = [
      'trajectory_id',
      'request_id',
      'steps',
      'metadata',
    ];

    for (const field of requiredFields) {
      if (!trajectory[field as keyof RLTrajectory]) {
        issues.push({
          type: 'MISSING_FIELD',
          severity: 'CRITICAL',
          trajectory_id: trajectory.trajectory_id,
          field,
          message: `Missing required field: ${field}`,
          suggestion: `Ensure ${field} is present in trajectory data`,
        });
      }
    }

    // 检查metadata必需字段
    if (trajectory.metadata) {
      const requiredMetadataFields = ['model_version', 'created_at', 'validation_status'];
      for (const field of requiredMetadataFields) {
        if (!trajectory.metadata[field as keyof typeof trajectory.metadata]) {
          issues.push({
            type: 'MISSING_FIELD',
            severity: 'HIGH',
            trajectory_id: trajectory.trajectory_id,
            field: `metadata.${field}`,
            message: `Missing required metadata field: ${field}`,
            suggestion: `Ensure metadata.${field} is present`,
          });
        }
      }
    }

    // 检查steps必需字段
    if (trajectory.steps && trajectory.steps.length > 0) {
      for (let i = 0; i < trajectory.steps.length; i++) {
        const step = trajectory.steps[i];
        const stepRequiredFields = ['state', 'action', 'reward', 'timestamp'];
        for (const field of stepRequiredFields) {
          if (!step[field as keyof RLTrajectoryStep]) {
            issues.push({
              type: 'MISSING_FIELD',
              severity: 'HIGH',
              trajectory_id: trajectory.trajectory_id,
              step_index: i,
              field: `steps[${i}].${field}`,
              message: `Missing required field in step ${i}: ${field}`,
              suggestion: `Ensure step ${i} has ${field}`,
            });
          }
        }
      }
    }

    return issues;
  }

  /**
   * 检查格式
   */
  private checkFormat(trajectory: RLTrajectory): DataQualityIssue[] {
    const issues: DataQualityIssue[] = [];

    // 检查trajectory_id格式
    if (trajectory.trajectory_id && !trajectory.trajectory_id.startsWith('traj_')) {
      issues.push({
        type: 'INVALID_FORMAT',
        severity: 'MEDIUM',
        trajectory_id: trajectory.trajectory_id,
        field: 'trajectory_id',
        message: `Invalid trajectory_id format: should start with 'traj_'`,
        suggestion: 'Ensure trajectory_id follows the pattern: traj_*',
      });
    }

    // 检查timestamp格式
    if (trajectory.metadata?.created_at) {
      if (isNaN(Date.parse(trajectory.metadata.created_at))) {
        issues.push({
          type: 'INVALID_FORMAT',
          severity: 'MEDIUM',
          trajectory_id: trajectory.trajectory_id,
          field: 'metadata.created_at',
          message: `Invalid timestamp format: ${trajectory.metadata.created_at}`,
          suggestion: 'Ensure timestamp is in ISO 8601 format',
        });
      }
    }

    // 检查steps中的timestamp格式
    if (trajectory.steps) {
      for (let i = 0; i < trajectory.steps.length; i++) {
        const step = trajectory.steps[i];
        if (step.timestamp && isNaN(Date.parse(step.timestamp))) {
          issues.push({
            type: 'INVALID_FORMAT',
            severity: 'MEDIUM',
            trajectory_id: trajectory.trajectory_id,
            step_index: i,
            field: `steps[${i}].timestamp`,
            message: `Invalid timestamp format in step ${i}`,
            suggestion: 'Ensure timestamp is in ISO 8601 format',
          });
        }
      }
    }

    return issues;
  }

  /**
   * 检查异常
   */
  private checkAnomalies(trajectory: RLTrajectory): DataQualityIssue[] {
    const issues: DataQualityIssue[] = [];

    // 检查reward范围（应该在0-1之间）
    if (trajectory.metadata?.total_reward !== undefined) {
      const reward = trajectory.metadata.total_reward;
      if (reward < 0 || reward > 1) {
        issues.push({
          type: 'ANOMALY',
          severity: 'HIGH',
          trajectory_id: trajectory.trajectory_id,
          field: 'metadata.total_reward',
          message: `Reward out of range: ${reward} (expected 0-1)`,
          suggestion: 'Ensure reward is normalized to 0-1 range',
        });
      }
    }

    // 检查validation_score范围（应该在0-1之间）
    if (trajectory.metadata?.validation_score !== undefined) {
      const score = trajectory.metadata.validation_score;
      if (score < 0 || score > 1) {
        issues.push({
          type: 'ANOMALY',
          severity: 'HIGH',
          trajectory_id: trajectory.trajectory_id,
          field: 'metadata.validation_score',
          message: `Validation score out of range: ${score} (expected 0-1)`,
          suggestion: 'Ensure validation_score is normalized to 0-1 range',
        });
      }
    }

    // 检查steps中的reward范围
    if (trajectory.steps) {
      for (let i = 0; i < trajectory.steps.length; i++) {
        const step = trajectory.steps[i];
        if (step.reward?.total_reward !== undefined) {
          const reward = step.reward.total_reward;
          if (reward < -1 || reward > 1) {
            issues.push({
              type: 'ANOMALY',
              severity: 'MEDIUM',
              trajectory_id: trajectory.trajectory_id,
              step_index: i,
              field: `steps[${i}].reward.total_reward`,
              message: `Reward out of range in step ${i}: ${reward} (expected -1 to 1)`,
              suggestion: 'Ensure reward is in valid range',
            });
          }
        }
      }
    }

    // 检查steps数量异常（太少或太多）
    if (trajectory.steps) {
      if (trajectory.steps.length === 0) {
        issues.push({
          type: 'ANOMALY',
          severity: 'CRITICAL',
          trajectory_id: trajectory.trajectory_id,
          message: 'Trajectory has no steps',
          suggestion: 'Ensure trajectory has at least one step',
        });
      } else if (trajectory.steps.length > 100) {
        issues.push({
          type: 'ANOMALY',
          severity: 'MEDIUM',
          trajectory_id: trajectory.trajectory_id,
          message: `Trajectory has too many steps: ${trajectory.steps.length}`,
          suggestion: 'Consider splitting long trajectories',
        });
      }
    }

    return issues;
  }

  /**
   * 检查链条完整性（s→a→r→s'）
   */
  private checkChainIntegrity(trajectory: RLTrajectory): DataQualityIssue[] {
    const issues: DataQualityIssue[] = [];

    if (!trajectory.steps || trajectory.steps.length === 0) {
      return issues;
    }

    // 检查每个步骤的链条完整性
    for (let i = 0; i < trajectory.steps.length; i++) {
      const step = trajectory.steps[i];

      // 检查state存在
      if (!step.state) {
        issues.push({
          type: 'INCOMPLETE_CHAIN',
          severity: 'CRITICAL',
          trajectory_id: trajectory.trajectory_id,
          step_index: i,
          message: `Step ${i} missing state (s)`,
          suggestion: 'Ensure each step has a state',
        });
      }

      // 检查action存在
      if (!step.action) {
        issues.push({
          type: 'INCOMPLETE_CHAIN',
          severity: 'CRITICAL',
          trajectory_id: trajectory.trajectory_id,
          step_index: i,
          message: `Step ${i} missing action (a)`,
          suggestion: 'Ensure each step has an action',
        });
      }

      // 检查reward存在
      if (!step.reward) {
        issues.push({
          type: 'INCOMPLETE_CHAIN',
          severity: 'HIGH',
          trajectory_id: trajectory.trajectory_id,
          step_index: i,
          message: `Step ${i} missing reward (r)`,
          suggestion: 'Ensure each step has a reward',
        });
      }

      // 检查next_state（除了最后一步，其他步骤应该有next_state）
      if (i < trajectory.steps.length - 1 && !step.next_state) {
        issues.push({
          type: 'INCOMPLETE_CHAIN',
          severity: 'MEDIUM',
          trajectory_id: trajectory.trajectory_id,
          step_index: i,
          message: `Step ${i} missing next_state (s')`,
          suggestion: 'Ensure non-terminal steps have next_state',
        });
      }

      // 检查状态转换一致性（next_state应该等于下一步的state）
      if (i < trajectory.steps.length - 1 && step.next_state && trajectory.steps[i + 1].state) {
        // 简单检查：request_id应该一致
        if (
          step.next_state.request_id !== trajectory.steps[i + 1].state.request_id
        ) {
          issues.push({
            type: 'INCOMPLETE_CHAIN',
            severity: 'MEDIUM',
            trajectory_id: trajectory.trajectory_id,
            step_index: i,
            message: `Step ${i} next_state inconsistent with step ${i + 1} state`,
            suggestion: 'Ensure state transitions are consistent',
          });
        }
      }
    }

    return issues;
  }

  /**
   * 检查重复
   */
  private checkDuplicates(trajectories: RLTrajectory[]): DataQualityIssue[] {
    const issues: DataQualityIssue[] = [];
    const seenIds = new Set<string>();

    for (const trajectory of trajectories) {
      if (seenIds.has(trajectory.trajectory_id)) {
        issues.push({
          type: 'DUPLICATE',
          severity: 'HIGH',
          trajectory_id: trajectory.trajectory_id,
          message: `Duplicate trajectory_id: ${trajectory.trajectory_id}`,
          suggestion: 'Remove duplicate trajectories',
        });
      } else {
        seenIds.add(trajectory.trajectory_id);
      }
    }

    return issues;
  }

  /**
   * 计算质量分数
   */
  private calculateQualityScore(issues: DataQualityIssue[]): number {
    if (issues.length === 0) {
      return 1.0;
    }

    // 根据严重程度加权扣分
    let totalPenalty = 0;
    for (const issue of issues) {
      switch (issue.severity) {
        case 'CRITICAL':
          totalPenalty += 0.5;
          break;
        case 'HIGH':
          totalPenalty += 0.2;
          break;
        case 'MEDIUM':
          totalPenalty += 0.1;
          break;
        case 'LOW':
          totalPenalty += 0.05;
          break;
      }
    }

    // 分数 = 1 - min(totalPenalty, 1)
    return Math.max(0, 1 - Math.min(totalPenalty, 1));
  }

  /**
   * 计算完整率
   */
  private calculateCompletenessRate(
    trajectories: RLTrajectory[],
    issues: DataQualityIssue[],
  ): number {
    const missingFieldIssues = issues.filter((i) => i.type === 'MISSING_FIELD');
    const totalFields = trajectories.length * 10; // 估算每个轨迹约10个字段
    const missingFields = missingFieldIssues.length;
    return Math.max(0, 1 - missingFields / totalFields);
  }

  /**
   * 计算完整性率（链条完整性）
   */
  private calculateIntegrityRate(
    trajectories: RLTrajectory[],
    issues: DataQualityIssue[],
  ): number {
    const incompleteChainIssues = issues.filter((i) => i.type === 'INCOMPLETE_CHAIN');
    const totalSteps = trajectories.reduce((sum, t) => sum + (t.steps?.length || 0), 0);
    const incompleteSteps = incompleteChainIssues.length;
    return totalSteps > 0 ? Math.max(0, 1 - incompleteSteps / totalSteps) : 1.0;
  }
}
