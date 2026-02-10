// src/agent/training/services/reward-signal-extractor.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { ApprovalStatus } from '@prisma/client';
import { RewardSignal, RewardSignalType, ExecutionResult } from '../interfaces/trajectory.interface';
import { TripNARAApprovalSignals, GatedRewardMetrics } from '../interfaces/product.interface';

/**
 * TripNARA 扩展版 Reward 信号
 */
export interface TripNARARewardSignal extends RewardSignal {
  /** 信号来源 */
  source: 'SYSTEM' | 'USER' | 'HYBRID';
  /** 是否用于门控计算 */
  is_gate_signal: boolean;
}

/**
 * RewardSignalExtractorService
 * 
 * TripNARA v2.0 - 支持门控型奖励和拆分审批信号
 * 
 * 核心原则：
 * 1. 系统门控信号 > 用户偏好信号
 * 2. 门控信号决定"可训练性"
 * 3. 用户偏好信号决定"DPO 正/负样本"
 * 
 * Reward 信号来源：
 * - 系统门控：GATE_PASS/FAIL, SAFETY_PASS, COMPLIANCE_PASS, FEASIBILITY_PASS
 * - 证据质量：EVIDENCE_QUALITY
 * - 风险披露：RISK_DISCLOSURE
 * - 用户偏好：USER_APPROVAL, PREFERENCE_BONUS
 * - 执行反馈：EXECUTION_SUCCESS/FAILURE, PLAN_COMMIT
 */
@Injectable()
export class RewardSignalExtractorService {
  private readonly logger = new Logger(RewardSignalExtractorService.name);

  // ============================================================================
  // TripNARA v2.0 新增方法
  // ============================================================================

  /**
   * 从 TripNARA 拆分审批信号提取 reward 信号
   * 
   * 核心：系统门控和用户偏好分开处理
   */
  extractFromTripNARAApproval(
    signals: TripNARAApprovalSignals,
  ): TripNARARewardSignal[] {
    this.logger.debug(
      `[RewardExtractor] 从 TripNARA 审批信号提取: system_approved=${signals.system_approval.system_approved}, user_approved=${signals.user_preference.user_approved}`,
    );

    const rewardSignals: TripNARARewardSignal[] = [];

    // === 系统门控信号（决定可训练性） ===
    
    // 安全门控
    rewardSignals.push({
      type: signals.system_approval.safety_pass ? 'SAFETY_PASS' : 'GATE_FAIL',
      value: signals.system_approval.safety_pass ? 0.3 : -2.0,
      timestamp: new Date().toISOString(),
      source: 'SYSTEM',
      is_gate_signal: true,
      metadata: {
        gate_type: 'SAFETY',
        passed: signals.system_approval.safety_pass,
      },
    });

    // 合规门控
    rewardSignals.push({
      type: signals.system_approval.compliance_pass ? 'COMPLIANCE_PASS' : 'GATE_FAIL',
      value: signals.system_approval.compliance_pass ? 0.2 : -1.5,
      timestamp: new Date().toISOString(),
      source: 'SYSTEM',
      is_gate_signal: true,
      metadata: {
        gate_type: 'COMPLIANCE',
        passed: signals.system_approval.compliance_pass,
      },
    });

    // 可执行门控
    rewardSignals.push({
      type: signals.system_approval.feasibility_pass ? 'FEASIBILITY_PASS' : 'GATE_FAIL',
      value: signals.system_approval.feasibility_pass ? 0.2 : -1.0,
      timestamp: new Date().toISOString(),
      source: 'SYSTEM',
      is_gate_signal: true,
      metadata: {
        gate_type: 'FEASIBILITY',
        passed: signals.system_approval.feasibility_pass,
      },
    });

    // 证据充分性
    if (signals.system_approval.evidence_sufficient) {
      rewardSignals.push({
        type: 'EVIDENCE_QUALITY',
        value: 0.1,
        timestamp: new Date().toISOString(),
        source: 'SYSTEM',
        is_gate_signal: false,
        metadata: {
          evidence_sufficient: true,
        },
      });
    }

    // 系统整体门控
    rewardSignals.push({
      type: signals.system_approval.system_approved ? 'GATE_PASS' : 'GATE_FAIL',
      value: signals.system_approval.system_approved ? 0 : -0.5, // 已在上面单独计算，这里只做标记
      timestamp: new Date().toISOString(),
      source: 'SYSTEM',
      is_gate_signal: true,
      metadata: {
        system_approved: signals.system_approval.system_approved,
        rejection_reasons: signals.system_approval.rejection_reasons,
      },
    });

    // === 用户偏好信号（决定 DPO 正/负样本） ===
    
    // 只有系统通过后，用户偏好才有意义
    if (signals.system_approval.system_approved) {
      // 用户审批
      rewardSignals.push({
        type: 'USER_APPROVAL',
        value: signals.user_preference.user_approved ? 0.3 : -0.1,
        timestamp: new Date().toISOString(),
        source: 'USER',
        is_gate_signal: false,
        metadata: {
          user_approved: signals.user_preference.user_approved,
          is_dpo_positive: signals.user_preference.user_approved,
        },
      });

      // 满意度评分加分
      if (signals.user_preference.satisfaction_rating) {
        const rating = signals.user_preference.satisfaction_rating;
        const bonus = ((rating - 3) / 2) * 0.1; // 3分为基准，5分加0.1，1分减0.1
        
        rewardSignals.push({
          type: 'PREFERENCE_BONUS',
          value: bonus,
          timestamp: new Date().toISOString(),
          source: 'USER',
          is_gate_signal: false,
          metadata: {
            satisfaction_rating: rating,
            bonus_type: 'SATISFACTION',
          },
        });
      }

      // 偏好因素加分
      if (signals.user_preference.preference_factors) {
        const factors = signals.user_preference.preference_factors;
        const avgFactor = (
          factors.route_appeal +
          factors.pacing_comfort +
          factors.poi_interest +
          factors.cost_acceptability
        ) / 4;

        if (avgFactor > 0.7) {
          rewardSignals.push({
            type: 'PREFERENCE_BONUS',
            value: (avgFactor - 0.7) * 0.1,
            timestamp: new Date().toISOString(),
            source: 'USER',
            is_gate_signal: false,
            metadata: {
              avg_preference_factor: avgFactor,
              bonus_type: 'PREFERENCE_FACTORS',
              factors,
            },
          });
        }
      }
    }

    this.logger.debug(
      `[RewardExtractor] 提取到 ${rewardSignals.length} 个 TripNARA 信号`,
    );

    return rewardSignals;
  }

  /**
   * 从门控指标提取信号
   */
  extractFromGateMetrics(metrics: GatedRewardMetrics): TripNARARewardSignal[] {
    const signals: TripNARARewardSignal[] = [];

    // 安全门控
    const safetyPass = metrics.safety_score >= 0.9;
    signals.push({
      type: safetyPass ? 'SAFETY_PASS' : 'GATE_FAIL',
      value: safetyPass ? metrics.safety_score * 0.3 : -2.0,
      timestamp: new Date().toISOString(),
      source: 'SYSTEM',
      is_gate_signal: true,
      metadata: {
        gate_type: 'SAFETY',
        score: metrics.safety_score,
        threshold: 0.9,
        passed: safetyPass,
      },
    });

    // 合规门控
    const compliancePass = metrics.compliance_score >= 0.95;
    signals.push({
      type: compliancePass ? 'COMPLIANCE_PASS' : 'GATE_FAIL',
      value: compliancePass ? metrics.compliance_score * 0.2 : -1.5,
      timestamp: new Date().toISOString(),
      source: 'SYSTEM',
      is_gate_signal: true,
      metadata: {
        gate_type: 'COMPLIANCE',
        score: metrics.compliance_score,
        threshold: 0.95,
        passed: compliancePass,
      },
    });

    // 可执行门控
    const feasibilityPass = metrics.feasibility_score >= 0.8;
    signals.push({
      type: feasibilityPass ? 'FEASIBILITY_PASS' : 'GATE_FAIL',
      value: feasibilityPass ? metrics.feasibility_score * 0.2 : -1.0,
      timestamp: new Date().toISOString(),
      source: 'SYSTEM',
      is_gate_signal: true,
      metadata: {
        gate_type: 'FEASIBILITY',
        score: metrics.feasibility_score,
        threshold: 0.8,
        passed: feasibilityPass,
      },
    });

    // 证据覆盖
    if (metrics.evidence_coverage !== undefined) {
      signals.push({
        type: 'EVIDENCE_QUALITY',
        value: metrics.evidence_coverage * 0.1,
        timestamp: new Date().toISOString(),
        source: 'SYSTEM',
        is_gate_signal: false,
        metadata: {
          evidence_coverage: metrics.evidence_coverage,
        },
      });
    }

    // 风险披露
    if (metrics.risk_disclosure === true) {
      signals.push({
        type: 'RISK_DISCLOSURE',
        value: 0.05,
        timestamp: new Date().toISOString(),
        source: 'SYSTEM',
        is_gate_signal: false,
        metadata: {
          risk_disclosed: true,
        },
      });
    }

    return signals;
  }

  /**
   * 计算 TripNARA 总奖励（考虑门控）
   */
  calculateTripNARATotalReward(signals: TripNARARewardSignal[]): {
    total_reward: number;
    gate_passed: boolean;
    trainable: boolean;
  } {
    // 检查门控信号
    const gateSignals = signals.filter(s => s.is_gate_signal);
    const gateFailed = gateSignals.some(
      s => s.type === 'GATE_FAIL' || s.value < 0,
    );

    if (gateFailed) {
      // 门控失败，返回最低的门控惩罚
      const minGateValue = Math.min(...gateSignals.map(s => s.value));
      return {
        total_reward: minGateValue,
        gate_passed: false,
        trainable: false,
      };
    }

    // 门控通过，计算总奖励
    const totalReward = signals
      .filter(s => !s.is_gate_signal || s.value > 0)
      .reduce((sum, s) => sum + s.value, 0);

    return {
      total_reward: Math.min(1.0, totalReward),
      gate_passed: true,
      trainable: true,
    };
  }

  // ============================================================================
  // [Legacy] 原有方法保持兼容
  // ============================================================================

  /**
   * [Legacy] 从用户审批提取 reward 信号
   */
  extractFromApproval(approval: ApprovalStatus): RewardSignal[] {
    this.logger.debug(`[RewardExtractor] [Legacy] 从审批提取reward: ${approval}`);

    const signals: RewardSignal[] = [];

    if (approval === ApprovalStatus.APPROVED) {
      signals.push({
        type: 'USER_APPROVAL',
        value: 1.0,
        timestamp: new Date().toISOString(),
        metadata: {
          approval_status: 'APPROVED',
        },
      });
    } else if (approval === ApprovalStatus.REJECTED) {
      signals.push({
        type: 'USER_APPROVAL',
        value: -0.5,
        timestamp: new Date().toISOString(),
        metadata: {
          approval_status: 'REJECTED',
        },
      });
    }

    this.logger.debug(
      `[RewardExtractor] 提取到 ${signals.length} 个reward信号，总值: ${signals.reduce((sum, s) => sum + s.value, 0)}`,
    );

    return signals;
  }

  /**
   * [Legacy] 从执行结果提取 reward 信号
   */
  extractFromExecution(executionResult: ExecutionResult): RewardSignal[] {
    this.logger.debug(
      `[RewardExtractor] 从执行结果提取reward: success=${executionResult.success}`,
    );

    const signals: RewardSignal[] = [];

    if (executionResult.success) {
      signals.push({
        type: 'EXECUTION_SUCCESS',
        value: 0.8,
        timestamp: new Date().toISOString(),
        metadata: {
          execution_success: true,
          error: executionResult.error || null,
        },
      });
    } else {
      signals.push({
        type: 'EXECUTION_FAILURE',
        value: -0.3,
        timestamp: new Date().toISOString(),
        metadata: {
          execution_success: false,
          error: executionResult.error || 'Unknown error',
        },
      });
    }

    this.logger.debug(
      `[RewardExtractor] 提取到 ${signals.length} 个reward信号，总值: ${signals.reduce((sum, s) => sum + s.value, 0)}`,
    );

    return signals;
  }

  /**
   * [Legacy] 从规划工作台提交提取 reward 信号
   */
  extractFromPlanCommit(success: boolean): RewardSignal[] {
    this.logger.debug(`[RewardExtractor] 从规划提交提取reward: success=${success}`);

    const signals: RewardSignal[] = [];

    if (success) {
      signals.push({
        type: 'PLAN_COMMIT',
        value: 0.8,
        timestamp: new Date().toISOString(),
        metadata: {
          commit_success: true,
        },
      });
    }

    return signals;
  }

  /**
   * [Legacy] 从决策对齐分数提取 reward 信号
   */
  extractFromAlignmentScore(alignmentScore: number): RewardSignal[] {
    this.logger.debug(
      `[RewardExtractor] 从对齐分数提取reward: score=${alignmentScore}`,
    );

    const normalizedScore = Math.max(0, Math.min(1, alignmentScore));

    return [
      {
        type: 'DECISION_ALIGNMENT',
        value: normalizedScore,
        timestamp: new Date().toISOString(),
        metadata: {
          alignment_score: normalizedScore,
        },
      },
    ];
  }

  /**
   * 合并多个 reward 信号，计算总 reward
   */
  calculateTotalReward(signals: RewardSignal[]): number {
    return signals.reduce((sum, signal) => sum + signal.value, 0);
  }

  /**
   * 合并多个 reward 信号数组
   */
  mergeSignals(...signalArrays: RewardSignal[][]): RewardSignal[] {
    return signalArrays.flat();
  }

  /**
   * 从用户反馈提取Reward信号（护城河扩展）
   * 
   * 整合用户反馈学习系统到RL基础设施
   */
  extractFromUserFeedback(feedback: {
    type: 'TRIP_COMPLETED' | 'POI_SKIPPED' | 'DAY_FAILED' | 'POI_ADDED';
    data: {
      actualDays?: number;
      actualAscent?: number;
      actualDifficulty?: number;
      overallSatisfaction?: number;
      skippedPoiIds?: string[];
      skipReason?: string;
      failedDayNumbers?: number[];
      failureReason?: string;
      addedPoiIds?: string[];
    };
  }): TripNARARewardSignal[] {
    this.logger.debug(
      `[RewardExtractor] 从用户反馈提取reward: type=${feedback.type}`,
    );

    const signals: TripNARARewardSignal[] = [];

    switch (feedback.type) {
      case 'TRIP_COMPLETED':
        // 执行成功 → +0.8 reward（如果满意度 >= 4）
        if (feedback.data.overallSatisfaction !== undefined && feedback.data.overallSatisfaction >= 4) {
          signals.push({
            type: 'EXECUTION_SUCCESS',
            value: 0.8,
            timestamp: new Date().toISOString(),
            source: 'USER',
            is_gate_signal: false,
            metadata: {
              trip_completed: true,
              overall_satisfaction: feedback.data.overallSatisfaction,
              actual_days: feedback.data.actualDays,
              actual_ascent: feedback.data.actualAscent,
            },
          });
        } else if (feedback.data.overallSatisfaction !== undefined && feedback.data.overallSatisfaction < 3) {
          // 执行失败（满意度低）→ -0.3 reward
          signals.push({
            type: 'EXECUTION_FAILURE',
            value: -0.3,
            timestamp: new Date().toISOString(),
            source: 'USER',
            is_gate_signal: false,
            metadata: {
              trip_completed: true,
              overall_satisfaction: feedback.data.overallSatisfaction,
              actual_days: feedback.data.actualDays,
            },
          });
        }
        break;

      case 'DAY_FAILED':
        // 执行失败 → -0.3 reward
        signals.push({
          type: 'EXECUTION_FAILURE',
          value: -0.3,
          timestamp: new Date().toISOString(),
          source: 'USER',
          is_gate_signal: false,
          metadata: {
            day_failed: true,
            failed_day_numbers: feedback.data.failedDayNumbers,
            failure_reason: feedback.data.failureReason,
          },
        });
        break;

      case 'POI_SKIPPED':
        // POI跳过 → -0.1 reward（如果跳过核心POI）
        // TODO: 需要检查POI是否是核心POI（需要RouteDirection数据）
        signals.push({
          type: 'CORE_POI_SKIPPED',
          value: -0.1,
          timestamp: new Date().toISOString(),
          source: 'USER',
          is_gate_signal: false,
          metadata: {
            poi_skipped: true,
            skipped_poi_ids: feedback.data.skippedPoiIds,
            skip_reason: feedback.data.skipReason,
          },
        });
        break;

      case 'POI_ADDED':
        // POI添加 → +0.1 reward（用户主动添加POI，说明计划不够完整）
        signals.push({
          type: 'POI_ADDED',
          value: 0.1,
          timestamp: new Date().toISOString(),
          source: 'USER',
          is_gate_signal: false,
          metadata: {
            poi_added: true,
            added_poi_ids: feedback.data.addedPoiIds,
          },
        });
        break;
    }

    this.logger.debug(
      `[RewardExtractor] 从用户反馈提取到 ${signals.length} 个reward信号，总值: ${signals.reduce((sum, s) => sum + s.value, 0)}`,
    );

    return signals;
  }
}
