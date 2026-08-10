import { HeuristicExtractionProvider } from '../extraction/heuristic-extraction.provider';
import { ObservationExtractionService } from '../extraction/observation-extraction.service';
import { LookFeedbackStore } from '../feedback/look-feedback.store';
import { ObservationGroundingService } from '../grounding/observation-grounding.service';
import { LookMediaStore } from '../look-media/look-media.store';
import { ObservationRepository } from '../observation.repository';
import { ObservationService } from '../observation.service';
import { LookDecisionProblemStore } from './look-decision-problem.store';
import { ObservationAssessmentBridgeService } from './observation-assessment.bridge.service';

function makeService(media?: LookMediaStore) {
  return new ObservationService(
    new ObservationRepository(),
    new ObservationExtractionService(new HeuristicExtractionProvider()),
    new ObservationGroundingService(),
    new ObservationAssessmentBridgeService(new LookDecisionProblemStore()),
    undefined,
    undefined,
    new LookFeedbackStore(),
    media,
  );
}

describe('Look observation list + media store', () => {
  it('lists recent observations with filter and limit', async () => {
    const service = makeService();
    await service.create('trip_list', {
      intent: 'CHECK_ROAD',
      capturedAt: '2026-07-26T10:00:00Z',
      mediaRefs: ['m_road'],
      ocrTextSeed: 'F208',
    });
    await service.create('trip_list', {
      intent: 'CHECK_PARKING',
      capturedAt: '2026-07-26T11:00:00Z',
      mediaRefs: ['m_park'],
      location: { latitude: 64.14, longitude: -21.9 },
      ocrTextSeed: 'Paid parking until 18:00',
    });

    const all = service.list('trip_list', { limit: 10 });
    expect(all.items.length).toBe(2);
    expect(all.items[0].intent).toBe('CHECK_PARKING');
    expect(all.items[0].filter).toBe('parking');
    expect(all.items[0].writesPlanVersion).toBe(false);
    expect(all.items[0].detailKind).toBe('assessment');

    const roads = service.list('trip_list', { limit: 3, filter: 'road' });
    expect(roads.items).toHaveLength(1);
    expect(roads.items[0].filter).toBe('road');

    const page = service.list('trip_list', {
      limit: 1,
      cursor: all.items[0].observationId,
    });
    expect(page.items).toHaveLength(1);
    expect(page.items[0].observationId).toBe(all.items[1].observationId);
  });

  it('LookMediaStore upload returns mediaRef usable for create', async () => {
    const store = new LookMediaStore();
    const saved = await store.save({
      tripId: 'trip_media',
      buffer: Buffer.from('fake-jpeg'),
      originalName: 'shot.jpg',
      mimeType: 'image/jpeg',
    });
    expect(saved.mediaId).toMatch(/^lm_/);
    expect(saved.mediaRef).toBe(saved.mediaId);

    const service = makeService(store);
    const event = await service.create('trip_media', {
      intent: 'CHECK_ROAD',
      capturedAt: '2026-07-26T12:00:00Z',
      mediaRefs: [saved.mediaRef],
      ocrTextSeed: 'F208',
    });
    expect(event.mediaRefs).toEqual([saved.mediaRef]);
    const listed = service.list('trip_media', { limit: 3 });
    expect(listed.items[0].observationId).toBe(event.observationId);
  });
});
