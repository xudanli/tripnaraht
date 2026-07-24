/**
 * Overall Trip Readiness — 事实采集 + 快照组装
 */

import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { resolveTripDestinationCountry } from '../../../decision-runtime/packs/loader/country-pack-registry.util';
import { FeasibilityReportService } from '../../trip-constraint-solver/services/feasibility-report.service';
import { DepartureGateService } from '../../trip-constraint-solver/services/departure-gate.service';
import { isAccommodationItem } from '../../utils/accommodation-overview.util';
import { computePlanningProgress } from '../../utils/timeline-overview.util';
import { TripsService } from '../../trips.service';
import { toInputJsonValue } from '../../budget-os/utils/prisma-json.util';
import type {
  OverallReadinessCardProjection,
  OverallReadinessFactInput,
  OverallReadinessSnapshot,
} from '../types/overall-trip-readiness.types';
import {
  assembleOverallReadinessSnapshot,
  projectOverallReadinessCard,
} from '../utils/assemble-overall-readiness.util';
import { projectTransportFromDecisionCases } from '../utils/decision-case-transport.util';
import {
  buildOverallReadinessCache,
  OVERALL_READINESS_CACHE_KEY,
} from '../utils/overall-readiness-cache.util';

const CORE_ACTIVITY_PATTERN =
  /冰川|glacier|ice\s*cave|蓝冰|whale|观鲸|silfra|直升机|helicopter|snowmobile|雪地摩托|骑马|horse|温泉|lagoon|浮潜|潜水|volcano|火山|高地|highland|f-?road/i;

const BOOKED = new Set(['BOOKED', 'CONFIRMED', 'COMPLETED']);

@Injectable()
export class OverallTripReadinessService {
  private readonly logger = new Logger(OverallTripReadinessService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tripsService: TripsService,
    @Optional() private readonly feasibility?: FeasibilityReportService,
    @Optional() private readonly departureGate?: DepartureGateService,
  ) {}

  async getSnapshot(
    tripId: string,
    userId?: string,
  ): Promise<OverallReadinessSnapshot> {
    await this.tripsService.findOne(tripId, userId);
    const facts = await this.collectFacts(tripId);
    const snapshot = assembleOverallReadinessSnapshot(facts);
    await this.persistCache(tripId, snapshot);
    return snapshot;
  }

  async getCard(
    tripId: string,
    userId?: string,
  ): Promise<OverallReadinessCardProjection> {
    const snapshot = await this.getSnapshot(tripId, userId);
    return projectOverallReadinessCard(snapshot);
  }

  async collectFacts(tripId: string): Promise<OverallReadinessFactInput> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        destination: true,
        metadata: true,
        TripDay: {
          orderBy: { date: 'asc' },
          select: {
            id: true,
            date: true,
            ItineraryItem: {
              select: {
                id: true,
                type: true,
                bookingStatus: true,
                bookingConfirmation: true,
                costCategory: true,
                note: true,
                Place: {
                  select: {
                    nameCN: true,
                    nameEN: true,
                    category: true,
                  },
                },
              },
            },
          },
        },
        TripCollaborator: { select: { userId: true, role: true } },
      },
    });

    if (!trip) {
      throw new NotFoundException(`Trip ${tripId} not found`);
    }

    const metadata =
      trip.metadata && typeof trip.metadata === 'object' && !Array.isArray(trip.metadata)
        ? (trip.metadata as Record<string, unknown>)
        : {};
    const constraints =
      metadata.constraints &&
      typeof metadata.constraints === 'object' &&
      !Array.isArray(metadata.constraints)
        ? (metadata.constraints as Record<string, unknown>)
        : {};

    const countryCode = resolveTripDestinationCountry(trip.destination) ?? null;
    const isSelfDrive = this.resolveIsSelfDrive(metadata, countryCode);
    const memberCount = Math.max(1, trip.TripCollaborator.length || 1);
    const decisionTransport = projectTransportFromDecisionCases(metadata);

    const [feasibilityFacts, gateFacts, planningInternal] = await Promise.all([
      this.loadFeasibilityFacts(tripId),
      this.loadGateFreshness(tripId),
      this.loadPlanningProgressInternal(tripId),
    ]);

    const days = trip.TripDay;
    const expectedNightCount = Math.max(0, days.length - 1);
    const accommodationFacts = this.projectAccommodation(days, expectedNightCount);
    const transportFacts = this.projectTransport({
      isSelfDrive,
      constraints,
      metadata,
      days,
      decisionTransport,
      openBlockingTitles: [
        ...decisionTransport.openBlockingProblems,
        ...feasibilityFacts.openTransportBlockers.filter(
          (b) => !decisionTransport.openBlockingProblems.some((d) => d.id === b.id),
        ),
      ],
    });
    const activityFacts = this.projectActivities(days, memberCount);
    const openCriticalDecisionCount = Math.max(
      decisionTransport.openCriticalDecisionCount,
      (!transportFacts.vehicleConfirmed ? 1 : 0) +
        (isSelfDrive && !transportFacts.insuranceConfirmed ? 1 : 0),
    );

    const memberRates = await this.loadMemberProfilingRates(tripId, memberCount);

    const memberFacts = this.projectMembers({
      memberCount,
      collaborators: trip.TripCollaborator,
      metadata,
      openCriticalDecisionCount,
      teamFitScore: feasibilityFacts.teamFitScore,
      preferenceCompletionRate: memberRates.preferenceCompletionRate,
      hardLimitsConfirmedRate: memberRates.hardLimitsConfirmedRate,
      profilingCompletionRate: memberRates.profilingCompletionRate,
    });

    return {
      tripId,
      calculatedAt: new Date().toISOString(),
      countryCode,
      isSelfDrive,
      memberCount,
      feasibility: feasibilityFacts.feasibility,
      accommodation: accommodationFacts,
      transport: transportFacts,
      activities: activityFacts,
      members: memberFacts,
      evidenceFreshness: gateFacts,
      feasibilityProofs: feasibilityFacts.proofs,
      planningProgressInternal: planningInternal,
    };
  }

  private async persistCache(
    tripId: string,
    snapshot: OverallReadinessSnapshot,
  ): Promise<void> {
    try {
      const trip = await this.prisma.trip.findUnique({
        where: { id: tripId },
        select: { metadata: true, updatedAt: true },
      });
      if (!trip) return;
      const meta =
        trip.metadata && typeof trip.metadata === 'object' && !Array.isArray(trip.metadata)
          ? (trip.metadata as Record<string, unknown>)
          : {};
      await this.prisma.trip.update({
        where: { id: tripId },
        data: {
          metadata: toInputJsonValue({
            ...meta,
            [OVERALL_READINESS_CACHE_KEY]: buildOverallReadinessCache(
              snapshot,
              trip.updatedAt.toISOString(),
            ),
          }),
        },
      });
    } catch (err) {
      this.logger.warn(
        `overall readiness cache write failed trip=${tripId}: ${(err as Error).message}`,
      );
    }
  }

  private resolveIsSelfDrive(
    metadata: Record<string, unknown>,
    countryCode: string | null,
  ): boolean {
    if (typeof metadata.isSelfDrive === 'boolean') return metadata.isSelfDrive;
    if (typeof metadata.selfDrive === 'boolean') return metadata.selfDrive;
    const mode = String(metadata.travelMode ?? metadata.transportMode ?? '').toLowerCase();
    if (mode.includes('self') || mode.includes('drive') || mode === 'car') return true;
    if (mode.includes('transit') || mode.includes('flight') || mode.includes('train')) {
      return false;
    }
    return countryCode === 'IS';
  }

  private async loadFeasibilityFacts(tripId: string): Promise<{
    feasibility?: OverallReadinessFactInput['feasibility'];
    mustHandleCount?: number;
    teamFitScore?: number;
    proofs: NonNullable<OverallReadinessFactInput['feasibilityProofs']>;
    openTransportBlockers: Array<{ id: string; title: string; semanticKey?: string }>;
  }> {
    if (!this.feasibility) {
      return { openTransportBlockers: [], proofs: [] };
    }
    try {
      const report =
        typeof this.feasibility.getReportFast === 'function'
          ? await this.feasibility.getReportFast(tripId)
          : await this.feasibility.getReport(tripId);

      const mustHandleCount = report.summary?.mustHandle ?? 0;
      const suggestAdjustCount = report.summary?.suggestAdjust ?? 0;
      const openTransportBlockers = (report.issues ?? [])
        .filter(
          (i) =>
            i.priority === 'must_handle' &&
            (i.category === 'transport' ||
              String(i.semanticKey ?? '').toUpperCase().includes('VEHICLE') ||
              String(i.semanticKey ?? '').toUpperCase().includes('FROAD')),
        )
        .map((i) => ({
          id: i.id,
          title: i.title,
          semanticKey: i.semanticKey,
        }));

      const proofs: NonNullable<OverallReadinessFactInput['feasibilityProofs']> = [];
      for (const issue of report.issues ?? []) {
        for (const proof of issue.proofs ?? []) {
          proofs.push({
            id: `${issue.id}:${proof.constraint}:${proof.entity}`,
            category: issue.category,
            evidenceType: proof.evidenceType,
            evidenceSource: proof.evidenceSource,
            conclusion: proof.conclusion,
            currentFact: proof.currentFact,
            constraint: proof.constraint,
            confidence: proof.confidence,
            observedAt: proof.observedAt,
            validUntil: proof.validUntil,
            itemId: proof.itemId ?? issue.fromItemId ?? issue.toItemId,
          });
        }
      }

      const teamFitDim = report.dimensions?.find((d) => d.key === 'team_fit');

      return {
        mustHandleCount,
        openTransportBlockers,
        proofs: proofs.slice(0, 40),
        teamFitScore: teamFitDim?.score ?? report.teamFitSummary?.score,
        feasibility: {
          overallScore: report.overallScore,
          verdictStatus: report.verdict?.status,
          isStale: report.isStale,
          dimensions: (report.dimensions ?? []).map((d) => ({
            key: d.key,
            score: d.score,
            blockerCount: d.blockerCount,
            issueCount: d.issueCount,
          })),
          mustHandleCount,
          suggestAdjustCount,
          issues: (report.issues ?? []).map((i) => ({
            id: i.id,
            priority: i.priority,
            dimension: i.category,
            title: i.title,
            code: i.semanticKey,
          })),
        },
      };
    } catch (err) {
      this.logger.warn(
        `feasibility unavailable for overall readiness trip=${tripId}: ${(err as Error).message}`,
      );
      return { openTransportBlockers: [], proofs: [] };
    }
  }

  private async loadGateFreshness(
    tripId: string,
  ): Promise<OverallReadinessFactInput['evidenceFreshness']> {
    if (!this.departureGate) {
      return { isStale: false, revalidationRequired: false };
    }
    try {
      const gate = await this.departureGate.getDepartureGate(tripId);
      return {
        isStale: Boolean(gate.evidenceFreshness?.isStale),
        revalidationRequired: Boolean(gate.evidenceFreshness?.revalidationRequired),
      };
    } catch {
      return { isStale: false, revalidationRequired: false };
    }
  }

  private async loadPlanningProgressInternal(
    tripId: string,
  ): Promise<OverallReadinessFactInput['planningProgressInternal']> {
    try {
      const pipeline = await this.tripsService.getPipelineStatus(tripId);
      return computePlanningProgress(pipeline?.stages ?? []);
    } catch {
      return undefined;
    }
  }

  private projectAccommodation(
    days: Array<{
      id: string;
      ItineraryItem: Array<{
        id: string;
        type: string;
        bookingStatus: string | null;
        bookingConfirmation: string | null;
        costCategory: string | null;
        note: string | null;
        Place: {
          nameCN: string | null;
          nameEN: string | null;
          category: string | null;
        } | null;
      }>;
    }>,
    expectedNightCount: number,
  ): OverallReadinessFactInput['accommodation'] {
    // 住宿通常挂在当晚行程；最后一天多为退房日，不计入应住夜晚
    const nights = days.slice(0, Math.max(0, days.length - 1));
    let coveredNightCount = 0;
    let bookedNightCount = 0;
    let needBookingNightCount = 0;
    let missingDocumentCount = 0;
    let cancelledNightCount = 0;

    for (const day of nights) {
      const accom = day.ItineraryItem.find((item) =>
        isAccommodationItem({
          type: item.type,
          costCategory: item.costCategory,
          placeCategory: item.Place?.category,
          placeNameCN: item.Place?.nameCN,
          placeNameEN: item.Place?.nameEN,
          note: item.note,
        }),
      );
      if (!accom) continue;
      coveredNightCount += 1;
      const status = (accom.bookingStatus ?? '').toUpperCase();
      if (status === 'CANCELLED') {
        cancelledNightCount += 1;
        continue;
      }
      if (BOOKED.has(status)) {
        bookedNightCount += 1;
        if (!accom.bookingConfirmation?.trim()) missingDocumentCount += 1;
      } else {
        needBookingNightCount += 1;
      }
    }

    return {
      expectedNightCount,
      coveredNightCount,
      bookedNightCount,
      needBookingNightCount,
      missingDocumentCount,
      cancelledNightCount,
    };
  }

  private projectTransport(input: {
    isSelfDrive: boolean;
    constraints: Record<string, unknown>;
    metadata: Record<string, unknown>;
    days: Array<{
      ItineraryItem: Array<{
        type: string;
        bookingStatus: string | null;
        bookingConfirmation: string | null;
      }>;
    }>;
    decisionTransport: ReturnType<typeof projectTransportFromDecisionCases>;
    openBlockingTitles: Array<{ id: string; title: string; semanticKey?: string }>;
  }): NonNullable<OverallReadinessFactInput['transport']> {
    const vehicleType =
      input.constraints.vehicle_type ??
      input.constraints.vehicleType ??
      input.metadata.vehicleType;
    const insurance =
      input.constraints.insurance_coverage_tier ??
      input.constraints.insuranceCoverageTier ??
      input.metadata.insuranceCoverageTier;

    const transportItem = input.days
      .flatMap((d) => d.ItineraryItem)
      .find((i) => {
        const t = i.type.toUpperCase();
        return t === 'TRANSPORT' || t === 'CAR_RENTAL' || t === 'RENTAL';
      });

    const vehicleFromConstraint = Boolean(
      (typeof vehicleType === 'string' && vehicleType.trim()) ||
        (transportItem && BOOKED.has((transportItem.bookingStatus ?? '').toUpperCase())),
    );
    const vehicleConfirmed =
      vehicleFromConstraint || input.decisionTransport.vehicleResolved;
    const hasVehicleOrPrimaryMode =
      vehicleConfirmed ||
      Boolean(transportItem) ||
      input.decisionTransport.vehicleCase != null ||
      !input.isSelfDrive;

    const insuranceFromConstraint = Boolean(
      typeof insurance === 'string' && insurance.trim() && insurance !== 'UNDECIDED',
    );
    const insuranceConfirmed =
      insuranceFromConstraint || input.decisionTransport.insuranceResolved;

    return {
      hasVehicleOrPrimaryMode,
      vehicleConfirmed,
      insuranceConfirmed,
      driverArrangementConfirmed: vehicleConfirmed ? true : null,
      openBlockingProblems: input.openBlockingTitles,
    };
  }

  private projectActivities(
    days: Array<{
      ItineraryItem: Array<{
        id: string;
        type: string;
        bookingStatus: string | null;
        bookingConfirmation: string | null;
        note: string | null;
        Place: { nameCN: string | null; nameEN: string | null } | null;
      }>;
    }>,
    memberCount: number,
  ): NonNullable<OverallReadinessFactInput['activities']> {
    const out: NonNullable<OverallReadinessFactInput['activities']> = [];

    for (const day of days) {
      for (const item of day.ItineraryItem) {
        const title =
          item.Place?.nameCN ||
          item.Place?.nameEN ||
          item.note?.slice(0, 40) ||
          item.type;
        const type = item.type.toUpperCase();
        const isActivityType =
          type === 'ACTIVITY' || type === 'EXPERIENCE' || type === 'TOUR';
        const isCore =
          isActivityType || CORE_ACTIVITY_PATTERN.test(`${title} ${item.note ?? ''}`);
        if (!isCore) continue;

        out.push({
          id: item.id,
          title: title || '活动',
          isCoreExperience: true,
          isMustDo: CORE_ACTIVITY_PATTERN.test(title),
          bookingStatus: item.bookingStatus,
          hasConfirmation: Boolean(item.bookingConfirmation?.trim()),
          memberConfirmedCount: memberCount <= 1 ? memberCount : undefined,
          memberTotalCount: memberCount <= 1 ? memberCount : undefined,
        });
      }
    }

    return out;
  }

  private async loadMemberProfilingRates(
    tripId: string,
    memberCount: number,
  ): Promise<{
    preferenceCompletionRate: number;
    hardLimitsConfirmedRate: number;
    profilingCompletionRate: number;
  }> {
    if (memberCount <= 1) {
      return {
        preferenceCompletionRate: 100,
        hardLimitsConfirmedRate: 100,
        profilingCompletionRate: 100,
      };
    }
    try {
      const [styleDone, moneyDone, quizDone] = await Promise.all([
        this.prisma.tripDecisionProfilingStatus.count({
          where: { tripId, travelStyleCompleted: true },
        }),
        this.prisma.tripDecisionProfilingStatus.count({
          where: { tripId, moneyDnaCompleted: true },
        }),
        this.prisma.tripDecisionProfilingStatus.count({
          where: { tripId, quizCompleted: true },
        }),
      ]);
      return {
        preferenceCompletionRate: Math.round((styleDone / memberCount) * 100),
        hardLimitsConfirmedRate: Math.round((moneyDone / memberCount) * 100),
        profilingCompletionRate: Math.round((quizDone / memberCount) * 100),
      };
    } catch {
      return {
        preferenceCompletionRate: 50,
        hardLimitsConfirmedRate: 50,
        profilingCompletionRate: 50,
      };
    }
  }

  private projectMembers(input: {
    memberCount: number;
    collaborators: Array<{ userId: string; role: string }>;
    metadata: Record<string, unknown>;
    openCriticalDecisionCount: number;
    teamFitScore?: number;
    preferenceCompletionRate?: number;
    hardLimitsConfirmedRate?: number;
    profilingCompletionRate?: number;
  }): NonNullable<OverallReadinessFactInput['members']> {
    const profilingFromMeta =
      typeof input.metadata.teamCompletionRate === 'number'
        ? input.metadata.teamCompletionRate
        : typeof input.metadata.profilingCompletionRate === 'number'
          ? input.metadata.profilingCompletionRate
          : null;

    const profiling =
      input.profilingCompletionRate ??
      profilingFromMeta ??
      (typeof input.teamFitScore === 'number'
        ? input.teamFitScore
        : input.memberCount <= 1
          ? 100
          : 50);

    const preferenceCompletionRate =
      input.preferenceCompletionRate ?? profiling;
    const hardLimitsConfirmedRate =
      input.hardLimitsConfirmedRate ?? profiling;

    const confirmedParticipationCount =
      input.memberCount <= 1
        ? 1
        : Math.max(1, input.collaborators.length);

    return {
      totalCount: input.memberCount,
      confirmedParticipationCount,
      profilingCompletionRate: Math.max(0, Math.min(100, profiling)),
      preferenceCompletionRate: Math.max(0, Math.min(100, preferenceCompletionRate)),
      hardLimitsConfirmedRate: Math.max(0, Math.min(100, hardLimitsConfirmedRate)),
      openCriticalDecisionCount: input.openCriticalDecisionCount,
      rolesAssigned: input.collaborators.some((c) =>
        /owner|driver|admin/i.test(c.role),
      ),
    };
  }
}
