// src/trips/decision/strategies/abu-strategy.service.ts
/**
 * Abu Strategy（安全否决者）
 * 
 * 第一性原理：只接受"物理现实 + 合规"的输入
 * 
 * 法律：Abu 只能做两种事
 * ✔ ALLOW
 * ✔ REJECT
 * ❌ 不可 ADJUST / REPLACE
 * 
 * 约束：
 * - 只读 world.physical 和 complianceEvidence
 * - 不读任何"用户想玩什么"的字段（tags、preferences、体验类）
 * - 日志里只写：DEM 证据、封路状态、Hazard 信息、合规/签证/季节窗口
 */

import { Injectable, Logger } from '@nestjs/common';
import { DecisionPersonaStrategy } from './decision-persona-strategy.interface';
import { WorldModelContext, RoutePlanDraft } from '../shared/world-model.types';
import { DecisionResult, DecisionAction, DecisionSource } from '../shared/decision-result.types';
import { validatePhysicalRealityModel } from '../models/physical-reality.model';

@Injectable()
export class AbuStrategy implements DecisionPersonaStrategy {
  private readonly logger = new Logger(AbuStrategy.name);
  readonly personaName = 'ABU' as const;

  /**
   * 评估计划
   * 
   * Abu 的职责（第一性原理）：
   * 1. 验证 PhysicalRealityModel 是否完整
   * 2. 检查 DEM 硬违规（HARD violation）
   * 3. 检查道路状态（封路、季节性关闭）
   * 4. 检查危险区域（Hazard zones）
   * 5. 检查合规（许可、向导、签证）
   * 6. 只能 ALLOW 或 REJECT，不能 ADJUST 或 REPLACE
   * 
   * 注意：Abu 不关心：
   * - 用户偏好（tags、preferences）
   * - 路线体验（好不好玩）
   * - 节奏偏好（快慢）
   * 这些都不是"是否允许存在"的决定因素
   */
  async evaluate(
    world: WorldModelContext,
    plan: RoutePlanDraft
  ): Promise<DecisionResult> {
    // 参数验证
    if (!world) {
      this.logger.error('WorldModelContext 不能为空');
      return {
        allowed: false,
        action: 'REJECT',
        logs: [
          {
            persona: 'ABU',
            action: 'REJECT',
            explanation: 'WorldModelContext 不能为空',
            reasonCodes: ['MISSING_WORLD_CONTEXT'],
            evidenceRefs: [],
            timestamp: new Date().toISOString(),
            decisionSource: 'PHYSICAL',
          },
        ],
      };
    }

    if (!plan) {
      this.logger.error('RoutePlanDraft 不能为空');
      return {
        allowed: false,
        action: 'REJECT',
        logs: [
          {
            persona: 'ABU',
            action: 'REJECT',
            explanation: 'RoutePlanDraft 不能为空',
            reasonCodes: ['MISSING_PLAN'],
            evidenceRefs: [],
            timestamp: new Date().toISOString(),
            decisionSource: 'PHYSICAL',
          },
        ],
      };
    }

    this.logger.debug(`Abu 评估计划: ${plan.tripId || 'unknown'}`);

    if (!world.physical) {
      this.logger.error('WorldModelContext.physical 不能为空');
      return {
        allowed: false,
        action: 'REJECT',
        logs: [
          {
            persona: 'ABU',
            action: 'REJECT',
            explanation: 'WorldModelContext.physical 不能为空',
            reasonCodes: ['MISSING_PHYSICAL_MODEL'],
            evidenceRefs: [],
            timestamp: new Date().toISOString(),
            decisionSource: 'PHYSICAL',
          },
        ],
      };
    }

    const physical = world.physical;
    const complianceEvidence = world.complianceEvidence || [];

    // 1️⃣ 验证 PhysicalRealityModel 是否完整
    const validation = validatePhysicalRealityModel(physical);
    if (!validation.valid) {
      this.logger.warn(
        `计划 ${plan.tripId} 的 PhysicalRealityModel 不完整，缺少: ${validation.missingFields.join(', ')}`
      );
      return {
        allowed: false,
        action: 'REJECT',
        logs: [
          {
            persona: 'ABU',
            action: 'REJECT',
            explanation: `物理现实模型不完整，缺少字段: ${validation.missingFields.join(', ')}`,
            reasonCodes: ['INCOMPLETE_PHYSICAL_REALITY'],
            evidenceRefs: [],
            timestamp: new Date().toISOString(),
            decisionSource: 'PHYSICAL',
          },
        ],
      };
    }

    // 2️⃣ 检查 DEM 硬违规
    const demHardViolation = physical.demEvidence.find(
      e => e.violation === 'HARD'
    );

    if (demHardViolation) {
      this.logger.warn(
        `计划 ${plan.tripId} 存在 DEM 硬违规: ${demHardViolation.segmentId}`
      );
      return {
        allowed: false,
        action: 'REJECT',
        logs: [
          {
            persona: 'ABU',
            action: 'REJECT',
            explanation: `检测到 DEM 硬违规（路段: ${demHardViolation.segmentId}，原因: ${demHardViolation.explanation || '未知'}），路线不应继续`,
            reasonCodes: ['HARD_DEM_VIOLATION'],
            evidenceRefs: [demHardViolation.segmentId],
            timestamp: new Date().toISOString(),
            decisionSource: 'PHYSICAL',
          },
        ],
      };
    }

    // 3️⃣ 检查道路状态（封路、季节性关闭）
    const closedRoads = physical.roadStates.filter(
      road => road.status === 'CLOSED' || 
              (road.status === 'SEASONAL' && 
               (road.seasonOpenFrom && physical.month < road.seasonOpenFrom ||
                road.seasonOpenTo && physical.month > road.seasonOpenTo))
    );

    if (closedRoads.length > 0) {
      this.logger.warn(
        `计划 ${plan.tripId} 包含 ${closedRoads.length} 条封闭道路`
      );
      return {
        allowed: false,
        action: 'REJECT',
        logs: [
          {
            persona: 'ABU',
            action: 'REJECT',
            explanation: `检测到封闭道路: ${closedRoads.map(r => r.roadId).join(', ')}，路线不应继续`,
            reasonCodes: ['ROAD_CLOSED'],
            evidenceRefs: closedRoads.map(r => r.roadId),
            timestamp: new Date().toISOString(),
            decisionSource: 'PHYSICAL',
          },
        ],
      };
    }

    // 4️⃣ 检查危险区域（高风险 Hazard zones）
    const highRiskHazards = physical.hazardZones.filter(
      hazard => hazard.level === 'HIGH' &&
                (hazard.seasonality?.highRiskMonths?.includes(physical.month) ?? false)
    );

    if (highRiskHazards.length > 0) {
      this.logger.warn(
        `计划 ${plan.tripId} 包含 ${highRiskHazards.length} 个高风险危险区域`
      );
      return {
        allowed: false,
        action: 'REJECT',
        logs: [
          {
            persona: 'ABU',
            action: 'REJECT',
            explanation: `检测到高风险危险区域（${highRiskHazards.map(h => `${h.type}@${h.zoneId}`).join(', ')}），路线不应继续`,
            reasonCodes: ['HIGH_RISK_HAZARD_ZONE'],
            evidenceRefs: highRiskHazards.map(h => h.zoneId),
            timestamp: new Date().toISOString(),
            decisionSource: 'PHYSICAL',
          },
        ],
      };
    }

    // 5️⃣ 检查渡轮状态（如果路线依赖渡轮）
    const cancelledFerries = physical.ferryStates.filter(
      ferry => ferry.status === 'CANCELLED' ||
               (ferry.status === 'SEASONAL' &&
                (ferry.seasonOpenFrom && physical.month < ferry.seasonOpenFrom ||
                 ferry.seasonOpenTo && physical.month > ferry.seasonOpenTo))
    );

    if (cancelledFerries.length > 0) {
      // 检查计划是否依赖这些渡轮（简化处理：如果有渡轮状态，假设可能依赖）
      this.logger.warn(
        `计划 ${plan.tripId} 可能依赖已取消的渡轮: ${cancelledFerries.map(f => f.ferryId).join(', ')}`
      );
      // 注意：这里不直接拒绝，因为可能不依赖，但记录警告
    }

    // 6️⃣ 检查合规（许可、向导、签证）
    const complianceHardViolation = complianceEvidence.find(
      e => e.violation === 'HARD'
    );

    if (complianceHardViolation) {
      this.logger.warn(`计划 ${plan.tripId} 存在合规硬违规`);
      return {
        allowed: false,
        action: 'REJECT',
        logs: [
          {
            persona: 'ABU',
            action: 'REJECT',
            explanation: '检测到合规硬违规（如缺少许可或向导），路线不应继续',
            reasonCodes: ['HARD_COMPLIANCE_VIOLATION'],
            evidenceRefs: [],
            timestamp: new Date().toISOString(),
            decisionSource: 'PHYSICAL',
          },
        ],
      };
    }

    // 7️⃣ 检查气候季节性（如果可达性评分过低）
    if (physical.climateSeasonality && physical.climateSeasonality.accessibilityScore < 0.3) {
      this.logger.warn(
        `计划 ${plan.tripId} 在当前月份（${physical.month}）可达性评分过低: ${physical.climateSeasonality.accessibilityScore}`
      );
      return {
        allowed: false,
        action: 'REJECT',
        logs: [
          {
            persona: 'ABU',
            action: 'REJECT',
            explanation: `当前月份（${physical.month}）可达性评分过低（${physical.climateSeasonality.accessibilityScore}），路线不应继续`,
            reasonCodes: ['LOW_ACCESSIBILITY_SCORE'],
            evidenceRefs: [],
            timestamp: new Date().toISOString(),
            decisionSource: 'PHYSICAL',
          },
        ],
      };
    }

    // 8️⃣ 所有检查通过 → ALLOW
    this.logger.debug(`计划 ${plan.tripId} 通过 Abu 检查，允许继续`);
    return {
      allowed: true,
      action: 'ALLOW',
      logs: [
        {
          persona: 'ABU',
          action: 'ALLOW',
          explanation: '未发现硬性风险问题（DEM、道路、危险区域、合规均通过），允许继续',
          reasonCodes: [],
          evidenceRefs: [],
          timestamp: new Date().toISOString(),
          decisionSource: 'PHYSICAL',
        },
      ],
    };
  }
}

