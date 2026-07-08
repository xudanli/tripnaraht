import {
  findLatestRoadStatusEvent,
  findOpenRoadProblemId,
  findExistingRoadProblemId,
  roadIdFromAssertion,
} from './find-road-status-event.util';

describe('find-road-status-event.util', () => {
  const tripId = 'trip_1';

  it('finds latest matching road status event', () => {
    const event = findLatestRoadStatusEvent(
      {
        assertions: [],
        snapshots: [],
        events: [
          {
            eventId: 'evt_old',
            eventType: 'ROAD_STATUS_CHANGED',
            aggregateType: 'TRIP',
            aggregateId: tripId,
            occurredAt: '2026-01-01T00:00:00Z',
            correlationId: 'c1',
            ontologyVersion: 'rfc001-0.1.0',
            payload: { roadId: 'F208', status: 'CLOSED', sourceProvider: 'admin_injection' },
          },
          {
            eventId: 'evt_new',
            eventType: 'ROAD_STATUS_CHANGED',
            aggregateType: 'TRIP',
            aggregateId: tripId,
            occurredAt: '2026-02-01T00:00:00Z',
            correlationId: 'c2',
            ontologyVersion: 'rfc001-0.1.0',
            payload: { roadId: 'F208', status: 'CLOSED', sourceProvider: 'admin_injection' },
          },
        ],
      },
      tripId,
      'f208',
    );

    expect(event?.eventId).toBe('evt_new');
  });

  it('finds open problem by trigger event id', () => {
    const problemId = findOpenRoadProblemId(
      [
        { problemId: 'p1', triggerEventId: 'evt_1', status: 'OPEN' },
        { problemId: 'p2', triggerEventId: 'evt_2', status: 'RESOLVED' },
      ],
      'evt_1',
    );
    expect(problemId).toBe('p1');
  });

  it('extracts road id from assertion payload', () => {
    expect(
      roadIdFromAssertion({
        assertionId: 'a1',
        subjectRef: { kind: 'ROAD_SEGMENT', id: 'seg_1' },
        predicate: 'road.status',
        payload: { roadId: 'f208', status: 'CLOSED' },
        source: { provider: 'x', sourceType: 'INTERNAL', evidenceRefs: [] },
        observedAt: '',
        validFrom: '',
        confidence: 1,
        status: 'ACTIVE',
        version: 1,
      }),
    ).toBe('F208');
  });

  it('findExistingRoadProblemId matches harness problem ids', () => {
    expect(
      findExistingRoadProblemId(
        [{ problemId: 'problem_road_F208_trip_ice_123', status: 'RESOLVED' }],
        'F208',
      ),
    ).toBe('problem_road_F208_trip_ice_123');
  });
});
