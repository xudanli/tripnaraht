/**
 * 分流方案 — 应用写操作与元数据读
 */

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { DEFAULT_PACING_TRAVEL_MODE } from '../../../common/constants/travel-mode-scope.constants';
import { ConstraintsSummaryService } from './constraints-summary.service';
import { FeasibilityReportService } from './feasibility-report.service';
import { TripConstraintPreviewService } from './trip-constraint-preview.service';
import {
  appendSplitSnapshotSuffix,
  projectSplitPlanBundle,
  readAppliedSplitPlanIds,
  type SplitPlanProjectionInput,
  type SplitPlanProjectionResult,
} from '../utils/split-plan.projection.util';
import { buildSnapshotVersion } from '../utils/decision-checker-view.projection.util';
import {
  bumpConstraintsVersion,
  getConstraintsVersion,
} from '../utils/constraints-metadata.util';
import { toInputJsonValue } from '../../budget-os/utils/prisma-json.util';
import { assertDirectEffectivePlanWriteBlocked } from '../../../decision-runtime/execution/effective-plan-write-chain-blocked.util';
import type { PlanningDaySplitDto } from '../types/planning-conflicts.types';
import type { FeasibilityIssueDto, TripFeasibilityReportDto } from '../types/trip-constraint-solver.types';
import type { ConstraintsSummaryResponse } from '../types/constraints-summary.types';
import {
  appendSplitNoteTag,
  buildApplyManifestFromDaySplit,
  type SplitPlanApplyManifest,
} from '../utils/split-plan-schedule.builder.util';
import {
  loadMemberClusterForSplit,
  loadSplitPlanScheduleSource,
} from '../utils/split-plan-schedule.source.util';
import {
  mergeSplitPlanProjection,
  patchSplitPlanOverrides,
  readSplitPlanOverridesMap,
} from '../utils/split-plan-overrides.util';
import type { PatchSplitPlanBody, PatchSplitPlanResponse } from '../dto/patch-split-plan.dto';

export interface ApplySplitPlanBody {
  constraintsVersion?: number;
  confirm?: boolean;
}

export interface ApplySplitPlanResponse {
  applied: boolean;
  scheduleVersion: string;
  affectedDays: number[];
}

function stubConstraintsSummaryForSplit(
  tripId: string,
  report: TripFeasibilityReportDto,
): ConstraintsSummaryResponse {
  const memberCount = report.teamFitSummary?.memberCount ?? 0;
  return {
    tripId,
    constraintsVersion: 0,
    confirmedAt: null,
    confirmedBy: null,
    isUserConfirmed: false,
    isVersionConfirmed: false,
    allReady: false,
    pendingCount: 0,
    timeRange: { startDate: null, endDate: null, dayCount: 0, status: 'missing' },
    budget: { total: null, currency: 'CNY', status: 'missing' },
    travelers: {
      count: memberCount,
      memberCount,
      profilingCompletedCount: report.teamFitSummary?.profilingCompletedCount ?? 0,
      status: memberCount > 0 ? 'confirmed' : 'missing',
    },
    transport: {
      travelMode: DEFAULT_PACING_TRAVEL_MODE,
      label: '自驾',
      transportHint: 'self_drive',
      editable: false,
      hidden: true,
      scope: 'self_drive_only',
      status: 'confirmed',
    },
    pendingItems: [],
  };
}

@Injectable()
export class SplitPlanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly constraintsSummary: ConstraintsSummaryService,
    @Inject(forwardRef(() => FeasibilityReportService))
    private readonly feasibility: FeasibilityReportService,
    private readonly preview: TripConstraintPreviewService,
  ) {}

  async getAppliedSplitPlanIds(tripId: string): Promise<string[]> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    if (!trip) return [];
    return readAppliedSplitPlanIds(trip.metadata);
  }

  async getScheduleContext(tripId: string) {
    return this.loadScheduleContext(tripId);
  }

  private async loadScheduleContext(tripId: string) {
    const memberCluster = await loadMemberClusterForSplit(this.prisma, tripId);
    const schedule = await loadSplitPlanScheduleSource(this.prisma, tripId, memberCluster);
    return { schedule, memberCluster };
  }

  async projectForTrip(
    tripId: string,
    opts?: {
      primaryIssue?: FeasibilityIssueDto;
      appliedSplitPlanIds?: string[];
      report?: TripFeasibilityReportDto;
      /** 跳过 constraintsSummary / assessTrip，供 planning-conflicts 首包 */
      lightweight?: boolean;
    },
  ): Promise<SplitPlanProjectionResult | undefined> {
    const appliedIds = opts?.appliedSplitPlanIds ?? (await this.getAppliedSplitPlanIds(tripId));
    const reportPromise = opts?.report
      ? Promise.resolve(opts.report)
      : opts?.lightweight
        ? this.feasibility.getReportFast(tripId)
        : this.feasibility.getReport(tripId);

    if (opts?.lightweight) {
      const [report, scheduleContext] = await Promise.all([
        reportPromise,
        this.loadScheduleContext(tripId),
      ]);
      const experienceCompletionDelta =
        typeof report.itineraryCompletenessSummary?.score === 'number'
          ? Math.round(report.itineraryCompletenessSummary.score - 100)
          : undefined;

      return this.applyStoredOverrides(
        tripId,
        projectSplitPlanBundle({
          tripId,
          report,
          constraintsSummary: stubConstraintsSummaryForSplit(tripId, report),
          primaryIssue: opts?.primaryIssue,
          experienceCompletionDelta,
          appliedSplitPlanIds: appliedIds,
          schedule: scheduleContext.schedule,
        }),
      );
    }

    const [report, constraintsSummary, assessSummary, scheduleContext] = await Promise.all([
      reportPromise,
      this.constraintsSummary.getSummary(tripId),
      this.preview.captureAssessSummary(tripId),
      this.loadScheduleContext(tripId),
    ]);

    const experienceCompletionDelta =
      typeof report.itineraryCompletenessSummary?.score === 'number'
        ? Math.round(report.itineraryCompletenessSummary.score - 100)
        : undefined;

    const input: SplitPlanProjectionInput = {
      tripId,
      report,
      constraintsSummary,
      primaryIssue: opts?.primaryIssue,
      experienceCompletionDelta,
      appliedSplitPlanIds: appliedIds,
      schedule: scheduleContext.schedule,
    };

    return this.applyStoredOverrides(tripId, projectSplitPlanBundle(input));
  }

  private async applyStoredOverrides(
    tripId: string,
    bundle: SplitPlanProjectionResult | undefined,
  ): Promise<SplitPlanProjectionResult | undefined> {
    if (!bundle) return undefined;
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const overrides = readSplitPlanOverridesMap(trip?.metadata)[bundle.splitPlan.id];
    return mergeSplitPlanProjection(bundle, overrides);
  }

  async patchSplitPlan(
    tripId: string,
    splitPlanId: string,
    body: PatchSplitPlanBody,
    userId: string,
  ): Promise<PatchSplitPlanResponse> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { id: true, metadata: true },
    });
    if (!trip) throw new NotFoundException(`行程 ${tripId} 不存在`);

    const currentVersion = getConstraintsVersion(trip.metadata);
    if (body.constraintsVersion != null && body.constraintsVersion !== currentVersion) {
      throw new ConflictException({
        code: 'CONSTRAINTS_STALE',
        message: `约束已变更（当前 version=${currentVersion}）`,
        currentVersion,
      });
    }

    const bundle = await this.projectForTrip(tripId, {
      appliedSplitPlanIds: readAppliedSplitPlanIds(trip.metadata),
    });
    if (!bundle || bundle.splitPlan.id !== splitPlanId) {
      throw new BadRequestException({
        code: 'SPLIT_PLAN_NOT_FOUND',
        message: `分流方案 ${splitPlanId} 不存在或已过期`,
      });
    }

    const overridesMap = readSplitPlanOverridesMap(trip.metadata);
    const mergedOverrides = patchSplitPlanOverrides(overridesMap[splitPlanId], body, userId);
    overridesMap[splitPlanId] = mergedOverrides;

    const baseMeta =
      trip.metadata && typeof trip.metadata === 'object'
        ? { ...(trip.metadata as Record<string, unknown>) }
        : {};

    const bumped = bumpConstraintsVersion({
      ...baseMeta,
      splitPlanOverrides: overridesMap,
    });

    await this.prisma.trip.update({
      where: { id: tripId },
      data: { metadata: toInputJsonValue(bumped) },
    });

    const refreshed = await this.projectForTrip(tripId, {
      appliedSplitPlanIds: readAppliedSplitPlanIds(bumped),
    });
    const daySplit = refreshed?.daySplits[0];
    if (!refreshed || !daySplit) {
      throw new BadRequestException('分流日数据缺失');
    }

    return {
      splitPlanId,
      constraintsVersion: getConstraintsVersion(bumped),
      overrides: mergedOverrides,
      splitPlan: refreshed.splitPlan,
      daySplit,
    };
  }

  async projectDaySplits(
    tripId: string,
    opts?: { report?: TripFeasibilityReportDto; lightweight?: boolean },
  ): Promise<PlanningDaySplitDto[] | undefined> {
    const bundle = await this.projectForTrip(tripId, {
      ...opts,
      lightweight: opts?.lightweight ?? Boolean(opts?.report),
    });
    return bundle?.daySplits;
  }

  private async persistApplyManifest(
    tripId: string,
    bundle: SplitPlanProjectionResult,
    appliedAt: string,
    userId: string,
  ): Promise<SplitPlanApplyManifest | undefined> {
    // Agent Harness P1：既有行程 note 结构写须走写链
    assertDirectEffectivePlanWriteBlocked('split-plan.persistApplyManifest');

    const { schedule } = await this.loadScheduleContext(tripId);
    if (!schedule) return undefined;

    const daySplit = bundle.daySplits[0];
    if (!daySplit) return undefined;

    const manifest = buildApplyManifestFromDaySplit(
      daySplit,
      schedule,
      bundle.splitPlan.id,
      appliedAt,
    );

    const itemUpdates: Array<{ id: string; note: string }> = [];
    for (const group of manifest.groups) {
      for (const itemId of group.itemIds) {
        const row = await this.prisma.itineraryItem.findUnique({
          where: { id: itemId },
          select: { note: true },
        });
        if (!row) continue;
        itemUpdates.push({
          id: itemId,
          note: appendSplitNoteTag(row.note, group.groupId),
        });
      }
    }

    if (itemUpdates.length > 0) {
      await this.prisma.$transaction(
        itemUpdates.map((u) =>
          this.prisma.itineraryItem.update({
            where: { id: u.id },
            data: { note: u.note },
          }),
        ),
      );
    }

    return manifest;
  }

  private bumpScheduleVersion(metadata: Record<string, unknown>): string {
    const prev =
      typeof metadata.scheduleVersion === 'string'
        ? metadata.scheduleVersion
        : typeof metadata.verifiedForTripVersion === 'string'
          ? metadata.verifiedForTripVersion
          : 'v0';
    const numMatch = prev.match(/v(\d+)$/);
    const nextNum = numMatch ? Number(numMatch[1]) + 1 : 1;
    const scheduleVersion = `plan_v${nextNum}`;
    metadata.scheduleVersion = scheduleVersion;
    return scheduleVersion;
  }

  async applySplitPlan(
    tripId: string,
    splitPlanId: string,
    body: ApplySplitPlanBody,
    userId: string,
  ): Promise<ApplySplitPlanResponse> {
    if (!body.confirm) {
      throw new BadRequestException({
        code: 'SPLIT_PLAN_CONFIRM_REQUIRED',
        message: 'confirm=true required to apply split plan',
      });
    }

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { id: true, metadata: true },
    });
    if (!trip) throw new NotFoundException(`行程 ${tripId} 不存在`);

    const currentVersion = getConstraintsVersion(trip.metadata);
    if (body.constraintsVersion != null && body.constraintsVersion !== currentVersion) {
      throw new ConflictException({
        code: 'CONSTRAINTS_STALE',
        message: `约束已变更（当前 version=${currentVersion}）`,
        currentVersion,
      });
    }

    const bundle = await this.projectForTrip(tripId, {
      appliedSplitPlanIds: readAppliedSplitPlanIds(trip.metadata),
    });
    if (!bundle || bundle.splitPlan.id !== splitPlanId) {
      throw new BadRequestException({
        code: 'SPLIT_PLAN_NOT_FOUND',
        message: `分流方案 ${splitPlanId} 不存在或已过期`,
      });
    }

    const alreadyApplied = readAppliedSplitPlanIds(trip.metadata);
    if (alreadyApplied.includes(splitPlanId)) {
      const report = await this.feasibility.getReport(tripId);
      return {
        applied: true,
        scheduleVersion:
          (trip.metadata as { scheduleVersion?: string })?.scheduleVersion ??
          (report.verifiedForTripVersion ? `plan_${report.verifiedForTripVersion}` : 'plan_v0'),
        affectedDays: bundle.splitPlan.banner.affectedDays,
      };
    }

    const appliedAt = new Date().toISOString();
    const manifest = await this.persistApplyManifest(tripId, bundle, appliedAt, userId);

    const baseMeta =
      trip.metadata && typeof trip.metadata === 'object'
        ? { ...(trip.metadata as Record<string, unknown>) }
        : {};

    const appliedSplitPlans = [
      ...(Array.isArray(baseMeta.appliedSplitPlans) ? baseMeta.appliedSplitPlans : []),
      {
        id: splitPlanId,
        appliedAt,
        appliedBy: userId,
        affectedDays: bundle.splitPlan.banner.affectedDays,
      },
    ];

    const scheduleVersion = this.bumpScheduleVersion(baseMeta);

    const splitPlanManifests = [
      ...(Array.isArray(baseMeta.splitPlanManifests) ? baseMeta.splitPlanManifests : []),
      ...(manifest ? [manifest] : []),
    ];

    const bumped = bumpConstraintsVersion({
      ...baseMeta,
      appliedSplitPlans,
      splitPlanManifests,
      lastAppliedSplitPlanId: splitPlanId,
      scheduleVersion,
    });

    await this.prisma.trip.update({
      where: { id: tripId },
      data: { metadata: toInputJsonValue(bumped) },
    });

    return {
      applied: true,
      scheduleVersion,
      affectedDays: bundle.splitPlan.banner.affectedDays,
    };
  }

  async resolveCurrentSnapshotVersion(tripId: string, generatedAt: string): Promise<string | undefined> {
    const bundle = await this.projectForTrip(tripId);
    if (!bundle) return undefined;

    const [constraintsSummary, report] = await Promise.all([
      this.constraintsSummary.getSummary(tripId),
      this.feasibility.getReport(tripId),
    ]);
    const base = buildSnapshotVersion(
      constraintsSummary.constraintsVersion,
      report,
      generatedAt,
    );
    return appendSplitSnapshotSuffix(base, bundle.splitPlan.id);
  }
}
