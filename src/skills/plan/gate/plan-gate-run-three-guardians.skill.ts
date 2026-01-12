// src/skills/plan/gate/plan-gate-run-three-guardians.skill.ts
/**
 * skill.plan.gate.runThreeGuardians
 * 
 * 目的：调用现有的 skill.decision.runThreeGuardians，对方案进行完整评审
 * 
 * System 2 技能：完整评审
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../../interfaces/skill.interface';
import { PlanState, GateStatus } from '../shared/plan-state.types';
import { DecisionRunThreeGuardiansSkill } from '../../decision/decision-run-three-guardians.skill';
import { WorldBuildContextSkill } from '../../world/world-build-context.skill';

export interface PlanGateRunThreeGuardiansInput extends SkillInput {
  /** PlanState */
  planState: PlanState;
  
  /** Trip ID（可选） */
  tripId?: string;
}

export interface PlanGateRunThreeGuardiansOutput extends SkillOutput {
  /** 门控状态（包含三人格结果） */
  gateStatus: GateStatus;
}

@Injectable()
export class PlanGateRunThreeGuardiansSkill implements Skill<PlanGateRunThreeGuardiansInput, PlanGateRunThreeGuardiansOutput> {
  private readonly logger = new Logger(PlanGateRunThreeGuardiansSkill.name);

  metadata = {
    name: 'plan.gate.runThreeGuardians',
    description: '调用三人格（Abu/Dr.Dre/Neptune）对方案进行完整评审',
    version: '1.0.0',
    category: 'trip' as const,
    toolGroup: 'DOMAIN' as const,
  };

  constructor(
    @Optional() private readonly decisionRunThreeGuardians?: DecisionRunThreeGuardiansSkill,
    @Optional() private readonly worldBuildContext?: WorldBuildContextSkill,
  ) {}

  async execute(input: PlanGateRunThreeGuardiansInput): Promise<PlanGateRunThreeGuardiansOutput> {
    this.logger.debug(`执行 plan.gate.runThreeGuardians: planId=${input.planState.plan_id}`);

    try {
      if (!this.decisionRunThreeGuardians) {
        this.logger.warn('DecisionRunThreeGuardiansSkill 未注入，跳过三人格评审');
        return {
          gateStatus: {
            status: 'NEED_CONFIRM',
            reasons: ['三人格评审服务不可用'],
            missingEvidence: [],
          },
        };
      }

      // 1. 构建或使用世界模型
      let world = input.planState.world;
      if (!world && input.tripId && this.worldBuildContext) {
        const worldResult = await this.worldBuildContext.execute({ tripId: input.tripId });
        world = worldResult.world;
      }

      if (!world) {
        return {
          gateStatus: {
            status: 'NEED_CONFIRM',
            reasons: ['缺少世界模型上下文'],
            missingEvidence: ['world'],
          },
        };
      }

      // 2. 调用三人格评审
      const result = await this.decisionRunThreeGuardians.execute({
        world,
        planCandidate: input.planState.itinerary as any,
        tripId: input.tripId,
      });

      // 3. 构建门控状态
      const gateStatus: GateStatus = {
        status: result.allowed ? 'ALLOW' : 'NEED_CONFIRM',
        reasons: [],
        missingEvidence: [],
        guardianResults: {
          abu: {
            verdict: result.abuResult.allowed ? 'ALLOW' : 'REJECT',
            evidence: result.abuResult.violations.map(v => v.explanation),
          },
          drdre: {
            verdict: result.drdreResult.adjusted ? 'ADJUST' : 'ALLOW',
            evidence: result.drdreResult.changes?.map(c => c.reason || '') || [],
          },
          neptune: {
            verdict: result.neptuneResult.repaired ? 'REPLACE' : 'ALLOW',
            evidence: result.neptuneResult.replacements?.map(r => r.explanation || '') || [],
          },
        },
        consolidatedVerdict: result.allowed ? 'ALLOW' : 'NEED_CONFIRM',
        requiredUserConfirmations: result.requiredUserConfirmations || [],
      };

      // 收集原因
      if (!result.abuResult.allowed) {
        gateStatus.reasons.push(`Abu 拒绝: ${result.abuResult.violations.map(v => v.explanation).join(', ')}`);
      }
      if (result.drdreResult.adjusted) {
        gateStatus.reasons.push(`Dr.Dre 建议调整节奏`);
      }
      if (result.neptuneResult.repaired) {
        gateStatus.reasons.push(`Neptune 建议替换路段`);
      }

      return {
        gateStatus,
      };
    } catch (error: any) {
      this.logger.error(`三人格评审失败: ${error.message}`, error.stack);
      throw error;
    }
  }
}
