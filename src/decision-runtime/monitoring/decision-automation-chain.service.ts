/**
 * S4 — auto submit + apply when TravelDecisionContract.automation allows.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DecisionEngineGatewayService } from '../gateway/services/decision-engine-gateway.service';
import { UnifiedDecisionProblemReadModelService } from '../gateway/services/unified-decision-problem-read-model.service';
import { DecisionProblemResolutionStoreService } from '../gateway/persistence/decision-problem-resolution.store';
import { resolveAutomationPolicyFromTripMetadata } from '../../trips/trip-constraint-solver/utils/travel-decision-contract-runtime.util';
import { readStoredTravelDecisionContract } from '../../trips/trip-constraint-solver/utils/travel-decision-contract.builder';
import { evaluateDecisionAutomation } from '../authorization/utils/decision-automation-policy.util';
import {
  buildExecutionContextFromAction,
  evaluateAutomationExecutionConditions,
} from '../authorization/utils/automation-execution-conditions.util';
import { getAutomationActionByKey } from '../authorization/automation-action.catalog';
import {
  appendAutomationChangeLogEntry,
  buildAutomationChangeLogId,
} from './automation-change-log.store.util';
import {
  buildAutomationChangeSummary,
  estimateItemsChangedFromAction,
  resolveUndoActionId,
} from './automation-change-summary.util';
import { isDecisionAutomationChainEnabled } from './decision-automation-chain.config';
import type { TripMonitoringScanResult } from './trip-monitoring-mvp.types';
import { resolveRfc001ProblemSemanticKey } from '../../decision-capabilities/problem-semantic';
import type { DecisionAction } from '../gateway/contracts/unified-decision-ui.types';

export const DECISION_AUTOMATION_ACTOR_USER_ID = 'system:decision-automation';

export interface DecisionAutomationAttemptResult {
  problemId: string;
  status: 'APPLIED' | 'SKIPPED' | 'FAILED';
  reasonCodes?: string[];
  detail?: string;
  changeLogId?: string;
  changeSummary?: string;
}

export interface DecisionAutomationChainResult {
  enabled: boolean;
  attempts: DecisionAutomationAttemptResult[];
}

@Injectable()
export class DecisionAutomationChainService {
  private readonly logger = new Logger(DecisionAutomationChainService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly gateway?: DecisionEngineGatewayService,
    @Optional() private readonly readModel?: UnifiedDecisionProblemReadModelService,
    @Optional() private readonly resolutionStore?: DecisionProblemResolutionStoreService,
  ) {}

  isEnabled(): boolean {
    return isDecisionAutomationChainEnabled();
  }

  async tryAutoApplyAfterScan(
    tripId: string,
    scan: TripMonitoringScanResult,
    userId: string = DECISION_AUTOMATION_ACTOR_USER_ID,
  ): Promise<DecisionAutomationChainResult> {
    if (!this.isEnabled() || !this.gateway || !this.readModel) {
      return { enabled: false, attempts: [] };
    }

    const problemIds = scan.items
      .filter((i) => i.status === 'ALERT' && i.problemId)
      .map((i) => i.problemId!);

    const attempts: DecisionAutomationAttemptResult[] = [];
    for (const problemId of problemIds) {
      attempts.push(await this.tryAutoApplyProblem(tripId, problemId, userId));
    }

    return { enabled: true, attempts };
  }

  async tryAutoApplyProblem(
    tripId: string,
    problemId: string,
    userId: string = DECISION_AUTOMATION_ACTOR_USER_ID,
  ): Promise<DecisionAutomationAttemptResult> {
    if (!this.gateway || !this.readModel) {
      return { problemId, status: 'SKIPPED', reasonCodes: ['GATEWAY_NOT_WIRED'] };
    }

    try {
      const [trip, detail] = await Promise.all([
        this.prisma.trip.findUnique({
          where: { id: tripId },
          select: { metadata: true, budgetConfig: true },
        }),
        this.readModel.getProblemDetail(tripId, problemId),
      ]);

      if (!trip) {
        return { problemId, status: 'FAILED', detail: 'trip_not_found' };
      }

      const metadata = (trip.metadata ?? {}) as Record<string, unknown>;
      const pacing = (trip.budgetConfig ?? {}) as Record<string, unknown>;
      const stored = readStoredTravelDecisionContract(metadata);
      const automation = resolveAutomationPolicyFromTripMetadata(metadata, pacing);

      const problemRow = detail.problem as {
        semanticKey?: string;
        semanticCapability?: string;
        type?: string;
        triggerEventId?: string;
        enforcement?: string;
        scope?: { dayNumbers?: number[] };
      };
      const semanticKey =
        problemRow.semanticKey ??
        (problemRow.semanticCapability || problemRow.type
          ? resolveRfc001ProblemSemanticKey({
              type: problemRow.type ?? 'FEASIBILITY_FAILURE',
              triggerEventId: problemRow.triggerEventId ?? problemId,
              semanticCapability: problemRow.semanticCapability,
            })
          : undefined);
      const semanticCapability =
        problemRow.semanticCapability ?? semanticKey?.split(':')[0];

      const evaluation = evaluateDecisionAutomation({
        automation,
        automationPaused: stored?.automationPaused === true,
        semanticKey,
        semanticCapability,
        enforcement: problemRow.enforcement ?? detail.problem.enforcement,
      });

      if (!evaluation.autoApplyEligible || evaluation.outcome !== 'ALLOW') {
        return {
          problemId,
          status: 'SKIPPED',
          reasonCodes: evaluation.reasonCodes,
        };
      }

      const recommended = this.pickRecommendedAction(detail.actions);
      if (!recommended?.actionId) {
        return { problemId, status: 'SKIPPED', reasonCodes: ['NO_ALLOWED_ACTION'] };
      }

      const matchedActionKeys = evaluation.matchedActionKeys ?? [];
      const conditionsResult = evaluateAutomationExecutionConditions({
        matchedActionKeys,
        automation,
        context: buildExecutionContextFromAction({
          action: recommended,
          problem: {
            semanticKey,
            affectedDayNumbers:
              recommended.expectedImpact?.affectedDays ?? problemRow.scope?.dayNumbers,
          },
        }),
      });

      if (!conditionsResult.allowed) {
        return {
          problemId,
          status: 'SKIPPED',
          reasonCodes: conditionsResult.reasonCodes,
          detail: conditionsResult.violatedConditions.join(','),
        };
      }

      const submit = await this.gateway.submitResolution(tripId, problemId, userId, {
        selectedActionId: recommended.actionId,
      });

      if (submit.nextStep !== 'APPLY') {
        return {
          problemId,
          status: 'SKIPPED',
          reasonCodes: ['SUBMIT_DID_NOT_ADVANCE_TO_APPLY'],
          detail: submit.nextStep,
        };
      }

      await this.gateway.applyResolution(tripId, problemId, userId);

      const affectedDayNumbers =
        recommended.expectedImpact?.affectedDays ?? problemRow.scope?.dayNumbers;
      const itemsChanged = estimateItemsChangedFromAction(recommended);
      const matchedActionLabels = matchedActionKeys
        .map((key) => getAutomationActionByKey(key)?.label)
        .filter((label): label is string => Boolean(label));
      const changeSummary = buildAutomationChangeSummary({
        actionTitle: recommended.title,
        actionSummary: recommended.summary,
        affectedDayNumbers,
        itemsChanged,
        matchedActionLabels,
      });
      const undoActionId = resolveUndoActionId({
        availableActionIds: detail.actions.map((a) => a.actionId),
      });
      const logId = buildAutomationChangeLogId();
      const appliedAt = new Date().toISOString();
      const teamCanUndo = conditionsResult.effectiveConditions.teamCanUndo !== false;

      await appendAutomationChangeLogEntry(this.prisma, tripId, {
        logId,
        problemId,
        appliedAt,
        changeSummary,
        status: 'APPLIED',
        matchedActionKeys,
        selectedActionId: recommended.actionId,
        undoActionId,
        affectedDayNumbers,
        itemsChanged,
        automatic: true,
        reversible: teamCanUndo && Boolean(undoActionId),
      });

      if (this.resolutionStore) {
        const resolution = await this.resolutionStore.getForProblem(tripId, problemId);
        if (resolution) {
          await this.resolutionStore.upsert(tripId, {
            ...resolution,
            automationMeta: {
              changeSummary,
              matchedActionKeys,
              changeLogId: logId,
              itemsChanged,
              affectedDayNumbers,
              actionTitle: recommended.title,
              undoActionId,
              appliedAt,
            },
          });
        }
      }

      this.logger.log(
        `[DecisionAutomation] auto-applied trip=${tripId} problem=${problemId} action=${recommended.actionId} summary="${changeSummary}"`,
      );

      return {
        problemId,
        status: 'APPLIED',
        reasonCodes: [...evaluation.reasonCodes, ...conditionsResult.reasonCodes],
        changeLogId: logId,
        changeSummary,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `[DecisionAutomation] failed trip=${tripId} problem=${problemId}: ${message}`,
      );
      return { problemId, status: 'FAILED', detail: message };
    }
  }

  private pickRecommendedAction(actions: DecisionAction[]): DecisionAction | undefined {
    return (
      actions.find((a) => a.allowed && !a.blockedReason && !a.requiresConfirmation) ??
      actions.find((a) => a.allowed && !a.blockedReason) ??
      actions.find((a) => a.allowed)
    );
  }
}
