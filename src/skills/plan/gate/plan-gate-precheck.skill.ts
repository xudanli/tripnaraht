// src/skills/plan/gate/precheck.skill.ts
/**
 * skill.plan.gate.precheck
 * 
 * 目的：快速门控（数据足够时做硬判断，数据不足时标记需确认）
 * 
 * System 1 技能：快速检查
 */

import { Injectable, Logger } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../../interfaces/skill.interface';
import { PlanState, GateStatus } from '../shared/plan-state.types';

export interface PlanGatePrecheckInput extends SkillInput {
  /** PlanState */
  planState: PlanState;
}

export interface PlanGatePrecheckOutput extends SkillOutput {
  /** 门控状态 */
  gateStatus: GateStatus;
}

@Injectable()
export class PlanGatePrecheckSkill implements Skill<PlanGatePrecheckInput, PlanGatePrecheckOutput> {
  private readonly logger = new Logger(PlanGatePrecheckSkill.name);

  metadata = {
    name: 'plan.gate.precheck',
    description: '执行 plan gate 快速预检（数据足够则硬判，不足则标记待确认）。在完整三守护者评审前的轻量门控阶段调用。',
    version: '1.0.0',
    category: 'trip' as const,
    toolGroup: 'DOMAIN' as const,
  };

  async execute(input: PlanGatePrecheckInput): Promise<PlanGatePrecheckOutput> {
    this.logger.debug(`执行 plan.gate.precheck: planId=${input.planState.plan_id}`);

    try {
      const reasons: string[] = [];
      const missingEvidence: string[] = [];
      let status: GateStatus['status'] = 'ALLOW';

      // 1. 检查基本约束
      if (!input.planState.constraints.time.days || input.planState.constraints.time.days <= 0) {
        status = 'REJECT';
        reasons.push('天数无效或未指定');
      }

      // 2. 检查可达性
      const infeasibleSegments = input.planState.mobility.transferSegments.filter(
        seg => seg.feasibility === 'infeasible'
      );
      if (infeasibleSegments.length > 0) {
        status = 'REJECT';
        reasons.push(`${infeasibleSegments.length} 段不可达`);
      }

      // 3. 检查高风险段
      const highRiskSegments = input.planState.mobility.transferSegments.filter(
        seg => seg.riskFlags.some(flag => flag.severity === 'high')
      );
      if (highRiskSegments.length > 0) {
        status = 'NEED_CONFIRM';
        reasons.push(`${highRiskSegments.length} 段存在高风险`);
      }

      // 4. 检查预算
      if (input.planState.budget.overrun && input.planState.budget.overrun.overrunAmount > 0) {
        status = 'NEED_CONFIRM';
        reasons.push(`预算超支 ${input.planState.budget.overrun.overrunAmount}`);
      }

      // 5. 检查证据完整性
      if (input.planState.evidence_refs.length === 0) {
        missingEvidence.push('缺少证据引用');
      }

      // 6. 检查世界模型
      if (!input.planState.world) {
        missingEvidence.push('缺少世界模型上下文');
      }

      // 如果有缺失证据，标记为需要确认
      if (missingEvidence.length > 0 && status === 'ALLOW') {
        status = 'NEED_CONFIRM';
      }

      return {
        gateStatus: {
          status,
          reasons,
          missingEvidence,
        },
      };
    } catch (error: any) {
      this.logger.error(`预检查失败: ${error.message}`, error.stack);
      throw error;
    }
  }
}
