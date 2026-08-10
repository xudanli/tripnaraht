/**
 * PPT / product narrative showcase — high-roof camper + ≥18 m/s gust,
 * nominal ETA still inside check-in buffer, effective state already unstable.
 */

import { buildWindPilotEvidence } from './build-wind-pilot-evidence';
import type { IcelandWindPilotEvidence } from './wind-pilot.types';

const DAY = '2026-07-17';

/**
 * User drives a high-body camper toward a 16:00 check-in.
 * Nav ETA 15:50 (10 min buffer) looks fine; gust ≥18 m/s makes the plan unstable.
 */
export function buildIcelandWindPilotShowcaseCase(): IcelandWindPilotEvidence {
  return buildWindPilotEvidence({
    caseId: 'showcase_high_roof_gust18_checkin',
    archetype: 'FIX_BY_DEPART_EARLIER',
    title: 'High-roof camper gust≥18 — ETA buffer looks ok',
    titleZh: '高车身露营车阵风≥18 — 导航缓冲看似充足',
    facts: {
      windMps: 18,
      windGustMps: 22,
      highRoof: true,
      windExposure: 'high',
      routeLabel: 'Vík → 下午活动签到点',
      distanceKm: 95,
      // Nominal drive ~2h50; depart 13:00 → ETA ~15:50 vs check-in 16:00
      baseDurationMinutes: 170,
      appointmentSlackMinutes: 10,
      plannedDepartureAt: `${DAY}T13:00:00.000Z`,
      checkInDeadlineAt: `${DAY}T16:00:00.000Z`,
      windOnsetAt: `${DAY}T12:30:00.000Z`,
      region: 'south_coast',
    },
    preferDropStop: false,
    expectedRootCauseSummaryZh:
      '南岸强风可能导致冰川活动无法按时签到。',
    irreparableAfterAt: `${DAY}T16:00:00.000Z`,
    observation: {
      kind: 'BOOKING_CHECKIN',
      completed: true,
      observedAt: `${DAY}T15:55:00.000Z`,
      arrivalTime: `${DAY}T15:52:00.000Z`,
      notes: '采纳提前出发后签到成功',
    },
    notes:
      'Product narrative: 名义 ETA 仍有 10 分钟缓冲；高车身×阵风使有效状态不稳定。',
  });
}
