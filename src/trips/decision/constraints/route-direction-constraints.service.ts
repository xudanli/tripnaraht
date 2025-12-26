// src/trips/decision/constraints/route-direction-constraints.service.ts
/**
 * RouteDirection 约束服务
 * 
 * 提供硬约束/软约束检查方法，供 Abu/Dr.Dre/Neptune 使用
 */

import { Injectable } from '@nestjs/common';
import { TripWorldState, ActivityCandidate } from '../world-model';

export interface ConstraintViolation {
  type: 'hard' | 'soft';
  code: string;
  message: string;
  candidateId?: string;
  severity: 'critical' | 'warning';
  details?: Record<string, any>;
}

@Injectable()
export class RouteDirectionConstraintsService {
  /**
   * 检查硬约束违反（必须修复/降级）
   */
  checkHardConstraints(
    state: TripWorldState,
    candidate: ActivityCandidate,
    dayElevation?: number,
    dayAscent?: number
  ): ConstraintViolation[] {
    const violations: ConstraintViolation[] = [];
    const policies = state.policies as any;
    const hardConstraints = policies?.hardConstraints;

    if (!hardConstraints) return violations;

    // 检查快速爬升限制
    if (hardConstraints.rapidAscentForbidden && dayAscent !== undefined) {
      const maxRapidAscent = hardConstraints.maxDailyRapidAscentM || 500;
      if (dayAscent > maxRapidAscent) {
        violations.push({
          type: 'hard',
          code: 'RAPID_ASCENT_VIOLATION',
          message: `每日快速爬升超过限制: ${dayAscent}m > ${maxRapidAscent}m`,
          candidateId: candidate.id,
          severity: 'critical',
          details: { dayAscent, maxRapidAscent },
        });
      }
    }

    // 检查坡度限制（如果有 DEM 数据）
    if (hardConstraints.maxSlopePct && candidate.metadata?.slope) {
      const slope = candidate.metadata.slope;
      if (slope > hardConstraints.maxSlopePct) {
        violations.push({
          type: 'hard',
          code: 'SLOPE_VIOLATION',
          message: `坡度超过限制: ${slope}% > ${hardConstraints.maxSlopePct}%`,
          candidateId: candidate.id,
          severity: 'critical',
          details: { slope, maxSlope: hardConstraints.maxSlopePct },
        });
      }
    }

    // 检查许可要求
    if (hardConstraints.requiresPermit && !candidate.metadata?.hasPermit) {
      violations.push({
        type: 'hard',
        code: 'PERMIT_REQUIRED',
        message: '此路线需要许可，但未检测到许可信息',
        candidateId: candidate.id,
        severity: 'critical',
        details: { requiresPermit: true },
      });
    }

    return violations;
  }

  /**
   * 检查软约束违反（尽量满足，超了就加惩罚）
   */
  checkSoftConstraints(
    state: TripWorldState,
    candidate: ActivityCandidate,
    dayElevation?: number,
    dayAscent?: number
  ): ConstraintViolation[] {
    const violations: ConstraintViolation[] = [];
    const policies = state.policies as any;
    const softConstraints = policies?.softConstraints;

    if (!softConstraints) return violations;

    // 检查海拔限制
    if (softConstraints.maxElevationM && dayElevation !== undefined) {
      if (dayElevation > softConstraints.maxElevationM) {
        violations.push({
          type: 'soft',
          code: 'ELEVATION_WARNING',
          message: `海拔超过建议值: ${dayElevation}m > ${softConstraints.maxElevationM}m`,
          candidateId: candidate.id,
          severity: 'warning',
          details: { dayElevation, maxElevation: softConstraints.maxElevationM },
        });
      }
    }

    // 检查每日爬升限制
    if (softConstraints.maxDailyAscentM && dayAscent !== undefined) {
      if (dayAscent > softConstraints.maxDailyAscentM) {
        violations.push({
          type: 'soft',
          code: 'DAILY_ASCENT_WARNING',
          message: `每日爬升超过建议值: ${dayAscent}m > ${softConstraints.maxDailyAscentM}m`,
          candidateId: candidate.id,
          severity: 'warning',
          details: { dayAscent, maxDailyAscent: softConstraints.maxDailyAscentM },
        });
      }
    }

    return violations;
  }

  /**
   * 计算软约束惩罚分数（用于排序）
   */
  calculateSoftConstraintPenalty(
    state: TripWorldState,
    candidate: ActivityCandidate,
    dayElevation?: number,
    dayAscent?: number
  ): number {
    const violations = this.checkSoftConstraints(state, candidate, dayElevation, dayAscent);
    let penalty = 0;

    for (const violation of violations) {
      if (violation.code === 'ELEVATION_WARNING') {
        const excess = (dayElevation || 0) - (state.policies as any)?.softConstraints?.maxElevationM || 0;
        penalty += Math.min(0.3, excess / 1000); // 每超过1000米惩罚0.3
      }
      if (violation.code === 'DAILY_ASCENT_WARNING') {
        const excess = (dayAscent || 0) - (state.policies as any)?.softConstraints?.maxDailyAscentM || 0;
        penalty += Math.min(0.2, excess / 500); // 每超过500米惩罚0.2
      }
    }

    return penalty;
  }

  /**
   * 应用目标函数权重（影响排序）
   */
  applyObjectiveWeights(
    state: TripWorldState,
    candidate: ActivityCandidate,
    baseScore: number
  ): number {
    const policies = state.policies as any;
    const objectives = policies?.objectives;

    if (!objectives) return baseScore;

    let weightedScore = baseScore;

    // 偏好观景点
    if (objectives.preferViewpoints && candidate.intentTags?.includes('摄影')) {
      weightedScore += objectives.preferViewpoints * 0.1;
    }

    // 偏好温泉
    if (objectives.preferHotSpring && candidate.intentTags?.includes('温泉')) {
      weightedScore += objectives.preferHotSpring * 0.1;
    }

    // 偏好摄影
    if (objectives.preferPhotography && candidate.intentTags?.includes('摄影')) {
      weightedScore += objectives.preferPhotography * 0.1;
    }

    return weightedScore;
  }
}

