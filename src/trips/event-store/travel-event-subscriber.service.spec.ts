import {
  DecisionEventBus,
  DecisionEventEmitter,
  DecisionEventType,
} from '../decision/optimization/events/decision-events';
import { TravelEventPersistenceService } from './travel-event-persistence.service';
import { TravelEventSubscriberService } from './travel-event-subscriber.service';
import { TravelEventType, TrajectorySegment } from './types/travel-event.types';

describe('TravelEventSubscriberService', () => {
  let eventBus: DecisionEventBus;
  let eventEmitter: DecisionEventEmitter;
  let persistenceService: {
    persist: jest.Mock;
  };
  let subscriber: TravelEventSubscriberService;
  let previousFlag: string | undefined;

  beforeEach(() => {
    previousFlag = process.env.TRAVEL_EVENT_STORE_ENABLED;
    process.env.TRAVEL_EVENT_STORE_ENABLED = 'true';

    eventBus = new DecisionEventBus();
    eventEmitter = new DecisionEventEmitter(eventBus);
    persistenceService = {
      persist: jest.fn().mockResolvedValue({ persisted: true, eventId: 'event-1' }),
    };
    subscriber = new TravelEventSubscriberService(
      eventBus,
      persistenceService as unknown as TravelEventPersistenceService,
    );
    subscriber.onModuleInit();
  });

  afterEach(() => {
    subscriber.onModuleDestroy();
    if (previousFlag === undefined) {
      delete process.env.TRAVEL_EVENT_STORE_ENABLED;
    } else {
      process.env.TRAVEL_EVENT_STORE_ENABLED = previousFlag;
    }
  });

  it('persists TRIP_STATE_CHANGED via subscriber', async () => {
    eventEmitter.tripStateChanged('trip-123', 'PLANNING', 'TRAVELING', 'user-1');

    await new Promise((resolve) => setImmediate(resolve));

    expect(persistenceService.persist).toHaveBeenCalledTimes(1);
    expect(persistenceService.persist).toHaveBeenCalledWith(
      expect.objectContaining({
        tripId: 'trip-123',
        segment: TrajectorySegment.STATE,
        eventType: TravelEventType.TRIP_LIFECYCLE_STATE_CHANGED,
        payload: {
          previousStatus: 'PLANNING',
          newStatus: 'TRAVELING',
        },
        userId: 'user-1',
      }),
    );
  });

  it('does not subscribe when feature flag is disabled', () => {
    subscriber.onModuleDestroy();
    persistenceService.persist.mockClear();

    process.env.TRAVEL_EVENT_STORE_ENABLED = 'false';
    const disabledSubscriber = new TravelEventSubscriberService(
      eventBus,
      persistenceService as unknown as TravelEventPersistenceService,
    );
    disabledSubscriber.onModuleInit();

    eventEmitter.tripStateChanged('trip-123', 'PLANNING', 'TRAVELING', 'user-1');

    expect(persistenceService.persist).not.toHaveBeenCalled();
  });

  it('fail-open when persistence throws', async () => {
    persistenceService.persist.mockRejectedValueOnce(new Error('persist failed'));

    await expect(
      subscriber.handleTripTransitionRejected({
        type: DecisionEventType.TRIP_TRANSITION_REJECTED,
        timestamp: new Date().toISOString(),
        tripId: 'trip-123',
        currentStatus: 'CANCELLED',
        attemptedStatus: 'PLANNING',
        reason: '不允许从 CANCELLED 转换到 PLANNING',
      }),
    ).resolves.toBeUndefined();
  });

  it('persists TRIP_TRANSITION_REJECTED via subscriber', async () => {
    eventEmitter.tripTransitionRejected(
      'trip-123',
      'CANCELLED',
      'PLANNING',
      '不允许从 CANCELLED 转换到 PLANNING',
      ['计划确认'],
      'user-1',
    );

    await new Promise((resolve) => setImmediate(resolve));

    expect(persistenceService.persist).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: TravelEventType.TRIP_LIFECYCLE_TRANSITION_REJECTED,
        segment: TrajectorySegment.STATE,
        metadata: expect.objectContaining({ verification: 'verified' }),
      }),
    );
  });

  it('fail-open when state-changed persistence throws', async () => {
    persistenceService.persist.mockRejectedValueOnce(new Error('persist failed'));

    await expect(
      subscriber.handleTripStateChanged({
        type: DecisionEventType.TRIP_STATE_CHANGED,
        timestamp: new Date().toISOString(),
        tripId: 'trip-123',
        previousStatus: 'PLANNING',
        newStatus: 'TRAVELING',
      }),
    ).resolves.toBeUndefined();
  });
});
