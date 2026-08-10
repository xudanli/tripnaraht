import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { isEffectivePlanWriteChainEnabled } from '../../../decision-runtime/execution/effective-plan-write-chain.config';
import { EnvironmentRadarService } from '../../in-trip-execution/services/environment-radar.service';
import { InTripAccessService } from '../../in-trip-execution/services/in-trip-access.service';
import { ExecutionAdvisoryApplyService } from '../../trip-constraint-solver/services/execution-advisory-apply.service';
import { TravelStatusService } from '../../travel-status/services/travel-status.service';
import type {
  ConfirmExecutionRiskApplyResponseDto,
  ExecutionGate,
  ExecutionRiskApplyRequestDto,
  ExecutionRiskApplyResponseDto,
} from '../types/execution-risk.types';
import { ActiveRiskAggregationService } from './active-risk-aggregation.service';
import { ExecutionRiskRecommendationService } from './execution-risk-recommendation.service';
import {
  buildMemberImpactsForRecommendation,
  resolveAffectedMembersScope,
} from '../utils/execution-risk-member.util';
import {
  buildPlanDiffPreview,
  projectRisksAfterApply,
} from '../utils/execution-risk-plan-diff.util';
import { Rfc001PlanVersionStoreService } from '../../guardian-decision-core/plan-version/plan-version.store';
import { ExecutionRiskConfirmWriteService } from './execution-risk-confirm-write.service';
import {
  buildIdempotencyStoreKey,
  ExecutionRiskIdempotencyStore,
  hashIdempotencyBody,
} from './execution-risk-idempotency.store';
import { guardAutoExternalTransaction } from '../utils/execution-risk-automation-boundary.util';
import { loadExecutionRiskKnowledgeFromPackage } from '../knowledge/execution-risk-knowledge.loader';
import { executionRiskPlanAppliedBus } from '../ports/execution-risk-plan-applied.bus';

export function parseEnvironmentRecommendationId(
  recommendationId: string,
  eventIdHint?: string,
): { eventId: string; planId: string } | null {
  if (!recommendationId.startsWith('env-rec-')) return null;
  const rest = recommendationId.slice('env-rec-'.length);
  if (eventIdHint && rest.startsWith(`${eventIdHint}-`)) {
    return { eventId: eventIdHint, planId: rest.slice(eventIdHint.length + 1) };
  }
  if (rest.length > 37 && rest[36] === '-') {
    return { eventId: rest.slice(0, 36), planId: rest.slice(37) };
  }
  const dash = rest.indexOf('-');
  if (dash <= 0) return null;
  return { eventId: rest.slice(0, dash), planId: rest.slice(dash + 1) };
}

export interface ApplyRecommendationOptions {
  idempotencyKey?: string;
  request?: ExecutionRiskApplyRequestDto;
  expectedPlanVersionId?: string;
}

export interface ConfirmRecommendationOptions {
  idempotencyKey?: string;
  confirmedBy?: string;
  expectedPlanVersionId?: string;
}

@Injectable()
export class ExecutionRiskApplyService {
  private readonly idempotency: ExecutionRiskIdempotencyStore;

  constructor(
    private readonly aggregation: ActiveRiskAggregationService,
    private readonly recommendations: ExecutionRiskRecommendationService,
    private readonly confirmWrite: ExecutionRiskConfirmWriteService,
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly planVersionStore?: Rfc001PlanVersionStoreService,
    @Optional() private readonly travelStatus?: TravelStatusService,
    @Optional() private readonly advisoryApply?: ExecutionAdvisoryApplyService,
    @Optional() private readonly environmentRadar?: EnvironmentRadarService,
    @Optional() private readonly inTripAccess?: InTripAccessService,
  ) {
    this.idempotency = new ExecutionRiskIdempotencyStore(this.prisma);
  }

  /** Test-only — reset L1 idempotency between spec cases */
  resetIdempotencyForTests(): void {
    this.idempotency.clear();
  }

  async applyRecommendation(
    tripId: string,
    riskId: string,
    recommendationId: string,
    userId: string,
    options: ApplyRecommendationOptions = {},
  ): Promise<ExecutionRiskApplyResponseDto> {
    const idempotencyKey = options.idempotencyKey ?? options.request?.idempotencyKey;
    const requestBody = {
      tripId,
      riskId,
      recommendationId,
      requestedBy: options.request?.requestedBy ?? userId,
      idempotencyKey,
    };
    const bodyHash = hashIdempotencyBody(requestBody);

    if (idempotencyKey) {
      const storeKey = buildIdempotencyStoreKey({
        operation: 'apply',
        tripId,
        riskId,
        recommendationId,
        idempotencyKey,
      });
      const cached = await this.idempotency.lookupAsync<ExecutionRiskApplyResponseDto>(
        tripId,
        storeKey,
        bodyHash,
      );
      if (cached.hit && cached.response) {
        return { ...cached.response, idempotentReplay: true };
      }
    }

    const { risk, rec } = await this.requireRiskAndRecommendation(tripId, riskId, recommendationId, userId);
    const decisionProblemId = this.resolveDecisionProblemId(risk, rec);
    const basePlanVersionId = await this.resolveBasePlanVersionId(
      tripId,
      options.expectedPlanVersionId ?? options.request?.expectedPlanVersionId,
    );
    const { planDiff, preview } = buildPlanDiffPreview({
      tripId,
      risk,
      recommendationLabel: rec.label,
      recommendationDescription: rec.description,
      impactSummary: rec.impactSummary,
      basePlanVersionId,
    });

    const allRisks = await this.aggregation.listRisks(tripId, userId);
    const projectedRisks = projectRisksAfterApply(allRisks, riskId);
    const memberImpacts = buildMemberImpactsForRecommendation({
      risk,
      label: rec.label,
      description: rec.description,
      impactSummary: rec.impactSummary,
      affectedMembersScope: resolveAffectedMembersScope({ risks: [risk] }),
    });

    // Agent Harness P0-1 W3 / C9：apply 仅 PREVIEW；落库仅 confirm → AE（禁止 materialize 旁路）
    const response: ExecutionRiskApplyResponseDto = {
      executionStatus: 'PREVIEW',
      riskId,
      recommendationId,
      decisionProblemId,
      planDiffId: planDiff.afterPlanVersionId,
      preview,
      planDiff,
      idempotencyKey,
      expectedPlanVersionId: planDiff.beforePlanVersionId,
      projectedRisks,
      requiresConfirmation: true,
      confirmHint: this.buildConfirmHint(decisionProblemId, recommendationId),
      memberImpacts,
      validation: {
        gate: (risk.executionGate ?? 'AT_RISK') as ExecutionGate,
        newRisks: [],
        resolvedRiskIds: [],
      },
    };

    if (idempotencyKey) {
      const storeKey = buildIdempotencyStoreKey({
        operation: 'apply',
        tripId,
        riskId,
        recommendationId,
        idempotencyKey,
      });
      await this.idempotency.saveAsync(tripId, storeKey, bodyHash, response);
    }

    return response;
  }

  async confirmRecommendation(
    tripId: string,
    riskId: string,
    recommendationId: string,
    userId: string,
    confirm: boolean,
    options: ConfirmRecommendationOptions = {},
  ): Promise<ConfirmExecutionRiskApplyResponseDto> {
    if (!confirm) {
      throw new BadRequestException({ code: 'CONFIRMATION_REQUIRED', message: '需要 confirm=true' });
    }

    const idempotencyKey = options.idempotencyKey;
    if (idempotencyKey) {
      const hasPreview = await this.idempotency.findApplyRecordAsync({
        tripId,
        riskId,
        recommendationId,
        idempotencyKey,
      });
      if (!hasPreview) {
        throw new BadRequestException({
          code: 'PREVIEW_REQUIRED',
          message: '必须先调用 apply 预览后再 confirm',
        });
      }

      const requestBody = {
        tripId,
        riskId,
        recommendationId,
        confirmedBy: options.confirmedBy ?? userId,
        confirm: true,
        idempotencyKey,
      };
      const bodyHash = hashIdempotencyBody(requestBody);
      const storeKey = buildIdempotencyStoreKey({
        operation: 'confirm',
        tripId,
        riskId,
        recommendationId,
        idempotencyKey,
      });
      const cached = await this.idempotency.lookupAsync<ConfirmExecutionRiskApplyResponseDto>(
        tripId,
        storeKey,
        bodyHash,
      );
      if (cached.hit && cached.response) {
        return { ...cached.response, idempotentReplay: true };
      }
    }

    const prepared = await this.applyRecommendation(tripId, riskId, recommendationId, userId, {
      idempotencyKey,
    });
    const { risk, rec } = await this.requireRiskAndRecommendation(tripId, riskId, recommendationId, userId);

    // apply already wrote Active Plan (legacy chain-off) — treat confirm as idempotent success
    if (prepared.executionStatus === 'APPLIED' && prepared.contextVersion != null) {
      const confirmed: ConfirmExecutionRiskApplyResponseDto = {
        ...prepared,
        applied: true,
        itineraryMaterialized: true,
        updatedRisks: await this.aggregation.listRisks(tripId, userId),
      };
      await this.cacheConfirmIfNeeded(confirmed, tripId, riskId, recommendationId, idempotencyKey, userId, options);
      return confirmed;
    }

    const actionCodes = await this.resolveRecommendationActionCodes(
      tripId,
      riskId,
      userId,
      recommendationId,
    );
    guardAutoExternalTransaction({
      actionCodes,
      actionsByCode: loadExecutionRiskKnowledgeFromPackage().actionsByCode,
      userConfirmed: confirm,
      autoSwitch: false,
    });

    // Agent Harness P0-1 W3 / C10：确认路径优先 AE（confirmWrite → Rfc001 activate）
    if (this.confirmWrite.isWriteEnabled() && prepared.planDiff && idempotencyKey) {
      const writeResult = await this.confirmWrite.commitConfirmedRecommendation({
        tripId,
        riskId,
        recommendationId,
        userId,
        planDiff: prepared.planDiff,
        decisionProblemId: prepared.decisionProblemId,
        idempotencyKey,
        actionCodes,
        riskCode: risk.code,
        expectedPlanVersionId:
          options.expectedPlanVersionId ??
          prepared.expectedPlanVersionId ??
          prepared.planDiff?.beforePlanVersionId,
      });
      if (writeResult) {
        const updatedRisks = await this.aggregation.listRisks(tripId, userId);
        let contextVersion = prepared.contextVersion;
        if (this.prisma && contextVersion == null) {
          const bumpedAt = new Date();
          await this.prisma.trip.update({
            where: { id: tripId },
            data: { updatedAt: bumpedAt },
          });
          contextVersion = bumpedAt.getTime();
          executionRiskPlanAppliedBus.emitApplied({
            tripId,
            contextVersion,
            changedSections: ['plan', 'itinerary', 'execution'],
            planVersion: contextVersion,
          });
        }
        const confirmed: ConfirmExecutionRiskApplyResponseDto = {
          ...prepared,
          executionStatus: 'APPLIED',
          applied: true,
          contextVersion,
          planVersion: contextVersion,
          newPlanVersionId: writeResult.newPlanVersionId,
          ledgerRef: writeResult.ledgerRef,
          effectivePlanVersionId: writeResult.effectivePlanVersionId,
          planActivated: writeResult.planActivated,
          itineraryMaterialized: writeResult.itineraryMaterialized,
          riskRefreshSnapshotId: writeResult.riskRefreshSnapshotId,
          updatedRisks,
        };
        const storeKey = buildIdempotencyStoreKey({
          operation: 'confirm',
          tripId,
          riskId,
          recommendationId,
          idempotencyKey,
        });
        await this.idempotency.saveAsync(
          tripId,
          storeKey,
          hashIdempotencyBody({
            tripId,
            riskId,
            recommendationId,
            confirmedBy: options.confirmedBy ?? userId,
            confirm: true,
            idempotencyKey,
          }),
          confirmed,
        );
        return confirmed;
      }
    }

    const problemId = risk.decisionProblemIds[0] ?? prepared.decisionProblemId;
    if (problemId && !problemId.startsWith('dp_') && this.travelStatus) {
      const result = await this.travelStatus.acceptRecommended(tripId, problemId, userId);
      const confirmed: ConfirmExecutionRiskApplyResponseDto = {
        ...prepared,
        executionStatus: 'APPLIED',
        applied: true,
        decisionQueue: result,
        updatedRisks: await this.aggregation.listRisks(tripId, userId),
      };
      await this.cacheConfirmIfNeeded(confirmed, tripId, riskId, recommendationId, idempotencyKey, userId, options);
      return confirmed;
    }

    // W3：写链开启时禁止 advisory 直写旁路（确认须 AE / 决策队列）
    if (
      !isEffectivePlanWriteChainEnabled() &&
      this.advisoryApply &&
      rec.id &&
      !rec.id.startsWith('env-rec-')
    ) {
      try {
        const applied = await this.advisoryApply.applyRecommendation(tripId, rec.id, userId, {
          confirm: true,
        });
        const confirmed: ConfirmExecutionRiskApplyResponseDto = {
          ...prepared,
          executionStatus: 'APPLIED',
          applied: true,
          advisoryApply: applied,
          updatedRisks: await this.aggregation.listRisks(tripId, userId),
        };
        await this.cacheConfirmIfNeeded(confirmed, tripId, riskId, recommendationId, idempotencyKey, userId, options);
        return confirmed;
      } catch (e) {
        throw e;
      }
    }

    const envParsed = parseEnvironmentRecommendationId(recommendationId, rec.sourceId);
    if (envParsed && this.environmentRadar && this.inTripAccess) {
      await this.inTripAccess.assertOrganizer(tripId, userId);
      const resolved = await this.environmentRadar.resolveEvent(tripId, envParsed.eventId, userId, {
        planId: envParsed.planId,
      });
      const confirmed: ConfirmExecutionRiskApplyResponseDto = {
        ...prepared,
        executionStatus: 'APPLIED',
        applied: true,
        environmentResolution: { eventId: envParsed.eventId, planId: envParsed.planId, resolved },
        updatedRisks: await this.aggregation.listRisks(tripId, userId),
      };
      await this.cacheConfirmIfNeeded(confirmed, tripId, riskId, recommendationId, idempotencyKey, userId, options);
      return confirmed;
    }

    return {
      ...prepared,
      executionStatus: 'REQUIRES_CONFIRMATION',
      applied: false,
      confirmHint:
        prepared.confirmHint ??
        '暂无可用自动确认路径，请通过决策队列或环境事件投票完成调整',
    };
  }

  private async cacheConfirmIfNeeded(
    response: ConfirmExecutionRiskApplyResponseDto,
    tripId: string,
    riskId: string,
    recommendationId: string,
    idempotencyKey: string | undefined,
    userId: string,
    options: ConfirmRecommendationOptions,
  ): Promise<void> {
    if (!idempotencyKey) return;
    const storeKey = buildIdempotencyStoreKey({
      operation: 'confirm',
      tripId,
      riskId,
      recommendationId,
      idempotencyKey,
    });
    await this.idempotency.saveAsync(
      tripId,
      storeKey,
      hashIdempotencyBody({
        tripId,
        riskId,
        recommendationId,
        confirmedBy: options.confirmedBy ?? userId,
        confirm: true,
        idempotencyKey,
      }),
      response,
    );
  }

  private async requireRiskAndRecommendation(
    tripId: string,
    riskId: string,
    recommendationId: string,
    userId: string,
  ) {
    const risk = await this.aggregation.getRisk(tripId, riskId, userId);
    if (!risk) {
      throw new NotFoundException(`风险 ${riskId} 不存在`);
    }
    const recs = await this.recommendations.listForRisk(tripId, riskId, userId);
    const rec = recs.find((r) => r.id === recommendationId);
    if (!rec) {
      throw new NotFoundException(`建议 ${recommendationId} 不存在或已失效`);
    }
    return { risk, rec };
  }

  private resolveDecisionProblemId(
    risk: Awaited<ReturnType<ActiveRiskAggregationService['getRisk']>> & object,
    rec: { sourceSystem: string; sourceId: string },
  ): string {
    if (risk.decisionProblemIds[0]) return risk.decisionProblemIds[0]!;
    if (rec.sourceSystem === 'DECISION_PROBLEM') return rec.sourceId;
    return `dp_${randomUUID().slice(0, 8)}`;
  }

  private async resolveRecommendationActionCodes(
    tripId: string,
    riskId: string,
    userId: string,
    recommendationId?: string,
  ): Promise<string[]> {
    const recs = await this.recommendations.listForRisk(tripId, riskId, userId);
    const matched = recommendationId
      ? recs.find((r) => r.id === recommendationId)
      : undefined;
    if (matched?.actionCodes?.length) return matched.actionCodes;

    const plans = await this.recommendations.listThreePlansForRisk(tripId, riskId, userId);
    if (matched?.planType) {
      const byType = plans.find((p) => String(p.planType) === matched.planType);
      if (byType?.actionCodes?.length) return byType.actionCodes;
    }
    const recommended = plans.find((p) => p.planType === 'RECOMMENDED');
    return recommended?.actionCodes ?? [];
  }

  private async resolveBasePlanVersionId(
    tripId: string,
    clientExpected?: string,
  ): Promise<string | undefined> {
    if (clientExpected?.trim()) return clientExpected.trim();
    if (!this.planVersionStore) return undefined;
    const effective = await this.planVersionStore.getEffectivePlanVersionId(tripId);
    return effective?.trim() || undefined;
  }

  private buildConfirmHint(decisionProblemId: string, recommendationId: string): string {
    if (!decisionProblemId.startsWith('dp_')) {
      return `确认后请调用 POST /api/trips/:tripId/decision-queue/${decisionProblemId}/accept-recommended，或使用本接口 confirm=true 自动提交`;
    }
    if (recommendationId.startsWith('env-rec-')) {
      return '环境方案需组织者 confirm=true 后 resolve；或团队成员通过环境事件投票';
    }
    return '请使用 confirm=true 提交，或前往决策空间完成确认';
  }
}
