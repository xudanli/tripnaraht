import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { GuardianChooseRequestDto } from '../dto/guardian-choose.dto';
import { WeightLearnerService } from '../learning/weight-learner.service';
import { WeightPersistenceService } from '../learning/weight-persistence.service';
import { GuardianDebateService } from '../learning/guardian-debate.service';
import { DEFAULT_NEGOTIATION_CONFIG } from '../learning/guardian-persona.interface';
import { ObjectiveFunctionService } from '../objective-function.service';
import { NegotiateContextLoaderService } from '../collaboration/negotiate-context-loader.service';
import { DecisionLogStorageService } from '../../services/decision-log-storage.service';
import {
  buildPresentationFromNegotiationResult,
  buildPresentationFromOptimizeResult,
  mapNegotiationResultToApiSummary,
} from '../utils/guardian-negotiation-api.mapper';
import {
  buildPresentationFromReadinessNegotiationSummary,
  extractGuardianNegotiationSnapshot,
} from '../../../readiness/utils/readiness-guardian-negotiation.util';
import { StrategyOrchestratorV2Service } from '../strategy-orchestrator-v2.service';
import type { GuardianPersonaPresentation } from '../../shared/guardian-presentation.types';
import type { DecisionLogEntry } from '../../shared/decision-result.types';

export const GUARDIAN_CHOOSE_PENDING_METADATA_KEY = 'guardianChoosePending';
export const LAST_GUARDIAN_PRESENTATION_METADATA_KEY = 'lastGuardianPresentation';

export interface GuardianChoosePendingContext {
  source: GuardianChooseRequestDto['source'];
  decisionPoints: string[];
  hardConstraintBlocked?: boolean;
  correlationId?: string;
  sessionId?: string;
  negotiationRunId?: string;
  createdAt: string;
  expiresAt: string;
}

@Injectable()
export class GuardianChooseService {
  private readonly logger = new Logger(GuardianChooseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly weightLearner: WeightLearnerService,
    private readonly weightPersistence: WeightPersistenceService,
    @Optional() private readonly guardianDebate?: GuardianDebateService,
    @Optional() private readonly objectiveFunction?: ObjectiveFunctionService,
    @Optional() private readonly negotiateLoader?: NegotiateContextLoaderService,
    @Optional() private readonly decisionLogStorage?: DecisionLogStorageService,
    @Optional() private readonly orchestratorV2?: StrategyOrchestratorV2Service,
  ) {}

  async persistChooseContext(
    tripId: string,
    context: Omit<GuardianChoosePendingContext, 'createdAt' | 'expiresAt'>,
  ): Promise<void> {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId }, select: { metadata: true } });
    if (!trip) return;

    const now = new Date();
    const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const pending: GuardianChoosePendingContext = {
      ...context,
      createdAt: now.toISOString(),
      expiresAt: expires.toISOString(),
    };

    const meta = this.readMetadata(trip.metadata);
    meta[GUARDIAN_CHOOSE_PENDING_METADATA_KEY] = pending;

    await this.prisma.trip.update({
      where: { id: tripId },
      data: { metadata: meta as never },
    });
  }

  async persistLastPresentation(
    tripId: string,
    presentation: GuardianPersonaPresentation,
    chooseOptions?: string[],
  ): Promise<void> {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId }, select: { metadata: true } });
    if (!trip) return;

    const meta = this.readMetadata(trip.metadata);
    meta[LAST_GUARDIAN_PRESENTATION_METADATA_KEY] = presentation;

    if (presentation.actions.user === 'CHOOSE' && !presentation.hardConstraintBlocked) {
      const decisionPoints = this.extractChooseOptionsFromPresentation(presentation, chooseOptions);
      if (decisionPoints.length > 0) {
        meta[GUARDIAN_CHOOSE_PENDING_METADATA_KEY] = {
          source: 'presentation',
          decisionPoints,
          hardConstraintBlocked: false,
          correlationId: `wb-${Date.now()}`,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        };
      }
    }

    await this.prisma.trip.update({
      where: { id: tripId },
      data: { metadata: meta as never },
    });
  }

  async submitChoice(tripId: string, dto: GuardianChooseRequestDto) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) {
      throw new NotFoundException(`行程 ${tripId} 不存在`);
    }

    if (!dto.decisionPoints?.length) {
      throw new BadRequestException('decisionPoints 不能为空');
    }
    if (dto.selectedIndex < 0 || dto.selectedIndex >= dto.decisionPoints.length) {
      throw new BadRequestException('selectedIndex 超出 decisionPoints 范围');
    }

    const pending = this.readPendingContext(trip.metadata);
    if (pending?.hardConstraintBlocked) {
      throw new ConflictException({
        accepted: false,
        nextAction: 'BLOCKED',
        message: '硬约束已 BLOCK，不可通过 CHOOSE 覆盖',
      });
    }

    const meta = this.readMetadata(trip.metadata);
    const userId =
      typeof meta.userId === 'string' ? meta.userId : 'anonymous';
    const feedbackId = `guardian_choose_${Date.now()}`;
    const feedback = {
      id: feedbackId,
      userId,
      tripId,
      type: 'PREFERENCE_UPDATE' as const,
      timestamp: new Date().toISOString(),
      data: {
        modificationType: 'OTHER' as const,
        modificationReason: `[${dto.source}] choice=${dto.selectedIndex}:${dto.selectedText}; points=${JSON.stringify(dto.decisionPoints)}`,
      },
      weightsAtTime: this.weightLearner.getUserWeights(userId),
      utilityAtTime: 0,
    };
    this.weightLearner.recordFeedback(feedback);
    await this.weightPersistence.saveFeedback(feedback);

    delete meta[GUARDIAN_CHOOSE_PENDING_METADATA_KEY];
    const planVersion = (typeof meta.planVersion === 'number' ? meta.planVersion : 0) + 1;
    meta.planVersion = planVersion;
    meta.lastGuardianChoice = {
      ...dto,
      chosenAt: new Date().toISOString(),
    };

    let presentation: GuardianPersonaPresentation | undefined;
    let decisionLogEntryId: string | undefined;

    const chooseLog: DecisionLogEntry = {
      persona: 'USER_ACTION',
      action: 'MODIFY',
      explanation: `用户 CHOOSE：${dto.selectedText}`,
      reasonCodes: ['GUARDIAN_CHOOSE'],
      timestamp: new Date().toISOString(),
      decisionSource: 'USER',
      decisionStage: 'FINALIZE',
      metadata: {
        guardianActions: { user: 'CHOOSE' },
        guardianChoose: dto as unknown as Record<string, unknown>,
        selectedIndex: dto.selectedIndex,
        selectedText: dto.selectedText,
        decisionPoints: dto.decisionPoints,
      },
    };

    if (this.decisionLogStorage) {
      try {
        await this.decisionLogStorage.saveLogEntry(chooseLog, { tripId });
        decisionLogEntryId = feedbackId;
      } catch (error: unknown) {
        this.logger.warn(`Guardian choose decision log failed: ${(error as Error).message}`);
        decisionLogEntryId = feedbackId;
      }
    } else {
      decisionLogEntryId = feedbackId;
    }

    if (
      (dto.source === 'negotiation' || dto.source === 'team_negotiation') &&
      this.guardianDebate &&
      this.negotiateLoader &&
      this.objectiveFunction
    ) {
      try {
        const { plan, world } = await this.negotiateLoader.loadPlanAndWorld(tripId);
        meta.lastGuardianChoicePreference = dto.selectedText;
        const baseEvaluation = this.objectiveFunction.evaluate(plan, world);
        const result = await this.guardianDebate.negotiate(plan, world, DEFAULT_NEGOTIATION_CONFIG);
        const apiSummary = mapNegotiationResultToApiSummary(result, baseEvaluation);
        presentation = buildPresentationFromNegotiationResult(result, apiSummary);
        meta.lastGuardianPresentation = presentation;
        if (
          apiSummary.decision === 'NEEDS_HUMAN' &&
          apiSummary.humanDecisionPoints?.length &&
          !apiSummary.hardConstraintBlocked
        ) {
          meta[GUARDIAN_CHOOSE_PENDING_METADATA_KEY] = {
            source: dto.source,
            decisionPoints: apiSummary.humanDecisionPoints,
            hardConstraintBlocked: false,
            correlationId: dto.correlationId ?? `neg-rerun-${Date.now()}`,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          };
        }
      } catch (error: unknown) {
        this.logger.warn(`Guardian choose re-negotiation failed: ${(error as Error).message}`);
      }
    } else if (dto.source === 'presentation') {
      const last = meta[LAST_GUARDIAN_PRESENTATION_METADATA_KEY] as
        | GuardianPersonaPresentation
        | undefined;
      if (last) {
        presentation = {
          ...last,
          narrative: `${last.narrative}\n\n已记录你的选择：${dto.selectedText}`,
        };
        meta.lastGuardianPresentation = presentation;
      }
    } else if (
      dto.source === 'optimize_judgment' &&
      this.orchestratorV2 &&
      this.negotiateLoader
    ) {
      try {
        meta.lastGuardianChoicePreference = dto.selectedText;
        const { plan, world } = await this.negotiateLoader.loadPlanAndWorld(tripId);
        const optimizeResult = await this.orchestratorV2.run(world, plan);
        presentation = buildPresentationFromOptimizeResult(optimizeResult);
        meta.lastGuardianPresentation = presentation;
        if (
          optimizeResult.humanDecisionPointsFlat?.length &&
          !optimizeResult.hardConstraintBlocked
        ) {
          meta[GUARDIAN_CHOOSE_PENDING_METADATA_KEY] = {
            source: 'optimize_judgment',
            decisionPoints: optimizeResult.humanDecisionPointsFlat,
            hardConstraintBlocked: false,
            correlationId: dto.correlationId ?? `opt-rerun-${Date.now()}`,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          };
        }
      } catch (error: unknown) {
        this.logger.warn(`Guardian choose re-optimize failed: ${(error as Error).message}`);
      }
    } else if (dto.source === 'readiness_repair') {
      const snapshot = extractGuardianNegotiationSnapshot(trip.metadata);
      const summary = snapshot?.preRepair ?? snapshot?.latest;
      if (summary) {
        const base = buildPresentationFromReadinessNegotiationSummary(summary);
        presentation = {
          ...base,
          narrative: `${base.narrative}\n\n已记录你的选择：${dto.selectedText}`,
          actions: { ...base.actions, user: undefined },
        };
        meta.lastGuardianPresentation = presentation;
      }
    }

    if (!presentation) {
      const last = meta[LAST_GUARDIAN_PRESENTATION_METADATA_KEY] as
        | GuardianPersonaPresentation
        | undefined;
      if (last) {
        presentation = {
          ...last,
          narrative: `${last.narrative}\n\n已记录你的选择：${dto.selectedText}`,
        };
        meta.lastGuardianPresentation = presentation;
      }
    }

    await this.prisma.trip.update({
      where: { id: tripId },
      data: { metadata: meta as never },
    });

    const nextAction: 'CONTINUE_PLANNING' | 'RE_RUN_NEGOTIATION' | 'APPLY_REPAIR' | 'BLOCKED' =
      dto.source === 'readiness_repair'
        ? 'APPLY_REPAIR'
        : dto.source === 'negotiation' || dto.source === 'team_negotiation'
          ? presentation
            ? 'CONTINUE_PLANNING'
            : 'RE_RUN_NEGOTIATION'
          : dto.source === 'optimize_judgment'
            ? presentation
              ? 'CONTINUE_PLANNING'
              : 'RE_RUN_NEGOTIATION'
            : 'CONTINUE_PLANNING';

    return {
      accepted: true,
      nextAction,
      presentation,
      planVersion,
      decisionLogEntryId,
    };
  }

  private extractChooseOptionsFromPresentation(
    presentation: GuardianPersonaPresentation,
    override?: string[],
  ): string[] {
    const fromOverride = (override ?? []).map((line) => line.trim()).filter(Boolean);
    if (fromOverride.length > 0) return fromOverride.slice(0, 8);

    const lines = presentation.supportingLines.map((l) => l.text).filter(Boolean);
    if (lines.length > 0) return lines.slice(0, 8);
    if (presentation.actions.user === 'CHOOSE') {
      return ['确认你的价值取舍'];
    }
    return [];
  }

  private readMetadata(metadata: unknown): Record<string, unknown> {
    return metadata && typeof metadata === 'object'
      ? { ...(metadata as Record<string, unknown>) }
      : {};
  }

  private readPendingContext(metadata: unknown): GuardianChoosePendingContext | undefined {
    if (!metadata || typeof metadata !== 'object') return undefined;
    const raw = (metadata as Record<string, unknown>)[GUARDIAN_CHOOSE_PENDING_METADATA_KEY];
    if (!raw || typeof raw !== 'object') return undefined;
    const pending = raw as GuardianChoosePendingContext;
    if (pending.expiresAt && new Date(pending.expiresAt) < new Date()) {
      return undefined;
    }
    return pending;
  }
}
