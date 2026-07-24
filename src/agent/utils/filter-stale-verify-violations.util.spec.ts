import type { GateResult, Itinerary } from '../interfaces/trip-plan.interface';
import {
  dedupeGateViolations,
  filterGateViolationsAgainstItinerary,
  filterGateViolationsToDraftScheduleOnly,
  filterSafetyIssuesDuplicatingGateViolations,
  isStaleVerifyViolationForItinerary,
} from './filter-stale-verify-violations.util';
import { VERIFY_SYNTHETIC_VIOLATION_PREFIX } from './merge-verify-issues-into-gate.util';

const itinerary: Itinerary = {
  request_id: 't1',
  days: [
    {
      date: '2026-06-06',
      items: [
        {
          id: 'day6-lead',
          type: 'POI',
          start_window: '09:00',
          end_window: '10:40',
          location_ref: { place_id: '1', name: '众神瀑布' },
          evidence_refs: [],
          verified: false,
        },
      ],
    },
  ],
};

describe('filter-stale-verify-violations', () => {
  it('drops verify violation when POI name no longer on itinerary', () => {
    const detail = `${VERIFY_SYNTHETIC_VIOLATION_PREFIX} POI_CLOSED [entity:POI:day6-lead]: POI "钻石沙滩" 在 2026-06-06 09:00 可能未开放`;
    expect(isStaleVerifyViolationForItinerary(detail, itinerary)).toBe(true);

    const gate: GateResult = {
      gate_result: 'ALLOW',
      confidence: 0.8,
      violations: [{ type: 'DATA_MISSING', severity: 'SOFT', detail, verify_synthetic: true }],
    };
    const filtered = filterGateViolationsAgainstItinerary(gate, itinerary);
    expect(filtered.violations).toHaveLength(0);
  });

  it('dedupes identical POI_CLOSED lines', () => {
    const detail =
      '[VERIFY] POI_CLOSED [entity:POI:a]: POI "冰河湖" 在 2026-06-02 09:00 可能未开放';
    const dupes = dedupeGateViolations([
      { type: 'DATA_MISSING', severity: 'SOFT', detail },
      { type: 'DATA_MISSING', severity: 'SOFT', detail },
    ]);
    expect(dupes).toHaveLength(1);
  });

  it('dedupes POI_CLOSED with same POI/date/time but different entity ids', () => {
    const d1 =
      '[VERIFY] POI_CLOSED [entity:POI:item-a]: POI "斯卡夫塔山国家公园" 在 2026-06-02 11:00 不在开放时间范围内';
    const d2 =
      '[VERIFY] POI_CLOSED [entity:POI:item-b]: POI "斯卡夫塔山国家公园" 在 2026-06-02 11:00 不在开放时间范围内';
    expect(
      dedupeGateViolations([
        { type: 'DATA_MISSING', severity: 'SOFT', detail: d1 },
        { type: 'DATA_MISSING', severity: 'SOFT', detail: d2 },
      ]),
    ).toHaveLength(1);
  });

  it('keeps violation when POI name still matches', () => {
    const detail = `${VERIFY_SYNTHETIC_VIOLATION_PREFIX} POI_CLOSED [entity:POI:day6-lead]: POI "众神瀑布" 在 2026-06-06 09:00 可能未开放`;
    expect(isStaleVerifyViolationForItinerary(detail, itinerary)).toBe(false);
  });

  it('drops opening-hours violation when start_window changed since verify', () => {
    const rescheduled: Itinerary = {
      request_id: 't2',
      days: [
        {
          date: '2026-06-03',
          items: [
            {
              id: 'skaftafell',
              type: 'POI',
              start_window: '11:30',
              end_window: '14:00',
              location_ref: { place_id: '381041', name: '斯卡夫塔山国家公园' },
              evidence_refs: [],
            },
          ],
        },
      ],
    };
    const detail = `${VERIFY_SYNTHETIC_VIOLATION_PREFIX} POI_CLOSED [entity:POI:skaftafell]: POI "斯卡夫塔山国家公园" 在 09:00 不在开放时间内`;
    expect(isStaleVerifyViolationForItinerary(detail, rescheduled)).toBe(true);
  });

  it('filterGateViolationsToDraftScheduleOnly keeps only draft POIs', () => {
    const skoga =
      '[VERIFY] POI_CLOSED [entity:POI:a]: POI "斯科加瀑布" 在 2026-06-02 09:00 不在开放时间范围内';
    const skaftafell =
      '[VERIFY] POI_CLOSED [entity:POI:b]: POI "斯卡夫塔山国家公园" 在 2026-06-02 11:00 不在开放时间范围内';
    const filtered = filterGateViolationsToDraftScheduleOnly(
      [
        { type: 'DATA_MISSING', severity: 'SOFT', detail: skoga },
        { type: 'DATA_MISSING', severity: 'SOFT', detail: skaftafell },
      ],
      ['斯科加瀑布'],
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0].detail).toContain('斯科加瀑布');
  });

  it('strips safety_surface issues duplicated in gate violations', () => {
    const gateDetail =
      '[VERIFY] POI_CLOSED [entity:POI:a]: POI "斯科加瀑布" 在 2026-06-02 13:00 不在开放时间范围内';
    const filtered = filterSafetyIssuesDuplicatingGateViolations(
      [
        {
          type: 'POI_CLOSED',
          message: 'POI "斯科加瀑布" 在 2026-06-02 13:00 不在开放时间范围内',
          day: '2026-06-02',
        },
      ],
      {
        gate_result: 'ALLOW',
        confidence: 0.8,
        violations: [{ type: 'DATA_MISSING', severity: 'SOFT', detail: gateDetail }],
      },
    );
    expect(filtered).toHaveLength(0);
  });
});
