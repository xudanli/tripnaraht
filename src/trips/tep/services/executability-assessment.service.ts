import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { resolveTripDestinationCountry } from '../../../decision-runtime/packs/loader/country-pack-registry.util';
import { FeasibilityReportService } from '../../trip-constraint-solver/services/feasibility-report.service';
import type {
  DailyDrivePlan,
  ExecutabilityAssessment,
  ExecutabilityAssessmentUi,
  PlanningRuleResult,
  SelfDriveProfile,
} from '../contracts/tep-self-drive.types';
import {
  mapFeasibilityIssuesToAssessment,
} from '../mappers/feasibility-to-executability.mapper';
import { projectDailyDrivePlans } from '../projectors/daily-drive-plan.projector';
import type {
  ItineraryItemRow,
  TripDayRow,
} from '../projectors/daily-drive-plan.projector';
import { buildItemLabelMapFromItineraryRows } from '../../trip-constraint-solver/utils/constraint-impact-drive-schedule.util';
import { projectExecutabilityAssessmentUi } from '../projectors/executability-assessment-ui.projector';
import { resolveSelfDriveProfile } from '../resolvers/self-drive-profile.resolver';
import { loadDrivingLoadConfig } from '../loaders/driving-load-config.loader';
import { TepOrchestratorService } from '../orchestrators/tep-orchestrator.service';
import { WorldStateTepEvidenceService } from './world-state-tep-evidence.service';
import { TepPlanMetadataService } from './tep-plan-metadata.service';
import type { TepPlanVersionMetadata } from '../contracts/tep-plan-metadata.types';
import type { TepWorldStateEvidence } from '../adapters/world-state-to-tep-evidence.adapter';
import { projectDecisionHooks } from '../projectors/decision-hook.projector';
import type { DecisionHook, RecoveryGraph } from '../contracts/tep-self-drive.types';
import {
  projectLocalRepairPreviews,
  projectRecoveryGraph,
  type LocalRepairPreview,
} from '../projectors/recovery-graph.projector';
import {
  projectPlanningTepDecisionProblems,
  type PlanningTepDecisionProblem,
} from '../projectors/planning-tep-decision-problem.projector';

export interface TripExecutabilityView {
  tripId: string;
  assessment: ExecutabilityAssessment;
  ui: ExecutabilityAssessmentUi;
  profile: SelfDriveProfile;
  dailyDrivePlans: DailyDrivePlan[];
  drivingLoadConfig: ReturnType<typeof loadDrivingLoadConfig>;
  feasibilityReportVersion?: string;
  isStale: boolean;
  /** TEP Validator 规则结果（规划期） */
  tepRuleResults?: ExecutabilityAssessment['ruleResults'];
  /** WP-TEP-10 — WorldState 证据桥接结果 */
  worldStateEvidence?: TepWorldStateEvidence;
  evidenceBinding: 'WORLD_STATE' | 'PLAN_SCHEDULE' | 'HYBRID';
  /** WP-TEP-11 — 规划期 DecisionHook 投影 */
  decisionHooks: DecisionHook[];
  /** WP-TEP-12 — RecoveryGraph 节点/依赖/fallback */
  recoveryGraph: RecoveryGraph;
  /** WP-TEP-12 — Local Repair 重评估预览（REQUIRES_REPAIR 时） */
  repairPreviews: LocalRepairPreview[];
  /** P1 — 规划期 DecisionProblem 读模型（reason + impact + options） */
  planningDecisionProblems: PlanningTepDecisionProblem[];
  /** WP-TEP-11 — PlanVersion.metadata.tep 同步结果 */
  planVersionId?: string;
  hooksPersisted: boolean;
  tepPlanMetadata?: TepPlanVersionMetadata;
}

@Injectable()
export class ExecutabilityAssessmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly feasibility: FeasibilityReportService,
    private readonly tepOrchestrator: TepOrchestratorService,
    private readonly worldStateEvidence: WorldStateTepEvidenceService,
    private readonly tepPlanMetadata: TepPlanMetadataService,
  ) {}

  async getExecutability(
    tripId: string,
    options?: { refresh?: boolean },
  ): Promise<TripExecutabilityView> {
    const report = options?.refresh
      ? await this.feasibility.validate(tripId, {})
      : await this.feasibility.getReport(tripId);

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        destination: true,
        metadata: true,
        pacingConfig: true,
      },
    });
    if (!trip) {
      throw new NotFoundException(`Trip ${tripId} not found`);
    }

    const countryCode = resolveTripDestinationCountry(trip.destination) ?? 'IS';
    const metadata =
      trip.metadata && typeof trip.metadata === 'object' && !Array.isArray(trip.metadata)
        ? (trip.metadata as Record<string, unknown>)
        : {};

    const explorationInput = metadata.explorationInput as
      | import('../../exploration/types/exploration.types').ExplorationInput
      | undefined;

    const profile = resolveSelfDriveProfile({
      tripId,
      explorationInput,
      tripPacingConfig: trip.pacingConfig,
      tripMetadata: metadata,
      destinationCountry: countryCode,
    });

    const { dailyDrivePlans } = await this.projectDailyDrivePlansForTrip(tripId);
    const wsEvidence = await this.worldStateEvidence.resolveEvidenceForTrip({
      tripId,
      dailyDrivePlans,
    });

    const evidenceBinding: TripExecutabilityView['evidenceBinding'] =
      wsEvidence.sources.includes('road.status') ||
      wsEvidence.sources.includes('execution.departure_slip') ||
      wsEvidence.sources.includes('weather.hazard')
        ? wsEvidence.sources.includes('plan_schedule')
          ? 'HYBRID'
          : 'WORLD_STATE'
        : 'PLAN_SCHEDULE';

    const feasibilityAssessment = mapFeasibilityIssuesToAssessment({
      tripId,
      issues: report.issues,
      packId: `destination.${countryCode.toLowerCase()}`,
      packVersion: '1.0.0',
      planVersionRef: report.verifiedForTripVersion ?? report.currentTripVersion,
      countryCode,
      evaluatedAt: report.verifiedAt,
    });

    const tepAssessment = this.tepOrchestrator.validatePlanningSnapshot({
      tripId,
      countryCode,
      profile,
      dailyDrivePlans,
      planVersionRef: report.verifiedForTripVersion ?? report.currentTripVersion,
      feasibilityRuleResults: feasibilityAssessment.ruleResults,
      evaluatedAt: report.verifiedAt,
      roadConditions: wsEvidence.roadConditions,
      activityArrivals: wsEvidence.activityArrivals,
    });

    const assessment = tepAssessment;
    const decisionHooks = projectDecisionHooks({
      tripId,
      countryCode,
      dailyDrivePlans,
      profile,
    });

    const recoveryGraph = projectRecoveryGraph({
      tripId,
      countryCode,
      dailyDrivePlans,
      profile,
      ruleResults: tepAssessment.ruleResults,
    });

    const repairPreviews = projectLocalRepairPreviews({
      tripId,
      countryCode,
      profile,
      dailyDrivePlans,
      recoveryGraph,
      assessmentStatus: assessment.status,
    });

    const planningDecisionProblems = projectPlanningTepDecisionProblems({
      tripId,
      assessmentStatus: assessment.status,
      ruleResults: tepAssessment.ruleResults,
      recoveryGraph,
      repairPreviews,
    });

    const planVersionRef = report.verifiedForTripVersion ?? report.currentTripVersion;
    const syncResult = await this.tepPlanMetadata.syncTepArtifacts({
      tripId,
      planVersionRef,
      decisionHooks,
      recoveryGraph,
    });

    return {
      tripId,
      assessment,
      ui: projectExecutabilityAssessmentUi(assessment),
      profile,
      dailyDrivePlans,
      drivingLoadConfig: loadDrivingLoadConfig(countryCode),
      feasibilityReportVersion: report.verifiedForTripVersion ?? report.currentTripVersion,
      isStale: report.isStale,
      tepRuleResults: tepAssessment.ruleResults.filter((r) =>
        r.ruleId.startsWith('SDR-'),
      ),
      worldStateEvidence: wsEvidence,
      evidenceBinding,
      decisionHooks,
      recoveryGraph,
      repairPreviews,
      planningDecisionProblems,
      planVersionId: syncResult.planVersionId,
      hooksPersisted: syncResult.synced,
      tepPlanMetadata: syncResult.tep,
    };
  }

  /**
   * P0 Assessment Merge — TEP-only SDR results (parallel lane, no feasibility merge).
   */
  async getTepOnlyPlanningRuleResults(
    tripId: string,
    options?: { refresh?: boolean },
  ): Promise<{
    ruleResults: PlanningRuleResult[];
    profile: SelfDriveProfile;
    dailyDrivePlans: DailyDrivePlan[];
    itemLabelsById: Map<string, string>;
    evaluatedAt: string;
    planVersionRef?: string;
  }> {
    const report = options?.refresh
      ? await this.feasibility.validate(tripId, {})
      : await this.feasibility.getReport(tripId);

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        destination: true,
        metadata: true,
        pacingConfig: true,
      },
    });
    if (!trip) {
      throw new NotFoundException(`Trip ${tripId} not found`);
    }

    const countryCode = resolveTripDestinationCountry(trip.destination) ?? 'IS';
    const metadata =
      trip.metadata && typeof trip.metadata === 'object' && !Array.isArray(trip.metadata)
        ? (trip.metadata as Record<string, unknown>)
        : {};

    const explorationInput = metadata.explorationInput as
      | import('../../exploration/types/exploration.types').ExplorationInput
      | undefined;

    const profile = resolveSelfDriveProfile({
      tripId,
      explorationInput,
      tripPacingConfig: trip.pacingConfig,
      tripMetadata: metadata,
      destinationCountry: countryCode,
    });

    const { dailyDrivePlans, itemLabelsById } = await this.projectDailyDrivePlansForTrip(tripId);
    const wsEvidence = await this.worldStateEvidence.resolveEvidenceForTrip({
      tripId,
      dailyDrivePlans,
    });

    const tepAssessment = this.tepOrchestrator.validateTepOnly({
      tripId,
      countryCode,
      profile,
      dailyDrivePlans,
      planVersionRef: report.verifiedForTripVersion ?? report.currentTripVersion,
      evaluatedAt: report.verifiedAt,
      roadConditions: wsEvidence.roadConditions,
      activityArrivals: wsEvidence.activityArrivals,
    });

    return {
      ruleResults: tepAssessment.ruleResults.filter((r) => r.ruleId.startsWith('SDR-')),
      profile,
      dailyDrivePlans,
      itemLabelsById,
      evaluatedAt: report.verifiedAt ?? new Date().toISOString(),
      planVersionRef: report.verifiedForTripVersion ?? report.currentTripVersion,
    };
  }

  private async projectDailyDrivePlansForTrip(tripId: string): Promise<{
    dailyDrivePlans: DailyDrivePlan[];
    itemLabelsById: Map<string, string>;
  }> {
    const tripDays = await this.prisma.tripDay.findMany({
      where: { tripId },
      select: { id: true, date: true },
      orderBy: { date: 'asc' },
    });

    const items = await this.prisma.itineraryItem.findMany({
      where: { tripDayId: { in: tripDays.map((d) => d.id) } },
      select: {
        id: true,
        tripDayId: true,
        type: true,
        order: true,
        startTime: true,
        endTime: true,
        note: true,
        placeId: true,
        bookingStatus: true,
        costCategory: true,
        travelFromPreviousDuration: true,
        travelFromPreviousDistance: true,
        travelMode: true,
        Place: {
          select: {
            nameCN: true,
            nameEN: true,
            category: true,
          },
        },
      },
      orderBy: [{ order: 'asc' }, { id: 'asc' }],
    });

    const placeCoords = await this.loadPlaceCoordinatesMap(
      [...new Set(items.map((item) => item.placeId).filter((id): id is number => id != null))],
    );

    const itemsByDayId = new Map<string, ItineraryItemRow[]>();
    const labelRows: Array<{
      id: string;
      placeNameCN?: string | null;
      placeNameEN?: string | null;
      note?: string | null;
    }> = [];
    for (const item of items) {
      const coords = item.placeId != null ? placeCoords.get(item.placeId) : undefined;
      const row: ItineraryItemRow = {
        id: item.id,
        tripDayId: item.tripDayId,
        type: item.type,
        order: item.order,
        startTime: item.startTime,
        endTime: item.endTime,
        note: item.note,
        placeId: item.placeId,
        placeNameCN: item.Place?.nameCN ?? null,
        placeNameEN: item.Place?.nameEN ?? null,
        placeCategory: item.Place?.category ?? null,
        placeLat: coords?.lat ?? null,
        placeLng: coords?.lng ?? null,
        costCategory: item.costCategory,
        bookingStatus: item.bookingStatus,
        travelFromPreviousDuration: item.travelFromPreviousDuration,
        travelFromPreviousDistance: item.travelFromPreviousDistance,
        travelMode: item.travelMode,
      };
      const bucket = itemsByDayId.get(item.tripDayId) ?? [];
      bucket.push(row);
      itemsByDayId.set(item.tripDayId, bucket);
      labelRows.push({
        id: item.id,
        placeNameCN: item.Place?.nameCN ?? null,
        placeNameEN: item.Place?.nameEN ?? null,
        note: item.note,
      });
    }

    return {
      dailyDrivePlans: projectDailyDrivePlans({
        tripId,
        planVersionId: 'effective',
        tripDays: tripDays as TripDayRow[],
        itemsByDayId,
      }),
      itemLabelsById: buildItemLabelMapFromItineraryRows(labelRows),
    };
  }

  private async loadPlaceCoordinatesMap(
    placeIds: number[],
  ): Promise<Map<number, { lat: number; lng: number }>> {
    const map = new Map<number, { lat: number; lng: number }>();
    if (!placeIds.length) return map;

    const rows = await this.prisma.$queryRaw<
      Array<{ id: number; lat: number; lng: number }>
    >(
      Prisma.sql`
        SELECT id, ST_Y(location::geometry)::float as lat, ST_X(location::geometry)::float as lng
        FROM "Place"
        WHERE id IN (${Prisma.join(placeIds)}) AND location IS NOT NULL
      `,
    );

    for (const row of rows) {
      if (row.lat == null || row.lng == null) continue;
      map.set(row.id, { lat: row.lat, lng: row.lng });
    }
    return map;
  }
}
