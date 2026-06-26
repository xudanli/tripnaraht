import { Injectable } from '@nestjs/common';
import type { ISODate } from '../world-model';
import type { PlanDay, PlanSlot, TripPlan } from '../plan-model';
import {
  ClosedLoopTripState,
  ClosedLoopUiHints,
  TripAction,
  TripDecisionIssue,
  TripDecisionReport,
  TripFailureEvent,
  TripRepairSuggestion,
  TripStateMetrics,
} from './trip-closed-loop.types';

const DEFAULT_MAX_DAILY_SLOTS = 5;
const DEFAULT_MAX_DAILY_TRAVEL_MINUTES = 300;
const DEFAULT_MIN_ROBUSTNESS = 0.55;

@Injectable()
export class TripClosedLoopService {
  buildState(plan: TripPlan, overrides?: Partial<ClosedLoopTripState>): ClosedLoopTripState {
    return {
      tripId: plan.tripId,
      plan,
      actionHistory: overrides?.actionHistory ?? [],
      acceptedRiskIssueIds: overrides?.acceptedRiskIssueIds ?? [],
      constraints: overrides?.constraints ?? {},
      metrics: this.computeMetrics(plan),
    };
  }

  simulate(state: ClosedLoopTripState, action: TripAction): ClosedLoopTripState {
    const nextPlan = clonePlan(state.plan);

    switch (action.type) {
      case 'ADD_SLOT':
        this.findOrCreateDay(nextPlan, action.targetDate).timeSlots.push(action.slot);
        break;
      case 'REMOVE_SLOT':
        for (const day of nextPlan.days) {
          day.timeSlots = day.timeSlots.filter(slot => slot.id !== action.slotId);
        }
        break;
      case 'MOVE_SLOT':
        this.moveSlot(nextPlan, action.slotId, action.targetDate, action.targetTime);
        break;
      case 'REPLACE_SLOT':
        this.replaceSlot(nextPlan, action.slotId, action.replacement);
        break;
      case 'CHANGE_PACE':
        nextPlan.metrics = {
          ...nextPlan.metrics,
          robustnessScore: this.adjustRobustnessForPace(nextPlan.metrics?.robustnessScore, action.pace),
        };
        break;
      case 'ACCEPT_RISK':
      case 'ADD_CONSTRAINT':
        break;
    }

    const acceptedRiskIssueIds =
      action.type === 'ACCEPT_RISK'
        ? Array.from(new Set([...state.acceptedRiskIssueIds, ...action.issueIds]))
        : state.acceptedRiskIssueIds;

    const constraints =
      action.type === 'ADD_CONSTRAINT'
        ? {
            ...state.constraints,
            [action.constraint.key]: action.constraint.value,
          }
        : state.constraints;

    return this.buildState(nextPlan, {
      actionHistory: [...state.actionHistory, stampAction(action)],
      acceptedRiskIssueIds,
      constraints,
    });
  }

  evaluate(planOrState: TripPlan | ClosedLoopTripState, action?: TripAction): TripDecisionReport {
    const initialState = isClosedLoopState(planOrState) ? planOrState : this.buildState(planOrState);
    const simulatedState = action ? this.simulate(initialState, action) : initialState;

    const issues = this.detectIssues(simulatedState).filter(
      issue => !simulatedState.acceptedRiskIssueIds.includes(issue.id),
    );
    const hardViolations = issues.filter(issue => issue.severity === 'hard');
    const softRisks = issues.filter(issue => issue.severity === 'soft');
    const uncertainty = issues.filter(issue => issue.severity === 'info');
    const score = this.computeDecisionScore(simulatedState.metrics, hardViolations, softRisks, uncertainty);

    return {
      status: hardViolations.length > 0 ? 'blocked' : softRisks.length > 0 ? 'risky' : 'safe',
      score,
      hardViolations,
      softRisks,
      uncertainty,
      repairSuggestions: this.buildRepairSuggestions(simulatedState, [...hardViolations, ...softRisks, ...uncertainty]),
      simulatedState,
      appliedAction: action,
    };
  }

  recordFailureEvent(
    state: ClosedLoopTripState,
    event: Omit<TripFailureEvent, 'timestamp' | 'stateSnapshot'>,
  ): TripFailureEvent {
    return {
      ...event,
      tripId: event.tripId ?? state.tripId,
      timestamp: new Date().toISOString(),
      stateSnapshot: {
        tripId: state.tripId,
        metrics: state.metrics,
        constraints: state.constraints,
      },
    };
  }

  buildUiHints(report: TripDecisionReport): ClosedLoopUiHints {
    const primaryIssues = [
      ...report.hardViolations.map(issue => this.toUiIssueHint(issue)),
      ...report.softRisks.map(issue => this.toUiIssueHint(issue)),
      ...report.uncertainty.map(issue => this.toUiIssueHint(issue)),
    ].slice(0, 4);

    return {
      status: report.status,
      score: report.score,
      tone: report.status === 'blocked' ? 'danger' : report.status === 'risky' ? 'caution' : 'positive',
      headline: this.buildUiHeadline(report),
      summary: this.buildUiSummary(report),
      primaryIssues,
      actionHints: report.repairSuggestions.slice(0, 3).map(suggestion => ({
        id: suggestion.id,
        label: suggestion.title,
        mode: suggestion.mode,
        rationale: suggestion.rationale,
        actionCount: suggestion.actions.length,
      })),
      counts: {
        hard: report.hardViolations.length,
        soft: report.softRisks.length,
        uncertainty: report.uncertainty.length,
      },
    };
  }

  private detectIssues(state: ClosedLoopTripState): TripDecisionIssue[] {
    const issues: TripDecisionIssue[] = [];
    const maxDailySlots = asNumber(state.constraints.maxDailySlots, DEFAULT_MAX_DAILY_SLOTS);
    const maxDailyTravelMinutes = asNumber(
      state.constraints.maxDailyTravelMinutes,
      DEFAULT_MAX_DAILY_TRAVEL_MINUTES,
    );
    const minRobustness = asNumber(state.constraints.minRobustnessScore, DEFAULT_MIN_ROBUSTNESS);

    for (const day of state.plan.days) {
      const daySlotIds = day.timeSlots.map(slot => slot.id).filter(Boolean);

      if (day.weatherExecution?.executionState === 'BLOCKED' || day.weatherExecution?.violation === 'HARD') {
        issues.push({
          id: `weather-blocked-day-${day.day}`,
          domain: 'weather',
          severity: 'hard',
          title: `Day ${day.day} weather blocks execution`,
          detail: day.weatherExecution.explanation ?? 'Weather execution layer marks this day as blocked.',
          date: day.date,
          affectedSlotIds: daySlotIds,
          evidenceRefs: day.weatherExecution.hazardKinds,
          repairHint: 'Delay the sensitive activity, reroute, or add a buffer day.',
        });
      } else if (day.weatherExecution?.executionState === 'HIGH_RISK') {
        issues.push({
          id: `weather-high-risk-day-${day.day}`,
          domain: 'weather',
          severity: 'soft',
          title: `Day ${day.day} weather is high risk`,
          detail: day.weatherExecution.explanation ?? 'Weather execution layer marks this day as high risk.',
          date: day.date,
          affectedSlotIds: daySlotIds,
          evidenceRefs: day.weatherExecution.hazardKinds,
          repairHint: 'Prefer an indoor or lower-exposure alternative for this day.',
        });
      }

      const dailyTravelMinutes = sumDailyTravelMinutes(day);
      if (dailyTravelMinutes > maxDailyTravelMinutes) {
        issues.push({
          id: `travel-overload-day-${day.day}`,
          domain: 'transport',
          severity: dailyTravelMinutes > maxDailyTravelMinutes * 1.35 ? 'hard' : 'soft',
          title: `Day ${day.day} travel time is overloaded`,
          detail: `Estimated travel is ${dailyTravelMinutes} minutes, above the ${maxDailyTravelMinutes} minute limit.`,
          date: day.date,
          affectedSlotIds: daySlotIds,
          repairHint: 'Split the day, move one stop, or add an overnight closer to the corridor.',
        });
      }

      if (day.timeSlots.length > maxDailySlots) {
        issues.push({
          id: `pace-overload-day-${day.day}`,
          domain: 'pace',
          severity: day.timeSlots.length > maxDailySlots + 2 ? 'hard' : 'soft',
          title: `Day ${day.day} has too many stops`,
          detail: `${day.timeSlots.length} scheduled stops exceeds the ${maxDailySlots} stop pace constraint.`,
          date: day.date,
          affectedSlotIds: daySlotIds,
          repairHint: 'Remove optional stops or move them to a lighter day.',
        });
      }

      for (const flag of day.terrainFacts?.riskFlags ?? []) {
        if (flag.severity === 'HIGH') {
          issues.push({
            id: `terrain-${day.day}-${flag.type}`,
            domain: 'safety',
            severity: 'hard',
            title: `Day ${day.day} terrain risk: ${flag.type}`,
            detail: flag.message,
            date: day.date,
            affectedSlotIds: daySlotIds,
            repairHint: 'Require a safer segment, lower exposure alternative, or explicit guide/equipment evidence.',
          });
        }
      }
    }

    if (typeof state.metrics.robustnessScore === 'number' && state.metrics.robustnessScore < minRobustness) {
      issues.push({
        id: 'plan-low-robustness',
        domain: 'uncertainty',
        severity: 'soft',
        title: 'Plan robustness is low',
        detail: `Robustness score ${state.metrics.robustnessScore.toFixed(2)} is below ${minRobustness.toFixed(2)}.`,
        repairHint: 'Increase buffers, reduce same-day transfers, or fetch fresher evidence.',
      });
    }

    if (state.plan.days.length === 0 || state.metrics.slotCount === 0) {
      issues.push({
        id: 'plan-empty',
        domain: 'uncertainty',
        severity: 'info',
        title: 'Plan has no executable slots',
        detail: 'The evaluator needs at least one scheduled slot to assess execution risk.',
        repairHint: 'Build an initial draft before running closed-loop evaluation.',
      });
    }

    return issues;
  }

  private buildRepairSuggestions(
    state: ClosedLoopTripState,
    issues: TripDecisionIssue[],
  ): TripRepairSuggestion[] {
    const suggestions: TripRepairSuggestion[] = [];
    const overloadedDay = issues.find(issue => issue.domain === 'pace' || issue.domain === 'transport');
    const weatherIssue = issues.find(issue => issue.domain === 'weather');
    const uncertaintyIssue = issues.find(issue => issue.domain === 'uncertainty');

    if (overloadedDay?.date) {
      const day = state.plan.days.find(candidate => candidate.date === overloadedDay.date);
      const optionalSlot = day?.timeSlots.find(slot => slot.priorityTag === 'optional') ?? day?.timeSlots.at(-1);
      if (optionalSlot) {
        suggestions.push({
          id: `repair-lighten-${overloadedDay.date}`,
          mode: 'lighter',
          title: `Lighten ${overloadedDay.date}`,
          rationale: overloadedDay.repairHint ?? 'Reduce same-day load.',
          actions: [{ type: 'REMOVE_SLOT', slotId: optionalSlot.id, actor: 'system', reason: overloadedDay.id }],
        });
      }
    }

    if (weatherIssue?.date) {
      suggestions.push({
        id: `repair-weather-${weatherIssue.date}`,
        mode: 'safer',
        title: `Add safety buffer for ${weatherIssue.date}`,
        rationale: weatherIssue.repairHint ?? 'Weather-sensitive execution needs a safer fallback.',
        actions: [{ type: 'CHANGE_PACE', pace: 'relaxed', actor: 'system', reason: weatherIssue.id }],
      });
    }

    if (uncertaintyIssue) {
      suggestions.push({
        id: 'repair-refresh-evidence',
        mode: 'evidence_needed',
        title: 'Refresh missing or stale evidence',
        rationale: uncertaintyIssue.repairHint ?? 'More evidence is needed before commitment.',
        actions: [
          {
            type: 'ADD_CONSTRAINT',
            actor: 'system',
            reason: uncertaintyIssue.id,
            constraint: { key: 'requiresEvidenceRefresh', value: true, severity: 'soft' },
          },
        ],
      });
    }

    return suggestions;
  }

  private computeMetrics(plan: TripPlan): TripStateMetrics {
    const dailyTravel = plan.days.map(sumDailyTravelMinutes);
    return {
      dayCount: plan.days.length,
      slotCount: plan.days.reduce((sum, day) => sum + day.timeSlots.length, 0),
      estActiveMinutes: plan.metrics?.estActiveMinutes,
      estTravelMinutes: plan.metrics?.estTravelMinutes,
      robustnessScore: plan.metrics?.robustnessScore,
      maxDailySlotCount: Math.max(0, ...plan.days.map(day => day.timeSlots.length)),
      maxDailyTravelMinutes: Math.max(0, ...dailyTravel),
    };
  }

  private computeDecisionScore(
    metrics: TripStateMetrics,
    hardViolations: TripDecisionIssue[],
    softRisks: TripDecisionIssue[],
    uncertainty: TripDecisionIssue[],
  ): number {
    if (hardViolations.length > 0) return Math.max(0, 30 - hardViolations.length * 8);
    const base = typeof metrics.robustnessScore === 'number' ? metrics.robustnessScore * 100 : 82;
    return clamp(Math.round(base - softRisks.length * 12 - uncertainty.length * 5), 0, 100);
  }

  private findOrCreateDay(plan: TripPlan, date: ISODate): PlanDay {
    let day = plan.days.find(candidate => candidate.date === date);
    if (!day) {
      day = { day: plan.days.length + 1, date, timeSlots: [] };
      plan.days.push(day);
      plan.days.sort((a, b) => a.date.localeCompare(b.date));
      plan.days.forEach((candidate, index) => {
        candidate.day = index + 1;
      });
    }
    return day;
  }

  private moveSlot(plan: TripPlan, slotId: string, targetDate: ISODate, targetTime?: string): void {
    let movedSlot: PlanSlot | undefined;
    for (const day of plan.days) {
      const index = day.timeSlots.findIndex(slot => slot.id === slotId);
      if (index >= 0) {
        movedSlot = day.timeSlots.splice(index, 1)[0];
        break;
      }
    }
    if (!movedSlot) return;
    this.findOrCreateDay(plan, targetDate).timeSlots.push({
      ...movedSlot,
      time: targetTime ?? movedSlot.time,
    });
  }

  private replaceSlot(plan: TripPlan, slotId: string, replacement: PlanSlot): void {
    for (const day of plan.days) {
      const index = day.timeSlots.findIndex(slot => slot.id === slotId);
      if (index >= 0) {
        day.timeSlots[index] = replacement;
        return;
      }
    }
  }

  private adjustRobustnessForPace(
    current: number | undefined,
    pace: 'relaxed' | 'moderate' | 'intense',
  ): number {
    const baseline = current ?? 0.7;
    if (pace === 'relaxed') return clampFloat(baseline + 0.08, 0, 1);
    if (pace === 'intense') return clampFloat(baseline - 0.12, 0, 1);
    return baseline;
  }

  private toUiIssueHint(issue: TripDecisionIssue) {
    return {
      id: issue.id,
      severity: issue.severity === 'hard' ? 'block' as const : issue.severity === 'soft' ? 'warn' as const : 'info' as const,
      domain: issue.domain,
      title: issue.title,
      detail: issue.detail,
      date: issue.date,
      affectedSlotIds: issue.affectedSlotIds,
      evidenceRefs: issue.evidenceRefs,
    };
  }

  private buildUiHeadline(report: TripDecisionReport): string {
    if (report.status === 'blocked') return 'Route is not ready to execute';
    if (report.status === 'risky') return 'Route needs adjustment before commitment';
    return 'Route is executable';
  }

  private buildUiSummary(report: TripDecisionReport): string {
    if (report.status === 'blocked') {
      return `${report.hardViolations.length} blocking issue(s) must be resolved before this plan should be used.`;
    }
    if (report.status === 'risky') {
      return `${report.softRisks.length} risk signal(s) should be reviewed; ${report.repairSuggestions.length} repair option(s) are available.`;
    }
    return `No blocking issues found. Execution score is ${report.score}.`;
  }
}

function isClosedLoopState(value: TripPlan | ClosedLoopTripState): value is ClosedLoopTripState {
  return 'plan' in value && 'actionHistory' in value && 'metrics' in value;
}

function stampAction(action: TripAction): TripAction {
  return {
    ...action,
    id: action.id ?? `action_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: action.timestamp ?? new Date().toISOString(),
  };
}

function sumDailyTravelMinutes(day: PlanDay): number {
  return day.timeSlots.reduce((sum, slot) => sum + (slot.travelLegFromPrev?.durationMin ?? 0), 0);
}

function clonePlan(plan: TripPlan): TripPlan {
  return JSON.parse(JSON.stringify(plan)) as TripPlan;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampFloat(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
