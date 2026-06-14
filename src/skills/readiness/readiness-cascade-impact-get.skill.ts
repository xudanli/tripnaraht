// src/skills/readiness/readiness-cascade-impact-get.skill.ts
/**
 * skill.readiness.cascadeImpact.get
 *
 * 读取 trip.metadata.readinessCausalPreAnalysis 快照（repair-options / apply-repair / score 持久化结果）。
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { ReadinessCausalPreanalysisService } from '../../trips/readiness/services/readiness-causal-preanalysis.service';
import type { ReadinessCausalPreAnalysisSnapshot } from '../../trips/readiness/types/coverage-map.types';
import { buildReadinessCascadeUiHints } from '../../trips/readiness/utils/readiness-causal-preanalysis.util';
import type { NonTransactionalReplanResult } from '../../travel-cognition';

export interface ReadinessCascadeImpactGetInput extends SkillInput {
  tripId: string;
}

export interface ReadinessCascadeImpactGetOutput extends SkillOutput {
  tripId: string;
  causalPreAnalysis?: NonTransactionalReplanResult;
  cascadeUiHints?: ReturnType<typeof buildReadinessCascadeUiHints>;
  updatedAt?: string;
  snapshot?: ReadinessCausalPreAnalysisSnapshot;
}

@Injectable()
export class ReadinessCascadeImpactGetSkill
  implements Skill<ReadinessCascadeImpactGetInput, ReadinessCascadeImpactGetOutput>
{
  private readonly logger = new Logger(ReadinessCascadeImpactGetSkill.name);

  metadata = {
    name: 'readiness.cascadeImpact.get',
    description: '读取行程上已持久化的级联影响预分析快照（latest / byBlockerId）',
    version: '1.0.0',
    category: 'readiness' as const,
    inputSchema: {
      dependencies: [{ param: 'tripId' }],
      extractors: { tripId: 'tripId' },
    },
  };

  constructor(
    @Optional() private readonly causalPreanalysisService?: ReadinessCausalPreanalysisService,
  ) {}

  async execute(
    input: ReadinessCascadeImpactGetInput,
  ): Promise<ReadinessCascadeImpactGetOutput> {
    const tripId = input.tripId?.trim();
    if (!tripId) {
      throw new Error('tripId 不能为空');
    }

    if (!this.causalPreanalysisService) {
      this.logger.warn('ReadinessCausalPreanalysisService 不可用');
      return { tripId };
    }

    const snapshot = await this.causalPreanalysisService.loadSnapshot(tripId);
    const causalPreAnalysis = snapshot?.latest;
    return {
      tripId,
      snapshot,
      causalPreAnalysis,
      cascadeUiHints: buildReadinessCascadeUiHints(causalPreAnalysis),
      updatedAt: snapshot?.updatedAt,
    };
  }
}
