// src/skills/decision/decision-guardian-negotiate.skill.ts
/**
 * skill.decision.guardianNegotiate
 *
 * Phase 3 三人格博弈（Abu / Dre / Neptune 辩论 + 投票），与 decision.runThreeGuardians（顺序 Gate 编排）不同。
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { GuardianDebateService } from '../../trips/decision/optimization/learning/guardian-debate.service';
import { DEFAULT_NEGOTIATION_CONFIG } from '../../trips/decision/optimization/learning/guardian-persona.interface';
import { NegotiateContextLoaderService } from '../../trips/decision/optimization/collaboration/negotiate-context-loader.service';
import type {
  RoutePlanDraft,
  WorldModelContext,
} from '../../trips/decision/shared/world-model.types';
import type { ReadinessGuardianNegotiationSummary } from '../../trips/readiness/types/coverage-map.types';
import {
  mapNegotiationResultToSummary,
  mergeGuardianNegotiationSnapshot,
  GUARDIAN_LOW_CONSENSUS_DEFER_THRESHOLD,
} from '../../trips/readiness/utils/readiness-guardian-negotiation.util';
import { ReadinessGuardianNegotiationService } from '../../trips/readiness/services/readiness-guardian-negotiation.service';
import { PrismaService } from '../../prisma/prisma.service';

export interface DecisionGuardianNegotiateInput extends SkillInput {
  tripId?: string;
  plan?: RoutePlanDraft;
  world?: WorldModelContext;
  /** 写入 trip.metadata.readinessGuardianNegotiation.latest（默认 false） */
  persistToTrip?: boolean;
}

export interface DecisionGuardianNegotiateOutput extends SkillOutput {
  enabled: boolean;
  summary?: ReadinessGuardianNegotiationSummary;
  /** 低共识 REJECT 时是否应暂缓自动修复 */
  shouldDeferRepair?: boolean;
  message?: string;
}

@Injectable()
export class DecisionGuardianNegotiateSkill
  implements Skill<DecisionGuardianNegotiateInput, DecisionGuardianNegotiateOutput>
{
  private readonly logger = new Logger(DecisionGuardianNegotiateSkill.name);
  private guardianDebate?: GuardianDebateService;
  private negotiateLoader?: NegotiateContextLoaderService;

  metadata = {
    name: 'decision.guardianNegotiate',
    description:
      '三人格博弈协商（Abu/Dre/Neptune 辩论与投票）。与 decision.runThreeGuardians（顺序 Gate）不同，用于共识度、人类决策点与修复条件。',
    version: '1.0.0',
    category: 'decision' as const,
    inputSchema: {
      dependencies: [
        { param: 'world', alternatives: ['tripId'] },
        { param: 'tripId', alternatives: ['world'] },
      ],
      extractors: {
        tripId: 'tripId',
      },
    },
  };

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly prisma: PrismaService,
    @Optional() private readonly guardianNegotiationService?: ReadinessGuardianNegotiationService,
  ) {}

  async execute(input: DecisionGuardianNegotiateInput): Promise<DecisionGuardianNegotiateOutput> {
    const debate = this.getGuardianDebate();
    const loader = this.getNegotiateLoader();
    if (!debate || !loader) {
      return {
        enabled: false,
        message: 'GuardianDebateService 不可用，请确认 OptimizationModule 已加载',
      };
    }

    let plan = input.plan;
    let world = input.world;
    const tripId = input.tripId?.trim() || plan?.tripId?.trim();

    if ((!plan || !world) && tripId) {
      const loaded = await loader.loadPlanAndWorld(tripId);
      plan = plan ?? loaded.plan;
      world = world ?? loaded.world;
    }

    if (!plan || !world) {
      throw new Error('必须提供 tripId，或同时提供 plan + world');
    }
    if (!plan.tripId && tripId) {
      plan = { ...plan, tripId };
    }
    if (!plan.tripId) {
      throw new Error('plan.tripId 不能为空');
    }

    try {
      const result = await debate.negotiate(plan, world, DEFAULT_NEGOTIATION_CONFIG);
      const summary = mapNegotiationResultToSummary(result, {
        phase: 'standalone',
        tripId: plan.tripId,
      });

      if (input.persistToTrip) {
        await this.persistLatest(plan.tripId, summary);
      }

      const shouldDeferRepair =
        summary.decision === 'REJECT' &&
        summary.consensusLevel < GUARDIAN_LOW_CONSENSUS_DEFER_THRESHOLD;

      return {
        enabled: true,
        summary,
        shouldDeferRepair,
        message: summary.summary || undefined,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`decision.guardianNegotiate failed: ${msg}`);
      throw error;
    }
  }

  private async persistLatest(
    tripId: string,
    summary: ReadinessGuardianNegotiationSummary,
  ): Promise<void> {
    if (this.guardianNegotiationService) {
      await this.guardianNegotiationService.persistSnapshot(tripId, { latest: summary });
      return;
    }

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    if (!trip) return;

    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        metadata: mergeGuardianNegotiationSnapshot(trip.metadata, { latest: summary }),
      },
    });
  }

  private getGuardianDebate(): GuardianDebateService | null {
    if (this.guardianDebate) return this.guardianDebate;
    try {
      this.guardianDebate = this.moduleRef.get(GuardianDebateService, { strict: false });
      return this.guardianDebate;
    } catch {
      return null;
    }
  }

  private getNegotiateLoader(): NegotiateContextLoaderService | null {
    if (this.negotiateLoader) return this.negotiateLoader;
    try {
      this.negotiateLoader = this.moduleRef.get(NegotiateContextLoaderService, { strict: false });
      return this.negotiateLoader;
    } catch {
      return null;
    }
  }
}