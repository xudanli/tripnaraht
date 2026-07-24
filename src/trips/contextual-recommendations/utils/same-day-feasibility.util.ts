import { parseClockToMinutes } from './same-day-context-merge.util';
import { isRejectedArrivalActivityKey } from './same-day-arrival-planner.util';
import type {
  MergedSameDayProblem,
  MicroPlanGate,
  MicroPlanRecommendation,
  MicroPlanScheduleSlot,
} from '../types/contextual-recommendations.types';

export type FeasibilitySeverity = 'HARD' | 'SOFT';

export type FeasibilityViolation = {
  code: string;
  severity: FeasibilitySeverity;
  message: string;
};

export type MicroPlanFeasibilityResult = {
  gate: MicroPlanGate;
  violations: FeasibilityViolation[];
  repaired: boolean;
  recommendation: MicroPlanRecommendation;
};

function isAdverseWeather(hint?: string | null): boolean {
  return !!hint && /rain|wind|storm|雨|风|风暴|大风/i.test(hint);
}

function slotMinutes(slot: MicroPlanScheduleSlot): {
  start: number | null;
  end: number | null;
} {
  return {
    start: parseClockToMinutes(slot.startTime),
    end: parseClockToMinutes(slot.endTime),
  };
}

/**
 * Evaluate hard/soft executability of a micro-plan; optionally strip outdoor slots to repair.
 */
export function evaluateAndRepairMicroPlan(
  problem: MergedSameDayProblem,
  recommendation: MicroPlanRecommendation,
): MicroPlanFeasibilityResult {
  const firstPass = evaluateSchedule(problem, recommendation);
  if (firstPass.hardCount === 0) {
    const gate: MicroPlanGate = firstPass.softCount > 0 ? 'NEED_CONFIRM' : 'ALLOW';
    return {
      gate,
      violations: firstPass.violations,
      repaired: false,
      recommendation: {
        ...recommendation,
        gate,
        reasonCodes: [
          ...recommendation.reasonCodes,
          ...firstPass.violations.map((v) => v.code),
          'FEASIBILITY_PASS',
        ].filter((c, i, arr) => arr.indexOf(c) === i),
        score: Math.max(0, recommendation.score - firstPass.softCount * 4),
      },
    };
  }

  const repairedRec = repairByDroppingOutdoor(problem, recommendation);
  const secondPass = evaluateSchedule(problem, repairedRec);
  if (secondPass.hardCount === 0) {
    return {
      gate: secondPass.softCount > 0 ? 'NEED_CONFIRM' : 'ALLOW',
      violations: [...firstPass.violations, ...secondPass.violations],
      repaired: true,
      recommendation: {
        ...repairedRec,
        gate: secondPass.softCount > 0 ? 'NEED_CONFIRM' : 'ALLOW',
        reasonCodes: [
          ...repairedRec.reasonCodes,
          'FEASIBILITY_REPAIRED',
          ...secondPass.violations.map((v) => v.code),
        ].filter((c, i, arr) => arr.indexOf(c) === i),
        score: Math.max(40, repairedRec.score - 8 - secondPass.softCount * 3),
        title: repairedRec.title.includes('修复')
          ? repairedRec.title
          : `${repairedRec.title}（已按约束收敛）`,
      },
    };
  }

  return {
    gate: 'REJECT',
    violations: secondPass.violations,
    repaired: true,
    recommendation: {
      ...repairedRec,
      gate: 'REJECT',
      reasonCodes: [
        ...repairedRec.reasonCodes,
        'FEASIBILITY_REJECT',
        ...secondPass.violations.filter((v) => v.severity === 'HARD').map((v) => v.code),
      ].filter((c, i, arr) => arr.indexOf(c) === i),
      score: Math.min(35, repairedRec.score),
    },
  };
}

function evaluateSchedule(
  problem: MergedSameDayProblem,
  recommendation: MicroPlanRecommendation,
): { violations: FeasibilityViolation[]; hardCount: number; softCount: number } {
  const violations: FeasibilityViolation[] = [];
  const schedule = recommendation.schedule ?? [];
  const now = parseClockToMinutes(problem.currentTimeIso);
  const returnBy =
    parseClockToMinutes(problem.desiredReturnTime) ??
    parseClockToMinutes(problem.availableUntil);

  let prevEnd: number | null = null;
  for (const slot of schedule) {
    const { start, end } = slotMinutes(slot);
    if (start == null || end == null) {
      violations.push({
        code: 'INVALID_SLOT_TIME',
        severity: 'HARD',
        message: `时段时间无效：${slot.title ?? slot.type}`,
      });
      continue;
    }
    if (end <= start) {
      violations.push({
        code: 'SLOT_END_BEFORE_START',
        severity: 'HARD',
        message: `${slot.title ?? slot.type} 结束不晚于开始`,
      });
    }
    if (prevEnd != null && start < prevEnd - 1) {
      violations.push({
        code: 'SLOT_OVERLAP',
        severity: 'HARD',
        message: `${slot.title ?? slot.type} 与前一时段重叠`,
      });
    }
    prevEnd = Math.max(prevEnd ?? 0, end);

    if (slot.productId && isRejectedArrivalActivityKey(slot.productId)) {
      violations.push({
        code: 'REJECTED_HIGH_LOAD_PRODUCT',
        severity: 'HARD',
        message: `高负载活动不可用于当前情境：${slot.productId}`,
      });
    }
    const titleKey = `${slot.title ?? ''} ${slot.productId ?? ''}`;
    if (isRejectedArrivalActivityKey(titleKey)) {
      violations.push({
        code: 'REJECTED_HIGH_LOAD_PRODUCT',
        severity: 'HARD',
        message: `高负载活动不可用于当前情境：${slot.title}`,
      });
    }
  }

  if (schedule.length && now != null) {
    const first = slotMinutes(schedule[0]);
    if (first.start != null && first.start + 5 < now) {
      violations.push({
        code: 'STARTS_IN_PAST',
        severity: 'HARD',
        message: '方案开始时间早于当前时间',
      });
    }
  }

  if (schedule.length && returnBy != null) {
    const last = slotMinutes(schedule[schedule.length - 1]);
    if (last.end != null && last.end > returnBy + 5) {
      violations.push({
        code: 'MISSES_RETURN_DEADLINE',
        severity: 'HARD',
        message: `方案结束晚于目标返回时间`,
      });
    }
  }

  const walking = recommendation.impact?.walkingMinutes ?? 0;
  if (problem.energy === 'LOW' && walking > 35) {
    violations.push({
      code: 'WALKING_EXCEEDS_ENERGY',
      severity: 'HARD',
      message: '步行量超出当前低体力可接受范围',
    });
  } else if (problem.energy === 'LOW' && walking > 20) {
    violations.push({
      code: 'WALKING_HIGH_FOR_LOW_ENERGY',
      severity: 'SOFT',
      message: '低体力下步行偏多，建议确认',
    });
  }

  if (
    isAdverseWeather(problem.canonical.weatherHint) &&
    schedule.some((s) => s.type === 'LIGHT_ACTIVITY')
  ) {
    violations.push({
      code: 'OUTDOOR_IN_ADVERSE_WEATHER',
      severity: 'HARD',
      message: '不利天气下仍安排户外轻活动',
    });
  }

  if (
    problem.temporaryConstraints.some((c) => /MOTION_SICKNESS|晕车/i.test(c)) &&
    (recommendation.impact?.additionalDrivingMinutes ?? 0) > 25
  ) {
    violations.push({
      code: 'DRIVE_WITH_MOTION_SICKNESS',
      severity: 'HARD',
      message: '晕车约束下额外驾驶过长',
    });
  }

  if (problem.canonical.tomorrow?.earlyDeparture) {
    const last = schedule.length ? slotMinutes(schedule[schedule.length - 1]) : null;
    if (last?.end != null && last.end > 21 * 60 + 30) {
      violations.push({
        code: 'LATE_RETURN_BEFORE_EARLY_DEPARTURE',
        severity: 'HARD',
        message: '明日早发前结束过晚',
      });
    } else if (last?.end != null && last.end > 21 * 60) {
      violations.push({
        code: 'RETURN_TIGHT_BEFORE_EARLY_DEPARTURE',
        severity: 'SOFT',
        message: '明日早发前结束偏晚',
      });
    }
  }

  if (
    problem.canonical.team.childrenPresent &&
    schedule.some((s) => s.type === 'LIGHT_ACTIVITY') &&
    problem.energy === 'LOW'
  ) {
    violations.push({
      code: 'FAMILY_LOW_ENERGY_OUTDOOR',
      severity: 'SOFT',
      message: '有儿童且体力偏低时户外活动需确认',
    });
  }

  const hardCount = violations.filter((v) => v.severity === 'HARD').length;
  const softCount = violations.filter((v) => v.severity === 'SOFT').length;
  return { violations, hardCount, softCount };
}

function repairByDroppingOutdoor(
  problem: MergedSameDayProblem,
  recommendation: MicroPlanRecommendation,
): MicroPlanRecommendation {
  const filtered = recommendation.schedule.filter((s) => s.type !== 'LIGHT_ACTIVITY');
  const returnBy =
    parseClockToMinutes(problem.desiredReturnTime) ??
    parseClockToMinutes(problem.availableUntil) ??
    21 * 60;

  let schedule = filtered;
  if (schedule.length === 0) {
    schedule = [
      {
        type: 'REST',
        startTime: recommendation.schedule[0]?.startTime ?? '19:00',
        endTime: formatClock(returnBy),
        title: '返回休息',
      },
    ];
  } else {
    const last = schedule[schedule.length - 1];
    if (last.type !== 'REST') {
      schedule = [
        ...schedule,
        {
          type: 'REST',
          startTime: last.endTime,
          endTime: formatClock(returnBy),
          title: '返回休息',
        },
      ];
    } else {
      schedule = schedule.map((s, i) =>
        i === schedule.length - 1 ? { ...s, endTime: formatClock(returnBy) } : s,
      );
    }
  }

  // Clamp last end to returnBy if still over
  schedule = clampScheduleToDeadline(schedule, returnBy);

  return {
    ...recommendation,
    schedule,
    impact: {
      ...recommendation.impact,
      walkingMinutes: Math.min(recommendation.impact.walkingMinutes, 15),
      additionalDrivingMinutes: Math.min(recommendation.impact.additionalDrivingMinutes, 5),
      tomorrowPlanImpact: 'NONE',
    },
  };
}

function clampScheduleToDeadline(
  schedule: MicroPlanScheduleSlot[],
  returnBy: number,
): MicroPlanScheduleSlot[] {
  return schedule.map((slot, index) => {
    const start = parseClockToMinutes(slot.startTime);
    const end = parseClockToMinutes(slot.endTime);
    if (start == null || end == null) return slot;
    if (index === schedule.length - 1 && end > returnBy) {
      const clampedStart = Math.min(start, returnBy - 15);
      return {
        ...slot,
        startTime: formatClock(Math.max(0, clampedStart)),
        endTime: formatClock(returnBy),
      };
    }
    if (end > returnBy) {
      return {
        ...slot,
        endTime: formatClock(returnBy),
      };
    }
    return slot;
  });
}

function formatClock(totalMinutes: number): string {
  const m = ((Math.round(totalMinutes) % (24 * 60)) + 24 * 60) % (24 * 60);
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** Commit gate: REJECT blocks write; NEED_CONFIRM allowed if forceConfirm. */
export function assertCommitAllowed(
  gate: MicroPlanGate,
  opts?: { forceConfirm?: boolean },
): void {
  if (gate === 'REJECT') {
    throw Object.assign(new Error('方案未通过可行性校验，无法写入行程'), {
      code: 'FEASIBILITY_REJECT',
    });
  }
  if (gate === 'NEED_CONFIRM' && !opts?.forceConfirm) {
    throw Object.assign(new Error('方案需要确认后才能写入，请传 forceConfirm=true'), {
      code: 'FEASIBILITY_NEED_CONFIRM',
    });
  }
}
