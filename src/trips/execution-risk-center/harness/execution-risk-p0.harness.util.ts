/**
 * Execution Risk Center P0 harness utilities
 */

import { DateTime } from 'luxon';
import type { EnvironmentEventSummary } from '../../in-trip-execution/types/environment-event.types';
import type { AttentionItemDto } from '../../dto/attention-queue.dto';
import { AttentionItemType, AttentionSeverity } from '../../dto/attention-queue.dto';
import type { UnifiedDecisionProblemListItem } from '../../../decision-runtime/gateway/contracts/unified-decision-ui.types';
import { projectAttentionItemToRisk } from '../adapters/attention-queue-risk.adapter';
import { projectDecisionProblemToRisk } from '../adapters/decision-problem-risk.adapter';
import { projectEnvironmentEventToRisk } from '../adapters/environment-event-risk.adapter';
import { ExecutionRiskApplyService } from '../services/execution-risk-apply.service';
import { ExecutionRiskConfirmWriteService } from '../services/execution-risk-confirm-write.service';
import { ExecutionRiskUserStateService } from '../services/execution-risk-user-state.service';
import type { ActiveRisk, RiskSourceProjection } from '../types/execution-risk.types';
import { buildRiskKey, deriveRiskId } from '../utils/risk-key.util';
import { filterActiveRisks, mergeRiskProjections, overlayUserState } from '../utils/risk-merge.util';
import { computeOverallLevel, computeExecutionGateFromRisks } from '../utils/risk-level.util';

export const HARNESS_TRIP_ID = 'trip_er_harness_001';
export const HARNESS_USER_ID = 'user_er_harness';
export const HARNESS_ACTIVITY_ID = 'activity_glacier_walk';

export function harnessReferenceDate(): string {
  return DateTime.now().toISODate() ?? '2026-07-08';
}

export function harnessTodayIso(hour: number, minute = 0): string {
  return DateTime.now()
    .set({ hour, minute, second: 0, millisecond: 0 })
    .toUTC()
    .toISO()!;
}

export function harnessWindEnvironmentEvent(
  overrides: Partial<EnvironmentEventSummary> = {},
): EnvironmentEventSummary {
  return {
    id: 'env-wind-001',
    tripId: HARNESS_TRIP_ID,
    type: 'weather',
    severity: 'red',
    description: '预计 11:00 后阵风达到 16—18m/s，并将在 11:00—18:00 持续，可能影响冰川徒步和车辆稳定性',
    status: 'open',
    detectedAt: harnessTodayIso(10, 12),
    affectedItemCount: 1,
    alternativePlanCount: 2,
    ...overrides,
  };
}

export function harnessWindEnvironmentDetail() {
  const summary = harnessWindEnvironmentEvent();
  return {
    ...summary,
    affectedItems: [
      {
        itemType: 'activity' as const,
        itemId: HARNESS_ACTIVITY_ID,
        itemName: '瓦特纳冰川徒步',
        originalTime: '2026-07-08T13:30:00.000Z',
        refundable: true,
      },
    ],
    alternativePlans: [
      {
        planId: 'plan-shorten',
        name: '缩短徒步',
        description: '将冰川徒步缩短为 90 分钟',
        timeAdjustment: '-30min',
        costDifference: 0,
        experienceEquivalence: 0.85,
        bookingRequired: false,
      },
    ],
    cascadeImpact: [],
  };
}

export function harnessDecisionProblemBlock(
  overrides: Partial<UnifiedDecisionProblemListItem> = {},
): UnifiedDecisionProblemListItem {
  return {
    problemId: 'dp-road-close-001',
    semanticKey: 'road.status.closed',
    instanceKey: 'F208-segment',
    type: 'CONSTRAINT_VIOLATION',
    dimension: 'SAFETY',
    enforcement: 'BLOCK',
    phase: 'EXECUTION',
    affectsPlan: true,
    workflowStatus: 'OPEN',
    executionStatus: 'PENDING',
    title: '道路 F208 已关闭',
    summary: '官方已关闭 F208，原计划不可继续',
    scope: { tripId: HARNESS_TRIP_ID, itemIds: ['item-drive-1'] },
    evidenceSummary: { count: 2, freshness: 'FRESH', confidence: 0.95 },
    actionability: { canAcceptRecommended: true, canDefer: false, canKeepOriginal: false },
    occurrenceCount: 1,
    detectors: [{ detectorId: 'road-status', sourceRefIds: ['ev-road-1'], lastSeenAt: '2026-07-08T09:00:00.000Z' }],
    origin: { system: 'guardian', traceId: 'trace-1' },
    ...overrides,
  } as UnifiedDecisionProblemListItem;
}

export function harnessAttentionWeather(
  overrides: Partial<AttentionItemDto> = {},
): AttentionItemDto {
  return {
    id: 'att-weather-001',
    type: AttentionItemType.WEATHER_RISK,
    title: '强风预警',
    description: '阵风可达 16—18m/s',
    tripId: HARNESS_TRIP_ID,
    severity: AttentionSeverity.HIGH,
    createdAt: '2026-07-08T10:00:00.000Z',
    metadata: { day: 3, evidenceIds: ['ev-wind-1'] },
    ...overrides,
  };
}

export function buildHarnessProjections(): RiskSourceProjection[] {
  const refDate = harnessReferenceDate();
  const impactStart = `${refDate}T11:00:00.000Z`;
  const impactEnd = `${refDate}T18:00:00.000Z`;
  return [
    projectEnvironmentEventToRisk(harnessWindEnvironmentDetail(), {
      impactStartAt: impactStart,
      impactEndAt: impactEnd,
      validUntil: DateTime.now().plus({ hours: 8 }).toISO() ?? undefined,
      referenceDate: refDate,
    }),
    projectAttentionItemToRisk(harnessAttentionWeather()),
    projectDecisionProblemToRisk(harnessDecisionProblemBlock()),
  ];
}

export function buildHarnessActiveRisks(): ActiveRisk[] {
  return filterActiveRisks(mergeRiskProjections(buildHarnessProjections()));
}

export class HarnessExecutionRiskStack {
  readonly userState = new ExecutionRiskUserStateService({} as never);

  constructor() {
    ExecutionRiskUserStateService.clearMemoryStore();
  }

  mergeProjections(projections: RiskSourceProjection[]): ActiveRisk[] {
    return filterActiveRisks(mergeRiskProjections(projections));
  }

  mergeProjectionsRaw(projections: RiskSourceProjection[]) {
    return mergeRiskProjections(projections);
  }

  acknowledge(risk: ActiveRisk, userId = HARNESS_USER_ID): ActiveRisk {
    const state = {
      tripId: risk.tripId,
      riskKey: risk.riskKey,
      userId,
      acknowledgedAt: new Date().toISOString(),
      acknowledgedBy: userId,
    };
    return overlayUserState(risk, state);
  }

  applyService(): ExecutionRiskApplyService {
    return new ExecutionRiskApplyService({} as never, {} as never, new ExecutionRiskConfirmWriteService());
  }

  summaryLevel(risks: ActiveRisk[]) {
    return {
      overallLevel: computeOverallLevel({ activeRisks: risks }),
      executionGate: computeExecutionGateFromRisks(risks),
    };
  }
}

export function stableWindRiskKey(): string {
  const ref = harnessReferenceDate();
  return buildRiskKey({
    tripId: HARNESS_TRIP_ID,
    type: 'ENVIRONMENT',
    code: 'WEATHER_STRONG_WIND',
    normalizedSubject: HARNESS_ACTIVITY_ID,
    affectedScope: HARNESS_ACTIVITY_ID,
    impactStartAt: `${ref}T11:00:00.000Z`,
    impactEndAt: `${ref}T18:00:00.000Z`,
  });
}

export function stableWindRiskId(): string {
  return deriveRiskId(HARNESS_TRIP_ID, stableWindRiskKey());
}
