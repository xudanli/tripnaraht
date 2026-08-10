import { evaluatePoiAccessCapacity } from './evaluate-poi-access.util';
import { poiAccessEvaluationToFeasibilityIssue } from './poi-access-feasibility-mapper.util';
import type { PoiAccessRule } from '../interfaces/poi-access-capacity.interface';
import type { PoiAccessTripEvaluation } from '../types/poi-access-readiness.types';

describe('poiAccessEvaluationToFeasibilityIssue repairOptions', () => {
  it('季节关闭 BLOCKED → 首位是改期，不含预订/凭证', () => {
    const seasonalRule: PoiAccessRule = {
      id: 'is.djupalonssandur.seasonal',
      poiId: 'is.djupalonssandur',
      ruleType: 'SEASONAL_CLOSURE',
      targetResource: 'POI',
      notes: '6月至8月为最佳访问季节，天气相对稳定',
      confidence: 'OFFICIAL',
      status: 'ACTIVE',
      sourceAuthority: 'TripNARA / seasonality',
      lastVerifiedAt: '2026-07-20T00:00:00.000Z',
      // 有官方链接也不应变成「前往官方预订」——季节问题不是预约问题
      sourceUrl: 'https://example.com/djupalonssandur',
    };

    const raw = evaluatePoiAccessCapacity({
      poiId: 'is.djupalonssandur',
      dateISO: '2026-02-10',
      arrivalTime: '11:00',
      rules: [seasonalRule],
      staleRuleDays: 365,
    });
    expect(raw.verdict).toBe('BLOCKED');
    expect(raw.bottleneckRuleType).toBe('SEASONAL_CLOSURE');

    const evalRow: PoiAccessTripEvaluation = {
      tripItemId: 'item-djupalon',
      tripDayId: 'd3',
      dayNumber: 3,
      poiId: raw.poiId,
      poiName: 'Djúpalónssandur 黑沙滩',
      dateISO: '2026-02-10',
      arrivalTime: '11:00',
      raw,
      hasReservationEvidence: false,
    };

    const issue = poiAccessEvaluationToFeasibilityIssue(evalRow, [seasonalRule])!;
    expect(issue.issueKind).toBe('poi_access_blocked');
    expect(issue.uiHints?.primaryAction).toBe('change_date');
    expect(issue.repairOptions?.map((o) => o.type)).toEqual(['change_date']);
    expect(issue.repairOptions?.[0]?.label).toBe('改期');
    expect(issue.repairOptions?.[0]?.description).toContain('更换日期');
    expect(issue.repairOptions?.some((o) => o.type === 'book_parking')).toBe(false);
    expect(issue.repairOptions?.some((o) => o.type === 'manual_confirm')).toBe(false);
  });

  it('预约缺失仍保留前往官方预订 + 上传凭证', () => {
    const reservationRule: PoiAccessRule = {
      id: 'is.blue_lagoon.reservation',
      poiId: 'is.blue_lagoon',
      ruleType: 'RESERVATION_REQUIRED',
      targetResource: 'POI',
      reservationRequired: true,
      confidence: 'OFFICIAL',
      status: 'ACTIVE',
      sourceAuthority: 'Blue Lagoon',
      lastVerifiedAt: '2026-07-20T00:00:00.000Z',
      sourceUrl: 'https://www.bluelagoon.com/',
      notes: '入场需预约',
    };

    const raw = evaluatePoiAccessCapacity({
      poiId: 'is.blue_lagoon',
      dateISO: '2026-08-01',
      arrivalTime: '14:00',
      rules: [reservationRule],
      staleRuleDays: 365,
    });
    expect(raw.verdict).toBe('RESERVATION_REQUIRED');

    const issue = poiAccessEvaluationToFeasibilityIssue(
      {
        tripItemId: 'item-bl',
        tripDayId: 'd1',
        dayNumber: 1,
        poiId: raw.poiId,
        poiName: 'Blue Lagoon',
        dateISO: '2026-08-01',
        arrivalTime: '14:00',
        raw,
        hasReservationEvidence: false,
      },
      [reservationRule],
    )!;

    expect(issue.repairOptions?.some((o) => o.type === 'book_parking')).toBe(true);
    expect(issue.repairOptions?.some((o) => o.type === 'manual_confirm')).toBe(true);
  });
});
