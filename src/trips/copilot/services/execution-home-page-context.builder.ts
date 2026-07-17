/**
 * Execution Home Authoritative Page Context builder.
 * Real-time: delay + next window + risks + execution queue. No experience optimization.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { DecisionEngineGatewayService } from '../../../decision-runtime/gateway/services/decision-engine-gateway.service';
import { ExecutionAdvisoryService } from '../../trip-constraint-solver/services/execution-advisory.service';
import { ActiveRiskAggregationService } from '../../execution-risk-center/services/active-risk-aggregation.service';
import { TripContextSnapshotAssemblerService } from '../../../decision-runtime/snapshot/trip-context-snapshot.assembler.service';
import type { UnifiedDecisionProblemListItem } from '../../../decision-runtime/gateway/contracts/unified-decision-ui.types';
import type { ActiveRisk } from '../../execution-risk-center/types/execution-risk.types';
import type {
  AuthoritativePageContext,
  AvailableAction,
  ClientPageState,
} from '../contracts/page-insight.types';
import {
  EXEC_DELAY_ATTENTION_MINUTES,
  EXEC_DELAY_INTERVENTION_MINUTES,
} from '../contracts/execution-home-ai';
import type { ContextHashVersionInputs } from './page-insight-context-hash.service';
import { selectMostImportantProblemId } from './decision-space-page-context.builder';

const COPILOT_USER = 'copilot-context-builder';

export interface ExecContextGate {
  ok: boolean;
  code?: 'CONTEXT_MISSING';
  missing: string[];
}

export type ExecSeverity = 'CLEAR' | 'ATTENTION' | 'INTERVENTION';

export interface ExecutionHomeBuiltContext {
  authoritative: AuthoritativePageContext;
  versions: ContextHashVersionInputs;
  gate: ExecContextGate;
  severity: ExecSeverity;
  tripStatus?: string;
  delayMinutes: number;
  advisoryVerdict?: string;
  advisoryHeadline?: string;
  nextActivityLabel?: string;
  nextActivityStart?: string;
  interventionDeadline?: string;
  topRisk?: {
    riskId: string;
    level: string;
    executionGate?: string;
    summary: string;
    actionDeadline?: string;
  };
  topProblem?: UnifiedDecisionProblemListItem;
  blockingDecisionCount: number;
  highRiskCount: number;
  missWindowRisk: boolean;
  allowedFactTokens: string[];
}

@Injectable()
export class ExecutionHomePageContextBuilder {
  private readonly logger = new Logger(ExecutionHomePageContextBuilder.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly gateway?: DecisionEngineGatewayService,
    @Optional() private readonly advisory?: ExecutionAdvisoryService,
    @Optional() private readonly risks?: ActiveRiskAggregationService,
    @Optional() private readonly snapshotAssembler?: TripContextSnapshotAssemblerService,
  ) {}

  async build(
    tripId: string,
    client: ClientPageState,
  ): Promise<ExecutionHomeBuiltContext> {
    const missing: string[] = [];
    if (client.pageMode !== 'EXECUTION_HOME') missing.push('pageMode');
    if (client.insightScope !== 'EXECUTION') missing.push('insightScope');

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { status: true, metadata: true, startDate: true },
    });
    const tripStatus = String(trip?.status ?? '');
    if (!trip) missing.push('trip');
    if (client.lifecycle !== 'TRAVELING' && tripStatus !== 'TRAVELING') {
      missing.push('lifecycle');
    }

    const gate: ExecContextGate = {
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

    const meta = (trip?.metadata ?? {}) as Record<string, unknown>;
    let delayMinutes =
      typeof meta.inTripDelayMinutes === 'number' ? meta.inTripDelayMinutes : 0;

    let advisoryVerdict: string | undefined;
    let advisoryHeadline: string | undefined;
    if (this.advisory && gate.ok) {
      try {
        const adv = await this.advisory.getAdvisory(tripId, COPILOT_USER);
        delayMinutes = adv.currentState?.delayMinutes ?? delayMinutes;
        advisoryVerdict = adv.verdict?.status;
        advisoryHeadline = adv.verdict?.headline;
      } catch (err) {
        this.logger.debug(`advisory skipped: ${(err as Error).message}`);
      }
    }

    const next = await this.resolveNextActivity(tripId);
    let missWindowRisk = false;
    if (next.startTime && delayMinutes >= EXEC_DELAY_ATTENTION_MINUTES) {
      missWindowRisk = delayMinutes >= EXEC_DELAY_INTERVENTION_MINUTES;
    }

    let topRisk: ExecutionHomeBuiltContext['topRisk'];
    let highRiskCount = 0;
    let interventionDeadline: string | undefined;
    if (this.risks && gate.ok) {
      try {
        const list = await this.risks.listRisks(tripId, COPILOT_USER);
        const ranked = [...list].sort(
          (a, b) => riskRank(b) - riskRank(a),
        );
        highRiskCount = ranked.filter(
          (r) => r.level === 'HIGH' || r.level === 'CRITICAL',
        ).length;
        const primary = ranked[0];
        if (primary) {
          topRisk = {
            riskId: primary.id,
            level: primary.level,
            executionGate: primary.executionGate,
            summary: primary.summary || primary.title || primary.code,
            actionDeadline: primary.actionDeadline,
          };
          interventionDeadline = primary.actionDeadline;
        }
      } catch (err) {
        this.logger.debug(`risks skipped: ${(err as Error).message}`);
      }
    }

    let topProblem: UnifiedDecisionProblemListItem | undefined;
    let blockingDecisionCount = 0;
    if (this.gateway && gate.ok) {
      try {
        const list = await this.gateway.listProblems(tripId);
        const open = (list.items ?? []).filter(
          (p) => !['RESOLVED', 'DISMISSED'].includes(p.workflowStatus),
        );
        blockingDecisionCount = open.filter(
          (p) =>
            p.enforcement === 'BLOCK' ||
            p.decisionCase?.uiGroup === 'MUST_CONFIRM' ||
            p.decisionCase?.requiredness === 'BLOCKING',
        ).length;
        const topId = selectMostImportantProblemId(open);
        topProblem = open.find((p) => p.problemId === topId);
        const card = topProblem?.causalDecisionCard as
          | { interventionDeadline?: string; latestActBy?: string }
          | undefined;
        interventionDeadline =
          interventionDeadline ??
          card?.interventionDeadline ??
          card?.latestActBy;
      } catch (err) {
        this.logger.warn(`listProblems failed: ${(err as Error).message}`);
      }
    }

    const severity = deriveSeverity({
      delayMinutes,
      advisoryVerdict,
      topRisk,
      blockingDecisionCount,
      missWindowRisk,
      highRiskCount,
    });

    const versions: ContextHashVersionInputs = {
      relevantTripProjectionVersion:
        snapshotRef.effectivePlanVersionId ?? `rev_${snapshotRef.revision}`,
      relevantWorldStateVersion: `delay:${delayMinutes}:risk:${topRisk?.level ?? 'none'}:adv:${advisoryVerdict ?? 'none'}`,
      relevantDecisionWorkspaceVersion: topProblem
        ? `prob:${topProblem.problemId}`
        : `open_block:${blockingDecisionCount}`,
    };

    const allowedFactTokens = collectTokens({
      delayMinutes,
      next,
      topRisk,
      advisoryHeadline,
      interventionDeadline,
      topProblem,
    });

    const availableActions: AvailableAction[] = [];
    if (topRisk) {
      availableActions.push({
        actionType: 'ACKNOWLEDGE_RISK',
        ref: `execution-risk:${topRisk.riskId}`,
        kind: 'COMMAND',
      });
      availableActions.push({
        actionType: 'PREVIEW_PLAN_CHANGE',
        ref: `execution-risk-preview:${topRisk.riskId}`,
        kind: 'PREVIEW',
      });
    }
    if (topProblem) {
      availableActions.push({
        actionType: 'OPEN_DECISION',
        ref: `decision-problem:${topProblem.problemId}`,
        kind: 'PREVIEW',
      });
    }

    const authoritative: AuthoritativePageContext = {
      tripSnapshot: {
        tripVersion: versions.relevantTripProjectionVersion,
        payload: { tripStatus, delayMinutes },
      },
      relevantWorldState: {
        worldStateVersion: versions.relevantWorldStateVersion ?? 'none',
        payload: { topRisk, advisoryVerdict },
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
      tripStatus,
      delayMinutes,
      advisoryVerdict,
      advisoryHeadline,
      nextActivityLabel: next.label,
      nextActivityStart: next.startTime,
      interventionDeadline,
      topRisk,
      topProblem,
      blockingDecisionCount,
      highRiskCount,
      missWindowRisk,
      allowedFactTokens,
    };
  }

  private async resolveNextActivity(tripId: string): Promise<{
    label?: string;
    startTime?: string;
  }> {
    const today = await this.prisma.tripDay.findFirst({
      where: { tripId },
      orderBy: { date: 'asc' },
      include: {
        ItineraryItem: {
          orderBy: [{ order: 'asc' }, { startTime: 'asc' }],
          include: { Place: { select: { nameCN: true, nameEN: true } } },
        },
      },
    });
    // Prefer calendar-today day if multiple
    const days = await this.prisma.tripDay.findMany({
      where: { tripId },
      orderBy: { date: 'asc' },
      include: {
        ItineraryItem: {
          orderBy: [{ order: 'asc' }, { startTime: 'asc' }],
          include: { Place: { select: { nameCN: true, nameEN: true } } },
        },
      },
    });
    const now = new Date();
    const todayIso = now.toISOString().slice(0, 10);
    const day =
      days.find((d) => d.date.toISOString().slice(0, 10) === todayIso) ??
      today ??
      days[0];
    if (!day) return {};
    const upcoming = day.ItineraryItem.find(
      (it) => it.startTime && it.startTime.getTime() >= now.getTime() - 30 * 60 * 1000,
    ) ?? day.ItineraryItem[0];
    if (!upcoming) return {};
    return {
      label:
        upcoming.Place?.nameCN ||
        upcoming.Place?.nameEN ||
        upcoming.note ||
        upcoming.type,
      startTime: upcoming.startTime
        ? formatHhMm(upcoming.startTime)
        : undefined,
    };
  }
}

function formatHhMm(d: Date): string {
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

function riskRank(r: ActiveRisk): number {
  const levelScore: Record<string, number> = {
    CRITICAL: 100,
    HIGH: 80,
    MEDIUM: 40,
    LOW: 10,
  };
  const gateScore: Record<string, number> = {
    STOP: 50,
    REPLAN_REQUIRED: 40,
    AT_RISK: 20,
  };
  return (levelScore[r.level] ?? 0) + (gateScore[r.executionGate ?? ''] ?? 0);
}

function deriveSeverity(input: {
  delayMinutes: number;
  advisoryVerdict?: string;
  topRisk?: ExecutionHomeBuiltContext['topRisk'];
  blockingDecisionCount: number;
  missWindowRisk: boolean;
  highRiskCount: number;
}): ExecSeverity {
  const gate = input.topRisk?.executionGate;
  const level = input.topRisk?.level;
  if (
    gate === 'STOP' ||
    gate === 'REPLAN_REQUIRED' ||
    level === 'CRITICAL' ||
    input.advisoryVerdict === 'STOP' ||
    input.advisoryVerdict === 'REPLAN_REQUIRED' ||
    input.blockingDecisionCount > 0 ||
    input.missWindowRisk
  ) {
    return 'INTERVENTION';
  }
  if (
    gate === 'AT_RISK' ||
    level === 'HIGH' ||
    level === 'MEDIUM' ||
    input.advisoryVerdict === 'AT_RISK' ||
    input.highRiskCount > 0 ||
    input.delayMinutes >= EXEC_DELAY_ATTENTION_MINUTES
  ) {
    return 'ATTENTION';
  }
  return 'CLEAR';
}

function collectTokens(input: {
  delayMinutes: number;
  next: { label?: string; startTime?: string };
  topRisk?: ExecutionHomeBuiltContext['topRisk'];
  advisoryHeadline?: string;
  interventionDeadline?: string;
  topProblem?: UnifiedDecisionProblemListItem;
}): string[] {
  const tokens = new Set<string>();
  tokens.add(String(input.delayMinutes));
  if (input.next.label) tokens.add(input.next.label);
  if (input.next.startTime) tokens.add(input.next.startTime);
  if (input.topRisk?.summary) tokens.add(input.topRisk.summary);
  if (input.topRisk?.level) tokens.add(input.topRisk.level);
  if (input.advisoryHeadline) tokens.add(input.advisoryHeadline);
  if (input.interventionDeadline) tokens.add(input.interventionDeadline);
  if (input.topProblem?.title) tokens.add(input.topProblem.title);
  tokens.add('晚点');
  tokens.add('分钟');
  tokens.add('最晚入场');
  return [...tokens];
}
