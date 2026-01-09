// src/skills/decision/decision-abu-check.skill.ts
/**
 * skill.decision.abuCheck
 * 
 * 输入：{ world: PhysicalRealityModel, candidatePlan }
 * 输出：{ allowed: boolean, violations: DemDecisionEvidence[], decisionLog }
 */

import { Injectable, Logger } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { AbuStrategy } from '../../trips/decision/strategies/abu-strategy.service';
import { WorldModelContext, RoutePlanDraft, DemDecisionEvidence } from '../../trips/decision/shared/world-model.types';
import { DecisionResult } from '../../trips/decision/shared/decision-result.types';
import { PhysicalRealityModel } from '../../trips/decision/models/physical-reality.model';
import { HumanCapabilityModel } from '../../trips/decision/models/human-capability.model';

export interface DecisionAbuCheckInput extends SkillInput {
  /** 物理现实模型 */
  world: {
    physical: PhysicalRealityModel;
    human: HumanCapabilityModel;
    routeDirection?: any;
  };
  /** 候选计划 */
  candidatePlan: RoutePlanDraft;
}

export interface DecisionAbuCheckOutput extends SkillOutput {
  /** 是否允许 */
  allowed: boolean;
  /** DEM 决策证据（违规项） */
  violations: DemDecisionEvidence[];
  /** 决策日志 */
  decisionLog: Array<{
    persona: string;
    action: string;
    explanation: string;
    reasonCodes: string[];
    timestamp: string;
  }>;
}

@Injectable()
export class DecisionAbuCheckSkill implements Skill<DecisionAbuCheckInput, DecisionAbuCheckOutput> {
  private readonly logger = new Logger(DecisionAbuCheckSkill.name);

  metadata = {
    name: 'decision.abuCheck',
    description: '基于物理现实和合规的安全检查，不考虑体验偏好。只能 ALLOW 或 REJECT，不可调整。',
    version: '1.0.0',
    category: 'decision' as const,
    toolGroup: 'DOMAIN' as const,
  };

  constructor(
    private readonly abuStrategy: AbuStrategy,
  ) {}

  async execute(input: DecisionAbuCheckInput): Promise<DecisionAbuCheckOutput> {
    this.logger.debug(`执行 decision.abuCheck: ${input.candidatePlan.tripId || 'unknown'}`);

    // 构建 WorldModelContext
    const world: WorldModelContext = {
      physical: input.world.physical,
      human: input.world.human,
      routeDirection: input.world.routeDirection,
      complianceEvidence: [], // 可以从 input.world 中提取
    };

    // 调用 Abu Strategy
    const result: DecisionResult = await this.abuStrategy.evaluate(world, input.candidatePlan);

    // 提取违规项（从 decisionLog 中提取 HARD violation）
    const violations: DemDecisionEvidence[] = result.logs
      .filter(log => log.reasonCodes?.some(code => code.includes('HARD') || code.includes('VIOLATION')))
      .map(log => ({
        segmentId: log.evidenceRefs?.[0] || 'unknown',
        elevationProfile: [],
        cumulativeAscent: 0,
        maxSlopePct: 0,
        rollingAscent3Days: 0,
        fatigueIndex: 0,
        violation: 'HARD',
        explanation: log.explanation,
        metadata: {},
      }));

    return {
      allowed: result.allowed,
      violations,
      decisionLog: result.logs.map(log => ({
        persona: log.persona,
        action: log.action,
        explanation: log.explanation,
        reasonCodes: log.reasonCodes || [],
        timestamp: log.timestamp,
      })),
    };
  }
}

