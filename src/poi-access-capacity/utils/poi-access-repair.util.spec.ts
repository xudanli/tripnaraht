import {
  applyPoiAccessShiftArrivalRepair,
  applyPoiAccessReplaceRepair,
  isPoiAccessConstraintIssue,
  resolveAlternativePoiIdFromIssue,
} from './poi-access-repair.util';
import { CONSTRAINT_IDS } from '../../agent/services/constraint-registry';
import type { VerificationIssue } from '../../decision/kernel/decision-state.types';

describe('poi-access-repair.util', () => {
  const reservationIssue: VerificationIssue = {
    code: 'TIME_WINDOW_BREACH',
    class: 'CONFLICT',
    message: 'Blue Lagoon：入场需要预约',
    source: 'ITINERARY_VERIFY_SKILL',
    at: new Date().toISOString(),
    entityRef: { type: 'POI', id: 'item-bl' },
    metadata: { poi_access_constraint_id: CONSTRAINT_IDS.ENTITY_MANDATORY_RESERVATION },
    suggestedActions: [
      { action: 'REORDER', detail: '建议提前约 45 分钟到达' },
      { action: 'ASK_USER', detail: '前往官方预订' },
    ],
  };

  it('isPoiAccessConstraintIssue 识别预约约束', () => {
    expect(isPoiAccessConstraintIssue(reservationIssue)).toBe(true);
  });

  it('applyPoiAccessShiftArrivalRepair 提前到达时刻', () => {
    const itinerary = {
      request_id: 't1',
      days: [
        {
          date: '2026-08-01',
          items: [
            {
              id: 'item-bl',
              type: 'POI',
              start_window: '14:00',
              end_window: '16:00',
              location_ref: { name: 'Blue Lagoon' },
            },
          ],
        },
      ],
    };

    const result = applyPoiAccessShiftArrivalRepair(reservationIssue, itinerary);
    expect(result.ok).toBe(true);
    expect(result.itinerary?.days?.[0]?.items?.[0]?.start_window).toBe('13:15');
  });

  it('resolveAlternativePoiIdFromIssue 读取 metadata 替代 POI', () => {
    const issue: VerificationIssue = {
      code: 'POI_CLOSED',
      class: 'CONFLICT',
      message: 'Skaftafell 步道关闭',
      source: 'ITINERARY_VERIFY_SKILL',
      at: new Date().toISOString(),
      entityRef: { type: 'POI', id: 'item-skaft' },
      metadata: {
        poi_access_constraint_id: CONSTRAINT_IDS.ENTITY_ACCESS_BLOCKED,
        poi_access_alternative_poi_id: 'is.svinafellsjokull',
        poi_access_blocked_poi_id: 'is.skaftafell',
      },
    };
    const alt = resolveAlternativePoiIdFromIssue(issue);
    expect(alt?.poiId).toBe('is.svinafellsjokull');
  });

  it('applyPoiAccessReplaceRepair 替换为 Plan B 候选', () => {
    const issue: VerificationIssue = {
      code: 'POI_CLOSED',
      class: 'CONFLICT',
      message: 'Skaftafell 步道关闭',
      source: 'ITINERARY_VERIFY_SKILL',
      at: new Date().toISOString(),
      entityRef: { type: 'POI', id: 'item-skaft' },
      metadata: {
        poi_access_alternative_poi_id: 'is.svinafellsjokull',
        poi_access_blocked_poi_id: 'is.skaftafell',
      },
    };
    const itinerary = {
      request_id: 't1',
      days: [
        {
          date: '2026-07-15',
          items: [
            {
              id: 'item-skaft',
              type: 'POI',
              start_window: '10:00',
              location_ref: { name: 'Skaftafell' },
            },
          ],
        },
      ],
    };

    const result = applyPoiAccessReplaceRepair(issue, itinerary, 'is.skaftafell');
    expect(result.ok).toBe(true);
    expect(result.alternativePoiId).toBe('is.svinafellsjokull');
    expect(result.itinerary?.days?.[0]?.items?.[0]?.location_ref?.poi_access_slug).toBe(
      'is.svinafellsjokull',
    );
  });
});
