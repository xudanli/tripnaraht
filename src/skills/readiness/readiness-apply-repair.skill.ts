// src/skills/readiness/readiness-apply-repair.skill.ts
/**
 * skill.readiness.applyRepair
 *
 * 智能体统一入口：应用准备度修复选项（含三人格 pre/post 博弈与 Neptune 修复闭环）。
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { ReadinessRepairService } from '../../trips/readiness/services/readiness-repair.service';
import {
  buildEffectivePlanWriteChainBlockedPayload,
  isDirectPlanMutationBlocked,
} from '../../decision-runtime/execution/effective-plan-write-chain-blocked.util';
import type {
  ApplyRepairRequest,
  ApplyRepairResponse,
} from '../../trips/readiness/types/coverage-map.types';

export type ReadinessApplyRepairSkillInput = ApplyRepairRequest & SkillInput;

export interface ReadinessApplyRepairSkillOutput extends SkillOutput, ApplyRepairResponse {}

@Injectable()
export class ReadinessApplyRepairSkill
  implements Skill<ReadinessApplyRepairSkillInput, ReadinessApplyRepairSkillOutput>
{
  private readonly logger = new Logger(ReadinessApplyRepairSkill.name);

  metadata = {
    name: 'readiness.applyRepair',
    description:
      '应用准备度修复选项；executeDecision=true 时走 Neptune repair-plan，默认运行三人格 pre/post 博弈',
    version: '1.0.0',
    category: 'readiness' as const,
    inputSchema: {
      dependencies: [
        { param: 'tripId' },
        { param: 'blockerId' },
        { param: 'optionId' },
      ],
      extractors: { tripId: 'tripId' },
    },
  };

  constructor(@Optional() private readonly readinessRepairService?: ReadinessRepairService) {}

  async execute(input: ReadinessApplyRepairSkillInput): Promise<ReadinessApplyRepairSkillOutput> {
    if (!this.readinessRepairService) {
      throw new Error('ReadinessRepairService 未可用，请确认 ReadinessModule 已加载');
    }

    const { tripId, blockerId, optionId } = input;
    if (!tripId?.trim() || !blockerId?.trim() || !optionId?.trim()) {
      throw new Error('tripId、blockerId、optionId 均为必填');
    }

    this.logger.debug(
      `readiness.applyRepair trip=${tripId} blocker=${blockerId} option=${optionId}`,
    );

    if (isDirectPlanMutationBlocked()) {
      const blocked = buildEffectivePlanWriteChainBlockedPayload('readiness.applyRepair.skill');
      return {
        tripId: tripId.trim(),
        blockerId: blockerId.trim(),
        optionId: optionId.trim(),
        actionType: 'write_chain_blocked',
        status: 'deferred',
        message: blocked.message,
        metadata: {
          writeChainRequired: true,
          code: blocked.code,
          authorizedPaths: [...blocked.authorizedPaths],
        },
      };
    }

    return this.readinessRepairService.applyRepair({
      tripId: tripId.trim(),
      blockerId: blockerId.trim(),
      optionId: optionId.trim(),
      reason: input.reason,
      executeDecision: input.executeDecision ?? true,
      persistDecision: input.persistDecision ?? true,
      runGuardianNegotiation: input.runGuardianNegotiation ?? true,
      forceDecisionRepair: input.forceDecisionRepair,
    });
  }
}
