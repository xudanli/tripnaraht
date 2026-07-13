import { Injectable, NotFoundException } from '@nestjs/common';
import { DateTime } from 'luxon';
import { ItineraryItemsService } from '../../itinerary-items/itinerary-items.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CoverageMapService } from '../readiness/services/coverage-map.service';
import { FeasibilityReportService } from '../trip-constraint-solver/services/feasibility-report.service';
import { DecisionCheckerService } from '../trip-constraint-solver/services/decision-checker.service';
import { SplitPlanService } from '../trip-constraint-solver/services/split-plan.service';
import { RouteGeometryService } from '../../transport/services/route-geometry.service';
import { TripExtendedService } from './trip-extended.service';
import type {
  JourneyMapCoverageFields,
  JourneyMapInclude,
  JourneyMapInspectorActivityResponseDto,
  JourneyMapResponseDto,
} from '../dto/journey-map.dto';
import {
  buildDataFeeds,
  buildDaySummaries,
  buildDiversionsFromDaySplits,
  buildJourneyMapMemberGroups,
  buildJourneyMapMembers,
  buildJourneyMapStats,
  buildKnownMembers,
  buildSplitParticipantMap,
  enrichItineraryItemsWithParticipants,
  extractTripOwnerId,
  resolveTravelerSlots,
} from '../utils/journey-map-enrichment.util';
import { enrichDiversionsWithRouteGeometry } from '../utils/journey-map-route-geometry.util';
import {
  computeJourneyMapInspectorActivityEtag,
} from '../utils/journey-map-etag.util';
import {
  buildJourneyMapInspectorActivityContext,
  buildJourneyMapInspectorActivityContexts,
  type BuildJourneyMapInspectorContextsInput,
} from '../utils/journey-map-inspector-context.util';
import { JourneyMapDecisionItemsService } from './journey-map-decision-items.service';

const DEFAULT_INCLUDE: JourneyMapInclude[] = ['shell'];

function resolveDayTheme(metadata: unknown, dayIndex: number): string | null {
  const dayThemes = (metadata as { dayThemes?: Record<string | number, string> } | null)?.dayThemes;
  if (!dayThemes || typeof dayThemes !== 'object') return null;
  const dayNumber = dayIndex + 1;
  const theme = dayThemes[dayNumber] ?? dayThemes[String(dayNumber)];
  return typeof theme === 'string' && theme.trim() ? theme : null;
}

export function parseJourneyMapInclude(raw?: string): Set<JourneyMapInclude> {
  if (!raw?.trim()) return new Set(DEFAULT_INCLUDE);
  const out = new Set<JourneyMapInclude>();
  for (const part of raw.split(',')) {
    const token = part.trim().toLowerCase();
    if (token === 'shell') out.add('shell');
    else if (token === 'inspector') out.add('inspector');
  }
  if (out.size === 0) return new Set(DEFAULT_INCLUDE);
  // inspector-only second fetch still needs shell fields in the response contract
  if (out.has('inspector') && !out.has('shell')) out.add('shell');
  return out;
}

@Injectable()
export class JourneyMapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly itineraryItems: ItineraryItemsService,
    private readonly coverageMap: CoverageMapService,
    private readonly tripExtended: TripExtendedService,
    private readonly decisionChecker: DecisionCheckerService,
    private readonly splitPlans: SplitPlanService,
    private readonly routeGeometry: RouteGeometryService,
    private readonly decisionItems: JourneyMapDecisionItemsService,
    private readonly feasibilityReport: FeasibilityReportService,
  ) {}

  async getJourneyMap(
    tripId: string,
    query: {
      include?: string;
      fields?: JourneyMapCoverageFields;
    },
  ): Promise<JourneyMapResponseDto> {
    const include = parseJourneyMapInclude(query.include);
    const fields = query.fields ?? 'full';
    const wantInspector = include.has('inspector');
    const includeGaps = fields !== 'minimal';

    const tripRow = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        name: true,
        destination: true,
        updatedAt: true,
        metadata: true,
        pacingConfig: true,
        budgetConfig: true,
        TripDay: {
          orderBy: { date: 'asc' },
          select: { id: true, date: true },
        },
      },
    });
    if (!tripRow) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    const coveragePromise = this.coverageMap.getCoverageMap(tripId, {
      includeGaps,
      resolveRouteGeometry: fields !== 'minimal',
    });

    const ownerId = extractTripOwnerId(tripRow.metadata);

    const [
      coverageRaw,
      itineraryItemsRaw,
      collaborators,
      readinessScore,
      feasibilityReport,
      decisionCheckerData,
      daySplits,
      ownerUser,
    ] = await Promise.all([
      coveragePromise,
      this.itineraryItems.findByTrip(tripId, { includePlace: true }),
      this.tripExtended.getCollaborators(tripId),
      includeGaps
        ? coveragePromise.then((coverage) =>
            this.coverageMap.getReadinessScore(tripId, { coverageData: coverage }),
          )
        : this.coverageMap.getReadinessScore(tripId),
      this.feasibilityReport.getReport(tripId).catch(() => null),
      wantInspector ? this.decisionChecker.getDecisionChecker(tripId) : Promise.resolve(null),
      this.splitPlans.projectDaySplits(tripId, { lightweight: true }),
      ownerId
        ? this.prisma.user.findUnique({
            where: { id: ownerId },
            select: { id: true, displayName: true },
          })
        : Promise.resolve(null),
    ]);

    const tripDays = tripRow.TripDay.map((day, index) => ({
      id: day.id,
      date: DateTime.fromJSDate(day.date).toISODate() ?? '',
      theme: resolveDayTheme(tripRow.metadata, index),
    }));

    const trip: JourneyMapResponseDto['trip'] = {
      id: tripRow.id,
      name: tripRow.name,
      destination: tripRow.destination,
      updatedAt: tripRow.updatedAt.toISOString(),
      TripDay: tripDays,
    };

    const knownMembers = buildKnownMembers({
      owner: ownerUser
        ? { id: ownerUser.id, name: ownerUser.displayName ?? '发起人' }
        : null,
      collaborators,
    });
    const travelerSlots = resolveTravelerSlots({
      pacingConfig: tripRow.pacingConfig,
      metadata: tripRow.metadata,
      budgetConfig: tripRow.budgetConfig,
      fallbackCount: collaborators.length + 1,
    });
    const members = buildJourneyMapMembers({
      tripId,
      knownMembers,
      travelerSlots,
    });
    const memberGroups = buildJourneyMapMemberGroups(members);
    const participantMap = buildSplitParticipantMap(daySplits);
    const itineraryItems = enrichItineraryItemsWithParticipants(
      itineraryItemsRaw,
      participantMap,
    );
    const daySummaries = buildDaySummaries({
      tripDays,
      coverage: coverageRaw,
      itineraryItems,
    });
    const diversionsRaw = buildDiversionsFromDaySplits({
      daySplits,
      pois: coverageRaw.pois,
      itineraryItems: itineraryItemsRaw,
    });
    const diversions = await enrichDiversionsWithRouteGeometry({
      diversions: diversionsRaw,
      daySplits,
      pois: coverageRaw.pois,
      segments: coverageRaw.segments,
      itineraryItems: itineraryItemsRaw,
      routeGeometry: this.routeGeometry,
      useRouteApi: fields !== 'minimal',
    });
    const stats = buildJourneyMapStats({
      dayCount: tripRow.TripDay.length,
      coverage: coverageRaw,
      itineraryItems,
      diversions,
    });
    const dataFeeds = buildDataFeeds(coverageRaw);

    const data: JourneyMapResponseDto = {
      tripId,
      trip,
      coverage: coverageRaw,
      itineraryItems,
      feasibilityScore: feasibilityReport
        ? Math.round(feasibilityReport.overallScore)
        : undefined,
      travelerCount: members.length,
      members,
      memberGroups,
      daySummaries,
      diversions,
      stats,
      dataFeeds,
    };

    if (wantInspector && decisionCheckerData) {
      const inspectorInput = {
        itineraryItems,
        members,
        coverage: coverageRaw,
        diversions,
        daySplits,
        decisionChecker: decisionCheckerData,
        scoreRisks: readinessScore.risks,
        scoreFindings: readinessScore.findings,
        ownerId,
      };
      data.inspector = {
        evidence: decisionCheckerData.evidence ?? null,
        impact: decisionCheckerData.impact ?? null,
        scoreRisks: readinessScore.risks,
        scoreFindings: readinessScore.findings,
        activityContexts: buildJourneyMapInspectorActivityContexts(inspectorInput),
        decisionItems: await this.decisionItems.listForTrip(tripId),
      };
    }

    return data;
  }

  async getJourneyMapInspectorActivity(
    tripId: string,
    activityId: string,
    query: { fields?: JourneyMapCoverageFields },
  ): Promise<JourneyMapInspectorActivityResponseDto> {
    const fields = query.fields ?? 'full';
    const bundle = await this.loadInspectorContextBundle(tripId, fields);
    const context = buildJourneyMapInspectorActivityContext(activityId, bundle.inspectorInput);
    if (!context) {
      throw new NotFoundException(`活动 ID ${activityId} 不存在于该行程`);
    }

    return {
      tripId,
      activityId: context.activityId,
      context,
      evidence: bundle.decisionChecker?.evidence ?? null,
      impact: bundle.decisionChecker?.impact ?? null,
      etag: computeJourneyMapInspectorActivityEtag({
        tripId,
        tripUpdatedAt: bundle.tripUpdatedAt,
        coverageCalculatedAt: bundle.coverageCalculatedAt,
        itemCount: bundle.itemCount,
        fields,
        includeInspector: true,
        activityId: context.activityId,
      }),
    };
  }

  /** 供 inspector 全量 / 单活动懒加载复用 */
  private async loadInspectorContextBundle(tripId: string, fields: JourneyMapCoverageFields) {
    const includeGaps = fields !== 'minimal';

    const tripRow = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        updatedAt: true,
        metadata: true,
        pacingConfig: true,
        budgetConfig: true,
        TripDay: { orderBy: { date: 'asc' }, select: { id: true } },
      },
    });
    if (!tripRow) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    const coveragePromise = this.coverageMap.getCoverageMap(tripId, {
      includeGaps,
      resolveRouteGeometry: fields !== 'minimal',
    });
    const ownerId = extractTripOwnerId(tripRow.metadata);

    const [
      coverageRaw,
      itineraryItemsRaw,
      collaborators,
      readinessScore,
      decisionCheckerData,
      daySplits,
      ownerUser,
    ] = await Promise.all([
      coveragePromise,
      this.itineraryItems.findByTrip(tripId, { includePlace: true }),
      this.tripExtended.getCollaborators(tripId),
      includeGaps
        ? coveragePromise.then((coverage) =>
            this.coverageMap.getReadinessScore(tripId, { coverageData: coverage }),
          )
        : this.coverageMap.getReadinessScore(tripId),
      this.decisionChecker.getDecisionChecker(tripId),
      this.splitPlans.projectDaySplits(tripId, { lightweight: true }),
      ownerId
        ? this.prisma.user.findUnique({
            where: { id: ownerId },
            select: { id: true, displayName: true },
          })
        : Promise.resolve(null),
    ]);

    const knownMembers = buildKnownMembers({
      owner: ownerUser
        ? { id: ownerUser.id, name: ownerUser.displayName ?? '发起人' }
        : null,
      collaborators,
    });
    const travelerSlots = resolveTravelerSlots({
      pacingConfig: tripRow.pacingConfig,
      metadata: tripRow.metadata,
      budgetConfig: tripRow.budgetConfig,
      fallbackCount: collaborators.length + 1,
    });
    const members = buildJourneyMapMembers({
      tripId,
      knownMembers,
      travelerSlots,
    });
    const participantMap = buildSplitParticipantMap(daySplits);
    const itineraryItems = enrichItineraryItemsWithParticipants(
      itineraryItemsRaw,
      participantMap,
    );
    const diversionsRaw = buildDiversionsFromDaySplits({
      daySplits,
      pois: coverageRaw.pois,
      itineraryItems: itineraryItemsRaw,
    });
    const diversions = await enrichDiversionsWithRouteGeometry({
      diversions: diversionsRaw,
      daySplits,
      pois: coverageRaw.pois,
      segments: coverageRaw.segments,
      itineraryItems: itineraryItemsRaw,
      routeGeometry: this.routeGeometry,
      useRouteApi: fields !== 'minimal',
    });

    const inspectorInput: BuildJourneyMapInspectorContextsInput = {
      itineraryItems,
      members,
      coverage: coverageRaw,
      diversions,
      daySplits,
      decisionChecker: decisionCheckerData,
      scoreRisks: readinessScore.risks,
      scoreFindings: readinessScore.findings,
      ownerId,
    };

    return {
      tripUpdatedAt: tripRow.updatedAt.toISOString(),
      itemCount: itineraryItems.length,
      coverageCalculatedAt: coverageRaw.calculatedAt,
      decisionChecker: decisionCheckerData,
      inspectorInput,
    };
  }
}
