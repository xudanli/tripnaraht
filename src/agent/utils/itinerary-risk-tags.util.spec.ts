import type { Itinerary } from '../interfaces/trip-plan.interface';
import {
  applyRiskTagsFromAdjustments,
  applyRiskTagsFromVerifyIssues,
  riskTagFromAdjustmentAction,
  riskTagFromVerifyIssueType,
} from './itinerary-risk-tags.util';

describe('itinerary-risk-tags.util (ADR-B1)', () => {
  it('maps issue types to tags', () => {
    expect(riskTagFromVerifyIssueType('FATIGUE_THRESHOLD_EXCEEDED')).toBe('HEALTH');
    expect(riskTagFromVerifyIssueType('REACHABILITY_ISSUE')).toBe('SAFETY');
    expect(riskTagFromVerifyIssueType('TRANSFER_BUFFER_INSUFFICIENT')).toBe('LOGISTICS');
  });

  it('maps adjustment actions to tags', () => {
    expect(riskTagFromAdjustmentAction('ADD_BUFFER')).toBe('LOGISTICS');
    expect(riskTagFromAdjustmentAction('CHANGE_MODE')).toBe('SAFETY');
  });

  it('merges risk_tags and bumps risk_level on matching items', () => {
    const itinerary: Itinerary = {
      request_id: 'r1',
      days: [
        {
          date: '2026-04-01',
          items: [
            {
              id: 'i1',
              type: 'POI',
              start_window: '10:00',
              end_window: '11:00',
              location_ref: { name: 'X' },
              evidence_refs: [],
              verified: false,
            },
          ],
        },
      ],
    };
    applyRiskTagsFromVerifyIssues(itinerary, [
      { type: 'FATIGUE_THRESHOLD_EXCEEDED', severity: 'WARNING', item_id: 'i1' },
      { type: 'REACHABILITY_ISSUE', severity: 'ERROR', item_id: 'i1' },
    ]);
    const meta = itinerary.days[0].items[0].metadata;
    expect(meta?.risk_tags).toEqual(['HEALTH', 'SAFETY']);
    expect(meta?.risk_level).toBe('HIGH');
  });

  it('ignores issues without item_id', () => {
    const itinerary: Itinerary = {
      request_id: 'r1',
      days: [{ date: '2026-04-01', items: [] }],
    };
    applyRiskTagsFromVerifyIssues(itinerary, [
      { type: 'TIME_WINDOW_OVERLAP', severity: 'ERROR' },
    ]);
    expect(itinerary.days[0].items.length).toBe(0);
  });

  it('applies adjustment tags to targeted item', () => {
    const itinerary: Itinerary = {
      request_id: 'r2',
      days: [
        {
          date: '2026-04-01',
          items: [
            {
              id: 'seg-1',
              type: 'TRANSIT',
              start_window: '09:00',
              end_window: '10:00',
              location_ref: { name: 'Leg', place_id: 'p-leg' },
              evidence_refs: [],
              verified: true,
            },
          ],
        },
      ],
    };
    applyRiskTagsFromAdjustments(itinerary, [
      { action: 'ADD_BUFFER', why: 'transfer tight', target: 'seg-1' },
    ]);
    const meta = itinerary.days[0].items[0].metadata;
    expect(meta?.risk_tags).toEqual(['LOGISTICS']);
    expect(meta?.risk_level).toBe('MEDIUM');
  });
});
