import { Injectable, NotFoundException, BadRequestException, Optional, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { TripConflictsService } from '../../services/trip-conflicts.service';
import { CoverageMapService } from '../../readiness/services/coverage-map.service';
import { ReadinessRepairService } from '../../readiness/services/readiness-repair.service';
import { LoopTriggerBridgeService } from '../../../loops/services/loop-trigger-bridge.service';
import type { ReadinessScoreResponse } from '../../readiness/types/coverage-map.types';
import type { RepairOptionsResponse } from '../../readiness/types/coverage-map.types';
import type { FeasibilityApplyRepairBodyDto, FeasibilityPreviewRepairBodyDto, FeasibilityScopeDto } from '../dto/feasibility-report.dto';
import {
  assembleFeasibilityReport,
  type FeasibilityDecisionEvidenceInput,
} from '../utils/feasibility-assembler.util';
import { assessItineraryCompleteness } from '../utils/itinerary-completeness-assessment.util';
import {
  applyScopeToReport,
  filterReadinessByDay,
  filterReadinessByIssue,
} from '../utils/feasibility-scope-validation.util';
import {
  buildFeasibilitySnapshotPayload,
  readFeasibilitySnapshot,
  readMonteCarloSnapshot,
  monteCarloSnapshotMetaPatch,
  resolveIssueIdToBlockerId,
  resolveTripRevision,
  revisionToString,
  snapshotMetaPatch,
} from '../utils/trip-revision.util';
import { isDecisionEngineRepairAction } from '../../readiness/utils/trip-decision-repair-bridge.util';
import {
  buildRoadClassRepairOptions,
  isRoadClassIssueRef,
  synthesizeRoadClassIssueFromCoverage,
} from '../utils/road-class-repair-options.util';
import { DateTime } from 'luxon';
import { FeasibilityPomdpMonteCarloService } from './feasibility-pomdp-monte-carlo.service';
import { TeamFitAssessmentService } from './team-fit-assessment.service';
import type { FeasibilityProbabilisticAssessmentDto, FeasibilityIssueDto, TripFeasibilityReportDto } from '../types/trip-constraint-solver.types';

@Injectable()
export class FeasibilityReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly coverageMap: CoverageMapService,
    private readonly conflicts: TripConflictsService,
    private readonly readinessRepair: ReadinessRepairService,
    private readonly teamFitAssessment: TeamFitAssessmentService,
    @Optional() private readonly pomdpMonteCarlo?: FeasibilityPomdpMonteCarloService,
    @Optional()
    @Inject(forwardRef(() => LoopTriggerBridgeService))
    private readonly loopTriggerBridge?: LoopTriggerBridgeService,
  ) {}

  async getReport(tripId: string, opts?: { locale?: string }): Promise<TripFeasibilityReportDto> {
    const trip = await this.loadTripContext(tripId);
    const [readiness, coverage, conflictsResp, decisionEvidence] = await Promise.all([
      this.coverageMap.getReadinessScore(tripId),
      this.coverageMap.getCoverageMap(tripId),
      this.conflicts.getConflicts(tripId),
      this.loadDecisionEvidence(tripId),
    ]);
    const snapshot = readFeasibilitySnapshot(trip.metadata);
    const probabilisticAssessment = this.readCachedProbabilisticAssessment(trip.metadata);
    const teamFit = await this.teamFitAssessment.assessForTrip(tripId, conflictsResp.conflicts);
    const itineraryCompleteness = assessItineraryCompleteness({
      tripId,
      conflicts: conflictsResp.conflicts,
      coverage,
    });
    return assembleFeasibilityReport({
      trip,
      tripDays: trip.tripDays,
      readiness,
      coverage,
      decisionEvidence,
      conflicts: conflictsResp.conflicts,
      revision: resolveTripRevision(trip),
      snapshot: snapshot
        ? {
            verifiedAt: typeof snapshot.verifiedAt === 'string' ? snapshot.verifiedAt : undefined,
            verifiedForTripVersion:
              typeof snapshot.verifiedForTripVersion === 'string'
                ? snapshot.verifiedForTripVersion
                : undefined,
            gateResult: typeof snapshot.gateResult === 'string' ? snapshot.gateResult : undefined,
          }
        : null,
      locale: opts?.locale,
      probabilisticAssessment,
      teamFitScore: teamFit.score,
      teamFitIssues: teamFit.issues,
      teamFitSummary: {
        score: teamFit.score,
        memberCount: teamFit.memberCount,
        profilingCompletedCount: teamFit.profilingCompletedCount,
      },
      itineraryCompletenessScore: itineraryCompleteness.score,
      itineraryCompletenessIssues: itineraryCompleteness.issues,
      itineraryCompletenessSummary: {
        score: itineraryCompleteness.score,
        signalCount: itineraryCompleteness.signalCount,
      },
    });
  }

  async validate(
    tripId: string,
    opts?: { forceRefreshEvidence?: boolean; lang?: string; runMonteCarlo?: boolean; monteCarloSampleSize?: number },
  ): Promise<TripFeasibilityReportDto> {
    if (opts?.forceRefreshEvidence !== false) {
      await this.readinessRepair.refreshEvidence(tripId);
    }

    const tripRow = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!tripRow) throw new NotFoundException(`行程 ${tripId} 不存在`);

    const revision = resolveTripRevision(tripRow);
    const readiness = await this.coverageMap.getReadinessScore(tripId);
    const probabilisticAssessment = await this.runProbabilisticAssessment(tripId, readiness, {
      runMonteCarlo: opts?.runMonteCarlo,
      sampleSize: opts?.monteCarloSampleSize,
    });

    const report = await this.getReport(tripId, { locale: opts?.lang === 'en' ? 'en' : 'zh' });
    const reportWithMc: TripFeasibilityReportDto = {
      ...report,
      probabilisticAssessment: probabilisticAssessment ?? report.probabilisticAssessment,
    };

    const snapshot = buildFeasibilitySnapshotPayload({
      verifiedAt: new Date().toISOString(),
      verifiedForTripVersion: revisionToString(revision),
      overallScore: reportWithMc.overallScore,
      verdictStatus: mapVerdictAfterValidate(reportWithMc),
      gateResult: mapGateFromVerdict(mapVerdictAfterValidate(reportWithMc)),
    });

    let metadataPatch = snapshotMetaPatch(snapshot, tripRow.metadata) as Record<string, unknown>;
    if (probabilisticAssessment) {
      metadataPatch = monteCarloSnapshotMetaPatch(
        {
          assessedAt: new Date().toISOString(),
          verifiedForTripVersion: revisionToString(revision),
          assessment: probabilisticAssessment,
          audit: probabilisticAssessment.audit ?? {
            event: 'feasibility_mc_assess',
            feasibilityProbability: probabilisticAssessment.feasibilityProbability ?? 0,
            expectedUtility: probabilisticAssessment.expectedUtility ?? 0,
            sampleSize: probabilisticAssessment.monteCarloDiagnostics?.sampleSize ?? 0,
            worldSource: probabilisticAssessment.pomdp?.worldSource ?? 'unknown',
            planSegmentCount: 0,
          },
          decisionOsAudit: probabilisticAssessment.audit?.decisionOsAudit,
        },
        metadataPatch,
      );
    }

    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        metadata: metadataPatch as object,
      },
    });

    const tripAfter = await this.prisma.trip.findUnique({ where: { id: tripId } });
    const [coverage, conflictsResp, decisionEvidence] = await Promise.all([
      this.coverageMap.getCoverageMap(tripId),
      this.conflicts.getConflicts(tripId),
      this.loadDecisionEvidence(tripId),
    ]);
    const ctx = await this.loadTripContext(tripId);
    const teamFit = await this.teamFitAssessment.assessForTrip(tripId, conflictsResp.conflicts);
    const itineraryCompleteness = assessItineraryCompleteness({
      tripId,
      conflicts: conflictsResp.conflicts,
      coverage,
    });
    return assembleFeasibilityReport({
      trip: ctx,
      tripDays: ctx.tripDays,
      readiness,
      coverage,
      decisionEvidence,
      conflicts: conflictsResp.conflicts,
      revision: resolveTripRevision(tripAfter ?? tripRow),
      snapshot: {
        verifiedAt: snapshot.verifiedAt as string,
        verifiedForTripVersion: snapshot.verifiedForTripVersion as string,
        gateResult: snapshot.gateResult as string | undefined,
      },
      locale: opts?.lang === 'en' ? 'en' : 'zh',
      probabilisticAssessment: probabilisticAssessment ?? undefined,
      teamFitScore: teamFit.score,
      teamFitIssues: teamFit.issues,
      teamFitSummary: {
        score: teamFit.score,
        memberCount: teamFit.memberCount,
        profilingCompletedCount: teamFit.profilingCompletedCount,
      },
      itineraryCompletenessScore: itineraryCompleteness.score,
      itineraryCompletenessIssues: itineraryCompleteness.issues,
      itineraryCompletenessSummary: {
        score: itineraryCompleteness.score,
        signalCount: itineraryCompleteness.signalCount,
      },
    });
  }

  async getRepairOptions(tripId: string, issueId: string): Promise<RepairOptionsResponse> {
    const report = await this.getReport(tripId);
    const issue = report.issues.find((i) => matchesIssueId(i.id, issueId));
    const canonicalIssueId = issue?.id ?? normalizeIssueIdAlias(issueId);

    let response: RepairOptionsResponse;
    if (isRoadClassIssueRef(issueId, issue) || isRoadClassIssueRef(canonicalIssueId, issue)) {
      const coverage = await this.coverageMap.getCoverageMap(tripId);
      const roadClassIssue =
        issue?.issueKind === 'road_class'
          ? { ...issue, id: canonicalIssueId }
          : synthesizeRoadClassIssueFromCoverage(canonicalIssueId, coverage) ??
            synthesizeRoadClassIssueFromCoverage(issueId, coverage) ??
            (issue
              ? { ...issue, id: canonicalIssueId, issueKind: 'road_class' as const }
              : undefined);
      if (!roadClassIssue) {
        throw new BadRequestException(`无法解析超长路段 issue: ${issueId}`);
      }
      response = buildRoadClassRepairOptions(tripId, roadClassIssue);
    } else if (issue?.issueKind === 'inter_day_travel' || issue?.issueKind === 'same_day_travel') {
      response = buildTravelTimingRepairOptions(tripId, issue);
    } else {
      const blockerId = resolveIssueIdToBlockerId(issueId);
      const tryIds = [blockerId, issueId, issueId.replace(/^issue-/, 'coverage-gap:')];
      let resolved: RepairOptionsResponse | undefined;
      for (const id of tryIds) {
        try {
          resolved = await this.coverageMap.getRepairOptions(tripId, id);
          break;
        } catch {
          // try next alias
        }
      }
      response = resolved ?? (await this.coverageMap.getRepairOptions(tripId, issueId));
    }

    return {
      ...response,
      issueId: canonicalIssueId,
      blockerId: response.blockerId,
    };
  }

  async validateScope(
    tripId: string,
    scope: FeasibilityScopeDto,
    opts?: { forceRefreshEvidence?: boolean; lang?: string },
  ): Promise<TripFeasibilityReportDto> {
    if (opts?.forceRefreshEvidence) {
      await this.readinessRepair.refreshEvidence(tripId);
    }

    const locale = opts?.lang === 'en' ? 'en' : 'zh';
    const trip = await this.loadTripContext(tripId);
    const snapshot = readFeasibilitySnapshot(trip.metadata);

    const coverage = await this.coverageMap.getCoverageMap(tripId);
    let conflictsResp = await this.conflicts.getConflicts(tripId);
    let readiness = await this.coverageMap.getReadinessScore(tripId);

    if (scope.type === 'day' && scope.dayNumber) {
      const day = trip.tripDays.find((d) => d.dayNumber === scope.dayNumber);
      if (day?.date) {
        const dateISO = DateTime.fromJSDate(day.date).toISODate();
        if (dateISO) {
          conflictsResp = await this.conflicts.getConflicts(tripId, dateISO);
        }
      }
      readiness = filterReadinessByDay(readiness, scope.dayNumber);
    } else if (scope.type === 'issue' && scope.issueId) {
      readiness = filterReadinessByIssue(readiness, scope.issueId);
    } else if (scope.type === 'route' && scope.segmentId) {
      const segment = coverage.segments.find((s) => s.id === scope.segmentId);
      if (segment) {
        readiness = filterReadinessByDay(readiness, segment.day);
        const day = trip.tripDays.find((d) => d.dayNumber === segment.day);
        if (day?.date) {
          const dateISO = DateTime.fromJSDate(day.date).toISODate();
          if (dateISO) {
            conflictsResp = await this.conflicts.getConflicts(tripId, dateISO);
          }
        }
      }
    }

    const decisionEvidence = await this.loadDecisionEvidence(tripId);
    const teamFit = await this.teamFitAssessment.assessForTrip(tripId, conflictsResp.conflicts);
    const itineraryCompleteness = assessItineraryCompleteness({
      tripId,
      conflicts: conflictsResp.conflicts,
      coverage,
    });

    const report = assembleFeasibilityReport({
      trip,
      tripDays: trip.tripDays,
      readiness,
      coverage,
      decisionEvidence,
      conflicts: conflictsResp.conflicts,
      revision: resolveTripRevision(trip),
      snapshot: snapshot
        ? {
            verifiedAt: typeof snapshot.verifiedAt === 'string' ? snapshot.verifiedAt : undefined,
            verifiedForTripVersion:
              typeof snapshot.verifiedForTripVersion === 'string'
                ? snapshot.verifiedForTripVersion
                : undefined,
            gateResult: typeof snapshot.gateResult === 'string' ? snapshot.gateResult : undefined,
          }
        : null,
      locale,
      teamFitScore: teamFit.score,
      teamFitIssues: teamFit.issues,
      teamFitSummary: {
        score: teamFit.score,
        memberCount: teamFit.memberCount,
        profilingCompletedCount: teamFit.profilingCompletedCount,
      },
      itineraryCompletenessScore: itineraryCompleteness.score,
      itineraryCompletenessIssues: itineraryCompleteness.issues,
      itineraryCompletenessSummary: {
        score: itineraryCompleteness.score,
        signalCount: itineraryCompleteness.signalCount,
      },
    });

    return applyScopeToReport(report, scope);
  }

  async previewRepair(
    tripId: string,
    issueId: string,
    body: FeasibilityPreviewRepairBodyDto,
  ) {
    const repair = await this.getRepairOptions(tripId, issueId);
    const option = repair.options.find((o) => o.id === body.optionId);
    if (!option) {
      throw new BadRequestException(`修复选项 ${body.optionId} 不存在`);
    }

    const issue = (await this.getReport(tripId)).issues.find(
      (i) => i.id === issueId || i.id === normalizeIssueIdAlias(issueId),
    );
    const blockerId = resolveIssueIdToBlockerId(issueId);

    return this.readinessRepair.previewRepair({
      tripId,
      blockerId,
      issueId: repair.issueId ?? issueId,
      optionId: body.optionId,
      affectedDayNumber: issue?.affectedDays?.[0],
      runGuardianNegotiation: body.runGuardianNegotiation,
      forceDecisionRepair: body.forceDecisionRepair,
    });
  }

  async applyRepair(
    tripId: string,
    issueId: string,
    body: FeasibilityApplyRepairBodyDto,
  ) {
    const repair = await this.getRepairOptions(tripId, issueId);
    const option = repair.options.find((o) => o.id === body.optionId);
    const executeDecision =
      body.executeDecision ?? isDecisionEngineRepairAction(option?.actionType);

    const blockerId = resolveIssueIdToBlockerId(issueId);
    const result = await this.readinessRepair.applyRepair({
      tripId,
      blockerId,
      optionId: body.optionId,
      reason: body.reason,
      executeDecision,
      persistDecision: body.persistDecision,
      runGuardianNegotiation: body.runGuardianNegotiation,
      forceDecisionRepair: body.forceDecisionRepair,
    });

    if (
      this.loopTriggerBridge &&
      result.status === 'applied' &&
      body.persistDecision !== false
    ) {
      void this.loopTriggerBridge.notifyItineraryChanged({
        tripId,
        issueId,
        source: 'feasibility_apply_repair',
      });
    }

    return result;
  }

  private async loadTripContext(tripId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripDay: { orderBy: { date: 'asc' }, select: { id: true, date: true } },
      },
    });
    if (!trip) throw new NotFoundException(`行程 ${tripId} 不存在`);
    return {
      id: trip.id,
      name: trip.name,
      startDate: trip.startDate,
      endDate: trip.endDate,
      updatedAt: trip.updatedAt,
      metadata: trip.metadata,
      tripDays: trip.TripDay.map((d, i) => ({ id: d.id, dayNumber: i + 1, date: d.date })),
    };
  }

  private async loadDecisionEvidence(tripId: string): Promise<FeasibilityDecisionEvidenceInput[]> {
    const logs = await this.prisma.decisionLog.findMany({
      where: { tripId },
      orderBy: { timestamp: 'desc' },
      take: 100,
      select: {
        id: true,
        timestamp: true,
        persona: true,
        decisionStage: true,
        reasonCodes: true,
        explanation: true,
        metadata: true,
      },
    });

    return logs
      .map<FeasibilityDecisionEvidenceInput | null>((log) => {
        const evidence = extractDecisionLogEvidence(log.metadata);
        if (!evidence) return null;
        return {
          id: log.id,
          timestamp: log.timestamp,
          persona: log.persona,
          decisionStage: log.decisionStage,
          reasonCodes: log.reasonCodes,
          explanation: log.explanation,
          evidence,
        };
      })
      .filter((row): row is FeasibilityDecisionEvidenceInput => row !== null);
  }

  private readCachedProbabilisticAssessment(
    metadata: unknown,
  ): FeasibilityProbabilisticAssessmentDto | undefined {
    const snap = readMonteCarloSnapshot(metadata);
    const assessment = snap?.assessment;
    if (!assessment || typeof assessment !== 'object') return undefined;
    return assessment as FeasibilityProbabilisticAssessmentDto;
  }

  private async runProbabilisticAssessment(
    tripId: string,
    readiness: ReadinessScoreResponse,
    opts?: { runMonteCarlo?: boolean; sampleSize?: number },
  ): Promise<FeasibilityProbabilisticAssessmentDto | null> {
    if (!this.pomdpMonteCarlo?.isEnabled()) return null;
    if (opts?.runMonteCarlo === false) return null;
    return this.pomdpMonteCarlo.assess({
      tripId,
      readiness,
      sampleSize: opts?.sampleSize,
      runPomdpBeliefUpdate: true,
    });
  }
}

function extractDecisionLogEvidence(metadata: unknown): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const details = (metadata as Record<string, unknown>).details;
  if (!details || typeof details !== 'object') return null;
  const evidence = (details as Record<string, unknown>).evidence;
  return evidence && typeof evidence === 'object' && !Array.isArray(evidence)
    ? (evidence as Record<string, unknown>)
    : null;
}

function mapGateFromVerdict(status: TripFeasibilityReportDto['verdict']['status']): string | undefined {
  switch (status) {
    case 'EXECUTABLE':
      return 'ALLOW';
    case 'NOT_EXECUTABLE':
      return 'BLOCK';
    case 'ADJUST_REQUIRED':
      return 'ADJUST_REQUIRED';
    default:
      return undefined;
  }
}

function mapVerdictAfterValidate(report: TripFeasibilityReportDto): TripFeasibilityReportDto['verdict']['status'] {
  if (report.summary.mustHandle > 0) return 'NOT_EXECUTABLE';
  if (report.summary.suggestAdjust + report.summary.pendingConfirm > 0) return 'ADJUST_REQUIRED';
  return 'EXECUTABLE';
}

function normalizeIssueIdAlias(issueId: string): string {
  if (issueId.startsWith('issue-')) return issueId;
  return `issue-${issueId}`;
}

function matchesIssueId(actual: string, requested: string): boolean {
  return (
    actual === requested ||
    actual === normalizeIssueIdAlias(requested) ||
    actual === normalizeIssueIdAlias(`conflict-${requested}`)
  );
}

function buildTravelTimingRepairOptions(
  tripId: string,
  issue: FeasibilityIssueDto,
): RepairOptionsResponse {
  const anchors = issue.anchors ?? {};
  const suggestedTime = typeof anchors.suggestedTime === 'string' ? anchors.suggestedTime : anchors.toTime;
  const affectedDays = issue.affectedDays ?? [];
  const nextDayNumber = (anchors.toDayNumber ?? (affectedDays.length ? Math.max(...affectedDays) : 1)) + 1;
  const itemId = issue.toItemId ?? anchors.toItemId;
  const toLabel = anchors.toPlaceLabel ?? '下一项';
  const adjustTitle = issue.issueKind === 'inter_day_travel'
    ? '顺延次日首项开始时间'
    : '顺延下一项开始时间';

  const options: RepairOptionsResponse['options'] = [
      {
        id: 'adjust_time',
        title: adjustTitle,
        description: suggestedTime
          ? `将${toLabel}开始时间调整到 ${suggestedTime}，补足交通衔接。`
          : `顺延${toLabel}开始时间，补足交通衔接。`,
        impact: 'high',
        timeEstimate: '1分钟',
        actionType: 'adjust_time',
        payload: {
          suggestedValue: suggestedTime,
          itemId,
          field: 'startTime',
          validateScope: { type: 'issue', issueId: issue.id },
          anchors,
        },
        metadata: {
          tripId,
          issueKind: issue.issueKind,
          primaryAction: issue.uiHints?.primaryAction,
          deepLink: issue.uiHints?.deepLink,
        },
      },
    ];

  if (issue.issueKind === 'inter_day_travel') {
    options.push(
      {
        id: 'move_to_day',
        title: '移动到更宽松的一天',
        description: `把下一项移动到 Day ${nextDayNumber} 或更宽松的日期，避免跨天首段交通压缩出发窗口。`,
        impact: 'medium',
        timeEstimate: '2分钟',
        actionType: 'move_to_day',
        payload: {
          suggestedValue: { dayNumber: nextDayNumber },
          itemId,
          validateScope: { type: 'issue', issueId: issue.id },
          anchors,
        },
        metadata: {
          tripId,
          issueKind: issue.issueKind,
          primaryAction: issue.uiHints?.primaryAction,
          deepLink: issue.uiHints?.deepLink,
        },
      },
    );
  }

  return {
    issueId: issue.id,
    blockerId: issue.id,
    blockerMessage: issue.message,
    options,
    cascadeUiHints: [
      {
        id: `${issue.id}:route`,
        riskLevel:
          issue.severity === 'high'
            ? 'HIGH'
            : issue.severity === 'medium'
              ? 'MEDIUM'
              : 'LOW',
        message: issue.message,
        recommendation: issue.actionRequired ?? '调整交通衔接或顺延下一项开始时间',
      },
    ],
  };
}
