/**
 * Decision Space Authoritative Page Context builder.
 * Accepts ClientPageState refs only; re-fetches Decision / Snapshot / Constraints.
 *
 * Open queue SSOT = Gateway `listProblems` (queueOnly), NOT DecisionWorkspace rows.
 * DecisionWorkspace is only used for revision fingerprinting when present.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { DecisionEngineGatewayService } from '../../../decision-runtime/gateway/services/decision-engine-gateway.service';
import { TripContextSnapshotAssemblerService } from '../../../decision-runtime/snapshot/trip-context-snapshot.assembler.service';
import { UnifiedConstraintAssessmentService } from '../../../decision-runtime/constraints/services/unified-constraint-assessment.service';
import { DecisionWorkspaceService } from '../../guardian-decision-core/workspace/decision-workspace.service';
import type {
  UnifiedDecisionProblemDetailView,
  UnifiedDecisionProblemListItem,
  UnifiedDecisionOptionsView,
} from '../../../decision-runtime/gateway/contracts/unified-decision-ui.types';
import type {
  AuthoritativePageContext,
  AvailableAction,
  ClientPageState,
  ConstraintAssessmentRef,
  DecisionProblemRef,
  EntityProjection,
} from '../contracts/page-insight.types';
import type { InsuranceDecisionContext } from '../contracts/insurance-decision-context.types';
import { isRentalInsuranceProblem } from '../contracts/insurance-decision-context.types';
import type { VehicleDecisionContext } from '../contracts/vehicle-decision-context.types';
import { isVehicleRoadFitProblem } from '../contracts/vehicle-decision-context.types';
import {
  isGenericScheduleConflictProblem,
  toRecommendGatePreview,
  type RecommendGatePreview,
} from '../contracts/generic-conflict-ai';
import type { ContextHashVersionInputs } from './page-insight-context-hash.service';
import { InsuranceDecisionContextAssembler } from './insurance-decision-context.assembler';
import { VehicleDecisionContextAssembler } from './vehicle-decision-context.assembler';

/** Cap Gateway preview fan-out for Copilot evaluate latency. */
const MAX_OPTION_PREVIEWS = 4;
const PREVIEW_TIMEOUT_MS = 2500;
const COPILOT_PREVIEW_USER = 'copilot-context-builder';

export type FocusResolveStatus =
  | 'MATCHED_PROBLEM_ID'
  | 'MATCHED_INSTANCE_KEY'
  | 'FALLBACK_MOST_IMPORTANT'
  | 'SELECTED_TERMINAL'
  | 'SELECTED_NOT_IN_QUEUE'
  | 'NO_SELECTION_EMPTY_OPEN'
  | 'NO_SELECTION';

export interface FocusResolveDiag {
  clientSelectedRef?: string | null;
  resolveStatus: FocusResolveStatus;
  /** problemId actually used as focused (may differ from clientSelectedRef). */
  resolvedProblemId?: string | null;
  matchedVia?: 'problemId' | 'instanceKey' | 'fallback' | 'none';
  /** Selected id found in full gateway list but terminal. */
  selectedWorkflowStatus?: string | null;
  /** Whether DecisionWorkspace has a row for resolved problemId. */
  workspacePresentForFocused?: boolean;
  openProblemIds: string[];
  openInstanceKeys: string[];
}

export interface DecisionSpaceBuiltContext {
  authoritative: AuthoritativePageContext;
  versions: ContextHashVersionInputs;
  focusedProblem?: UnifiedDecisionProblemListItem;
  problemDetail?: UnifiedDecisionProblemDetailView;
  optionsView?: UnifiedDecisionOptionsView;
  openProblems: UnifiedDecisionProblemListItem[];
  /** Full gateway list (queue-admitted), including terminal statuses. */
  queueItems: UnifiedDecisionProblemListItem[];
  workspaceRevision?: number;
  focusDiag: FocusResolveDiag;
  /**
   * Present when focused problem is rental insurance — trip facts + completeness gate.
   * Assembled by Context Builder (deterministic); not by the LLM.
   */
  insuranceContext?: InsuranceDecisionContext;
  /** Present when focused problem is vehicle road-fit — primary Contextual Copilot example. */
  vehicleContext?: VehicleDecisionContext;
  /**
   * Gateway option previews for schedule/lunch conflicts — feeds recommend gate.
   * Empty when not a schedule conflict or all previews failed.
   */
  validatedPreviews?: RecommendGatePreview[];
  /** Effective plan version for canRecommendOption planVersion check. */
  planVersion?: string | null;
}

@Injectable()
export class DecisionSpacePageContextBuilder {
  private readonly logger = new Logger(DecisionSpacePageContextBuilder.name);

  constructor(
    private readonly gateway: DecisionEngineGatewayService,
    private readonly snapshotAssembler: TripContextSnapshotAssemblerService,
    private readonly workspaceService: DecisionWorkspaceService,
    @Optional() private readonly constraintAssessments?: UnifiedConstraintAssessmentService,
    @Optional() private readonly insuranceContextAssembler?: InsuranceDecisionContextAssembler,
    @Optional() private readonly vehicleContextAssembler?: VehicleDecisionContextAssembler,
  ) {}

  async build(tripId: string, client: ClientPageState): Promise<DecisionSpaceBuiltContext> {
    const snapshotRef = await this.snapshotAssembler.resolveSnapshotRef(tripId);

    let list;
    try {
      list = await this.gateway.listProblems(tripId);
    } catch (err) {
      this.logger.warn(
        `listProblems failed for ${tripId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      list = {
        schemaId: 'tripnara.unified_decision_problems@v2' as const,
        tripId,
        generatedAt: new Date().toISOString(),
        meta: {
          total: 0,
          openCount: 0,
          actionableCount: 0,
          occurrenceCount: 0,
          byEnforcement: {},
        },
        items: [] as UnifiedDecisionProblemListItem[],
      };
    }

    const queueItems = list.items;
    const openProblems = queueItems.filter((p) => isOpenWorkflow(p.workflowStatus));

    const focus = resolveFocusedProblem(client, openProblems, queueItems);
    let focusedProblem = focus.problem;

    if (
      focus.diag.clientSelectedRef &&
      focus.diag.resolveStatus !== 'MATCHED_PROBLEM_ID' &&
      focus.diag.resolveStatus !== 'MATCHED_INSTANCE_KEY'
    ) {
      this.logger.warn(
        `focus miss trip=${tripId} selected=${focus.diag.clientSelectedRef} status=${focus.diag.resolveStatus} openCount=${openProblems.length}`,
      );
    }

    let problemDetail: UnifiedDecisionProblemDetailView | undefined;
    let optionsView: UnifiedDecisionOptionsView | undefined;
    let workspaceRevision: number | undefined;
    let workspacePresent = false;

    const lookupId =
      focusedProblem?.problemId ??
      (focus.diag.resolveStatus === 'SELECTED_NOT_IN_QUEUE' ||
      focus.diag.resolveStatus === 'SELECTED_TERMINAL'
        ? focus.diag.clientSelectedRef ?? undefined
        : undefined);

    if (lookupId) {
      try {
        problemDetail = await this.gateway.getProblem(tripId, lookupId);
      } catch (err) {
        this.logger.warn(
          `getProblem ${lookupId} failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
      // Prefer detail's TravelCausalDecision (always freshly attached from trace)
      if (focusedProblem && problemDetail?.problem) {
        focusedProblem = {
          ...focusedProblem,
          travelCausalDecision:
            problemDetail.problem.travelCausalDecision ??
            problemDetail.travelCausalDecision ??
            focusedProblem.travelCausalDecision,
          causalDecisionCard:
            problemDetail.problem.causalDecisionCard ??
            problemDetail.causalDecisionCard ??
            focusedProblem.causalDecisionCard,
          causalTraceRef:
            problemDetail.problem.causalTraceRef ??
            problemDetail.causalTraceRef ??
            focusedProblem.causalTraceRef,
          causalStoryView:
            problemDetail.problem.causalStoryView ??
            problemDetail.causalStoryView ??
            focusedProblem.causalStoryView,
        };
      }
      if (focusedProblem) {
        try {
          optionsView = await this.gateway.getOptions(tripId, focusedProblem.problemId);
        } catch {
          // options optional
        }
      }
      try {
        const ws = await this.workspaceService.getByProblemId(tripId, lookupId);
        workspacePresent = !!ws;
        workspaceRevision = ws?.revision;
      } catch {
        workspaceRevision = undefined;
      }
    }

    const focusDiag: FocusResolveDiag = {
      ...focus.diag,
      workspacePresentForFocused: workspacePresent,
    };

    const decisionWorkspaceVersion = [
      list.generatedAt,
      focusedProblem?.problemId ?? '',
      focusedProblem?.evidenceSummary?.freshness ?? '',
      focusedProblem?.evidenceSummary?.count ?? 0,
      workspaceRevision ?? 0,
      openProblems.map((p) => p.problemId).join(','),
    ].join('::');

    let constraintVersion = String(snapshotRef.constraintsVersion);
    let assessmentRefs: ConstraintAssessmentRef[] = [];
    if (this.constraintAssessments && focusedProblem) {
      try {
        const bundle = await this.constraintAssessments.buildBundle(tripId, {});
        constraintVersion = bundle.generatedAt ?? constraintVersion;
        assessmentRefs = (bundle.items ?? [])
          .filter(
            (item) =>
              !item.problemIds?.length ||
              item.problemIds.includes(focusedProblem.problemId),
          )
          .slice(0, 20)
          .map((item) => ({
            assessmentId: item.constraintKey,
            payload: item,
          }));
        constraintVersion =
          typeof bundle.contextVersion === 'string'
            ? bundle.contextVersion
            : JSON.stringify(bundle.contextVersion ?? constraintVersion);
      } catch (err) {
        this.logger.debug(
          `constraint assessments skipped: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    const decisionProblems: DecisionProblemRef[] = openProblems.map((p) => ({
      problemId: p.problemId,
      payload: p,
    }));

    const selectedEntities: EntityProjection[] = focusedProblem
      ? [
          {
            ref: {
              entityType: 'DECISION_PROBLEM',
              entityId: focusedProblem.problemId,
            },
            payload: problemDetail ?? focusedProblem,
          },
        ]
      : [];

    const availableActions = buildAvailableActions(focusedProblem, optionsView);

    const versions: ContextHashVersionInputs = {
      relevantTripProjectionVersion: snapshotRef.revision,
      relevantConstraintVersion: constraintVersion,
      relevantDecisionWorkspaceVersion: decisionWorkspaceVersion,
      relevantWorldStateVersion: snapshotRef.snapshotId,
      draftRevision: null,
    };

    const authoritative: AuthoritativePageContext = {
      tripSnapshot: {
        tripVersion: snapshotRef.revision,
        payload: snapshotRef,
      },
      relevantWorldState: {
        worldStateVersion: snapshotRef.snapshotId,
      },
      constraintAssessments: assessmentRefs,
      decisionProblems,
      selectedEntities,
      availableActions,
      pageFocus: {
        pageId: client.pageId,
        lifecycle: client.lifecycle,
        selectedRefs: client.selectedRefs ?? [],
        viewport: client.viewport,
        recentAction: client.recentAction,
      },
    };

    let insuranceContext: InsuranceDecisionContext | undefined;
    let vehicleContext: VehicleDecisionContext | undefined;
    let validatedPreviews: RecommendGatePreview[] | undefined;
    const planVersion = snapshotRef.effectivePlanVersionId ?? null;

    if (
      focusedProblem &&
      this.insuranceContextAssembler &&
      isRentalInsuranceProblem({
        problemId: focusedProblem.problemId,
        semanticKey: focusedProblem.semanticKey,
        domain: focusedProblem.decisionCase?.domain,
      })
    ) {
      try {
        insuranceContext = await this.insuranceContextAssembler.assemble(tripId);
      } catch (err) {
        this.logger.warn(
          `insurance context assemble failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    } else if (
      focusedProblem &&
      this.vehicleContextAssembler &&
      isVehicleRoadFitProblem({
        problemId: focusedProblem.problemId,
        semanticKey: focusedProblem.semanticKey,
        domain: focusedProblem.decisionCase?.domain,
      })
    ) {
      try {
        vehicleContext = await this.vehicleContextAssembler.assemble(tripId);
      } catch (err) {
        this.logger.warn(
          `vehicle context assemble failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    } else if (
      focusedProblem &&
      optionsView &&
      isGenericScheduleConflictProblem({
        problemId: focusedProblem.problemId,
        semanticKey: focusedProblem.semanticKey,
        type: focusedProblem.type,
        title: focusedProblem.title,
        hasDecisionCase: !!focusedProblem.decisionCase,
      })
    ) {
      validatedPreviews = await this.collectScheduleConflictPreviews({
        tripId,
        problemId: focusedProblem.problemId,
        optionsView,
        planVersion,
      });
    }

    return {
      authoritative,
      versions,
      focusedProblem,
      problemDetail,
      optionsView,
      openProblems,
      queueItems,
      workspaceRevision,
      focusDiag,
      insuranceContext,
      vehicleContext,
      validatedPreviews,
      planVersion,
    };
  }

  /**
   * Preview candidate options via Gateway; map to RecommendGatePreview for selector gate.
   */
  async collectScheduleConflictPreviews(input: {
    tripId: string;
    problemId: string;
    optionsView: UnifiedDecisionOptionsView;
    planVersion?: string | null;
  }): Promise<RecommendGatePreview[]> {
    const candidates = (input.optionsView.actions ?? [])
      .filter((a) => a.allowed && a.type !== 'DEFER')
      .slice(0, MAX_OPTION_PREVIEWS);

    if (!candidates.length) return [];

    const settled = await Promise.all(
      candidates.map(async (action) => {
        try {
          const preview = await Promise.race([
            this.gateway.previewOption(
              input.tripId,
              input.problemId,
              action.actionId,
              COPILOT_PREVIEW_USER,
            ),
            new Promise<null>((resolve) => {
              const t = setTimeout(() => resolve(null), PREVIEW_TIMEOUT_MS);
              t.unref?.();
            }),
          ]);
          if (!preview) {
            this.logger.debug(
              `preview timeout option=${action.actionId} problem=${input.problemId}`,
            );
            return null;
          }
          return toRecommendGatePreview({
            problemId: input.problemId,
            planVersion: input.planVersion,
            preview: {
              problemId: preview.problemId,
              actionId: preview.actionId,
              action: {
                allowed: preview.action?.allowed ?? action.allowed,
                title: preview.action?.title ?? action.title,
              },
              repairPreview: preview.repairPreview as Record<string, unknown> | undefined,
              predictedImpact: preview.predictedImpact,
            },
          });
        } catch (err) {
          this.logger.debug(
            `preview failed option=${action.actionId}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
          return null;
        }
      }),
    );

    return settled.filter((p): p is RecommendGatePreview => p != null);
  }
}

export function isOpenWorkflow(status: string): boolean {
  return status !== 'RESOLVED' && status !== 'DECIDED' && status !== 'DISMISSED';
}

export function clientSelectedProblemRef(client: ClientPageState): string | undefined {
  return (client.selectedRefs ?? []).find(
    (r) =>
      r.entityType === 'DECISION_PROBLEM' ||
      r.entityType === 'DECISION_CASE',
  )?.entityId;
}

/** Match by problemId first, then instanceKey (iOS list id). */
export function findProblemByRef(
  items: UnifiedDecisionProblemListItem[],
  ref: string,
): { problem: UnifiedDecisionProblemListItem; via: 'problemId' | 'instanceKey' } | undefined {
  const byId = items.find((p) => p.problemId === ref);
  if (byId) return { problem: byId, via: 'problemId' };
  const byKey = items.find((p) => p.instanceKey === ref);
  if (byKey) return { problem: byKey, via: 'instanceKey' };
  return undefined;
}

export function resolveFocusedProblem(
  client: ClientPageState,
  openProblems: UnifiedDecisionProblemListItem[],
  queueItems: UnifiedDecisionProblemListItem[],
): {
  problem?: UnifiedDecisionProblemListItem;
  diag: FocusResolveDiag;
} {
  const selected = clientSelectedProblemRef(client) ?? null;
  const baseDiag = (): FocusResolveDiag => ({
    clientSelectedRef: selected,
    resolveStatus: 'NO_SELECTION',
    resolvedProblemId: null,
    matchedVia: 'none',
    openProblemIds: openProblems.map((p) => p.problemId),
    openInstanceKeys: openProblems.map((p) => p.instanceKey),
  });

  if (selected) {
    const inOpen = findProblemByRef(openProblems, selected);
    if (inOpen) {
      return {
        problem: inOpen.problem,
        diag: {
          ...baseDiag(),
          resolveStatus:
            inOpen.via === 'problemId' ? 'MATCHED_PROBLEM_ID' : 'MATCHED_INSTANCE_KEY',
          resolvedProblemId: inOpen.problem.problemId,
          matchedVia: inOpen.via,
        },
      };
    }

    const inQueue = findProblemByRef(queueItems, selected);
    if (inQueue && !isOpenWorkflow(inQueue.problem.workflowStatus)) {
      return {
        problem: undefined,
        diag: {
          ...baseDiag(),
          resolveStatus: 'SELECTED_TERMINAL',
          resolvedProblemId: inQueue.problem.problemId,
          matchedVia: inQueue.via,
          selectedWorkflowStatus: inQueue.problem.workflowStatus,
        },
      };
    }

    // Explicit selection not in Gateway queue open set — do NOT silently swap
    return {
      problem: undefined,
      diag: {
        ...baseDiag(),
        resolveStatus: 'SELECTED_NOT_IN_QUEUE',
        resolvedProblemId: null,
        matchedVia: 'none',
        selectedWorkflowStatus: inQueue?.problem.workflowStatus ?? null,
      },
    };
  }

  if (!openProblems.length) {
    return {
      problem: undefined,
      diag: { ...baseDiag(), resolveStatus: 'NO_SELECTION_EMPTY_OPEN' },
    };
  }

  const fallbackId = selectMostImportantProblemId(openProblems);
  const fallback = openProblems.find((p) => p.problemId === fallbackId);
  return {
    problem: fallback,
    diag: {
      ...baseDiag(),
      resolveStatus: 'FALLBACK_MOST_IMPORTANT',
      resolvedProblemId: fallback?.problemId ?? null,
      matchedVia: 'fallback',
    },
  };
}

/** Deterministic priority — no new rules; uses existing enforcement / requiredness. */
export function selectMostImportantProblemId(
  problems: UnifiedDecisionProblemListItem[],
): string | undefined {
  if (!problems.length) return undefined;
  const ranked = [...problems].sort((a, b) => scoreProblem(b) - scoreProblem(a));
  return ranked[0]?.problemId;
}

function scoreProblem(p: UnifiedDecisionProblemListItem): number {
  let score = 0;
  const req = p.decisionCase?.requiredness;
  if (req === 'BLOCKING') score += 100;
  else if (req === 'IMPORTANT') score += 60;
  else if (req === 'OPTIONAL') score += 20;

  if (p.enforcement === 'BLOCK') score += 50;
  else if (p.enforcement === 'REQUIRE_ADJUSTMENT' || p.enforcement === 'REQUIRE_CONFIRMATION')
    score += 30;
  else if (p.enforcement === 'WARN') score += 10;

  if (p.actionability?.requiresAction) score += 15;
  if (p.decisionCase?.uiGroup === 'MUST_CONFIRM') score += 25;
  else if (p.decisionCase?.uiGroup === 'IMPORTANT_CHOICE') score += 15;

  return score;
}

function buildAvailableActions(
  problem: UnifiedDecisionProblemListItem | undefined,
  optionsView: UnifiedDecisionOptionsView | undefined,
): AvailableAction[] {
  if (!problem) return [];
  const actions: AvailableAction[] = [
    {
      kind: 'PREVIEW',
      actionType: 'OPEN_DECISION',
      ref: `decision-problem:${problem.problemId}`,
    },
    {
      kind: 'NAVIGATION',
      actionType: 'OPEN_DECISION_SPACE',
      ref: `decision-space:${problem.problemId}`,
    },
  ];
  if ((optionsView?.actions?.length ?? 0) > 1) {
    actions.push({
      kind: 'PREVIEW',
      actionType: 'COMPARE_OPTIONS',
      ref: `decision-problem:${problem.problemId}`,
    });
  }
  return actions;
}
