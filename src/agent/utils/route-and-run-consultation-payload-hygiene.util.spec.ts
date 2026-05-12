import type { RouteAndRunResponseDto } from '../dto/route-and-run.dto';
import {
  applyConsultationItineraryPayloadHygiene,
  shouldApplyConsultationItineraryPayloadHygiene,
} from './route-and-run-consultation-payload-hygiene.util';

describe('route-and-run-consultation-payload-hygiene', () => {
  it('shouldApply: true when ui_surface=consultation', () => {
    const r = {
      result: { payload: { ui_surface: 'consultation' } },
    } as RouteAndRunResponseDto;
    expect(shouldApplyConsultationItineraryPayloadHygiene(r)).toBe(true);
  });

  it('shouldApply: true when lightweight_knowledge_qa in observability', () => {
    const r = {
      result: { payload: {} },
      observability: { lightweight_knowledge_qa: true },
    } as RouteAndRunResponseDto;
    expect(shouldApplyConsultationItineraryPayloadHygiene(r)).toBe(true);
  });

  it('apply strips timeline, poi fields, and empties orchestrationResult.itinerary.days', () => {
    const r = {
      result: {
        payload: {
          ui_surface: 'consultation',
          consultation_itinerary_payload_suppressed: true,
          timeline: [{ date: '2026-06-01', items: [] }],
          poi_cards: [{ itinerary_item_id: 'x' }],
          poi_cards_by_day: [{ day_index: 1, cards: [] }],
          poi_cards_meta: { suppress_answer_prose: true },
          orchestrationResult: {
            itinerary: { request_id: 'r1', days: [{ date: '2026-06-01', items: [{ id: 'p' }] }] },
          },
        },
      },
    } as unknown as RouteAndRunResponseDto;

    applyConsultationItineraryPayloadHygiene(r);
    const p = r.result!.payload as Record<string, unknown>;
    expect(p.timeline).toEqual([]);
    expect(p.poi_cards).toBeUndefined();
    expect(p.poi_cards_by_day).toBeUndefined();
    expect(p.poi_cards_meta).toBeUndefined();
    const orch = p.orchestrationResult as { itinerary: { days: unknown[] } };
    expect(orch.itinerary.days).toEqual([]);
  });

  it('apply no-op when planning surface', () => {
    const r = {
      result: {
        payload: {
          ui_surface: 'planning',
          timeline: [{ date: '2026-06-01', items: [] }],
          poi_cards: [{ itinerary_item_id: 'x' }],
        },
      },
    } as unknown as RouteAndRunResponseDto;

    applyConsultationItineraryPayloadHygiene(r);
    const p = r.result!.payload as Record<string, unknown>;
    expect((p.timeline as unknown[]).length).toBe(1);
    expect(p.poi_cards).toBeDefined();
  });
});
