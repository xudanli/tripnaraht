/**
 * RFC-001 → Decision Center V1.5 read-model bridge (display only, not execution authority).
 */

import type { Rfc001DecisionProblem } from '../contracts/decision-problem.types';
import type { Rfc001DecisionRecord } from '../contracts/decision-record.types';
import type { DecisionWorkspace } from '../contracts/decision-workspace.types';
import type { Rfc001RepairCandidate } from '../contracts/guardian-outputs.types';
import type { PlanVersion } from '../contracts/plan-version.types';
import type { WorldStateAssertion } from '../contracts/world-state.types';
import type { Rfc001DecisionRun } from '../persistence/rfc001-decision-ledger.store';
import type {
  AffectedScope,
  ConstraintAssertion,
  DecisionOption,
  DecisionOptionPreviewResponse,
  DecisionProblem,
  DecisionProblemStatus,
  DecisionProblemType,
  DecisionRecord,
  TripMutation,
} from '../../decision-semantics/types/decision-semantics.types';
import type { TripMutationSet } from '../../decision-semantics/types/decision-semantics.types';
import { resolveRfc001ProblemSemanticKey } from '../../../decision-capabilities/problem-semantic';
import { resolveExcessiveDailyLoadDisplayDayIndex } from '../detection/excessive-daily-load-problem.util';
import { resolveRepairCandidateExecutionCapability } from './repair-execution-capability.util';
import { isEffectiveExecutable } from '../cutover/cutover-reconciliation.util';
import type { TripDecisionRoutingView } from '../routing/decision-engine-routing.types';
import type { ImpactScopeView } from '../../../decision-runtime/gateway/frontend/impact-scope-view.types';

export type Rfc001LeadingPersona = 'ABU' | 'DRDRE' | 'NEPTUNE' | 'DECISION_CORE';

export interface Rfc001DecisionLineageLink {
  kind:
    | 'EVENT'
    | 'ASSERTION'
    | 'SNAPSHOT'
    | 'PROBLEM'
    | 'WORKSPACE'
    | 'DECISION'
    | 'PLAN_VERSION'
    | 'EXECUTION';
  id: string;
  at?: string;
}

export interface Rfc001DecisionCenterCandidateView {
  candidateId: string;
  label: string;
  generationMethod: string;
  intentPreservation: number;
  estimatedAddedDurationMinutes: number;
  preservedIntentRefs: string[];
  abuVerdict?: string;
  physicalLoad?: number;
  scheduleStress?: number;
  utility?: number;
  blocked: boolean;
}

export interface Rfc001DecisionCenterProblemView {
  schemaId: 'tripnara.rfc001_problem_view@v1';
  tripId: string;
  problemId: string;
  problemSummary: Pick<
    DecisionProblem,
    | 'id'
    | 'tripId'
    | 'type'
    | 'title'
    | 'description'
    | 'status'
    | 'detectedBy'
    | 'detectedAt'
    | 'tripVersion'
    | 'affectedScope'
    | 'affectedScopeDisplay'
    | 'semanticKey'
    | 'sourceRefs'
    | 'assertionIds'
  >;
  rfc001Problem: Rfc001DecisionProblem;
  leadingPersona: Rfc001LeadingPersona;
  requiresUserConfirmation: boolean;
  candidates: Rfc001DecisionCenterCandidateView[];
  workspace?: DecisionWorkspace;
  record?: Rfc001DecisionRecord;
  planVersion?: PlanVersion;
  options: DecisionOption[];
  lineage: Rfc001DecisionLineageLink[];
  /** Ontology cascade — what this change will affect downstream */
  impactScopeView?: ImpactScopeView;
}

export interface Rfc001DecisionCenterTripView {
  schemaId: 'tripnara.rfc001_decision_center@v1';
  tripId: string;
  generatedAt: string;
  effectivePlanVersionId?: string;
  decisionRef?: {
    decisionId: string;
    problemId: string;
    workspaceId: string;
    runId: string;
    shadowMode: boolean;
  };
  problems: Rfc001DecisionCenterProblemView[];
  latestRun?: Rfc001DecisionRun;
  v15RecordMirror?: DecisionRecord;
  routing?: TripDecisionRoutingView;
}

const RFC001_TO_V15_STATUS: Record<
  Rfc001DecisionProblem['status'],
  DecisionProblemStatus
> = {
  OPEN: 'OPEN',
  EVALUATING: 'ASSESSING',
  WAITING_HUMAN: 'WAITING_DECISION',
  DECIDED: 'WAITING_DECISION',
  EXECUTING: 'ASSESSING',
  RESOLVED: 'RESOLVED',
  FAILED: 'DISMISSED',
};

export function resolveLeadingPersona(
  problem: Rfc001DecisionProblem,
): Rfc001LeadingPersona {
  if (problem.semanticCapability === 'WEATHER_ACTIVITY_PROHIBITED') return 'ABU';
  if (problem.semanticCapability === 'EXCESSIVE_DAILY_LOAD') return 'DRDRE';
  if (problem.type === 'FEASIBILITY_FAILURE') return 'ABU';
  if (problem.type === 'EXCESSIVE_LOAD') return 'DRDRE';
  return 'DECISION_CORE';
}

export function bridgeRfc001ProblemToAffectedScope(
  problem: Rfc001DecisionProblem,
): AffectedScope[] {
  const scopes: AffectedScope[] = [];
  for (const itemId of problem.affectedPlanItemIds) {
    const isWeather = problem.semanticCapability === 'WEATHER_ACTIVITY_PROHIBITED';
    scopes.push({
      scopeType: 'ITINERARY_ITEM',
      scopeId: itemId,
      impactType: 'BLOCKED',
      severity: 'HIGH',
      explanation: isWeather
        ? `行程项 ${itemId} 受恶劣天气/活动限制影响`
        : `行程项 ${itemId} 受道路关闭影响`,
    });
  }
  for (const ref of problem.affectedEntityRefs) {
    if (ref.kind === 'ROUTE_SEGMENT') {
      scopes.push({
        scopeType: 'ROUTE_SEGMENT',
        scopeId: ref.id,
        impactType: 'BLOCKED',
        severity: 'HIGH',
        explanation: `路段 ${ref.label ?? ref.id}`,
      });
    }
  }
  return scopes;
}

export function bridgeRfc001ProblemToDecisionProblemSummary(
  problem: Rfc001DecisionProblem,
  tripVersion: string,
): Rfc001DecisionCenterProblemView['problemSummary'] {
  const affectedScope = bridgeRfc001ProblemToAffectedScope(problem);
  const type: DecisionProblemType =
    problem.type === 'FEASIBILITY_FAILURE' ? 'INFEASIBILITY' : 'RISK';
  const isWeather = problem.semanticCapability === 'WEATHER_ACTIVITY_PROHIBITED';
  const isLoad =
    problem.semanticCapability === 'EXCESSIVE_DAILY_LOAD' ||
    problem.type === 'EXCESSIVE_LOAD';
  const loadDayIndex = isLoad ? resolveExcessiveDailyLoadDisplayDayIndex(problem) : undefined;
  const itemCount = problem.affectedPlanItemIds.length;
  const title = isWeather
    ? `天气 / 活动限制：${itemCount} 个行程项受影响`
    : isLoad
      ? `行程负荷过高：第 ${loadDayIndex ?? '?'} 日驾驶超时`
      : `道路 / 可行性：${itemCount} 个行程项受影响`;

  return {
    id: problem.problemId,
    tripId: problem.tripId,
    type,
    title,
    description: isWeather
      ? `恶劣天气 · urgency ${problem.urgency}`
      : isLoad
        ? `Dr.Dre 日程负荷 · urgency ${problem.urgency}`
        : `RFC-001 ${problem.type} · urgency ${problem.urgency}`,
    status: RFC001_TO_V15_STATUS[problem.status] ?? 'OPEN',
    detectedBy: 'GUARDIAN',
    detectedAt: problem.detectedAt,
    tripVersion,
    affectedScope,
    affectedScopeDisplay: affectedScope.map((s) => ({
      scopeType: s.scopeType,
      scopeId: s.scopeId,
      label:
        s.scopeType === 'ROUTE_SEGMENT'
          ? `路段 ${s.explanation?.replace(/^路段 /, '') ?? s.scopeId}`
          : `行程项 ${s.scopeId}`,
    })),
    semanticKey: resolveRfc001ProblemSemanticKey(problem),
    sourceRefs: [{ system: 'OFFICIAL_RULE', refId: problem.triggerEventId }],
    assertionIds: [],
  };
}

export function bridgeRoadAssertionToConstraintAssertion(
  assertion: WorldStateAssertion,
): ConstraintAssertion {
  const payload = assertion.payload as { roadId?: string; status?: string };
  return {
    id: assertion.assertionId,
    sourceSystem: 'OFFICIAL_RULE',
    sourceRefId: assertion.subjectRef.id,
    nature: 'HARD_CONSTRAINT',
    domain: 'ROUTE',
    enforcement: payload.status === 'CLOSED' ? 'BLOCK' : 'WARN',
    overridable: false,
    condition: `road.status=${payload.status ?? 'UNKNOWN'}`,
    conclusion: payload.status === 'CLOSED' ? '道路关闭' : '道路状态受限',
    proofs: assertion.source.evidenceRefs.map((ref) => ({
      evidenceSource: assertion.source.sourceType,
      id: ref,
      observedAt: assertion.observedAt,
      validUntil: assertion.validUntil,
      confidence: assertion.confidence,
      entity: payload.roadId,
      constraint: 'road.status',
      currentFact: payload.status,
    })),
  };
}

export function bridgeCandidatesToOptions(
  problemId: string,
  candidates: Rfc001RepairCandidate[],
  workspace?: DecisionWorkspace,
  record?: Rfc001DecisionRecord,
): DecisionOption[] {
  const cutoverBlocked = record ? !isEffectiveExecutable(record) : false;
  return candidates.map((c) => {
    const blocked = cutoverBlocked
      ? true
      : workspace
        ? workspace.constraintAssertions.some(
            (a) =>
              a.targetCandidateId === c.candidateId &&
              a.verdict === 'BLOCK' &&
              !a.overridable,
          )
        : false;
    return {
      id: c.candidateId,
      problemId,
      type: 'REPAIR',
      title: `候选 ${c.candidateId}`,
      description: `${c.generationMethod} · 意图保留 ${Math.round(c.estimatedIntentPreservation * 100)}%`,
      source: 'NEPTUNE',
      resolves: c.replacesPlanItemIds,
      tradeoffs: [
        {
          dimension: 'POI_COVERAGE',
          direction: 'IMPROVE',
          value: c.estimatedIntentPreservation,
          explanation: '体验意图保留',
        },
        {
          dimension: 'TIME',
          direction: c.estimatedAddedDurationMinutes >= 0 ? 'WORSEN' : 'IMPROVE',
          value: Math.abs(c.estimatedAddedDurationMinutes),
          unit: 'MINUTE',
          explanation: '行程时长变化',
        },
      ],
      executable: !blocked,
      requiresConfirmation: true,
      executionCapability: resolveRepairCandidateExecutionCapability(c),
      sourceRefId: c.candidateId,
    };
  });
}

export function bridgeCanonicalOptionPreview(
  view: Rfc001DecisionCenterProblemView,
  optionId: string,
): DecisionOptionPreviewResponse {
  const option = view.options.find((o) => o.id === optionId);
  if (!option) {
    throw new Error(`DECISION_OPTION_NOT_FOUND: ${optionId}`);
  }

  const candidate = view.workspace?.repairCandidates.find(
    (c) => c.candidateId === optionId,
  );

  const mutations: TripMutation[] = (candidate?.proposedOperations ?? []).map((op) => ({
    operation: op.kind === 'REMOVE_ITEM' ? 'REMOVE' : 'UPDATE',
    entityType: 'ITINERARY_ITEM',
    entityId:
      (op.parameters.itineraryItemId as string | undefined) ??
      op.targetRefs.find((r) => r.kind === 'PLAN_ITEM')?.id,
    after: op.parameters,
    semanticEffects: option.tradeoffs.slice(0, 2),
  }));

  return {
    problemId: view.problemId,
    optionId,
    tripId: view.tripId,
    tradeoffs: option.tradeoffs,
    proposedMutations: {
      mutationId: `preview_${view.problemId}_${optionId}`,
      tripId: view.tripId,
      versionBefore: view.problemSummary.tripVersion,
      versionAfter: view.problemSummary.tripVersion,
      createdBy: 'RFC001_CANONICAL',
      createdAt: new Date().toISOString(),
      operations: mutations,
    },
    authority: {
      decisionDomain: 'ROUTE',
      proposer: 'SYSTEM',
      requiredApprover: 'TRIP_OWNER',
      executionMode: 'EXPLICIT_CONFIRMATION',
      overridable: false,
    },
    executionCapability: candidate
      ? resolveRepairCandidateExecutionCapability(candidate)
      : 'GUIDED_MANUAL',
    generatedAt: new Date().toISOString(),
  };
}

export function buildCandidateViews(
  workspace: DecisionWorkspace,
  utilityByCandidate?: Record<string, number>,
): Rfc001DecisionCenterCandidateView[] {
  const ids = [
    'original',
    ...workspace.repairCandidates.map((c) => c.candidateId),
  ];
  return ids.map((candidateId) => {
    const repair = workspace.repairCandidates.find(
      (c) => c.candidateId === candidateId,
    );
    const abu = workspace.constraintAssertions.find(
      (a) => a.targetCandidateId === candidateId,
    );
    const dre = workspace.loadAssessments.find(
      (a) => a.targetCandidateId === candidateId,
    );
    const blocked = abu?.verdict === 'BLOCK' && !abu.overridable;
    return {
      candidateId,
      label: repair?.generationMethod ?? 'ORIGINAL',
      generationMethod: repair?.generationMethod ?? 'BASE_PLAN',
      intentPreservation:
        repair?.estimatedIntentPreservation ?? (candidateId === 'original' ? 1 : 0),
      estimatedAddedDurationMinutes: repair?.estimatedAddedDurationMinutes ?? 0,
      preservedIntentRefs: repair?.preservedIntentRefs ?? [],
      abuVerdict: abu?.verdict,
      physicalLoad: dre?.physicalLoad,
      scheduleStress: dre?.scheduleStress,
      utility: utilityByCandidate?.[candidateId],
      blocked: Boolean(blocked),
    };
  });
}

export function buildDecisionLineage(input: {
  triggerEventId?: string;
  snapshotId?: string;
  assertionId?: string;
  problem: Rfc001DecisionProblem;
  workspace?: DecisionWorkspace;
  record?: Rfc001DecisionRecord;
  planVersion?: PlanVersion;
  run?: Rfc001DecisionRun;
}): Rfc001DecisionLineageLink[] {
  const links: Rfc001DecisionLineageLink[] = [];
  if (input.triggerEventId) {
    links.push({ kind: 'EVENT', id: input.triggerEventId });
  }
  if (input.assertionId) {
    links.push({ kind: 'ASSERTION', id: input.assertionId });
  }
  if (input.snapshotId) {
    links.push({ kind: 'SNAPSHOT', id: input.snapshotId });
  }
  links.push({
    kind: 'PROBLEM',
    id: input.problem.problemId,
    at: input.problem.detectedAt,
  });
  if (input.workspace) {
    links.push({
      kind: 'WORKSPACE',
      id: input.workspace.workspaceId,
      at: input.workspace.createdAt,
    });
  }
  if (input.record) {
    links.push({
      kind: 'DECISION',
      id: input.record.decisionId,
      at: input.record.decidedAt,
    });
  }
  if (input.planVersion) {
    links.push({
      kind: 'PLAN_VERSION',
      id: input.planVersion.planVersionId,
      at: input.planVersion.createdAt,
    });
  }
  if (input.run) {
    links.push({ kind: 'EXECUTION', id: input.run.runId, at: input.run.createdAt });
  }
  return links;
}

export function bridgeRfc001RecordToV15Mirror(
  record: Rfc001DecisionRecord,
  tripId: string,
  opts?: {
    actualMutation?: TripMutationSet;
    tripVersionAfter?: string;
  },
): DecisionRecord {
  if (!isEffectiveExecutable(record)) {
    return {
      id: record.decisionId,
      tripId,
      problemId: record.problemId,
      selectedOptionId: record.selectedCandidateId ?? 'original',
      rejectedOptionIds: record.rejectedCandidates.map((r) => r.candidateId),
      decidedBy: [{ role: 'SYSTEM' }],
      authoritySnapshot: {
        decisionDomain: 'ROUTE',
        proposer: 'SYSTEM',
        requiredApprover: 'TRIP_OWNER',
        executionMode: 'EXPLICIT_CONFIRMATION',
        overridable: false,
      },
      reasons: [
        {
          code: record.cutoverReconciliation?.status ?? 'CUT_OVER_RECONCILED',
          text: record.cutoverReconciliation?.reason ?? 'cutover reconciliation',
          source: 'SYSTEM' as const,
        },
      ],
      decidedAt: record.decidedAt,
      tripVersionBefore: record.basePlanVersionId,
      tripVersionAfter: opts?.tripVersionAfter ?? record.effectivePlanVersionId,
      actualMutation: opts?.actualMutation,
      status: 'ROLLED_BACK',
      validationStatus: 'PENDING',
      idempotencyKey: `trip:${tripId}:decision:${record.decisionId}:apply-plan-version`,
    };
  }

  const status: DecisionRecord['status'] =
    record.recordStatus === 'PROPOSED'
      ? 'PROPOSED'
      : record.recordStatus === 'AUTHORIZED'
        ? 'APPROVED'
        : record.recordStatus === 'EFFECTIVE'
          ? 'EXECUTED'
          : record.recordStatus === 'ROLLED_BACK'
            ? 'ROLLED_BACK'
            : record.recordStatus === 'NEEDS_REPAIR'
              ? 'PROPOSED'
              : 'PROPOSED';

  return {
    id: record.decisionId,
    tripId,
    problemId: record.problemId,
    selectedOptionId: record.selectedCandidateId ?? 'original',
    rejectedOptionIds: record.rejectedCandidates.map((r) => r.candidateId),
    decidedBy: [{ role: 'SYSTEM' }],
    authoritySnapshot: {
      decisionDomain: 'ROUTE',
      proposer: 'SYSTEM',
      requiredApprover: 'TRIP_OWNER',
      executionMode: 'EXPLICIT_CONFIRMATION',
      overridable: false,
    },
    reasons: [
      ...record.reasonCodes.map((code) => ({
        code,
        text: code,
        source: 'SYSTEM' as const,
      })),
      {
        code: 'RFC001_LEDGER_SOURCE',
        text: `RFC-001 ledger ${record.decisionId}`,
        source: 'SYSTEM' as const,
      },
    ],
    decidedAt: record.decidedAt,
    tripVersionBefore: record.basePlanVersionId,
    tripVersionAfter: opts?.tripVersionAfter ?? record.effectivePlanVersionId,
    actualMutation: opts?.actualMutation,
    status,
    validationStatus: status === 'EXECUTED' ? 'PENDING' : 'PENDING',
    idempotencyKey: `trip:${tripId}:decision:${record.decisionId}:apply-plan-version`,
    needsRepair: record.recordStatus === 'NEEDS_REPAIR' ? true : undefined,
  };
}
