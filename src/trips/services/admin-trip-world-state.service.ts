/**
 * Admin 行程世界状态投影：从已有落库/metadata 组装产品图六域，不触发外部实时抓取。
 */

import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../../prisma/prisma.service';
import { WorldStateStoreService } from '../guardian-decision-core/evidence/world-state-store.service';
import { ActiveRiskAggregationService } from '../execution-risk-center/services/active-risk-aggregation.service';
import type { ActiveRisk, RiskLevel } from '../execution-risk-center/types/execution-risk.types';
import { readIcelandSelfDriveMetadata } from '../iceland-self-drive/services/iceland-self-drive-response.util';
import { normalizeDrivingSettingsState } from '../iceland-self-drive/services/iceland-self-drive-completion.util';
import type { IcelandSelfDriveDrivingSettingsState } from '../iceland-self-drive/types/iceland-self-drive.types';
import type { WorldStateAssertion } from '../guardian-decision-core/contracts/world-state.types';
import {
  ADMIN_TRIP_WORLD_STATE_SCHEMA_ID,
  type AdminTripWorldStateView,
  type AdminWorldConstraintsView,
  type AdminWorldEnvironmentView,
  type AdminWorldPlanView,
  type AdminWorldRiskLevel,
  type AdminWorldRiskOverviewView,
  type AdminWorldRoadView,
  type AdminWorldStateCompleteness,
  type AdminWorldStateProvenance,
  type AdminWorldTeamView,
  type AdminWorldVehicleView,
} from '../dto/admin-trip-world-state.dto';

@Injectable()
export class AdminTripWorldStateService {
  private readonly logger = new Logger(AdminTripWorldStateService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly worldStateStore?: WorldStateStoreService,
    @Optional() private readonly riskAggregation?: ActiveRiskAggregationService,
  ) {}

  async getWorldState(tripId: string): Promise<AdminTripWorldStateView> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripCollaborator: true,
        TripDay: {
          orderBy: { date: 'asc' },
          include: {
            ItineraryItem: {
              orderBy: [{ order: 'asc' }, { startTime: 'asc' }],
              include: {
                Place: {
                  select: {
                    id: true,
                    nameCN: true,
                    nameEN: true,
                    category: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    const provenance: AdminWorldStateProvenance[] = [];
    const capturedAt = new Date().toISOString();

    const openEvents = await this.prisma.tripEnvironmentEvent.findMany({
      where: { tripId, status: 'open' },
      orderBy: { detectedAt: 'desc' },
      take: 50,
    });

    const isd = readIcelandSelfDriveMetadata(trip.metadata);
    const driving: IcelandSelfDriveDrivingSettingsState | null = isd?.drivingSettings
      ? normalizeDrivingSettingsState(
          isd.drivingSettings,
          isd.wizard?.vehicleAcquisition ?? 'undecided',
        )
      : null;

    const focusDay = this.resolveFocusDay(trip.startDate, trip.endDate, trip.TripDay);

    const environment = this.projectEnvironment(focusDay, openEvents, provenance);
    const road = await this.projectRoad(tripId, provenance);
    const vehicle = this.projectVehicle(driving, provenance);
    const plan = this.projectPlan(trip, focusDay, provenance);
    const team = this.projectTeam(trip.TripCollaborator, driving, isd?.wizard?.travelerCount, provenance);
    const constraints = this.projectConstraints(trip.budgetConfig, driving, provenance);
    const riskOverview = await this.projectRisk(
      tripId,
      trip.TripCollaborator,
      openEvents,
      provenance,
    );

    const completeness = this.computeCompleteness({
      environment,
      road,
      vehicle,
      plan,
      team,
      constraints,
    });

    return {
      schemaId: ADMIN_TRIP_WORLD_STATE_SCHEMA_ID,
      tripId,
      capturedAt,
      environment,
      road,
      vehicle,
      plan,
      team,
      constraints,
      riskOverview,
      completeness,
      provenance,
    };
  }

  private resolveFocusDay(
    startDate: Date,
    endDate: Date,
    days: Array<{
      id: string;
      date: Date;
      ItineraryItem: Array<{
        id: string;
        type: string;
        note: string | null;
        startTime: Date | null;
        endTime: Date | null;
        Place: { id: number; nameCN: string | null; nameEN: string | null; category: string } | null;
      }>;
    }>,
  ) {
    if (days.length === 0) return null;
    const today = DateTime.utc().startOf('day');
    const start = DateTime.fromJSDate(startDate).toUTC().startOf('day');
    const end = DateTime.fromJSDate(endDate).toUTC().startOf('day');

    let target = start;
    if (today >= start && today <= end) {
      target = today;
    } else if (today > end) {
      target = end;
    }

    const matched = days.find((d) =>
      DateTime.fromJSDate(d.date).toUTC().hasSame(target, 'day'),
    );
    return matched ?? days[0]!;
  }

  private projectEnvironment(
    focusDay: {
      ItineraryItem: Array<{
        Place: { nameCN: string | null; nameEN: string | null } | null;
      }>;
    } | null,
    openEvents: Array<{
      type: string;
      severity: string;
      description: string;
      detectedAt: Date;
      sourceObservedAt: Date | null;
    }>,
    provenance: AdminWorldStateProvenance[],
  ): AdminWorldEnvironmentView {
    const firstPlace = focusDay?.ItineraryItem?.find((i) => i.Place)?.Place;
    const location =
      firstPlace?.nameCN || firstPlace?.nameEN || null;

    const alerts = openEvents.map(
      (e) => `[${e.severity}] ${e.type}: ${e.description}`.slice(0, 240),
    );

    if (location) {
      provenance.push({
        domain: 'environment',
        source: 'prisma.TripDay.ItineraryItem.Place',
      });
    }
    if (openEvents.length > 0) {
      provenance.push({
        domain: 'environment',
        source: 'prisma.TripEnvironmentEvent',
        observedAt: openEvents[0]!.sourceObservedAt?.toISOString()
          ?? openEvents[0]!.detectedAt.toISOString(),
      });
    }

    return {
      location,
      weather: null,
      precipitation: null,
      visibility: null,
      alerts,
    };
  }

  private async projectRoad(
    tripId: string,
    provenance: AdminWorldStateProvenance[],
  ): Promise<AdminWorldRoadView> {
    const empty: AdminWorldRoadView = {
      currentSegment: null,
      surfaceCondition: null,
      riskLevel: 'unknown',
      closures: null,
      recommendedSpeedLimit: null,
    };

    if (!this.worldStateStore) return empty;

    try {
      const store = await this.worldStateStore.readStore(tripId);
      const roadAssertions = store.assertions.filter(
        (a) =>
          a.status === 'ACTIVE' &&
          /road|highway|surface|closure|f-?road/i.test(
            `${a.predicate} ${JSON.stringify(a.payload ?? {})}`,
          ),
      );

      if (roadAssertions.length === 0) return empty;

      const latest = [...roadAssertions].sort(
        (a, b) => new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime(),
      )[0]!;

      provenance.push({
        domain: 'road',
        source: 'trip.metadata.rfc001WorldState',
        observedAt: latest.observedAt,
      });

      return {
        currentSegment: this.pickAssertionString(latest, [
          'segment',
          'roadName',
          'roadCode',
          'name',
          'currentSegment',
        ]) ?? latest.predicate,
        surfaceCondition: this.pickAssertionString(latest, [
          'surfaceCondition',
          'surface',
          'condition',
        ]),
        riskLevel: this.normalizeRiskLevel(
          this.pickAssertionString(latest, ['riskLevel', 'risk', 'severity', 'level']),
        ),
        closures: this.pickAssertionString(latest, [
          'closures',
          'closure',
          'status',
          'blocked',
        ]),
        recommendedSpeedLimit: this.pickAssertionString(latest, [
          'recommendedSpeedLimit',
          'speedLimit',
          'maxSpeed',
        ]),
      };
    } catch (err: any) {
      this.logger.warn(`读取 RFC-001 road 断言失败: ${err?.message ?? err}`);
      return empty;
    }
  }

  private projectVehicle(
    driving: IcelandSelfDriveDrivingSettingsState | null,
    provenance: AdminWorldStateProvenance[],
  ): AdminWorldVehicleView {
    if (!driving) {
      return {
        model: null,
        tires: null,
        driveMode: null,
        heightLimit: null,
        wadingAbility: null,
      };
    }

    const v = driving.vehicle;
    provenance.push({
      domain: 'vehicle',
      source: 'trip.metadata.icelandSelfDrive.drivingSettings.vehicle',
    });

    const restrictions = v.rentalRestrictions ?? [];
    const noWading = restrictions.some((r) => /wad|涉水|no_wading/i.test(r));
    const height = restrictions.find((r) => /height|限高|m\b/i.test(r));

    let driveMode: string | null = null;
    if (v.is4wd === true) driveMode = '4WD';
    else if (v.is4wd === false) driveMode = '2WD';

    return {
      model: v.vehicleClassLabel || v.vehicleClass || null,
      tires: null,
      driveMode,
      heightLimit: height ?? (v.isHighBody === true ? '高底盘' : v.isHighBody === false ? '标准底盘' : null),
      wadingAbility: noWading ? 'Low / restricted' : restrictions.length ? 'See rentalRestrictions' : null,
    };
  }

  private projectPlan(
    trip: {
      destination: string;
      TripDay: Array<{
        date: Date;
        ItineraryItem: Array<{
          type: string;
          note: string | null;
          startTime: Date | null;
          endTime: Date | null;
          Place: { nameCN: string | null; nameEN: string | null; category: string } | null;
        }>;
      }>;
    },
    focusDay: {
      date: Date;
      ItineraryItem: Array<{
        type: string;
        note: string | null;
        startTime: Date | null;
        endTime: Date | null;
        Place: { nameCN: string | null; nameEN: string | null; category: string } | null;
      }>;
    } | null,
    provenance: AdminWorldStateProvenance[],
  ): AdminWorldPlanView {
    if (!focusDay) {
      return {
        currentDay: null,
        origin: null,
        destination: trip.destination || null,
        plannedDriveTime: null,
        midpointStops: null,
        lodging: null,
      };
    }

    const dayIndex =
      trip.TripDay.findIndex(
        (d) => DateTime.fromJSDate(d.date).toUTC().hasSame(DateTime.fromJSDate(focusDay.date).toUTC(), 'day'),
      ) + 1;

    const places = focusDay.ItineraryItem
      .map((i) => i.Place?.nameCN || i.Place?.nameEN || null)
      .filter((n): n is string => !!n);

    const origin = places[0] ?? null;
    const destination = places.length > 1 ? places[places.length - 1]! : trip.destination || null;
    const midpointStops = places.length > 2 ? places.length - 2 : places.length > 1 ? 0 : null;

    const lodgingItem = focusDay.ItineraryItem.find(
      (i) =>
        i.Place?.category === 'HOTEL' ||
        /hotel|lodging|住宿|民宿|garni/i.test(i.note ?? '') ||
        /hotel|lodging|住宿/i.test(i.Place?.nameCN ?? '') ||
        /hotel|lodging/i.test(i.Place?.nameEN ?? ''),
    );
    const lodging =
      lodgingItem?.Place?.nameCN ||
      lodgingItem?.Place?.nameEN ||
      lodgingItem?.note ||
      null;

    let plannedDriveTime: string | null = null;
    const withTimes = focusDay.ItineraryItem.filter((i) => i.startTime && i.endTime);
    if (withTimes.length >= 2) {
      const first = withTimes[0]!.startTime!;
      const last = withTimes[withTimes.length - 1]!.endTime!;
      const mins = Math.max(0, Math.round((last.getTime() - first.getTime()) / 60000));
      if (mins > 0) {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        plannedDriveTime = m ? `~${h}h${m}m` : `~${h}h`;
      }
    }

    provenance.push({ domain: 'plan', source: 'prisma.TripDay+ItineraryItem' });

    return {
      currentDay: dayIndex > 0 ? `Day ${dayIndex}` : null,
      origin,
      destination,
      plannedDriveTime,
      midpointStops,
      lodging,
    };
  }

  private projectTeam(
    collaborators: Array<{ role: string }>,
    driving: IcelandSelfDriveDrivingSettingsState | null,
    wizardTravelerCount: number | undefined,
    provenance: AdminWorldStateProvenance[],
  ): AdminWorldTeamView {
    const size =
      wizardTravelerCount ??
      (collaborators.length > 0 ? collaborators.length : null);

    const parts: string[] = [];
    if (driving?.members.hasChildren) parts.push('含儿童');
    if (driving?.members.hasElderly) parts.push('含老人');
    if (driving?.members.motionSickness) parts.push('有晕车');
    if (driving?.drivers.driverCount != null) {
      parts.push(`驾驶者 ${driving.drivers.driverCount} 人`);
    }
    const composition = parts.length > 0 ? parts.join('；') : null;

    let driverStatus: string | null = null;
    if (driving?.drivers.experienceLevel) {
      driverStatus = `经验: ${driving.drivers.experienceLevel}`;
    }

    const preferences = driving?.routePreference
      ? [
          driving.routePreference.pacePreference
            ? `节奏 ${driving.routePreference.pacePreference}`
            : null,
          driving.routePreference.allowNightDriving === false
            ? '避免夜间驾驶'
            : driving.routePreference.allowNightDriving
              ? '可夜间驾驶'
              : null,
          driving.routePreference.gravelTolerance
            ? `碎石容忍 ${driving.routePreference.gravelTolerance}`
            : null,
        ]
          .filter(Boolean)
          .join('；') || null
      : null;

    if (size != null || composition || driverStatus || preferences) {
      provenance.push({
        domain: 'team',
        source: driving
          ? 'trip.metadata.icelandSelfDrive.drivingSettings+TripCollaborator'
          : 'prisma.TripCollaborator',
      });
    }

    return {
      size,
      composition,
      staminaStatus: null,
      driverStatus,
      preferences,
    };
  }

  private projectConstraints(
    budgetConfig: unknown,
    driving: IcelandSelfDriveDrivingSettingsState | null,
    provenance: AdminWorldStateProvenance[],
  ): AdminWorldConstraintsView {
    const maxDailyDrivingHours =
      driving?.drivers.dailyDrivingLimitHours ??
      driving?.routePreference.dailyDrivingLimitHours ??
      null;

    const drivingPreferences = driving?.routePreference
      ? [
          driving.routePreference.allowNightDriving === false ? 'Avoid night driving' : null,
          driving.routePreference.fRoadPreference
            ? `F-road: ${driving.routePreference.fRoadPreference}`
            : null,
          driving.routePreference.waterCrossingPreference
            ? `涉水: ${driving.routePreference.waterCrossingPreference}`
            : null,
          driving.routePreference.highWindPreference
            ? `强风: ${driving.routePreference.highWindPreference}`
            : null,
        ]
          .filter(Boolean)
          .join('；') || null
      : null;

    const budgetLevel = this.mapBudgetLevel(budgetConfig);

    if (maxDailyDrivingHours != null || drivingPreferences || budgetLevel) {
      provenance.push({
        domain: 'constraints',
        source: driving
          ? 'trip.metadata.icelandSelfDrive.drivingSettings+budgetConfig'
          : 'prisma.Trip.budgetConfig',
      });
    }

    return {
      latestArrivalTime: null,
      maxDailyDrivingHours,
      drivingPreferences,
      budgetLevel,
      safetyPriority: null,
    };
  }

  private async projectRisk(
    tripId: string,
    collaborators: Array<{ userId: string; role: string }>,
    openEvents: Array<{ severity: string; cascadeImpact: unknown }>,
    provenance: AdminWorldStateProvenance[],
  ): Promise<AdminWorldRiskOverviewView> {
    const unknownImpacts = {
      safety: 'unknown' as AdminWorldRiskLevel,
      time: 'unknown' as AdminWorldRiskLevel,
      experience: 'unknown' as AdminWorldRiskLevel,
      cost: 'unknown' as AdminWorldRiskLevel,
    };

    const ownerId =
      collaborators.find((c) => c.role === 'OWNER')?.userId ??
      collaborators[0]?.userId;

    let risks: ActiveRisk[] = [];
    let recommendationText: string | null = null;

    if (this.riskAggregation && ownerId) {
      try {
        const risksPromise = this.riskAggregation.listRisks(tripId, ownerId, {});
        risks = await Promise.race([
          risksPromise,
          new Promise<ActiveRisk[]>((_, reject) =>
            setTimeout(() => reject(new Error('risk aggregation timeout')), 4000),
          ),
        ]);
        const summary = await Promise.race([
          this.riskAggregation.buildSummaryRecommendation(tripId, ownerId, risks),
          new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 2000)),
        ]);
        recommendationText =
          summary?.headline ??
          (risks[0]?.summary ? risks[0].summary : null);
        if (risks.length > 0 || summary) {
          provenance.push({
            domain: 'riskOverview',
            source: 'ActiveRiskAggregationService',
          });
        }
      } catch (err: any) {
        this.logger.warn(`聚合执行风险失败（admin 投影降级）: ${err?.message ?? err}`);
        risks = [];
      }
    }

    if (risks.length === 0 && openEvents.length > 0) {
      provenance.push({
        domain: 'riskOverview',
        source: 'prisma.TripEnvironmentEvent.severity',
      });
      const overall = this.maxRiskLevel(
        openEvents.map((e) => this.normalizeRiskLevel(e.severity)),
      );
      const impacts = this.impactsFromCascade(openEvents, overall);
      return {
        overallRiskLevel: overall,
        recommendationText:
          overall === 'high'
            ? '建议谨慎，考虑调整行程'
            : overall === 'medium'
              ? '关注环境变化，必要时调整节奏'
              : null,
        impacts,
      };
    }

    if (risks.length === 0) {
      return {
        overallRiskLevel: 'unknown',
        recommendationText: null,
        impacts: unknownImpacts,
      };
    }

    const overall = this.maxRiskLevel(risks.map((r) => this.mapRiskLevel(r.level)));
    const impacts = this.impactsFromRisks(risks, overall);

    return {
      overallRiskLevel: overall,
      recommendationText,
      impacts,
    };
  }

  private impactsFromCascade(
    openEvents: Array<{ cascadeImpact: unknown }>,
    fallback: AdminWorldRiskLevel,
  ): AdminWorldRiskOverviewView['impacts'] {
    const impacts: AdminWorldRiskOverviewView['impacts'] = {
      safety: fallback === 'unknown' ? 'unknown' : fallback,
      time: 'unknown',
      experience: 'unknown',
      cost: 'unknown',
    };

    for (const ev of openEvents) {
      const arr = Array.isArray(ev.cascadeImpact) ? ev.cascadeImpact : [];
      for (const item of arr) {
        if (!item || typeof item !== 'object') continue;
        const row = item as Record<string, unknown>;
        const dim = String(row.dimension ?? row.type ?? row.kind ?? '').toLowerCase();
        const level = this.normalizeRiskLevel(
          String(row.severity ?? row.level ?? row.impact ?? ''),
        );
        if (dim.includes('time') || dim.includes('schedule')) {
          impacts.time = this.maxRiskLevel([impacts.time, level]);
        } else if (dim.includes('cost') || dim.includes('budget')) {
          impacts.cost = this.maxRiskLevel([impacts.cost, level]);
        } else if (dim.includes('experience') || dim.includes('comfort')) {
          impacts.experience = this.maxRiskLevel([impacts.experience, level]);
        } else if (dim.includes('safety') || dim.includes('risk')) {
          impacts.safety = this.maxRiskLevel([impacts.safety, level]);
        }
      }
    }
    return impacts;
  }

  private impactsFromRisks(
    risks: ActiveRisk[],
    overall: AdminWorldRiskLevel,
  ): AdminWorldRiskOverviewView['impacts'] {
    const impacts: AdminWorldRiskOverviewView['impacts'] = {
      safety: 'unknown',
      time: 'unknown',
      experience: 'unknown',
      cost: 'unknown',
    };

    for (const r of risks) {
      const level = this.mapRiskLevel(r.level);
      if (r.type === 'ENVIRONMENT' || r.type === 'ROAD_TRANSPORT' || r.type === 'MEMBER_STATE') {
        impacts.safety = this.maxRiskLevel([impacts.safety, level]);
      }
      if (r.type === 'SCHEDULE' || r.type === 'ROUTE_EXECUTION') {
        impacts.time = this.maxRiskLevel([impacts.time, level]);
      }
      if (r.type === 'BOOKING_FULFILLMENT' || r.type === 'RESOURCE') {
        impacts.cost = this.maxRiskLevel([impacts.cost, level]);
      }
      if (r.type === 'TEAM_COORDINATION' || r.code === 'MEMBER_PHYSICAL_FATIGUE') {
        impacts.experience = this.maxRiskLevel([impacts.experience, level]);
      }
    }

    if (impacts.safety === 'unknown') impacts.safety = overall;
    return impacts;
  }

  private computeCompleteness(parts: {
    environment: AdminWorldEnvironmentView;
    road: AdminWorldRoadView;
    vehicle: AdminWorldVehicleView;
    plan: AdminWorldPlanView;
    team: AdminWorldTeamView;
    constraints: AdminWorldConstraintsView;
  }): AdminWorldStateCompleteness {
    return {
      environment: this.ratio([
        parts.environment.location,
        parts.environment.weather,
        parts.environment.precipitation,
        parts.environment.visibility,
        parts.environment.alerts.length > 0 ? 'yes' : null,
      ]),
      road: this.ratio([
        parts.road.currentSegment,
        parts.road.surfaceCondition,
        parts.road.riskLevel !== 'unknown' ? parts.road.riskLevel : null,
        parts.road.closures,
        parts.road.recommendedSpeedLimit,
      ]),
      vehicle: this.ratio([
        parts.vehicle.model,
        parts.vehicle.tires,
        parts.vehicle.driveMode,
        parts.vehicle.heightLimit,
        parts.vehicle.wadingAbility,
      ]),
      plan: this.ratio([
        parts.plan.currentDay,
        parts.plan.origin,
        parts.plan.destination,
        parts.plan.plannedDriveTime,
        parts.plan.midpointStops != null ? String(parts.plan.midpointStops) : null,
        parts.plan.lodging,
      ]),
      team: this.ratio([
        parts.team.size != null ? String(parts.team.size) : null,
        parts.team.composition,
        parts.team.staminaStatus,
        parts.team.driverStatus,
        parts.team.preferences,
      ]),
      constraints: this.ratio([
        parts.constraints.latestArrivalTime,
        parts.constraints.maxDailyDrivingHours != null
          ? String(parts.constraints.maxDailyDrivingHours)
          : null,
        parts.constraints.drivingPreferences,
        parts.constraints.budgetLevel,
        parts.constraints.safetyPriority,
      ]),
    };
  }

  private ratio(values: Array<string | null | undefined>): number {
    if (values.length === 0) return 0;
    const filled = values.filter((v) => v != null && String(v).length > 0).length;
    return Math.round((filled / values.length) * 100) / 100;
  }

  private pickAssertionString(
    assertion: WorldStateAssertion,
    keys: string[],
  ): string | null {
    const payload = assertion.payload;
    if (!payload || typeof payload !== 'object') {
      return typeof payload === 'string' ? payload : null;
    }
    const obj = payload as Record<string, unknown>;
    for (const key of keys) {
      const v = obj[key];
      if (typeof v === 'string' && v.trim()) return v;
      if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    }
    return null;
  }

  private mapBudgetLevel(budgetConfig: unknown): string | null {
    if (!budgetConfig || typeof budgetConfig !== 'object') return null;
    const cfg = budgetConfig as Record<string, unknown>;
    const total =
      typeof cfg.total === 'number'
        ? cfg.total
        : typeof cfg.totalBudget === 'number'
          ? cfg.totalBudget
          : null;
    if (total == null) {
      return typeof cfg.style === 'string' ? cfg.style : null;
    }
    if (total < 8000) return 'Low';
    if (total < 20000) return 'Medium';
    return 'High';
  }

  private mapRiskLevel(level: RiskLevel): AdminWorldRiskLevel {
    if (level === 'CRITICAL' || level === 'HIGH') return 'high';
    if (level === 'MEDIUM') return 'medium';
    if (level === 'LOW') return 'low';
    return 'unknown';
  }

  private normalizeRiskLevel(raw: string | null | undefined): AdminWorldRiskLevel {
    if (!raw) return 'unknown';
    const s = raw.toLowerCase();
    if (/(critical|high|severe|red|最高|高)/.test(s)) return 'high';
    if (/(medium|moderate|orange|warn|中)/.test(s)) return 'medium';
    if (/(low|green|info|低)/.test(s)) return 'low';
    return 'unknown';
  }

  private maxRiskLevel(levels: AdminWorldRiskLevel[]): AdminWorldRiskLevel {
    const order: AdminWorldRiskLevel[] = ['unknown', 'low', 'medium', 'high'];
    let best: AdminWorldRiskLevel = 'unknown';
    for (const l of levels) {
      if (order.indexOf(l) > order.indexOf(best)) best = l;
    }
    return best;
  }
}
