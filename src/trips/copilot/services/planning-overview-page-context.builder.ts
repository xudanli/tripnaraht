/**
 * Planning Overview Authoritative Page Context builder.
 * Trip-level: gateway queue + feasibility fast report. Navigation only.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { DecisionEngineGatewayService } from '../../../decision-runtime/gateway/services/decision-engine-gateway.service';
import { FeasibilityReportService } from '../../trip-constraint-solver/services/feasibility-report.service';
import { TripContextSnapshotAssemblerService } from '../../../decision-runtime/snapshot/trip-context-snapshot.assembler.service';
import type { UnifiedDecisionProblemListItem } from '../../../decision-runtime/gateway/contracts/unified-decision-ui.types';
import type {
  AuthoritativePageContext,
  AvailableAction,
  ClientPageState,
} from '../contracts/page-insight.types';
import { selectMostImportantProblemId } from './decision-space-page-context.builder';
import type { ContextHashVersionInputs } from './page-insight-context-hash.service';

export interface OverviewContextGate {
  ok: boolean;
  code?: 'CONTEXT_MISSING';
  missing: string[];
}

export type OverviewSeverity = 'CLEAR' | 'ATTENTION' | 'BLOCKING';

export interface PlanningOverviewBuiltContext {
  authoritative: AuthoritativePageContext;
  versions: ContextHashVersionInputs;
  gate: OverviewContextGate;
  severity: OverviewSeverity;
  openProblemCount: number;
  mustConfirmCount: number;
  importantChoiceCount: number;
  feasibilityMustHandle: number;
  feasibilitySuggestAdjust: number;
  canStartExecute?: boolean;
  gateExecuteBlocked: boolean;
  topProblem?: UnifiedDecisionProblemListItem;
  topBlockerTitle?: string;
  unlockHint?: string;
  vehicleRelatedOpen: boolean;
  routeRelatedOpen: boolean;
  lodgingRelatedOpen: boolean;
  allowedFactTokens: string[];
}

@Injectable()
export class PlanningOverviewPageContextBuilder {
  private readonly logger = new Logger(PlanningOverviewPageContextBuilder.name);

  constructor(
    @Optional() private readonly gateway?: DecisionEngineGatewayService,
    @Optional() private readonly feasibility?: FeasibilityReportService,
    @Optional() private readonly snapshotAssembler?: TripContextSnapshotAssemblerService,
  ) {}

  async build(
    tripId: string,
    client: ClientPageState,
  ): Promise<PlanningOverviewBuiltContext> {
    const missing: string[] = [];
    if (client.pageMode !== 'PLANNING_OVERVIEW') missing.push('pageMode');
    if (client.insightScope !== 'TRIP') missing.push('insightScope');
    if (!this.gateway) missing.push('decisionGateway');

    const gate: OverviewContextGate = {
      ok: missing.length === 0,
      code: missing.length ? 'CONTEXT_MISSING' : undefined,
      missing,
    };

    let snapshotRef: Awaited<
      ReturnType<TripContextSnapshotAssemblerService['resolveSnapshotRef']>
    > = {
      snapshotId: 'unknown',
      revision: '0',
      constraintsVersion: 0,
    };
    try {
      if (this.snapshotAssembler) {
        snapshotRef = await this.snapshotAssembler.resolveSnapshotRef(tripId);
      }
    } catch (err) {
      this.logger.warn(`snapshot ref failed: ${(err as Error).message}`);
    }

    const versions: ContextHashVersionInputs = {
      relevantTripProjectionVersion:
        snapshotRef.effectivePlanVersionId ?? `rev_${snapshotRef.revision}`,
      relevantConstraintVersion: String(snapshotRef.constraintsVersion),
      relevantDecisionWorkspaceVersion: undefined,
      relevantWorldStateVersion: undefined,
    };

    let openProblems: UnifiedDecisionProblemListItem[] = [];
    let openProblemCount = 0;
    let mustConfirmCount = 0;
    let importantChoiceCount = 0;
    let topProblem: UnifiedDecisionProblemListItem | undefined;
    let vehicleRelatedOpen = false;
    let routeRelatedOpen = false;
    let lodgingRelatedOpen = false;

    if (this.gateway && gate.ok) {
      try {
        const list = await this.gateway.listProblems(tripId);
        openProblems = (list.items ?? []).filter(
          (p) => !['RESOLVED', 'DISMISSED'].includes(p.workflowStatus),
        );
        openProblemCount = list.meta?.openCount ?? openProblems.length;
        mustConfirmCount = openProblems.filter(
          (p) => p.decisionCase?.uiGroup === 'MUST_CONFIRM',
        ).length;
        importantChoiceCount = openProblems.filter(
          (p) => p.decisionCase?.uiGroup === 'IMPORTANT_CHOICE',
        ).length;
        const topId = selectMostImportantProblemId(openProblems);
        topProblem = openProblems.find((p) => p.problemId === topId);
        vehicleRelatedOpen = openProblems.some((p) =>
          isDomain(p, ['TRANSPORT', 'VEHICLE', 'INSURANCE']),
        );
        routeRelatedOpen = openProblems.some((p) => isDomain(p, ['ROUTE', 'ROAD']));
        lodgingRelatedOpen = openProblems.some((p) =>
          isDomain(p, ['LODGING', 'ACCOMMODATION', 'HOTEL']),
        );
        versions.relevantDecisionWorkspaceVersion = `open:${openProblemCount}:mc:${mustConfirmCount}:ic:${importantChoiceCount}`;
      } catch (err) {
        this.logger.warn(`listProblems failed: ${(err as Error).message}`);
        if (gate.ok) {
          gate.ok = false;
          gate.code = 'CONTEXT_MISSING';
          gate.missing = [...gate.missing, 'decisionQueue'];
        }
      }
    }

    let feasibilityMustHandle = 0;
    let feasibilitySuggestAdjust = 0;
    let canStartExecute: boolean | undefined;
    let gateExecuteBlocked = false;
    let topIssueMessage: string | undefined;

    if (this.feasibility && gate.ok) {
      try {
        const report = await this.feasibility.getReportFast(tripId);
        feasibilityMustHandle = report.summary?.mustHandle ?? 0;
        feasibilitySuggestAdjust =
          (report.summary?.suggestAdjust ?? 0) + (report.summary?.pendingConfirm ?? 0);
        canStartExecute = report.canStartExecute;
        gateExecuteBlocked =
          report.gateExecute?.blocked === true ||
          report.verdict?.status === 'NOT_EXECUTABLE' ||
          (feasibilityMustHandle > 0 && canStartExecute === false);
        const hardIssue = (report.issues ?? []).find(
          (i: { priority?: string }) => i.priority === 'must_handle',
        ) as { message?: string; title?: string } | undefined;
        topIssueMessage = hardIssue?.message || hardIssue?.title;
        versions.relevantConstraintVersion =
          versions.relevantConstraintVersion ??
          `feas:mh:${feasibilityMustHandle}:sa:${feasibilitySuggestAdjust}`;
      } catch (err) {
        this.logger.warn(`getReportFast failed: ${(err as Error).message}`);
      }
    }

    const severity = deriveSeverity({
      mustConfirmCount,
      importantChoiceCount,
      feasibilityMustHandle,
      gateExecuteBlocked,
      topProblem,
    });

    const topBlockerTitle =
      topProblem?.title ||
      topIssueMessage ||
      (mustConfirmCount > 0 ? '有必须确认的决策' : undefined);

    const unlockHint = buildUnlockHint({
      topProblem,
      vehicleRelatedOpen,
      routeRelatedOpen,
    });

    const allowedFactTokens = collectTokens({
      openProblemCount,
      mustConfirmCount,
      importantChoiceCount,
      feasibilityMustHandle,
      feasibilitySuggestAdjust,
      topBlockerTitle,
      unlockHint,
      topProblem,
    });

    const availableActions: AvailableAction[] = [];
    if (topProblem) {
      availableActions.push({
        actionType: 'OPEN_DECISION_CASE',
        ref: `decision-problem:${topProblem.problemId}`,
        kind: 'NAVIGATION',
      });
      availableActions.push({
        actionType: 'START_SEQUENTIAL_PROCESSING',
        ref: `decision-queue:start:${topProblem.problemId}`,
        kind: 'NAVIGATION',
      });
    }
    availableActions.push({
      actionType: 'OPEN_READINESS_DETAIL',
      ref: 'readiness:overall',
      kind: 'NAVIGATION',
    });
    const dayNum = topProblemAffectedDay(topProblem);
    if (dayNum != null) {
      availableActions.push({
        actionType: 'OPEN_DAY_EDITOR',
        ref: `day:${dayNum}`,
        kind: 'NAVIGATION',
      });
    }

    const authoritative: AuthoritativePageContext = {
      tripSnapshot: {
        tripVersion: versions.relevantTripProjectionVersion,
        payload: { snapshotId: snapshotRef.snapshotId },
      },
      relevantWorldState: {
        worldStateVersion: versions.relevantWorldStateVersion ?? 'none',
      },
      constraintAssessments: [],
      decisionProblems: topProblem
        ? [{ problemId: topProblem.problemId, payload: topProblem }]
        : [],
      selectedEntities: [],
      availableActions,
      pageFocus: {
        pageId: client.pageId,
        lifecycle: client.lifecycle,
        selectedRefs: client.selectedRefs ?? [],
        viewport: client.viewport,
        recentAction: client.recentAction,
      },
    };

    return {
      authoritative,
      versions,
      gate,
      severity,
      openProblemCount,
      mustConfirmCount,
      importantChoiceCount,
      feasibilityMustHandle,
      feasibilitySuggestAdjust,
      canStartExecute,
      gateExecuteBlocked,
      topProblem,
      topBlockerTitle,
      unlockHint,
      vehicleRelatedOpen,
      routeRelatedOpen,
      lodgingRelatedOpen,
      allowedFactTokens,
    };
  }
}

function isDomain(
  p: UnifiedDecisionProblemListItem,
  domains: string[],
): boolean {
  const d = String(p.decisionCase?.domain ?? p.dimension ?? '').toUpperCase();
  const key = String(p.semanticKey ?? '').toUpperCase();
  return domains.some((x) => d.includes(x) || key.includes(x));
}

function deriveSeverity(input: {
  mustConfirmCount: number;
  importantChoiceCount: number;
  feasibilityMustHandle: number;
  gateExecuteBlocked: boolean;
  topProblem?: UnifiedDecisionProblemListItem;
}): OverviewSeverity {
  const blocking =
    input.mustConfirmCount > 0 ||
    input.gateExecuteBlocked ||
    input.feasibilityMustHandle > 0 ||
    input.topProblem?.decisionCase?.requiredness === 'BLOCKING' ||
    input.topProblem?.enforcement === 'BLOCK';
  if (blocking) return 'BLOCKING';
  if (
    input.importantChoiceCount > 0 ||
    input.topProblem?.decisionCase?.uiGroup === 'IMPORTANT_CHOICE'
  ) {
    return 'ATTENTION';
  }
  return 'CLEAR';
}

function buildUnlockHint(input: {
  topProblem?: UnifiedDecisionProblemListItem;
  vehicleRelatedOpen: boolean;
  routeRelatedOpen: boolean;
}): string | undefined {
  if (input.vehicleRelatedOpen) {
    return '先确认车型，系统才能完成道路验证。';
  }
  if (input.routeRelatedOpen) {
    return '先确认路线，后续日程才能定稿。';
  }
  const title = input.topProblem?.title;
  if (title) return `处理「${title}」后可继续后续确认。`;
  return undefined;
}

function topProblemAffectedDay(
  p?: UnifiedDecisionProblemListItem,
): number | undefined {
  if (!p) return undefined;
  const dayIds = p.scope?.dayIds;
  if (dayIds?.length) return dayIds[0];
  return undefined;
}

function collectTokens(input: {
  openProblemCount: number;
  mustConfirmCount: number;
  importantChoiceCount: number;
  feasibilityMustHandle: number;
  feasibilitySuggestAdjust: number;
  topBlockerTitle?: string;
  unlockHint?: string;
  topProblem?: UnifiedDecisionProblemListItem;
}): string[] {
  const tokens = new Set<string>();
  for (const n of [
    input.openProblemCount,
    input.mustConfirmCount,
    input.importantChoiceCount,
    input.feasibilityMustHandle,
    input.feasibilitySuggestAdjust,
  ]) {
    tokens.add(String(n));
  }
  if (input.topBlockerTitle) tokens.add(input.topBlockerTitle);
  if (input.unlockHint) tokens.add(input.unlockHint);
  if (input.topProblem?.title) tokens.add(input.topProblem.title);
  if (input.topProblem?.summary) tokens.add(input.topProblem.summary);
  tokens.add('车型');
  tokens.add('道路验证');
  tokens.add('住宿');
  tokens.add('路线');
  return [...tokens];
}
