import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../../../prisma/prisma.service';
import { TripConflictsService } from '../../services/trip-conflicts.service';
import type { ConflictsResponseDto } from '../../dto/trip-conflicts.dto';
import type { TripConflictsQueryOpts } from '../../services/trip-conflicts.service';
import { CoverageMapService } from '../../readiness/services/coverage-map.service';
import { ReadinessRepairService } from '../../readiness/services/readiness-repair.service';
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
import { buildStubReadinessFromSnapshot } from '../utils/feasibility-readiness-stub.util';
import { isDecisionEngineRepairAction } from '../../readiness/utils/trip-decision-repair-bridge.util';
import {
  buildRoadClassRepairOptions,
  isRoadClassIssueRef,
  synthesizeRoadClassIssueFromCoverage,
} from '../utils/road-class-repair-options.util';
import { DateTime } from 'luxon';
import { FeasibilityPomdpMonteCarloService } from './feasibility-pomdp-monte-carlo.service';
import { TeamFitAssessmentService } from './team-fit-assessment.service';
import { PreTripReadinessP0Service } from './pre-trip-readiness-p0.service';
import { ItineraryItemsService } from '../../../itinerary-items/itinerary-items.service';
import { TripReservationEvidenceService } from '../../../poi-access-capacity/services/trip-reservation-evidence.service';
import {
  IcelandAccessEvidenceRefreshService,
  type AccessEvidenceRefreshScope,
} from '../../../poi-access-capacity/services/iceland-access-evidence-refresh.service';
import type { RepairOption } from '../../readiness/types/coverage-map.types';
import type { FeasibilityProbabilisticAssessmentDto, FeasibilityIssueDto, TripFeasibilityReportDto } from '../types/trip-constraint-solver.types';
import {
  applyInterDayBufferDayRepair,
  buildAddBufferPreviewResponse,
  buildAddBufferRepairOption,
  shouldOfferAddBufferRepair,
} from '../utils/inter-day-buffer-repair.util';
import {
  buildBufferInsufficientRepairOptions,
} from '../utils/buffer-insufficient-repair.util';
import {
  applyMinuteTimingShiftRepair,
  applySuggestedStartTimeRepair,
  buildMinuteBufferRepairOptions,
  buildShiftDepartureRepairOption,
  buildShiftEarlierRepairOption,
  isInsertRestDayRepairPayload,
  isMinuteBufferRepairPayload,
  shouldOfferMinuteTimingRepairs,
  isShiftDepartureRepairViable,
} from '../utils/travel-timing-repair.util';
import { buildDailyDriveRepairOptionsResponse } from '../utils/daily-drive-repair.util';
import {
  buildPlanObjectRepairOptionsResponse,
  isPlanObjectFeasibilityIssue,
} from '../../../decision-runtime/constraints/utils/plan-object-repair-options.util';
import { applyPlanObjectRepair } from '../utils/apply-plan-object-repair.util';
import { isScheduleDomainConflict } from '../utils/schedule-domain.util';
import { mapConflictToFeasibilityIssue } from '../utils/feasibility-assembler.util';
import type { AssemblerGatewayDomainCoverage } from '../utils/assembler-gateway-coverage.util';
import { isPhase6GatewayDomainRulesExclusive } from '../../../decision-runtime/constraints/constraint-plan-verify.config';
import {
  EffectivePlanWriteGuardService,
} from '../../../decision-runtime/execution/effective-plan-write-guard.service';
import { assertPlanMutationAllowedOrThrow } from '../../../decision-runtime/execution/effective-plan-write-chain-blocked.util';
import { buildMcpoiBenchmarkFeasibilityIssues } from '../../benchmarks/multi-constraint-poi/mcpoi-benchmark-runtime.util';

@Injectable()
export class FeasibilityReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly coverageMap: CoverageMapService,
    private readonly conflicts: TripConflictsService,
    private readonly readinessRepair: ReadinessRepairService,
    private readonly teamFitAssessment: TeamFitAssessmentService,
    private readonly preTripP0: PreTripReadinessP0Service,
    private readonly reservationEvidence: TripReservationEvidenceService,
    private readonly accessEvidenceRefresh: IcelandAccessEvidenceRefreshService,
    private readonly moduleRef: ModuleRef,
    @Optional() private readonly pomdpMonteCarlo?: FeasibilityPomdpMonteCarloService,
    @Optional() private readonly effectivePlanWriteGuard?: EffectivePlanWriteGuardService,
  ) {}

  private getFeasibilityProjection():
    | import('../../../decision-runtime/constraints/services/feasibility-projection.service').FeasibilityProjectionService
    | undefined {
    try {
      const { FeasibilityProjectionService } = require('../../../decision-runtime/constraints/services/feasibility-projection.service') as {
        FeasibilityProjectionService: new (...args: never[]) => {
          projectP0Issues: (trip: {
            id: string;
            status?: string | null;
            startDate: Date;
            metadata: unknown;
          }) => Promise<import('../../../decision-runtime/constraints/services/feasibility-projection.service').FeasibilityProjectionResult>;
          projectScheduleConflicts: (
            tripId: string,
            conflicts: ConflictsResponseDto['conflicts'],
          ) => import('../../../decision-runtime/constraints/services/feasibility-projection.service').ScheduleConflictProjectionResult;
          projectGuardianIssues: (
            tripId: string,
            existingIssues: FeasibilityIssueDto[],
          ) => Promise<FeasibilityIssueDto[]>;
          projectPlanObjectIssues: (tripId: string) => Promise<FeasibilityIssueDto[]>;
          isProjectionEnabled: () => boolean;
        };
      };
      return this.moduleRef.get(FeasibilityProjectionService, { strict: false });
    } catch {
      return undefined;
    }
  }

  private buildConflictAssemblyInput(
    tripId: string,
    conflicts: ConflictsResponseDto['conflicts'],
  ): {
    conflicts: ConflictsResponseDto['conflicts'];
    projectedScheduleIssues?: FeasibilityIssueDto[];
    scheduleProjectionApplied: boolean;
  } {
    const projection = this.getFeasibilityProjection();
    if (!projection?.isProjectionEnabled()) {
      return { conflicts, scheduleProjectionApplied: false };
    }
    const result = projection.projectScheduleConflicts(tripId, conflicts);
    if (!result.projectionApplied) {
      return { conflicts, scheduleProjectionApplied: false };
    }
    return {
      conflicts: result.nonScheduleConflicts,
      projectedScheduleIssues: result.scheduleIssues,
      scheduleProjectionApplied: true,
    };
  }

  private resolveGatewayDomainCoverage(input: {
    p0ProjectionApplied: boolean;
    scheduleProjectionApplied: boolean;
  }): AssemblerGatewayDomainCoverage | undefined {
    const projection = this.getFeasibilityProjection();
    if (!isPhase6GatewayDomainRulesExclusive() || !projection?.isProjectionEnabled()) {
      return undefined;
    }
    return {
      poiAccess: input.p0ProjectionApplied,
      schedule: input.scheduleProjectionApplied,
      guardian: true,
    };
  }

  private async buildP0IssuesForReport(trip: {
    id: string;
    status?: string | null;
    startDate: Date;
    metadata: unknown;
  }): Promise<{
    issues: import('../types/trip-constraint-solver.types').FeasibilityIssueDto[];
    p0ProjectionApplied: boolean;
  }> {
    const projection = this.getFeasibilityProjection();
    if (projection?.isProjectionEnabled()) {
      const { mergeProjectedP0Issues } = await import(
        '../../../decision-runtime/constraints/services/feasibility-projection.service'
      );
      const result = await projection.projectP0Issues(trip);
      return {
        issues: mergeProjectedP0Issues(result),
        p0ProjectionApplied: result.projectionApplied,
      };
    }
    return {
      issues: await this.preTripP0.buildP0Issues(trip),
      p0ProjectionApplied: false,
    };
  }

  private async buildGuardianIssuesForReport(
    tripId: string,
    prelude: {
      p0Issues: FeasibilityIssueDto[];
      projectedScheduleIssues?: FeasibilityIssueDto[];
      conflicts: ConflictsResponseDto['conflicts'];
    },
  ): Promise<FeasibilityIssueDto[]> {
    const projection = this.getFeasibilityProjection();
    if (!projection?.isProjectionEnabled()) return [];

    const scheduleIssues =
      prelude.projectedScheduleIssues ??
      prelude.conflicts
        .filter((c) => isScheduleDomainConflict(c))
        .map((c) => mapConflictToFeasibilityIssue(c, { tripId }));

    return [
      ...(await projection.projectPlanObjectIssues(tripId)),
      ...(await projection.projectGuardianIssues(tripId, [...prelude.p0Issues, ...scheduleIssues])),
    ];
  }

  private getLoopTriggerBridge():
    | { notifyItineraryChanged: (input: Record<string, unknown>) => Promise<void> }
    | undefined {
    try {
      // Lazy require breaks feasibility-report ↔ loops adapter circular import.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { LoopTriggerBridgeService } = require('../../../loops/services/loop-trigger-bridge.service') as {
        LoopTriggerBridgeService: new (...args: never[]) => {
          notifyItineraryChanged: (input: Record<string, unknown>) => Promise<void>;
        };
      };
      return this.moduleRef.get(LoopTriggerBridgeService, { strict: false });
    } catch {
      return undefined;
    }
  }

  async getReport(
    tripId: string,
    opts?: {
      locale?: string;
      preloadedConflicts?: ConflictsResponseDto;
      /** 与外部共享同一 getConflicts promise，避免重复计算且可与 coverage 并行 */
      preloadedConflictsPromise?: Promise<ConflictsResponseDto>;
    },
  ): Promise<TripFeasibilityReportDto> {
    const trip = await this.loadTripContext(tripId);
    const conflictsPromise =
      opts?.preloadedConflictsPromise ??
      (opts?.preloadedConflicts != null
        ? Promise.resolve(opts.preloadedConflicts)
        : this.conflicts.getConflicts(tripId));
    const [readiness, coverage, conflictsResp, decisionEvidence] = await Promise.all([
      this.coverageMap.getReadinessScore(tripId),
      this.coverageMap.getCoverageMap(tripId),
      conflictsPromise,
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
    const { issues: p0Issues, p0ProjectionApplied } = await this.buildP0IssuesForReport({
      id: trip.id,
      status: trip.status,
      startDate: trip.startDate,
      metadata: trip.metadata,
    });
    const conflictAssembly = this.buildConflictAssemblyInput(tripId, conflictsResp.conflicts);
    const projectedGuardianIssues = await this.mergeMcpoiBenchmarkGuardianIssues(
      tripId,
      await this.buildGuardianIssuesForReport(tripId, {
        p0Issues,
        projectedScheduleIssues: conflictAssembly.projectedScheduleIssues,
        conflicts: conflictsResp.conflicts,
      }),
    );
    return assembleFeasibilityReport({
      trip,
      tripDays: trip.tripDays,
      readiness,
      coverage,
      decisionEvidence,
      conflicts: conflictAssembly.conflicts,
      projectedScheduleIssues: conflictAssembly.projectedScheduleIssues,
      projectedGuardianIssues,
      gatewayDomainCoverage: this.resolveGatewayDomainCoverage({
        p0ProjectionApplied,
        scheduleProjectionApplied: conflictAssembly.scheduleProjectionApplied,
      }),
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
      p0Issues,
    });
  }

  /**
   * 快速 feasibility：启发式 conflicts + team-fit + metadata snapshot，跳过 coverage/readiness。
   */
  async getReportFast(
    tripId: string,
    opts?: {
      preloadedConflicts?: ConflictsResponseDto;
      preloadedConflictsPromise?: Promise<ConflictsResponseDto>;
      conflictsQuery?: TripConflictsQueryOpts;
    },
  ): Promise<TripFeasibilityReportDto> {
    const trip = await this.loadTripContext(tripId);
    const conflictsPromise =
      opts?.preloadedConflictsPromise ??
      (opts?.preloadedConflicts != null
        ? Promise.resolve(opts.preloadedConflicts)
        : this.conflicts.getConflicts(tripId, undefined, undefined, opts?.conflictsQuery));

    const conflictsResp = await conflictsPromise;
    const teamFit = await this.teamFitAssessment.assessForTrip(tripId, conflictsResp.conflicts);
    const snapshot = readFeasibilitySnapshot(trip.metadata);
    const revision = resolveTripRevision(trip);
    const readiness = buildStubReadinessFromSnapshot(tripId, snapshot);

    const conflictAssembly = this.buildConflictAssemblyInput(tripId, conflictsResp.conflicts);
    const projectedGuardianIssues = await this.mergeMcpoiBenchmarkGuardianIssues(
      tripId,
      await this.buildGuardianIssuesForReport(tripId, {
        p0Issues: [],
        projectedScheduleIssues: conflictAssembly.projectedScheduleIssues,
        conflicts: conflictsResp.conflicts,
      }),
    );
    return assembleFeasibilityReport({
      trip,
      tripDays: trip.tripDays,
      readiness,
      conflicts: conflictAssembly.conflicts,
      projectedScheduleIssues: conflictAssembly.projectedScheduleIssues,
      projectedGuardianIssues,
      gatewayDomainCoverage: this.resolveGatewayDomainCoverage({
        p0ProjectionApplied: false,
        scheduleProjectionApplied: conflictAssembly.scheduleProjectionApplied,
      }),
      revision,
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
      teamFitScore: teamFit.score,
      teamFitIssues: teamFit.issues,
      teamFitSummary: {
        score: teamFit.score,
        memberCount: teamFit.memberCount,
        profilingCompletedCount: teamFit.profilingCompletedCount,
      },
    });
  }

  async validate(
    tripId: string,
    opts?: {
      forceRefreshEvidence?: boolean | AccessEvidenceRefreshScope[];
      lang?: string;
      runMonteCarlo?: boolean;
      monteCarloSampleSize?: number;
    },
  ): Promise<TripFeasibilityReportDto> {
    await this.refreshEvidenceIfRequested(tripId, opts?.forceRefreshEvidence);
    await this.syncTravelDurationsFromTravelInfo(tripId);

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
    const { issues: p0Issues, p0ProjectionApplied } = await this.buildP0IssuesForReport({
      id: ctx.id,
      status: ctx.status,
      startDate: ctx.startDate,
      metadata: tripAfter?.metadata ?? tripRow.metadata,
    });
    const conflictAssembly = this.buildConflictAssemblyInput(tripId, conflictsResp.conflicts);
    const projectedGuardianIssues = await this.buildGuardianIssuesForReport(tripId, {
      p0Issues,
      projectedScheduleIssues: conflictAssembly.projectedScheduleIssues,
      conflicts: conflictsResp.conflicts,
    });
    return assembleFeasibilityReport({
      trip: ctx,
      tripDays: ctx.tripDays,
      readiness,
      coverage,
      decisionEvidence,
      conflicts: conflictAssembly.conflicts,
      projectedScheduleIssues: conflictAssembly.projectedScheduleIssues,
      projectedGuardianIssues,
      gatewayDomainCoverage: this.resolveGatewayDomainCoverage({
        p0ProjectionApplied,
        scheduleProjectionApplied: conflictAssembly.scheduleProjectionApplied,
      }),
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
      p0Issues,
    });
  }

  async getRepairOptions(
    tripId: string,
    issueId: string,
    opts?: { preloadedReport?: TripFeasibilityReportDto },
  ): Promise<RepairOptionsResponse> {
    const report = opts?.preloadedReport ?? (await this.getReport(tripId));
    const issue = report.issues.find((i) => matchesIssueId(i.id, issueId));
    const canonicalIssueId = issue?.id ?? normalizeIssueIdAlias(issueId);

    let response: RepairOptionsResponse;
    if (issue && isPlanObjectFeasibilityIssue(issue)) {
      response = buildPlanObjectRepairOptionsResponse(tripId, issue);
    } else if (isRoadClassIssueRef(issueId, issue) || isRoadClassIssueRef(canonicalIssueId, issue)) {
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
    } else if (issue?.issueKind === 'daily_drive') {
      response = buildDailyDriveRepairOptionsResponse(tripId, issue);
    } else if (issue?.issueKind === 'inter_day_travel' || issue?.issueKind === 'same_day_travel') {
      response = buildTravelTimingRepairOptions(tripId, issue);
    } else if (issue?.issueKind === 'buffer_insufficient') {
      response = buildBufferInsufficientRepairOptionsResponse(tripId, issue);
    } else if (
      issue?.issueKind === 'ROAD_CLOSED' ||
      issue?.semanticKey?.includes('ROAD_CLOSED')
    ) {
      response = {
        blockerId: issue.id,
        blockerMessage: issue.message,
        issueId: canonicalIssueId,
        options: [
          {
            id: 'road_plan_detour',
            title: '规划绕行路线',
            description: '调整受影响的路段与后续行程衔接。',
            impact: 'high',
            actionType: 'alternative',
          },
          {
            id: 'road_remove_segment',
            title: '移除或替换封闭路段',
            description: issue.message,
            impact: 'high',
            actionType: 'repair',
          },
        ],
      };
    } else if (!issue) {
      throw new NotFoundException(`REPAIR_OPTIONS_NOT_FOUND: issue ${issueId}`);
    } else if (issue?.issueKind?.startsWith('poi_access') && issue.repairOptions?.length) {
      response = {
        blockerId: issue.id,
        blockerMessage: issue.message,
        issueId: canonicalIssueId,
        options: issue.repairOptions.map(
          (o): RepairOption => ({
            id: o.id,
            title: o.label,
            description: o.description,
            impact: (['high', 'medium', 'low'].includes(String(o.impactSummary ?? ''))
              ? o.impactSummary
              : 'medium') as RepairOption['impact'],
            actionType: o.actionType ?? o.type,
            payload: o.payload,
          }),
        ),
      };
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
    opts?: { forceRefreshEvidence?: boolean | AccessEvidenceRefreshScope[]; lang?: string },
  ): Promise<TripFeasibilityReportDto> {
    await this.refreshEvidenceIfRequested(tripId, opts?.forceRefreshEvidence);

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
    const { issues: p0Issues, p0ProjectionApplied } = await this.buildP0IssuesForReport({
      id: trip.id,
      status: trip.status,
      startDate: trip.startDate,
      metadata: trip.metadata,
    });

    const conflictAssembly = this.buildConflictAssemblyInput(tripId, conflictsResp.conflicts);
    const projectedGuardianIssues = await this.buildGuardianIssuesForReport(tripId, {
      p0Issues,
      projectedScheduleIssues: conflictAssembly.projectedScheduleIssues,
      conflicts: conflictsResp.conflicts,
    });
    const report = assembleFeasibilityReport({
      trip,
      tripDays: trip.tripDays,
      readiness,
      coverage,
      decisionEvidence,
      conflicts: conflictAssembly.conflicts,
      projectedScheduleIssues: conflictAssembly.projectedScheduleIssues,
      projectedGuardianIssues,
      gatewayDomainCoverage: this.resolveGatewayDomainCoverage({
        p0ProjectionApplied,
        scheduleProjectionApplied: conflictAssembly.scheduleProjectionApplied,
      }),
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
      p0Issues,
    });

    return applyScopeToReport(report, scope);
  }

  async previewRepair(
    tripId: string,
    issueId: string,
    body: FeasibilityPreviewRepairBodyDto,
    opts?: {
      preloadedReport?: TripFeasibilityReportDto;
      preloadedRepairOptions?: RepairOptionsResponse;
    },
  ) {
    const repair =
      opts?.preloadedRepairOptions ??
      (await this.getRepairOptions(tripId, issueId, { preloadedReport: opts?.preloadedReport }));
    const option = repair.options.find((o) => o.id === body.optionId);
    if (!option) {
      throw new BadRequestException(`OPTION_NOT_APPLICABLE: optionId ${body.optionId}`);
    }

    const report = opts?.preloadedReport ?? (await this.getReport(tripId));
    const issue = report.issues.find(
      (i) => i.id === issueId || i.id === normalizeIssueIdAlias(issueId),
    );
    const blockerId = resolveIssueIdToBlockerId(issueId);
    const optionPayload = (option.payload ?? {}) as Record<string, unknown>;

    if (
      (option.actionType === 'add_buffer' || option.actionType === 'insert_rest_day') &&
      issue?.issueKind === 'inter_day_travel' &&
      isInsertRestDayRepairPayload(optionPayload)
    ) {
      const tripCtx = await this.prisma.trip.findUnique({
        where: { id: tripId },
        include: { TripDay: { include: { ItineraryItem: true } } },
      });
      const totalDays = tripCtx?.TripDay.length ?? 0;
      const totalItems =
        tripCtx?.TripDay.reduce((n, d) => n + d.ItineraryItem.length, 0) ?? 0;
      return buildAddBufferPreviewResponse({
        tripId,
        blockerId,
        issueId: repair.issueId ?? issueId,
        optionId: body.optionId,
        payload: (option.payload ?? {}) as Record<string, unknown>,
        totalDays,
        totalItems,
      });
    }

    if (
      (option.actionType === 'shift_departure' ||
        option.actionType === 'add_buffer_minutes' ||
        (option.actionType === 'add_buffer' &&
          isMinuteBufferRepairPayload((option.payload ?? {}) as Record<string, unknown>))) &&
      (issue?.issueKind === 'inter_day_travel' ||
        issue?.issueKind === 'same_day_travel' ||
        issue?.issueKind === 'buffer_insufficient')
    ) {
      const shiftMinutes = (option.payload as Record<string, unknown>)?.shiftMinutes;
      return {
        tripId,
        blockerId,
        issueId: repair.issueId ?? issueId,
        optionId: body.optionId,
        actionType: option.actionType,
        previewMode: 'heuristic' as const,
        status: 'preview' as const,
        message: `将把下一站开始时间顺延 ${shiftMinutes ?? '?'} 分钟`,
        before: {
          dayNumber: issue.affectedDays?.[0] ?? 1,
          itemCount: 0,
          totalItemCount: 0,
          highlights: [],
        },
        after: {
          dayNumber: issue.affectedDays?.[0] ?? 1,
          itemCount: 0,
          totalItemCount: 0,
          highlights: [`+${shiftMinutes ?? 0} 分钟`],
        },
        itineraryDiff: [],
        impact: {
          feasibilityScoreBefore: 0,
          feasibilityScoreAfter: 10,
          estimated: true,
        },
        option,
      };
    }

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
    userId?: string,
  ) {
    assertPlanMutationAllowedOrThrow(
      this.effectivePlanWriteGuard,
      'FeasibilityReportService.applyRepair',
    );

    const report = await this.getReport(tripId);
    const issue = report.issues.find(
      (i) => matchesIssueId(i.id, issueId) || i.id === normalizeIssueIdAlias(issueId),
    );

    const repair = await this.getRepairOptions(tripId, issueId);
    const option = repair.options.find((o) => o.id === body.optionId);
    if (!option) {
      throw new BadRequestException(`OPTION_NOT_APPLICABLE: optionId ${body.optionId}`);
    }

    const optionPayload = (option.payload ?? {}) as Record<string, unknown>;

    const isManualConfirm =
      body.optionId.includes('manual_confirm') ||
      option?.actionType === 'manual_confirm' ||
      option?.payload?.type === 'manual_confirm';

    const isInsertRestDay =
      (body.optionId === 'add_buffer' ||
        option?.actionType === 'add_buffer' ||
        option?.actionType === 'insert_rest_day') &&
      isInsertRestDayRepairPayload(optionPayload);

    if (issue?.issueKind === 'inter_day_travel' && isInsertRestDay) {
      const result = await applyInterDayBufferDayRepair(
        this.prisma,
        tripId,
        (option?.payload ?? {}) as Record<string, unknown>,
      );
      const refreshed = await this.getReport(tripId);
      return {
        tripId,
        blockerId: issue.id,
        optionId: body.optionId,
        actionType: 'insert_rest_day',
        status: 'applied' as const,
        message: `已插入缓冲日（${result.insertedDateISO}），Day ${result.beforeDayNumber} 及之后顺延 1 天`,
        metadata: { ...result, readinessHint: { reportVerdict: refreshed.verdict.status } },
      };
    }

    const isMinuteShift =
      option?.actionType === 'shift_departure' ||
      option?.actionType === 'add_buffer_minutes' ||
      (option?.actionType === 'add_buffer' && isMinuteBufferRepairPayload(optionPayload));

    if (
      (issue?.issueKind === 'inter_day_travel' ||
        issue?.issueKind === 'same_day_travel' ||
        issue?.issueKind === 'buffer_insufficient') &&
      isMinuteShift
    ) {
      const result = await applyMinuteTimingShiftRepair(
        this.prisma,
        (option?.payload ?? {}) as Record<string, unknown>,
      );
      const refreshed = await this.getReport(tripId);
      return {
        tripId,
        blockerId: issue.id,
        optionId: body.optionId,
        actionType: option!.actionType!,
        status: 'applied' as const,
        message: `已顺延 ${result.shiftMinutes} 分钟`,
        metadata: { ...result, readinessHint: { reportVerdict: refreshed.verdict.status } },
      };
    }

    const isAdjustTime =
      option?.actionType === 'adjust_time' &&
      typeof optionPayload.suggestedValue === 'string' &&
      typeof optionPayload.itemId === 'string';

    if (
      (issue?.issueKind === 'inter_day_travel' ||
        issue?.issueKind === 'same_day_travel' ||
        issue?.issueKind === 'buffer_insufficient') &&
      isAdjustTime
    ) {
      const result = await applySuggestedStartTimeRepair(
        this.prisma,
        optionPayload as Record<string, unknown>,
      );
      const refreshed = await this.getReport(tripId);
      return {
        tripId,
        blockerId: issue.id,
        optionId: body.optionId,
        actionType: 'adjust_time',
        status: 'applied' as const,
        message: `已将开始时间调整到 ${result.newStartTime}`,
        metadata: { ...result, readinessHint: { reportVerdict: refreshed.verdict.status } },
      };
    }

    if (issue && isPlanObjectFeasibilityIssue(issue)) {
      const result = await applyPlanObjectRepair(
        this.prisma,
        tripId,
        body.optionId,
        optionPayload,
      );
      const refreshed = await this.getReport(tripId);
      return {
        tripId,
        blockerId: issue.id,
        optionId: body.optionId,
        actionType: option?.actionType ?? body.optionId,
        status: 'applied' as const,
        message: result.message,
        metadata: { ...result, readinessHint: { reportVerdict: refreshed.verdict.status } },
      };
    }

    if (issue?.issueKind?.startsWith('poi_access') && isManualConfirm) {
      const code = body.parkingReservationRef?.trim();
      if (!code && !body.evidenceAttachmentId) {
        throw new BadRequestException('manual_confirm 需要 parkingReservationRef 或 evidenceAttachmentId');
      }
      const payload = option?.payload ?? {};
      const ctx = await this.loadTripContext(tripId);
      const dayNum = issue.affectedDays?.[0] ?? 1;
      const day = ctx.tripDays.find((d) => d.dayNumber === dayNum);
      const dateISO =
        day?.date != null
          ? DateTime.fromJSDate(day.date).toISODate() ?? new Date().toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10);
      const evidence = await this.reservationEvidence.upsertEvidence(
        tripId,
        userId ?? 'anonymous-dev-user',
        {
          tripItemId: String(payload.tripItemId ?? issue.fromItemId ?? ''),
          poiId: String(payload.poiId ?? issue.visitorAccess?.evaluation.poiId ?? ''),
          dateISO,
          confirmationCode: code,
          attachmentId: body.evidenceAttachmentId,
          resource: 'PARKING',
        },
      );
      return {
        tripId,
        blockerId: issue.id,
        optionId: body.optionId,
        actionType: 'manual_confirm',
        status: 'applied' as const,
        message: '预约凭证已保存',
        metadata: { evidence, readinessHint: { reportVerdict: (await this.getReport(tripId)).verdict.status } },
      };
    }

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
      result.status === 'applied' &&
      body.persistDecision !== false
    ) {
      const loopTriggerBridge = this.getLoopTriggerBridge();
      if (loopTriggerBridge) {
        void loopTriggerBridge.notifyItineraryChanged({
        tripId,
        issueId,
        source: 'feasibility_apply_repair',
      });
      }
    }

    return result;
  }

  /** validate 前将 travel-info 计算结果写回 DB，与 feasibility 冲突检测同源 */
  private async syncTravelDurationsFromTravelInfo(tripId: string): Promise<void> {
    try {
      const items = this.moduleRef.get(ItineraryItemsService, { strict: false });
      if (items) {
        await items.syncTravelDurationsFromDayTravelInfo(tripId);
      }
    } catch {
      // optional when ItineraryItemsModule not loaded
    }
  }

  private async refreshEvidenceIfRequested(
    tripId: string,
    forceRefreshEvidence?: boolean | AccessEvidenceRefreshScope[],
  ): Promise<void> {
    if (forceRefreshEvidence === false) return;

    if (Array.isArray(forceRefreshEvidence)) {
      if (forceRefreshEvidence.length) {
        await this.accessEvidenceRefresh.refresh(forceRefreshEvidence);
      }
      return;
    }

    if (forceRefreshEvidence === true) {
      await this.accessEvidenceRefresh.refresh([
        'access_rules',
        'access_inventory',
        'access_congestion',
      ]);
    }

    await this.readinessRepair.refreshEvidence(tripId);
  }

  private async mergeMcpoiBenchmarkGuardianIssues(
    tripId: string,
    guardianIssues: FeasibilityIssueDto[],
  ): Promise<FeasibilityIssueDto[]> {
    const mcpoiIssues = await buildMcpoiBenchmarkFeasibilityIssues(this.prisma, tripId);
    if (!mcpoiIssues.length) return guardianIssues;
    return [...mcpoiIssues, ...guardianIssues];
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
      status: trip.status,
      updatedAt: trip.updatedAt,
      metadata: trip.metadata,
      tripDays: trip.TripDay.map((d, i) => ({ id: d.id, dayNumber: i + 1, date: d.date })),
    };
  }

  private async loadDecisionEvidence(tripId: string): Promise<FeasibilityDecisionEvidenceInput[]> {
    if (!this.isUuidTripId(tripId)) {
      return [];
    }

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

  /** DecisionLog.trip_id is UUID; benchmark trips may use string ids like TRIP-ICELAND-MULTI-001. */
  private isUuidTripId(tripId: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tripId);
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
  if (report.gateExecute.blocked) {
    const hasHard = report.issues.some((i) => i.issueKind === 'poi_access_blocked');
    if (hasHard) return 'NOT_EXECUTABLE';
    return 'ADJUST_REQUIRED';
  }
  if (report.summary.mustHandle > 0) {
    const onlyReservation = report.issues.every(
      (i) =>
        i.priority !== 'must_handle' ||
        i.issueKind === 'poi_access_reservation_required',
    );
    if (!onlyReservation) return 'NOT_EXECUTABLE';
    return 'ADJUST_REQUIRED';
  }
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

function buildBufferInsufficientRepairOptionsResponse(
  tripId: string,
  issue: FeasibilityIssueDto,
): RepairOptionsResponse {
  const anchors = issue.anchors ?? {};
  const itemId = issue.toItemId ?? anchors.toItemId;
  const toLabel = anchors.toPlaceLabel ?? '下一项';
  const repairOpts =
    issue.repairOptions ??
    (itemId
      ? buildBufferInsufficientRepairOptions({
          issueId: issue.id,
          toItemId: itemId,
          toLabel,
          shortfallMinutes: anchors.shortfallMinutes,
          suggestedTime:
            typeof anchors.suggestedTime === 'string' ? anchors.suggestedTime : undefined,
          anchors,
        })
      : []);

  return {
    issueId: issue.id,
    blockerId: issue.id,
    blockerMessage: issue.message,
    options: repairOpts.map((o) => ({
      id: o.id,
      title: o.label,
      description: o.description,
      impact: 'medium',
      timeEstimate: '1分钟',
      actionType: o.actionType ?? o.id,
      payload: o.payload,
      metadata: {
        tripId,
        issueKind: issue.issueKind,
        primaryAction: 'add_buffer',
        deepLink: issue.uiHints?.deepLink,
      },
    })),
  };
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

  const options: RepairOptionsResponse['options'] = [];

  if (
    shouldOfferAddBufferRepair({
      issueKind: issue.issueKind,
      isStartTooEarly: issue.anchors?.isStartTooEarly ?? issue.severity === 'high',
      priority: issue.priority,
    })
  ) {
    const bufferOpt = buildAddBufferRepairOption({
      issueId: issue.id,
      anchors: issue.anchors,
      affectedDays: issue.affectedDays,
      fromItemId: issue.fromItemId,
      toItemId: issue.toItemId,
    });
    options.push({
      id: bufferOpt.id,
      title: bufferOpt.label,
      description: bufferOpt.description,
      impact: 'high',
      timeEstimate: '2分钟',
      actionType: bufferOpt.actionType ?? 'insert_rest_day',
      payload: bufferOpt.payload,
      metadata: {
        tripId,
        issueKind: issue.issueKind,
        primaryAction: 'insert_rest_day',
        deepLink: issue.uiHints?.deepLink,
      },
    });
  }

  if (
    itemId &&
    shouldOfferMinuteTimingRepairs({
      toItemId: itemId,
      shortfallMinutes: anchors.shortfallMinutes,
      travelMinutes: anchors.travelMinutes,
      isStartTooEarly: anchors.isStartTooEarly,
      issueKind: issue.issueKind,
      priority: issue.priority,
    })
  ) {
    const travelMinutes = anchors.travelMinutes;
    const minuteBuffers = buildMinuteBufferRepairOptions({
      issueId: issue.id,
      toItemId: itemId,
      fromItemId: issue.fromItemId ?? anchors.fromItemId,
      toLabel,
      toDayNumber: anchors.toDayNumber,
      shortfallMinutes: anchors.shortfallMinutes,
      anchors,
    });
    const timingOpts: RepairOptionsResponse['options'] = minuteBuffers.map((opt) => ({
      id: opt.id,
      title: opt.label,
      description: opt.description,
      impact: 'high' as const,
      timeEstimate: '1分钟',
      actionType: opt.actionType ?? opt.id,
      payload: opt.payload,
      metadata: {
        tripId,
        issueKind: issue.issueKind,
        deepLink: issue.uiHints?.deepLink,
      },
    }));

    if (anchors.isStartTooEarly === true && issue.fromItemId) {
      const earlier = buildShiftEarlierRepairOption({
        issueId: issue.id,
        fromItemId: issue.fromItemId,
        fromLabel: anchors.fromPlaceLabel,
        shortfallMinutes: anchors.shortfallMinutes,
        anchors,
      });
      if (earlier) {
        timingOpts.push({
          id: earlier.id,
          title: earlier.label,
          description: earlier.description,
          impact: 'high',
          timeEstimate: '1分钟',
          actionType: earlier.actionType ?? earlier.id,
          payload: earlier.payload,
          metadata: {
            tripId,
            issueKind: issue.issueKind,
            deepLink: issue.uiHints?.deepLink,
          },
        });
      }
    }

    if (
      (anchors.isStartTooEarly === true || (anchors.shortfallMinutes ?? 0) > 0) &&
      isShiftDepartureRepairViable({ travelMinutes })
    ) {
      const shiftOpt = buildShiftDepartureRepairOption({
        issueId: issue.id,
        toItemId: itemId,
        toLabel,
        shortfallMinutes: anchors.shortfallMinutes,
        bufferMinutes: anchors.bufferMinutes ?? 5,
        suggestedTime,
        anchors,
      });
      timingOpts.push({
        id: shiftOpt.id,
        title: shiftOpt.label,
        description: shiftOpt.description,
        impact: 'high',
        timeEstimate: '1分钟',
        actionType: shiftOpt.actionType ?? shiftOpt.id,
        payload: shiftOpt.payload,
        metadata: {
          tripId,
          issueKind: issue.issueKind,
          deepLink: issue.uiHints?.deepLink,
        },
      });
    }

    options.push(...timingOpts);
  }

  options.push(
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
    );

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
