// src/trips/decision/services/dem-evidence-enforcer.service.ts
/**
 * DEM Evidence Enforcer Service
 * 
 * PART 2: 强制规则执行器
 * 
 * 强制规则（写进代码，不写进文档）：
 * ❌ 没有 DEM evidence → plan 不可 finalize
 * ❌ Neptune 不允许修复没有 DEM evidence 的 segment
 * ❌ Abu 不允许忽略 HARD violation
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  DemDecisionEvidence,
  DemEvidencePipelineResult,
} from '../interfaces/dem-decision-evidence.interface';

@Injectable()
export class DemEvidenceEnforcerService {
  private readonly logger = new Logger(DemEvidenceEnforcerService.name);

  /**
   * 检查计划是否可以 finalize
   * 
   * 强制规则：没有 DEM evidence → plan 不可 finalize
   */
  canFinalizePlan(evidenceResult: DemEvidencePipelineResult): {
    allowed: boolean;
    reason?: string;
  } {
    if (evidenceResult.segmentEvidences.length === 0) {
      return {
        allowed: false,
        reason: '计划缺少 DEM 证据，无法验证地形约束，不能 finalize',
      };
    }

    if (evidenceResult.hasHardViolation) {
      return {
        allowed: false,
        reason: '计划存在硬约束违规，必须修复后才能 finalize',
      };
    }

    return { allowed: true };
  }

  /**
   * 检查 Neptune 是否可以修复某个 segment
   * 
   * 强制规则：Neptune 不允许修复没有 DEM evidence 的 segment
   */
  canNeptuneRepairSegment(
    segmentId: string,
    evidenceResult: DemEvidencePipelineResult
  ): {
    allowed: boolean;
    reason?: string;
    evidence?: DemDecisionEvidence;
  } {
    const evidence = evidenceResult.segmentEvidences.find(
      e => e.segmentId === segmentId
    );

    if (!evidence) {
      return {
        allowed: false,
        reason: `Segment ${segmentId} 没有 DEM 证据，Neptune 不允许修复`,
      };
    }

    return {
      allowed: true,
      evidence,
    };
  }

  /**
   * 检查 Abu 是否可以忽略某个 violation
   * 
   * 强制规则：Abu 不允许忽略 HARD violation
   */
  canAbuIgnoreViolation(
    segmentId: string,
    evidenceResult: DemEvidencePipelineResult
  ): {
    allowed: boolean;
    reason?: string;
    evidence?: DemDecisionEvidence;
  } {
    const evidence = evidenceResult.segmentEvidences.find(
      e => e.segmentId === segmentId
    );

    if (!evidence) {
      this.logger.warn(`Segment ${segmentId} 没有 DEM 证据，Abu 无法判断是否可以忽略`);
      return {
        allowed: false,
        reason: `Segment ${segmentId} 没有 DEM 证据`,
      };
    }

    if (evidence.violation === 'HARD') {
      return {
        allowed: false,
        reason: `Segment ${segmentId} 存在 HARD violation，Abu 不允许忽略`,
        evidence,
      };
    }

    // SOFT violation 可以忽略（但会记录）
    return {
      allowed: true,
      evidence,
    };
  }

  /**
   * 获取需要修复的 segments（HARD violations）
   */
  getSegmentsRequiringRepair(evidenceResult: DemEvidencePipelineResult): DemDecisionEvidence[] {
    return evidenceResult.segmentEvidences.filter(e => e.violation === 'HARD');
  }

  /**
   * 获取建议优化的 segments（SOFT violations）
   */
  getSegmentsSuggestingOptimization(evidenceResult: DemEvidencePipelineResult): DemDecisionEvidence[] {
    return evidenceResult.segmentEvidences.filter(e => e.violation === 'SOFT');
  }
}

