// src/agent/services/sub-agents/gatekeeper-agent.service.ts

import { Injectable, Logger, Optional } from '@nestjs/common';
import { GatekeeperAgent } from '../../interfaces/sub-agent.interface';
import { TripPlanRequest, OrchestratorState, GateResult, EvidenceRef } from '../../interfaces/trip-plan.interface';
import { PlanGateRunThreeGuardiansSkill } from '../../../skills/plan/gate/plan-gate-run-three-guardians.skill';
import { PlanGatePrecheckSkill } from '../../../skills/plan/gate/plan-gate-precheck.skill';
import { checkHardGate, HardGateResult } from '../../../trips/decision/tot/hard-gate';
import { FRoadCheckSkill } from '../../../skills/world/f-road-check.skill';

/**
 * Gatekeeper Agent Service (Claude Orchestration)
 * 
 * 职责：Should-Exist Gate 规则执行（硬门控+软评分）
 * 
 * 强制：Gate 在 Plan 之前执行
 */
@Injectable()
export class ClaudeGatekeeperAgentService implements GatekeeperAgent {
  private readonly logger = new Logger(ClaudeGatekeeperAgentService.name);

  constructor(
    @Optional() private readonly gateRunThreeGuardians?: PlanGateRunThreeGuardiansSkill,
    @Optional() private readonly gatePrecheck?: PlanGatePrecheckSkill,
    @Optional() private readonly fRoadCheck?: FRoadCheckSkill,
  ) {
    this.logger.log(`[GatekeeperAgent] 已初始化`);
    this.logger.log(`[GatekeeperAgent] GateRunThreeGuardians: ${!!this.gateRunThreeGuardians}, GatePrecheck: ${!!this.gatePrecheck}, FRoadCheck: ${!!this.fRoadCheck}`);
  }

  /**
   * 执行 Should-Exist Gate 评估
   */
  async evaluateGate(
    request: TripPlanRequest,
    researchData: Record<string, any>,
    context: OrchestratorState,
  ): Promise<GateResult> {
    this.logger.debug(`[GatekeeperAgent] 执行 Gate 评估: request_id=${request.request_id}`);

    try {
      // 0. 检查冰岛 F-road 状态（冰岛特定检查）
      if (this.fRoadCheck && this.isIcelandTrip(request)) {
        this.logger.debug(`[GatekeeperAgent] 检测到冰岛行程，执行 F-Road 检查`);
        const fRoadResult = await this.fRoadCheck.execute({
          request_id: request.request_id,
          destination: this.toLocationString(request.destination) || '',
          origin: this.toLocationString(request.origin),
          date_range: request.date_range,
        });

        // 如果有道路关闭，直接返回 BLOCK
        if (!fRoadResult.can_proceed) {
          this.logger.warn(`[GatekeeperAgent] F-Road 检查失败: ${fRoadResult.blocked_roads.length} 条道路关闭`);
          return {
            gate_result: 'BLOCK',
            violations: fRoadResult.blocked_roads.map(r => ({
              type: 'REACHABILITY' as const,
              severity: 'HARD' as const,
              detail: `${r.roadId} is ${r.currentStatus}: ${r.reason}${r.unverified ? ' (UNVERIFIED - requires manual verification)' : ''}`,
            })),
            required_adjustments: (fRoadResult.alternative_routes || []).map(alt => ({
              action: 'REPLACE_SEGMENT' as const,
              why: alt,
            })),
            confidence: 0.9,
            evidence_refs: fRoadResult.evidence_refs.map(ref => ({
              evidence_id: ref.evidence_id,
              source: ref.source,
              last_verified_at: ref.last_verified_at.toISOString(),
              confidence: ref.confidence,
            } as any)),
          };
        }

        // 如果有告警，记录为软检查
        if (fRoadResult.warnings.length > 0 || fRoadResult.required_actions.length > 0) {
          this.logger.warn(`[GatekeeperAgent] F-Road 检查告警: ${fRoadResult.warnings.length} 条`);
          researchData.f_road_warnings = fRoadResult.warnings;
          researchData.f_road_required_actions = fRoadResult.required_actions;
          researchData.f_road_evidence_refs = fRoadResult.evidence_refs;
        }
      }

      // 1. 硬门控检查（快速失败）
      const hardGateResult = this.checkHardGate(request, researchData);
      if (!hardGateResult.allowed) {
        return {
          gate_result: 'BLOCK',
          violations: hardGateResult.violations.map(v => ({
            type: this.mapViolationType(v),
            severity: 'HARD' as const,
            detail: v,
          })),
          required_adjustments: [],
          confidence: 0.9,
          evidence_refs: [],
        };
      }

      // 2. 如果有 gatePrecheck，执行快速预检查
      if (this.gatePrecheck) {
        // TODO: 将 request 转换为 PlanState 格式
        // const precheckResult = await this.gatePrecheck.execute({ planState, tripId: context.request_id });
        // 如果预检查失败，直接返回
      }

      // 3. 如果有 gateRunThreeGuardians，执行三人格评审
      if (this.gateRunThreeGuardians) {
        // TODO: 将 request 转换为 PlanState 格式
        // const guardiansResult = await this.gateRunThreeGuardians.execute({ planState, tripId: context.request_id });
        // 将 GateStatus 转换为 GateResult
      }

      // 4. 软评分检查（基于 researchData）
      const softChecks = this.performSoftChecks(request, researchData);

      // 5. 生成 GateResult
      const gateResult: GateResult = {
        gate_result: softChecks.hasAdjustments ? 'ADJUST_REQUIRED' : 'ALLOW',
        violations: softChecks.violations,
        required_adjustments: softChecks.adjustments,
        confidence: softChecks.confidence,
        evidence_refs: this.extractEvidenceRefs(researchData),
      };

      this.logger.log(`[GatekeeperAgent] Gate 评估完成: ${gateResult.gate_result}, 置信度: ${gateResult.confidence}`);

      return gateResult;
    } catch (error: any) {
      this.logger.error(`[GatekeeperAgent] Gate 评估失败: ${error?.message}`, error?.stack);

      // 降级：返回需要用户确认
      return {
        gate_result: 'NEED_USER_CONFIRM',
        violations: [{
          type: 'DATA_MISSING',
          severity: 'SOFT',
          detail: `Gate 评估失败: ${error?.message || '未知错误'}`,
        }],
        required_adjustments: [],
        confidence: 0.3,
        evidence_refs: [],
      };
    }
  }

  /**
   * 硬门控检查
   */
  private checkHardGate(
    request: TripPlanRequest,
    researchData: Record<string, any>,
  ): { allowed: boolean; violations: string[] } {
    const violations: string[] = [];

    // 检查必需字段
    if (!request.destination) {
      violations.push('缺少目的地（destination）');
    }

    if (!request.date_range && !request.start_date) {
      violations.push('缺少日期信息（date_range 或 start_date）');
    }

    // 检查可达性证据
    if (researchData.transport_evidence && Array.isArray(researchData.transport_evidence)) {
      if (researchData.transport_evidence.length === 0) {
        violations.push('起点/终点不可达（无交通证据）');
      }
    }

    // 检查高风险区域
    if (researchData.risk_assessment?.risk_level === 'CRITICAL') {
      violations.push('关键路段高风险（risk_level=CRITICAL）');
    }

    return {
      allowed: violations.length === 0,
      violations,
    };
  }

  /**
   * 软评分检查
   */
  private performSoftChecks(
    request: TripPlanRequest,
    researchData: Record<string, any>,
  ): {
    hasAdjustments: boolean;
    violations: GateResult['violations'];
    adjustments: GateResult['required_adjustments'];
    confidence: number;
  } {
    const violations: GateResult['violations'] = [];
    const adjustments: GateResult['required_adjustments'] = [];
    let confidence = 0.8;

    // 检查疲劳
    if (researchData.fatigue_estimate?.daily_fatigue_score > 0.8) {
      violations.push({
        type: 'FATIGUE',
        severity: 'SOFT',
        detail: `每日疲劳评分过高: ${researchData.fatigue_estimate.daily_fatigue_score}`,
      });
      adjustments.push({
        action: 'SHORTEN_DAY',
        why: '每日疲劳评分超过阈值，建议缩短每日行程',
      });
      confidence -= 0.1;
    }

    // 检查 DEM（累计爬升）
    if (researchData.dem_metrics) {
      const maxAscent = request.constraints?.max_ascent_m;
      if (maxAscent && researchData.dem_metrics.total_ascent_m > maxAscent) {
        violations.push({
          type: 'DEM',
          severity: 'SOFT',
          detail: `累计爬升超出限制: ${researchData.dem_metrics.total_ascent_m}m > ${maxAscent}m`,
        });
        adjustments.push({
          action: 'REPLACE_SEGMENT',
          why: '累计爬升超出用户能力，建议替换为更平缓的路段',
        });
        confidence -= 0.1;
      }
    }

    // 检查开放时间冲突
    if (researchData.opening_hours_evidence) {
      // TODO: 检查开放时间冲突
    }

    return {
      hasAdjustments: adjustments.length > 0,
      violations,
      adjustments,
      confidence: Math.max(0.1, confidence),
    };
  }

  /**
   * 提取证据引用
   */
  private extractEvidenceRefs(researchData: Record<string, any>): string[] {
    const evidenceRefs: string[] = [];

    if (researchData.transport_evidence && Array.isArray(researchData.transport_evidence)) {
      evidenceRefs.push(...researchData.transport_evidence.map((e: any) => e.evidence_id || e.id).filter(Boolean));
    }

    if (researchData.poi_evidence && Array.isArray(researchData.poi_evidence)) {
      evidenceRefs.push(...researchData.poi_evidence.map((e: any) => e.evidence_id || e.id).filter(Boolean));
    }

    if (researchData.opening_hours_evidence && Array.isArray(researchData.opening_hours_evidence)) {
      evidenceRefs.push(...researchData.opening_hours_evidence.map((e: any) => e.evidence_id || e.id).filter(Boolean));
    }

    return evidenceRefs;
  }

  /**
   * 映射违规类型
   */
  private mapViolationType(violation: string): GateResult['violations'][0]['type'] {
    if (violation.includes('不可达') || violation.includes('交通')) {
      return 'REACHABILITY';
    }
    if (violation.includes('风险') || violation.includes('安全')) {
      return 'SAFETY';
    }
    if (violation.includes('DEM') || violation.includes('爬升')) {
      return 'DEM';
    }
    if (violation.includes('缺失') || violation.includes('缺少')) {
      return 'DATA_MISSING';
    }
    return 'DATA_MISSING'; // 默认
  }

  /**
   * 检查是否为冰岛行程
   */
  private isIcelandTrip(request: TripPlanRequest): boolean {
    const destination = typeof request.destination === 'string'
      ? request.destination.toLowerCase()
      : '';
    const origin = request.origin && typeof request.origin === 'string'
      ? request.origin.toLowerCase()
      : '';

    return destination.includes('iceland') ||
           destination.includes('冰岛') ||
           origin.includes('iceland') ||
           origin.includes('冰岛') ||
           /F\d{1,3}/i.test(destination) ||
           /F\d{1,3}/i.test(origin);
  }

  /**
   * 将 TripPlanRequest 的 destination/origin 转换为字符串
   */
  private toLocationString(location: string | { lat: number; lng: number } | undefined): string | undefined {
    if (!location) return undefined;
    if (typeof location === 'string') return location;
    return `${location.lat},${location.lng}`;
  }
}
