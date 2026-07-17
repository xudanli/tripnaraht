/**
 * Iceland Wind Pilot — 19 acceptance samples (7 archetypes).
 * Not scale: coverage of decision structures.
 */

import { buildWindPilotEvidence } from './build-wind-pilot-evidence';
import type { IcelandWindPilotEvidence } from './wind-pilot.types';

const DAY = '2026-07-17';
const depart = (h: number, m = 0) =>
  `${DAY}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`;
const checkIn = (h: number, m = 0) =>
  `${DAY}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`;

function baseFacts(overrides: Partial<Parameters<typeof buildWindPilotEvidence>[0]['facts']>) {
  return {
    windMps: 18,
    windExposure: 'high' as const,
    routeLabel: 'Reykjavik → 冰川徒步集合点',
    distanceKm: 180,
    baseDurationMinutes: 130,
    appointmentSlackMinutes: 25,
    plannedDepartureAt: depart(12, 0),
    checkInDeadlineAt: checkIn(15, 30),
    windOnsetAt: depart(13, 0),
    region: 'south_coast',
    ...overrides,
  };
}

const ROOT =
  '南岸强风可能导致冰川活动无法按时签到。';

/**
 * 15–20 cases as specified for Pilot Validation.
 * Counts: 3+3+3+3+3+2+2 = 19
 */
export function buildIcelandWindPilotCaseRegistry(): IcelandWindPilotEvidence[] {
  const cases: IcelandWindPilotEvidence[] = [];

  // —— 强风但不影响行程 (3) ——
  for (let i = 1; i <= 3; i++) {
    cases.push(
      buildWindPilotEvidence({
        caseId: `wind_no_impact_${i}`,
        archetype: 'WIND_NO_IMPACT',
        title: `Wind present but slack sufficient #${i}`,
        titleZh: `有风但缓冲充足 #${i}`,
        facts: baseFacts({
          windMps: 8 + i,
          appointmentSlackMinutes: 60 + i * 10,
          baseDurationMinutes: 90,
        }),
        expectedRootCauseSummaryZh: ROOT,
        irreparableAfterAt: checkIn(15, 30),
        observation: {
          kind: 'BOOKING_CHECKIN',
          completed: true,
          observedAt: checkIn(14, 50),
          arrivalTime: checkIn(14, 45),
        },
        notes: '低风 + 大缓冲 → 可不干预或轻提示',
      }),
    );
  }

  // —— 轻微延误仍能签到 (3) ——
  for (let i = 1; i <= 3; i++) {
    cases.push(
      buildWindPilotEvidence({
        caseId: `wind_minor_ok_${i}`,
        archetype: 'WIND_MINOR_DELAY_STILL_OK',
        title: `Minor delay still check-in #${i}`,
        titleZh: `轻微延误仍可签到 #${i}`,
        facts: baseFacts({
          windMps: 12 + i,
          appointmentSlackMinutes: 40,
        }),
        expectedRootCauseSummaryZh: ROOT,
        irreparableAfterAt: checkIn(15, 30),
        observation: {
          kind: 'GPS',
          completed: true,
          observedAt: checkIn(15, 10),
          arrivalTime: checkIn(15, 5),
        },
      }),
    );
  }

  // —— 提前出发可修复 (3) ——
  for (let i = 1; i <= 3; i++) {
    cases.push(
      buildWindPilotEvidence({
        caseId: `fix_depart_earlier_${i}`,
        archetype: 'FIX_BY_DEPART_EARLIER',
        title: `Fix by depart earlier #${i}`,
        titleZh: `提前出发可修复 #${i}`,
        facts: baseFacts({
          windMps: 18 + i,
          appointmentSlackMinutes: 15,
          recoverableStopMinutes: undefined,
        }),
        preferDropStop: false,
        expectedRootCauseSummaryZh: ROOT,
        irreparableAfterAt: checkIn(15, 30),
        observation: {
          kind: 'USER_ARRIVAL_CLICK',
          completed: true,
          observedAt: checkIn(15, 20),
          arrivalTime: checkIn(15, 18),
        },
      }),
    );
  }

  // —— 删除中间 POI 可修复 (3) ——
  for (let i = 1; i <= 3; i++) {
    cases.push(
      buildWindPilotEvidence({
        caseId: `fix_drop_stop_${i}`,
        archetype: 'FIX_BY_DROP_STOP',
        title: `Fix by drop stop #${i}`,
        titleZh: `删除中途停靠可修复 #${i}`,
        facts: baseFacts({
          windMps: 20 + i,
          appointmentSlackMinutes: 12,
          recoverableStopMinutes: 35 + i * 5,
        }),
        preferDropStop: true,
        expectedRootCauseSummaryZh: ROOT,
        irreparableAfterAt: checkIn(15, 30),
        observation: {
          kind: 'BOOKING_CHECKIN',
          completed: true,
          observedAt: checkIn(15, 15),
          arrivalTime: checkIn(15, 12),
        },
      }),
    );
  }

  // —— 原活动不可挽回 (3) ——
  for (let i = 1; i <= 3; i++) {
    cases.push(
      buildWindPilotEvidence({
        caseId: `irrecoverable_${i}`,
        archetype: 'IRRECOVERABLE_REPLACE_OR_CANCEL',
        title: `Irrecoverable need replace/cancel #${i}`,
        titleZh: `已不可挽回需替换/取消 #${i}`,
        facts: baseFacts({
          windMps: 28 + i,
          appointmentSlackMinutes: 5,
          baseDurationMinutes: 150,
          plannedDepartureAt: depart(13, 30),
          checkInDeadlineAt: checkIn(15, 0),
        }),
        expectedRootCauseSummaryZh: ROOT,
        irreparableAfterAt: checkIn(15, 0),
        observation: {
          kind: 'BOOKING_CHECKIN',
          completed: false,
          observedAt: checkIn(16, 10),
          arrivalTime: checkIn(16, 5),
          notes: '错过签到窗口',
        },
      }),
    );
  }

  // —— 预报变化，旧决策失效 (2) ——
  for (let i = 1; i <= 2; i++) {
    cases.push(
      buildWindPilotEvidence({
        caseId: `forecast_stale_${i}`,
        archetype: 'FORECAST_CHANGE_STALE_CONTEXT',
        title: `Forecast change stale context #${i}`,
        titleZh: `预报变化需失效重算 #${i}`,
        facts: baseFacts({
          windMps: 16 + i * 4,
          appointmentSlackMinutes: 20,
        }),
        expectedRootCauseSummaryZh: ROOT,
        irreparableAfterAt: checkIn(15, 30),
        observation: { kind: 'NONE', notes: 'context 已 stale，等待重算后再观测' },
        notes: 'Harness 检查 contextHash / stale 标记',
      }),
    );
  }

  // —— 观测不完整 (2) ——
  for (let i = 1; i <= 2; i++) {
    cases.push(
      buildWindPilotEvidence({
        caseId: `incomplete_obs_${i}`,
        archetype: 'INCOMPLETE_OBSERVATION',
        title: `Incomplete observation #${i}`,
        titleZh: `观测不完整无法对账 #${i}`,
        facts: baseFacts({
          windMps: 19,
          appointmentSlackMinutes: 18,
          recoverableStopMinutes: 40,
        }),
        preferDropStop: true,
        expectedRootCauseSummaryZh: ROOT,
        irreparableAfterAt: checkIn(15, 30),
        observation: { kind: 'NONE', notes: 'Apply 后无 GPS/签到 → UNOBSERVABLE' },
      }),
    );
  }

  return cases;
}

export function countByArchetype(
  cases: IcelandWindPilotEvidence[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of cases) {
    out[c.archetype] = (out[c.archetype] ?? 0) + 1;
  }
  return out;
}
