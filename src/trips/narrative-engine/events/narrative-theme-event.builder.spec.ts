import {
  buildNarrativeThemeSelectedEnvelope,
  buildNarrativeThemeSelectedIdempotencyKey,
} from './narrative-theme-event.builder';
import { TravelEventType, TrajectorySegment, TravelEventSource } from '../../event-store/types/travel-event.types';

describe('narrative-theme-event.builder', () => {
  it('builds stable idempotency key for theme selection', () => {
    const key = buildNarrativeThemeSelectedIdempotencyKey({
      tripId: 'trip-1',
      themeId: 'cand-1',
      generationRequestId: 'req-1',
    });
    expect(key).toBe('narrative:theme_selected|trip-1|cand-1|req-1');
  });

  it('maps theme selection to DECISION travel event envelope', () => {
    const envelope = buildNarrativeThemeSelectedEnvelope({
      tripId: 'trip-1',
      theme: {
        schemaVersion: 1,
        selectedThemeId: 'cand-1',
        title: '《测试》',
        tagline: 'tag',
        arcTemplate: 'neutral',
        reflectionMode: 'resonance',
        selectedAt: '2026-06-16T10:00:00.000Z',
        generationRequestId: 'req-1',
        regenerateCount: 0,
      },
    });

    expect(envelope.tripId).toBe('trip-1');
    expect(envelope.segment).toBe(TrajectorySegment.DECISION);
    expect(envelope.eventType).toBe(TravelEventType.TRIP_NARRATIVE_THEME_SELECTED);
    expect(envelope.source).toBe(TravelEventSource.NARRATIVE_ENGINE);
    expect(envelope.payload.themeId).toBe('cand-1');
  });
});
