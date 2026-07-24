import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { FeasibilityReportService } from './feasibility-report.service';
import { ReadinessService } from '../../readiness/services/readiness.service';
import { computeCanStartExecute } from '../utils/feasibility-assembler.util';
import type { DepartureGateResponseDto } from '../types/departure-gate.types';
import { TripPrerequisiteService } from '../../prerequisites/services/trip-prerequisite.service';
import {
  buildEvidenceFreshness,
  buildPlanHeadlines,
  buildPreparationHeadlines,
  buildTravelStatusSummary,
  computeCanStartExecution,
  computeDepartureGateStatus,
  isPlanBlocked,
  mapPlanVerdictStatus,
  resolvePreparationStatus,
} from '../utils/departure-gate.compute.util';
import {
  collectDeparturePrepItems,
  computePreparationCompletion,
} from '../utils/departure-prep-projection.util';

@Injectable()
export class DepartureGateService {
  private readonly logger = new Logger(DepartureGateService.name);

  constructor(
    private readonly feasibility: FeasibilityReportService,
    private readonly readiness: ReadinessService,
    private readonly prisma: PrismaService,
    private readonly tripPrerequisites: TripPrerequisiteService,
  ) {}

  async getDepartureGate(tripId: string): Promise<DepartureGateResponseDto> {
    const [report, trip, checklistRows, notApplicableRows] = await Promise.all([
      this.feasibility.getReport(tripId),
      this.prisma.trip.findUnique({ where: { id: tripId } }),
      this.prisma.tripChecklistStatus.findMany({
        where: { tripId, checked: true },
        select: { findingId: true },
      }),
      this.prisma.tripFindingMark.findMany({
        where: { tripId, markType: 'not_applicable' },
        select: { findingId: true },
      }),
    ]);

    if (!trip) {
      throw new NotFoundException(`行程 ${tripId} 不存在`);
    }

    let prepItems: ReturnType<typeof collectDeparturePrepItems> = [];
    try {
      const prepResult = await this.readiness.checkFromDestination(trip.destination, {
        traveler: {},
        trip: {
          startDate: trip.startDate.toISOString().slice(0, 10),
          endDate: trip.endDate.toISOString().slice(0, 10),
        },
        itinerary: { countries: [trip.destination] },
      });
      prepItems = collectDeparturePrepItems(prepResult);
      const prerequisitePrepItems = await this.tripPrerequisites.projectDeparturePrepItems(tripId);
      prepItems = [...prepItems, ...prerequisitePrepItems];
    } catch (err) {
      this.logger.warn(
        `Departure prep projection skipped for ${tripId}: ${(err as Error).message}`,
      );
    }

    const checkedFindingIds = new Set(checklistRows.map((r) => r.findingId));
    const notApplicableFindingIds = new Set(notApplicableRows.map((r) => r.findingId));
    const prepCompletion = computePreparationCompletion({
      items: prepItems,
      checkedFindingIds,
      notApplicableFindingIds,
    });

    const hasValidation = Boolean(report.verifiedAt);
    const gateExecuteBlocked = report.gateExecute?.blocked ?? false;
    const planStatus = mapPlanVerdictStatus({
      hasValidation,
      isStale: report.isStale,
      verdictStatus: report.verdict.status,
    });
    const planBlocked = isPlanBlocked({
      hasValidation,
      isStale: report.isStale,
      verdictStatus: report.verdict.status,
      mustHandleCount: report.summary.mustHandle,
      gateExecuteBlocked,
    });
    const preparationBlocked = prepCompletion.openBlockerCount > 0;
    const evidenceFreshness = buildEvidenceFreshness({
      isStale: report.isStale,
      verifiedAt: report.verifiedAt,
      verifiedForTripVersion: report.verifiedForTripVersion,
      currentTripVersion: report.currentTripVersion,
      phaseHint: report.phaseHint,
    });
    const revalidationRequired = evidenceFreshness.revalidationRequired;

    const gateStatus = computeDepartureGateStatus({
      revalidationRequired,
      planBlocked,
      preparationBlocked,
    });

    const canExecutePlan = computeCanStartExecute({
      hasValidation,
      isStale: report.isStale,
      verdictStatus: report.verdict.status,
      gateExecute: report.gateExecute,
    });

    const planHeadlines = buildPlanHeadlines({
      status: planStatus,
      mustHandleCount: report.summary.mustHandle,
      suggestAdjustCount: report.summary.suggestAdjust,
      isStale: report.isStale,
    });

    const prepStatus = resolvePreparationStatus({
      openBlockerCount: prepCompletion.openBlockerCount,
      totalTrackedItemCount: prepCompletion.totalTrackedItemCount,
      completedItemCount: prepCompletion.completedItemCount,
    });
    const prepHeadlines = buildPreparationHeadlines({
      status: prepStatus,
      openBlockerCount: prepCompletion.openBlockerCount,
      openMustCount: prepCompletion.openMustCount,
      completionPercent: prepCompletion.completionPercent,
    });

    const travelStatusSummary = buildTravelStatusSummary({
      gateStatus,
      planHeadline: planHeadlines.headline,
      prepHeadline: prepHeadlines.headline,
      validatedAt: report.verifiedAt,
    });

    return {
      schema: 'tripnara.departure_gate@v1',
      tripId,
      calculatedAt: new Date().toISOString(),
      status: gateStatus,
      canStartExecution: computeCanStartExecution(gateStatus),
      canStartExecutePlanOnly: canExecutePlan,
      planVerdict: {
        status: planStatus,
        canExecutePlan,
        headline: planHeadlines.headline,
        subheadline: planHeadlines.subheadline,
        mustHandleCount: report.summary.mustHandle,
        suggestAdjustCount: report.summary.suggestAdjust,
        verifiedAt: report.verifiedAt,
        verifiedForTripVersion: report.verifiedForTripVersion,
        currentTripVersion: report.currentTripVersion,
        isStale: report.isStale,
        gateExecuteBlocked,
      },
      preparationVerdict: {
        status: prepStatus,
        canDepartByPreparation: !preparationBlocked,
        completionPercent: prepCompletion.completionPercent,
        openBlockerCount: prepCompletion.openBlockerCount,
        openMustCount: prepCompletion.openMustCount,
        openShouldCount: prepCompletion.openShouldCount,
        completedItemCount: prepCompletion.completedItemCount,
        totalTrackedItemCount: prepCompletion.totalTrackedItemCount,
        headline: prepHeadlines.headline,
        subheadline: prepHeadlines.subheadline,
      },
      evidenceFreshness,
      travelStatusSummary,
      links: {
        feasibilityReport: `/api/trips/${tripId}/feasibility-report`,
        departurePreparation: `/api/readiness/trip/${tripId}`,
        decisionChecker: `/api/trips/${tripId}/decision-checker`,
        prerequisites: `/api/trips/${tripId}/prerequisites`,
      },
    };
  }
}
