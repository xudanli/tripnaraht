/**
 * SDR-303 — 从 DailyDrivePlan 投影 PlanDependency（共享 builder，避免循环依赖）
 */

import type { DailyDrivePlan, PlanDependency } from '../contracts/tep-self-drive.types';

export function buildPlanDependencies(dailyDrivePlans: DailyDrivePlan[]): PlanDependency[] {
  const deps: PlanDependency[] = [];

  for (const day of dailyDrivePlans) {
    deps.push(...buildDayDependencies(day));
  }

  return deps;
}

function buildDayDependencies(day: DailyDrivePlan): PlanDependency[] {
  const deps: PlanDependency[] = [];
  const dayRef = `day_${day.dayIndex}`;

  if (day.legs.length > 0) {
    const firstLeg = day.legs[0];
    deps.push({
      fromRef: day.origin.ref,
      toRef: firstLeg.legId,
      kind: 'ROUTING',
      description: '日起点至首段驾驶',
    });

    for (let i = 0; i < day.legs.length; i += 1) {
      const leg = day.legs[i];
      const nextLeg = day.legs[i + 1];
      if (nextLeg) {
        deps.push({
          fromRef: leg.legId,
          toRef: nextLeg.legId,
          kind: 'ROUTING',
          description: '驾驶段顺序依赖',
        });
      } else if (day.accommodation) {
        deps.push({
          fromRef: leg.legId,
          toRef: day.accommodation.ref,
          kind: 'ACCOMMODATION',
          description: '末段驾驶至当日住宿',
        });
      } else {
        deps.push({
          fromRef: leg.legId,
          toRef: day.destination.ref,
          kind: 'ROUTING',
          description: '末段驾驶至日终点',
        });
      }

      for (const activity of day.activities) {
        if (activity.ref === leg.toRef || activity.ref === leg.fromRef) {
          deps.push({
            fromRef: leg.legId,
            toRef: activity.ref,
            kind: 'ROUTING',
            description: '驾驶段锚定活动',
          });
        }
        if (leg.fromRef === activity.ref) {
          deps.push({
            fromRef: activity.ref,
            toRef: leg.legId,
            kind: 'ROUTING',
            description: '活动变更影响后续驾驶段',
          });
        }
        if (activity.fixedStartAt || activity.reservationRequired) {
          deps.push({
            fromRef: leg.legId,
            toRef: activity.ref,
            kind: activity.reservationRequired ? 'RESERVATION' : 'TEMPORAL',
            description: activity.reservationRequired
              ? '预约活动抵达依赖'
              : '固定时段活动抵达依赖',
          });
        }
      }
    }
  } else {
    for (const activity of day.activities) {
      if (activity.fixedStartAt || activity.reservationRequired) {
        deps.push({
          fromRef: dayRef,
          toRef: activity.ref,
          kind: activity.reservationRequired ? 'RESERVATION' : 'TEMPORAL',
          description: activity.reservationRequired
            ? '预约活动当日依赖'
            : '固定时段活动当日依赖',
        });
      }
    }
  }

  if (day.accommodation) {
    deps.push({
      fromRef: dayRef,
      toRef: day.accommodation.ref,
      kind: 'ACCOMMODATION',
      description: '当日住宿节点',
    });
  }

  return deps;
}
