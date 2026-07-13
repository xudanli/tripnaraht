/**
 * IS-CERT-404 — TEP / Canonical dedup harness
 * @see internal-docs/product/TEP-PHASE0-CONTRACT-FREEZE.md §6
 */

import type { ExecutionAdjustmentQueueDto, ExecutionInterventionDto } from '../../../mobile/dto/mobile-execution.types';
import type { Rfc001DecisionProblem } from '../../guardian-decision-core/contracts/decision-problem.types';
import type { DecisionHook } from '../contracts/tep-self-drive.types';
import { TepErcBridgeService } from '../services/tep-erc-bridge.service';
import { TepPlanMetadataService } from '../services/tep-plan-metadata.service';
import {
  dedupeAdjustmentQueueForTepCanonical,
  isCanonicalDuplicateOfTepPrimary,
  resolveDedupKeyFromProblem,
} from '../utils/tep-canonical-dedup.util';
import type { IsCertRuntimeScenario } from './is-cert-runtime.harness';
import { projectDecisionHooks } from '../projectors/decision-hook.projector';

export interface IsCert404Result {
  scenarioId: string;
  passed: boolean;
  message?: string;
  artifacts?: {
    dedupKey?: string;
    visibleInterventionIds?: string[];
    suppressedCount?: number;
  };
}

export function buildIsCert404RoadHook(scenario: IsCertRuntimeScenario): DecisionHook {
  const hooks = projectDecisionHooks({
    tripId: scenario.input.tripId,
    countryCode: scenario.input.countryCode,
    dailyDrivePlans: scenario.input.dailyDrivePlans,
    profile: scenario.input.profile,
  });
  const road = hooks.find((h) => h.hookId.startsWith('HOOK-ROAD'));
  if (!road) {
    throw new Error('IS-CERT-404 scenario missing HOOK-ROAD projection');
  }
  return road;
}

export function buildIsCert404TepProblem(
  scenario: IsCertRuntimeScenario,
  hook: DecisionHook,
): Rfc001DecisionProblem {
  return {
    problemId: `problem_tep_${hook.hookId}_${scenario.input.tripId}`,
    tripId: scenario.input.tripId,
    planVersionId: scenario.input.planVersionId,
    type: 'RESOURCE_UNAVAILABLE',
    triggerEventId: scenario.input.triggerEventId ?? 'evt_cert_404',
    semanticCapability: hook.semanticKey ?? 'ROAD_SEGMENT_UNAVAILABLE',
    affectedEntityRefs: hook.impactScope.map((ref) => ({
      kind: ref.startsWith('drive_leg_') ? ('ROUTE_SEGMENT' as const) : ('PLAN_ITEM' as const),
      id: ref,
    })),
    affectedPlanItemIds: hook.impactScope.filter(
      (r) => r.startsWith('activity_') || r.startsWith('item_'),
    ),
    worldStateSnapshotId: scenario.input.worldStateSnapshotId ?? 'ws_cert_404',
    detectedAt: '2026-08-09T10:00:00.000Z',
    urgency: 'HIGH',
    status: 'OPEN',
  };
}

export function buildIsCert404CanonicalProblem(
  scenario: IsCertRuntimeScenario,
  hook: DecisionHook,
): Rfc001DecisionProblem {
  return {
    problemId: `problem_road_canonical_${scenario.input.tripId}`,
    tripId: scenario.input.tripId,
    planVersionId: scenario.input.planVersionId,
    type: 'FEASIBILITY_FAILURE',
    triggerEventId: 'evt_canonical_legacy_404',
    affectedEntityRefs: [{ kind: 'ROUTE_SEGMENT', id: hook.targetRef }],
    affectedPlanItemIds: hook.impactScope.filter(
      (r) => r.startsWith('activity_') || r.startsWith('item_'),
    ),
    worldStateSnapshotId: scenario.input.worldStateSnapshotId ?? 'ws_cert_404',
    detectedAt: '2026-08-09T10:00:00.000Z',
    urgency: 'HIGH',
    status: 'OPEN',
  };
}

function baseIntervention(
  tripId: string,
  partial: Partial<ExecutionInterventionDto>,
): ExecutionInterventionDto {
  return {
    schemaId: 'tripnara.execution_intervention@v1',
    id: partial.id ?? 'intervention-x',
    tripId,
    type: partial.type ?? 'SAFETY_INTERVENTION',
    priority: partial.priority ?? 'CRITICAL',
    title: partial.title ?? '道路封闭',
    reason: partial.reason ?? '封路',
    recommendedAction: '调整路线',
    affectedMembers: [],
    affectedActivities: partial.affectedActivities ?? [],
    alternativeActions: [],
    evidenceRefs: [],
    requiresConfirmation: true,
    autoExecutable: false,
    reversible: true,
    modifiesEffectivePlan: false,
    requiresRevalidation: false,
    status: 'OPEN',
    linkedRiskIds: partial.linkedRiskIds ?? [],
    causalChain: partial.causalChain ?? {
      headline: partial.title ?? '道路封闭',
      assessment: partial.reason ?? '封路',
      nodes: [],
    },
    actions: {
      primary: { label: '查看', action: 'view_impact', enabled: true },
      secondary: { label: '确认', action: 'complete', enabled: true },
      defer: { label: '稍后', action: 'defer', enabled: true },
    },
    ...partial,
  };
}

/** IS-CERT-404 — single road event → one primary user-facing intervention */
export async function runIsCert404Scenario(
  scenario: IsCertRuntimeScenario,
): Promise<IsCert404Result> {
  const hook = buildIsCert404RoadHook(scenario);
  const tepProblem = buildIsCert404TepProblem(scenario, hook);
  const canonicalProblem = buildIsCert404CanonicalProblem(scenario, hook);

  if (!isCanonicalDuplicateOfTepPrimary(canonicalProblem, tepProblem)) {
    return {
      scenarioId: 'IS-CERT-404',
      passed: false,
      message: 'Fixture canonical problem is not a dedup duplicate of TEP primary',
    };
  }

  const dedupKey = resolveDedupKeyFromProblem(tepProblem);
  if (!dedupKey) {
    return {
      scenarioId: 'IS-CERT-404',
      passed: false,
      message: 'Failed to resolve TEP dedup key',
    };
  }

  const baseQueue: ExecutionAdjustmentQueueDto = {
    schemaId: 'tripnara.execution_adjustment_queue@v1',
    tripId: scenario.input.tripId,
    contextVersion: 1,
    projectionSource: 'execution_risk_center',
    pendingCount: 3,
    criticalCount: 2,
    highPriorityCount: 2,
    headline: '今天需要您决定 3 件事',
    items: [
      baseIntervention(scenario.input.tripId, {
        id: `intervention-decision-${tepProblem.problemId}`,
        decisionProblemId: tepProblem.problemId,
        title: 'TEP 道路封闭（主问题）',
        affectedActivities: [hook.targetRef],
      }),
      baseIntervention(scenario.input.tripId, {
        id: `intervention-decision-${canonicalProblem.problemId}`,
        decisionProblemId: canonicalProblem.problemId,
        title: 'Canonical 道路封闭（应被抑制）',
        affectedActivities: [hook.targetRef],
      }),
      baseIntervention(scenario.input.tripId, {
        id: 'intervention-risk-road-close',
        linkedRiskIds: ['risk_road_close_404'],
        affectedActivities: [hook.targetRef],
        title: '风险层道路封闭（应被抑制）',
      }),
    ],
    countsByType: {
      SAFETY_INTERVENTION: 3,
      DYNAMIC_REPLAN: 0,
      TEAM_COORDINATION: 0,
      EXECUTION_PREPARATION: 0,
    },
  };

  const planMetadata = {
    loadTepMetadata: jest.fn(async () => ({
      planVersionId: scenario.input.planVersionId,
      tep: {
        schemaId: 'tripnara/tep_plan_version_metadata@v1',
        syncedAt: '2026-08-01T00:00:00.000Z',
        decisionHooks: [hook],
      },
    })),
  } as unknown as TepPlanMetadataService;

  const bridge = new TepErcBridgeService(planMetadata);
  const enriched = await bridge.enrichAdjustmentQueue(scenario.input.tripId, baseQueue);

  if (enriched.items.length !== 1) {
    return {
      scenarioId: 'IS-CERT-404',
      passed: false,
      message: `Expected 1 visible intervention, got ${enriched.items.length}`,
      artifacts: {
        dedupKey,
        visibleInterventionIds: enriched.items.map((i) => i.id),
        suppressedCount: baseQueue.items.length - enriched.items.length,
      },
    };
  }

  const visible = enriched.items[0]!;
  if (visible.decisionProblemId !== tepProblem.problemId) {
    return {
      scenarioId: 'IS-CERT-404',
      passed: false,
      message: `Expected TEP primary problem, got ${visible.decisionProblemId}`,
      artifacts: { dedupKey, visibleInterventionIds: [visible.id] },
    };
  }

  const directDedup = dedupeAdjustmentQueueForTepCanonical(baseQueue.items, {
    tripId: scenario.input.tripId,
    effectivePlanVersionId: scenario.input.planVersionId,
    decisionHooks: [hook],
  });
  if (directDedup.length !== 1) {
    return {
      scenarioId: 'IS-CERT-404',
      passed: false,
      message: 'Direct dedupe utility did not collapse duplicates',
    };
  }

  return {
    scenarioId: 'IS-CERT-404',
    passed: true,
    artifacts: {
      dedupKey,
      visibleInterventionIds: enriched.items.map((i) => i.id),
      suppressedCount: baseQueue.items.length - enriched.items.length,
    },
  };
}
