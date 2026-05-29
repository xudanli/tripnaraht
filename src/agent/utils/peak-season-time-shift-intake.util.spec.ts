import {
  buildDeterministicPeakSeasonGuardianResults,
  buildPeakSeasonTimeShiftSignals,
  detectPeakSeasonCrowdAvoidanceIntent,
  extractActivityDateYmdFromNl,
  isPeakSeasonWhaleTimeShiftScenario,
  MIDNIGHT_SUN_WHALE_SLOT,
} from './peak-season-time-shift-intake.util';
import type { TripPlanRequest } from '../interfaces/trip-plan.interface';

const USER_MSG =
  '6月25号下午我们到北部的胡萨维克，想安排一场观鲸，晚上住在阿克雷里，希望避开白天的旅游大巴人潮。';

describe('peak-season-time-shift-intake.util', () => {
  it('detects peak season crowd avoidance whale watching intent', () => {
    expect(detectPeakSeasonCrowdAvoidanceIntent(USER_MSG)).toBe(true);
    expect(isPeakSeasonWhaleTimeShiftScenario({ message: USER_MSG } as TripPlanRequest, USER_MSG)).toBe(
      true,
    );
  });

  it('extracts June 25 date from NL', () => {
    expect(extractActivityDateYmdFromNl(USER_MSG, 2026)).toBe('2026-06-25');
  });

  it('buildPeakSeasonTimeShiftSignals includes interpretation', () => {
    const s = buildPeakSeasonTimeShiftSignals(USER_MSG, 2026);
    expect(s?.whale_watching_husavik).toBe(true);
    expect(s?.activity_date_ymd).toBe('2026-06-25');
    expect(s?.interpretation_zh).toMatch(/胡萨维克|阿克雷里|大巴/);
    expect(s?.interpretation_zh).not.toMatch(/6\s*月下旬/);
  });

  it('does not invent 6月下旬 when trip has no explicit NL date', () => {
    const s = buildPeakSeasonTimeShiftSignals(
      '胡萨维克观鲸，住阿克雷里，避开白天大巴人潮',
      2026,
      { date_range: { start_date: '2026-07-10', end_date: '2026-07-18' } } as TripPlanRequest,
    );
    expect(s?.interpretation_zh).toMatch(/7月/);
    expect(s?.interpretation_zh).not.toMatch(/6\s*月下旬/);
  });

  it('deterministic guardian: Neptune evening slot, Dr.Dre delayed morning', () => {
    const signals = buildPeakSeasonTimeShiftSignals(USER_MSG, 2026)!;
    const gr = buildDeterministicPeakSeasonGuardianResults(
      { gate_result: 'ADJUST_REQUIRED', violations: [], required_adjustments: [], confidence: 0.8 },
      signals,
    );
    expect(gr.abu?.verdict).toBe('ALLOW');
    expect(gr.neptune?.verdict).toBe('REPLACE');
    expect(gr.neptune?.evidence?.join(' ')).toContain(MIDNIGHT_SUN_WHALE_SLOT.start_local);
    expect(gr.drdre?.evidence?.join(' ')).toMatch(/10:00|延迟/);
    expect(gr.debate_summary_zh).not.toMatch(/Neptune REPLACE/i);
  });
});
