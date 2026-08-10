import { appendVerifyTemporalOpeningAuditProof } from './verify-temporal-opening-audit.util';
import type { OrchestratorState } from '../../../interfaces/trip-plan.interface';

function baseState(overrides?: Partial<OrchestratorState>): OrchestratorState {
  return {
    request_id: 'req-1',
    decision_log: [],
    itinerary: {
      days: [
        {
          date: '2026-08-15',
          items: [
            {
              id: 'day1_item1',
              start_window: '08:00',
              end_window: '10:00',
              location_ref: { place_id: '381038', name: '斯科加瀑布' },
            },
          ],
        },
      ],
    },
    research_data: {
      opening_hours_evidence: {
        opening_hours: [],
      },
    },
    ...overrides,
  } as OrchestratorState;
}

describe('appendVerifyTemporalOpeningAuditProof', () => {
  it('skips HARD temporal_opening_v1 audit when open_window would be UNKNOWN', () => {
    const state = baseState();
    appendVerifyTemporalOpeningAuditProof(state, [
      {
        code: 'POI_CLOSED',
        entityRef: { type: 'POI', id: 'day1_item1' },
        class: 'ADVISORY',
        message: '缺少开放时间数据',
      },
    ]);
    expect(state.decision_log.some((l: any) => l?.metadata?.rule_id === 'temporal_opening_v1')).toBe(
      false,
    );
  });

  it('emits temporal_opening_v1 when known open_window conflicts', () => {
    const state = baseState({
      research_data: {
        opening_hours_evidence: {
          opening_hours: [{ poi_id: '381038', opening_hours: 'Closed' }],
        },
      },
    } as Partial<OrchestratorState>);
    appendVerifyTemporalOpeningAuditProof(state, [
      {
        code: 'POI_CLOSED',
        entityRef: { type: 'POI', id: 'day1_item1' },
      },
    ]);
    const entry = state.decision_log.find((l: any) => l?.metadata?.rule_id === 'temporal_opening_v1');
    expect(entry).toBeTruthy();
    expect((entry as any)?.metadata?.details?.evidence?.open_window).toBe('Closed');
    expect((entry as any)?.metadata?.details?.evidence?.is_violated).toBe(true);
  });
});
