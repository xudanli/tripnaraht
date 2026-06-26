import { Injectable, Optional } from '@nestjs/common';
import { DateTime } from 'luxon';
import { TripBudgetProfileService } from '../../budget-os/services/trip-budget-profile.service';
import type { TodayReadinessSnapshot } from '../../readiness/types/today-readiness.types';
import { CoverageMapService } from '../../readiness/services/coverage-map.service';
import type { InTripAnchorSnapshot } from '../types/anchor-handoff.types';
import { AnchorHandoffService } from './anchor-handoff.service';
import { EnvironmentRadarService } from './environment-radar.service';
import { GroupPulseService } from './group-pulse.service';
import { ExperiencePulseService } from './experience-pulse.service';
import { BudgetRebalanceService } from './budget-rebalance.service';
import { InTripAccessService } from './in-trip-access.service';
import { VulnerabilityScoreService } from './vulnerability-score.service';

export interface TodayDashboardSnapshot {
  dayNumber: number;
  date: string;
  weather: {
    summary: string;
    tempMin: number | null;
    tempMax: number | null;
    icon: string;
    source: 'stub';
  };
  vulnerability: {
    severity: 'green' | 'yellow' | 'red';
    stabilityScore: number;
    source: 'stub' | 'environment_radar';
  };
  timeline: {
    planned: InTripAnchorSnapshot['itinerary']['days'][number]['items'];
    actual: [];
    deviations: [];
  };
  quickActions: Array<'record_expense' | 'mood_check' | 'ask_ai'>;
  teamThermometer: {
    level: 'green' | 'yellow' | 'orange' | 'red';
    visible: boolean;
    source: 'stub' | 'group_pulse';
  };
  pendingCards: {
    environmentAlerts: number;
    interventions: number;
    experiencePulses: number;
    rebalanceSuggestions: number;
  };
  budgetSnapshot: {
    overallUsagePercent: number | null;
    topBucket: { category: string; usagePercent: number } | null;
    source: 'budget_os' | 'unavailable';
  };
  /** 今日就绪（行中可执行度）；模块未注入或计算失败时为 unavailable */
  todayReadiness:
    | (TodayReadinessSnapshot & { source: 'readiness_engine' })
    | { source: 'unavailable'; reason?: string };
  anchorMaterialized: boolean;
}

@Injectable()
export class TripTodayService {
  constructor(
    private readonly access: InTripAccessService,
    private readonly anchorHandoff: AnchorHandoffService,
    private readonly budgetProfile: TripBudgetProfileService,
    private readonly vulnerability: VulnerabilityScoreService,
    private readonly environmentRadar: EnvironmentRadarService,
    private readonly rebalance: BudgetRebalanceService,
    private readonly groupPulse: GroupPulseService,
    private readonly experiencePulse: ExperiencePulseService,
    @Optional() private readonly coverageMap?: CoverageMapService,
  ) {}

  async getToday(tripId: string, userId: string): Promise<TodayDashboardSnapshot> {
    const trip = await this.access.assertInTripPhase(tripId);
    await this.access.assertTripMember(tripId, userId);

    const anchor = await this.anchorHandoff.getSnapshot(tripId);
    const dayNumber = this.resolveDayNumber(trip.startDate, trip.endDate);
    const date = this.resolveDateForDay(trip.startDate, dayNumber);

    const todayPlan =
      anchor?.itinerary.days.find((d) => d.date === date)?.items ??
      anchor?.itinerary.days[dayNumber - 1]?.items ??
      [];

    const canViewTeam = this.access.isOrganizer(trip, userId);

    const vulnerabilityScores = await this.vulnerability.listScores(tripId);
    const todayVuln = this.vulnerability.getTodayScore(vulnerabilityScores, dayNumber);

    let environmentAlertCount = 0;
    try {
      const openEvents = await this.environmentRadar.listOpenEvents(tripId, userId);
      environmentAlertCount = openEvents.filter((e) => e.severity !== 'green').length;
    } catch {
      // optional when module partially enabled
    }

    let budgetSnapshot: TodayDashboardSnapshot['budgetSnapshot'] = {
      overallUsagePercent: null,
      topBucket: null,
      source: 'unavailable',
    };

    try {
      const profile = await this.budgetProfile.getProfile(tripId, ['actuals']);
      const usage = profile.actuals?.budgetUsagePercent;
      if (usage != null) {
        budgetSnapshot = {
          overallUsagePercent: Math.round(usage),
          topBucket: this.pickTopBucket(profile.structure?.structureVsActual),
          source: 'budget_os',
        };
      }
    } catch {
      // budget profile optional during early M7
    }

    let rebalanceSuggestions = 0;
    let interventionCount = 0;
    let teamThermometer: TodayDashboardSnapshot['teamThermometer'] = {
      level: 'green',
      visible: canViewTeam,
      source: 'stub',
    };

    try {
      rebalanceSuggestions = await this.rebalance.countPending(tripId);
    } catch {
      // optional when money brain tables missing
    }

    try {
      interventionCount = await this.groupPulse.countPendingInterventions(tripId);
      const thermo = await this.groupPulse.getTeamThermometer(tripId, userId);
      teamThermometer = {
        level: thermo.level,
        visible: thermo.visible,
        source: 'group_pulse',
      };
    } catch {
      // optional when pulse tables missing
    }

    let experiencePulseCount = 0;
    try {
      experiencePulseCount = await this.experiencePulse.countPending(tripId, userId);
    } catch {
      // optional when experience tables missing
    }

    let todayReadiness: TodayDashboardSnapshot['todayReadiness'] = {
      source: 'unavailable',
      reason: 'readiness_engine_not_loaded',
    };
    if (this.coverageMap) {
      try {
        const readiness = await this.coverageMap.getTodayReadinessScore(tripId, dayNumber);
        todayReadiness = { ...readiness, source: 'readiness_engine' };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        todayReadiness = { source: 'unavailable', reason: msg };
      }
    }

    return {
      dayNumber,
      date,
      weather: {
        summary: todayVuln?.factors[0]?.message ?? '数据同步中',
        tempMin: null,
        tempMax: null,
        icon: todayVuln?.severity === 'red' ? 'storm' : todayVuln?.severity === 'yellow' ? 'cloudy' : 'clear',
        source: 'stub',
      },
      vulnerability: todayVuln
        ? {
            severity: todayVuln.severity,
            stabilityScore: todayVuln.stabilityScore,
            source: 'environment_radar',
          }
        : {
            severity: 'green',
            stabilityScore: 0.85,
            source: 'stub',
          },
      timeline: {
        planned: todayPlan,
        actual: [],
        deviations: [],
      },
      quickActions: ['record_expense', 'mood_check', 'ask_ai'],
      teamThermometer,
      pendingCards: {
        environmentAlerts: environmentAlertCount,
        interventions: interventionCount,
        experiencePulses: experiencePulseCount,
        rebalanceSuggestions,
      },
      budgetSnapshot,
      todayReadiness,
      anchorMaterialized: Boolean(anchor),
    };
  }

  private resolveDayNumber(startDate: Date, endDate: Date): number {
    const start = DateTime.fromJSDate(startDate).startOf('day');
    const end = DateTime.fromJSDate(endDate).startOf('day');
    const now = DateTime.now().startOf('day');
    if (now < start) return 1;
    if (now > end) {
      return Math.max(1, Math.ceil(end.diff(start, 'days').days) + 1);
    }
    return Math.max(1, Math.floor(now.diff(start, 'days').days) + 1);
  }

  private resolveDateForDay(startDate: Date, dayNumber: number): string {
    return (
      DateTime.fromJSDate(startDate)
        .plus({ days: dayNumber - 1 })
        .toISODate() ?? startDate.toISOString().slice(0, 10)
    );
  }

  private pickTopBucket(
    structureVsActual?: Record<string, { intent: number; actual: number }>,
  ): { category: string; usagePercent: number } | null {
    if (!structureVsActual) return null;
    let top: { category: string; usagePercent: number } | null = null;
    for (const [category, entry] of Object.entries(structureVsActual)) {
      if (!entry.intent || entry.intent <= 0) continue;
      const usagePercent = Math.round((entry.actual / entry.intent) * 100);
      if (!top || usagePercent > top.usagePercent) {
        top = { category, usagePercent };
      }
    }
    return top;
  }
}
