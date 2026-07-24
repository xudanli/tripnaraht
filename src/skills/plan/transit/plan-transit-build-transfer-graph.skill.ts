// src/skills/plan/transit/plan-transit-build-transfer-graph.skill.ts
/**
 * skill.plan.transit.buildTransferGraph
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../../interfaces/skill.interface';
import { PlanState, TransferSegment } from '../shared/plan-state.types';
import { TransportSearchSkill } from '../../transport/transport-search.skill';

export interface PlanTransitBuildTransferGraphInput extends SkillInput {
  planState: PlanState;
}

export interface PlanTransitBuildTransferGraphOutput extends SkillOutput {
  transferGraph: {
    segments: TransferSegment[];
    riskSegments: string[];
    infeasibleSegments: string[];
  };
  degraded?: boolean;
  degradedReason?: string;
}

@Injectable()
export class PlanTransitBuildTransferGraphSkill implements Skill<
  PlanTransitBuildTransferGraphInput,
  PlanTransitBuildTransferGraphOutput
> {
  private readonly logger = new Logger(PlanTransitBuildTransferGraphSkill.name);

  constructor(@Optional() private readonly transportSearchSkill?: TransportSearchSkill) {}

  metadata = {
    name: 'plan.transit.buildTransferGraph',
    description: '构建 plan 跨城 transit 换乘可达图并标记不可达/高风险段。在多城 transit planning 阶段评估连通性时调用。',
    version: '1.0.0',
    category: 'trip' as const,
    toolGroup: 'DOMAIN' as const,
  };

  async execute(input: PlanTransitBuildTransferGraphInput): Promise<PlanTransitBuildTransferGraphOutput> {
    this.logger.debug(`执行 plan.transit.buildTransferGraph: planId=${input.planState.plan_id}`);

    let transportEnrichmentFailed = 0;
    const segments = input.planState.mobility.transferSegments;

    const analyzedSegments = await Promise.all(
      segments.map(async (segment) => {
        const analyzed = { ...segment };

        if (analyzed.riskFlags.some((flag) => flag.severity === 'high')) {
          analyzed.feasibility = 'needs_confirmation';
        }

        if (!analyzed.availableModes || analyzed.availableModes.length === 0) {
          const enriched = await this.enrichModesFromTransportSearch(analyzed);
          if (enriched) {
            analyzed.availableModes = enriched;
          } else if (
            analyzed.from.coordinates &&
            analyzed.to.coordinates &&
            !this.transportSearchSkill
          ) {
            transportEnrichmentFailed++;
          }
        }

        if (!analyzed.availableModes || analyzed.availableModes.length === 0) {
          analyzed.feasibility = 'infeasible';
        }

        return analyzed;
      }),
    );

    const riskSegments = analyzedSegments
      .filter((s) => s.riskFlags.some((f) => f.severity === 'high'))
      .map((s) => s.id);

    const infeasibleSegments = analyzedSegments
      .filter((s) => s.feasibility === 'infeasible')
      .map((s) => s.id);

    return {
      transferGraph: {
        segments: analyzedSegments,
        riskSegments,
        infeasibleSegments,
      },
      ...(transportEnrichmentFailed > 0
        ? {
            degraded: true,
            degradedReason: `transport.search unavailable for ${transportEnrichmentFailed} segment(s)`,
          }
        : {}),
    };
  }

  private async enrichModesFromTransportSearch(
    segment: TransferSegment,
  ): Promise<TransferSegment['availableModes'] | null> {
    if (!this.transportSearchSkill) {
      return null;
    }
    const from = segment.from.coordinates;
    const to = segment.to.coordinates;
    if (!from || !to) {
      return null;
    }

    try {
      const result = await this.transportSearchSkill.execute({
        origin: { lat: from[1], lng: from[0] },
        destination: { lat: to[1], lng: to[0] },
        mode: 'mixed',
      });

      if (!result.options?.length) {
        return null;
      }

      return result.options.map((opt) => ({
        mode: this.mapTransportMode(opt.mode),
        time: opt.duration_minutes,
        cost: 0,
        reliability: 'medium' as const,
        effort: opt.mode === 'walk' ? ('high' as const) : ('medium' as const),
        recommendation: result.best_option?.mode === opt.mode ? 'recommended' : undefined,
      }));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`transport.search failed for segment ${segment.id}: ${msg}`);
      return null;
    }
  }

  private mapTransportMode(mode: string): 'flight' | 'train' | 'bus' | 'self_drive' | 'other' {
    if (mode === 'drive') return 'self_drive';
    if (mode === 'transit') return 'train';
    if (mode === 'walk') return 'other';
    return 'other';
  }
}
