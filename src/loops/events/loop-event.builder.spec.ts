import { buildLoopTravelEventEnvelope } from './loop-event.builder';
import { TravelEventType } from '../../trips/event-store/types/travel-event.types';

describe('loop-event.builder', () => {
  it('embeds loopRunId correlationId and causationId in payload and metadata', () => {
    const envelope = buildLoopTravelEventEnvelope({
      tripId: 'trip-1',
      eventType: TravelEventType.LOOP_STARTED,
      payload: { loopType: 'READINESS_REPAIR' },
      ctx: {
        loopRunId: 'loop_abc',
        loopType: 'READINESS_REPAIR',
        correlationId: 'corr-1',
        causationId: 'evt-trigger',
      },
      idempotencyKey: 'trip-1|loop.started|loop_abc',
    });

    expect(envelope.payload.loopRunId).toBe('loop_abc');
    expect(envelope.payload.correlationId).toBe('corr-1');
    expect(envelope.payload.causationId).toBe('evt-trigger');
    expect(envelope.metadata?.correlationId).toBe('corr-1');
    expect(envelope.eventId).toHaveLength(32);
  });
});
