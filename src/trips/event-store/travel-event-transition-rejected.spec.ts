import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  DecisionEventBus,
  DecisionEventEmitter,
  DecisionEventType,
  type TripTransitionRejectedEvent,
} from '../decision/optimization/events/decision-events';
import { TripStatus } from '../dto/trip-status.dto';
import { buildTripTransitionRejectedEnvelope } from './travel-event-envelope.builder';
import { TravelEventPersistenceService } from './travel-event-persistence.service';
import { TravelEventSubscriberService } from './travel-event-subscriber.service';
import { TravelEventType, TrajectorySegment } from './types/travel-event.types';
import { TripLifecycleValidatorService } from '../services/trip-lifecycle-validator.service';
import { TripsService } from '../trips.service';

async function flushAsync(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

describe('Phase 2B-1: trip.lifecycle.transition_rejected', () => {
  let previousFlag: string | undefined;

  beforeEach(() => {
    previousFlag = process.env.TRAVEL_EVENT_STORE_ENABLED;
  });

  afterEach(() => {
    if (previousFlag === undefined) {
      delete process.env.TRAVEL_EVENT_STORE_ENABLED;
    } else {
      process.env.TRAVEL_EVENT_STORE_ENABLED = previousFlag;
    }
  });

  describe('TripLifecycleValidatorService', () => {
    let eventBus: DecisionEventBus;
    let eventEmitter: DecisionEventEmitter;
    let validator: TripLifecycleValidatorService;

    beforeEach(() => {
      eventBus = new DecisionEventBus();
      eventBus['enableHistoryRecording'](true);
      eventBus['clearHistory']();
      eventEmitter = new DecisionEventEmitter(eventBus);
      validator = new TripLifecycleValidatorService(eventEmitter);
    });

    it('emits TRIP_TRANSITION_REJECTED on invalid transition', () => {
      expect(() => {
        validator.validateTransitionOrThrow(
          TripStatus.CANCELLED,
          TripStatus.PLANNING,
          undefined,
          { tripId: 'trip-123', userId: 'user-1' },
        );
      }).toThrow(BadRequestException);

      const history = eventBus['getEventHistory']({
        type: DecisionEventType.TRIP_TRANSITION_REJECTED,
      });
      expect(history).toHaveLength(1);

      const event = history[0] as TripTransitionRejectedEvent;
      expect(event.tripId).toBe('trip-123');
      expect(event.currentStatus).toBe(TripStatus.CANCELLED);
      expect(event.attemptedStatus).toBe(TripStatus.PLANNING);
      expect(event.userId).toBe('user-1');
      expect(event.reason).toBeDefined();
    });

    it('does not emit TRIP_TRANSITION_REJECTED on valid transition', () => {
      validator.validateTransitionOrThrow(
        TripStatus.DRAFT,
        TripStatus.PLANNING,
        {
          destination: 'JP',
          startDate: new Date('2025-07-01'),
          endDate: new Date('2025-07-07'),
          budgetConfig: { totalBudget: 100000 },
        },
        { tripId: 'trip-123', userId: 'user-1' },
      );

      const history = eventBus['getEventHistory']({
        type: DecisionEventType.TRIP_TRANSITION_REJECTED,
      });
      expect(history).toHaveLength(0);
    });

    it('still throws validation error when event emission fails', () => {
      jest.spyOn(eventEmitter, 'tripTransitionRejected').mockImplementation(() => {
        throw new Error('emit failure');
      });

      expect(() => {
        validator.validateTransitionOrThrow(
          TripStatus.CANCELLED,
          TripStatus.PLANNING,
          undefined,
          { tripId: 'trip-123' },
        );
      }).toThrow(BadRequestException);
    });
  });

  describe('TravelEventSubscriberService persistence', () => {
    let eventBus: DecisionEventBus;
    let eventEmitter: DecisionEventEmitter;
    let persistenceService: { persist: jest.Mock };
    let subscriber: TravelEventSubscriberService;

    beforeEach(() => {
      eventBus = new DecisionEventBus();
      eventEmitter = new DecisionEventEmitter(eventBus);
      persistenceService = {
        persist: jest.fn().mockResolvedValue({ persisted: true, eventId: 'event-1' }),
      };
    });

    afterEach(() => {
      subscriber?.onModuleDestroy();
    });

    it('persists one travel_events envelope when flag is enabled', async () => {
      process.env.TRAVEL_EVENT_STORE_ENABLED = 'true';
      subscriber = new TravelEventSubscriberService(
        eventBus,
        persistenceService as unknown as TravelEventPersistenceService,
      );
      subscriber.onModuleInit();

      eventEmitter.tripTransitionRejected(
        'trip-123',
        TripStatus.CANCELLED,
        TripStatus.PLANNING,
        '不允许从 CANCELLED 转换到 PLANNING',
        undefined,
        'user-1',
      );

      await flushAsync();

      expect(persistenceService.persist).toHaveBeenCalledTimes(1);
      expect(persistenceService.persist).toHaveBeenCalledWith(
        expect.objectContaining({
          tripId: 'trip-123',
          segment: TrajectorySegment.STATE,
          eventType: TravelEventType.TRIP_LIFECYCLE_TRANSITION_REJECTED,
          payload: expect.objectContaining({
            currentStatus: TripStatus.CANCELLED,
            attemptedStatus: TripStatus.PLANNING,
            reason: '不允许从 CANCELLED 转换到 PLANNING',
          }),
          metadata: expect.objectContaining({ verification: 'verified' }),
          userId: 'user-1',
        }),
      );
    });

    it('persists nothing when flag is disabled', async () => {
      process.env.TRAVEL_EVENT_STORE_ENABLED = 'false';
      subscriber = new TravelEventSubscriberService(
        eventBus,
        persistenceService as unknown as TravelEventPersistenceService,
      );
      subscriber.onModuleInit();

      eventEmitter.tripTransitionRejected(
        'trip-123',
        TripStatus.CANCELLED,
        TripStatus.PLANNING,
        '不允许从 CANCELLED 转换到 PLANNING',
      );

      await flushAsync();

      expect(persistenceService.persist).not.toHaveBeenCalled();
    });
  });

  describe('TravelEventPersistenceService duplicate rejection', () => {
    it('does not treat duplicate idempotency key as an error', async () => {
      process.env.TRAVEL_EVENT_STORE_ENABLED = 'true';
      const prisma = {
        travelEvent: {
          create: jest.fn().mockRejectedValue(
            new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
              code: 'P2002',
              clientVersion: 'test',
            }),
          ),
        },
      };
      const service = new TravelEventPersistenceService(prisma as any);
      const envelope = buildTripTransitionRejectedEnvelope({
        type: DecisionEventType.TRIP_TRANSITION_REJECTED,
        timestamp: '2026-06-15T12:00:00.000Z',
        tripId: 'trip-123',
        currentStatus: TripStatus.CANCELLED,
        attemptedStatus: TripStatus.PLANNING,
        reason: '不允许从 CANCELLED 转换到 PLANNING',
        userId: 'user-1',
      });

      const first = await service.persist(envelope);
      const second = await service.persist(envelope);

      expect(first.duplicate).toBe(true);
      expect(second.duplicate).toBe(true);
      expect(prisma.travelEvent.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('TripsService API behavior', () => {
    let service: TripsService;
    let prisma: {
      trip: { findUnique: jest.Mock };
      $transaction: jest.Mock;
    };
    let eventBus: DecisionEventBus;
    let eventEmitter: DecisionEventEmitter;
    let persistenceService: { persist: jest.Mock };
    let subscriber: TravelEventSubscriberService;

    const baseTrip = {
      id: 'trip-123',
      name: 'Japan Trip',
      destination: 'JP',
      startDate: new Date('2026-07-01T00:00:00.000Z'),
      endDate: new Date('2026-07-07T00:00:00.000Z'),
      status: TripStatus.CANCELLED,
      budgetConfig: { totalBudget: 1000 },
      metadata: null,
      pacingConfig: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };

    beforeEach(() => {
      process.env.TRAVEL_EVENT_STORE_ENABLED = 'true';
      prisma = {
        trip: { findUnique: jest.fn().mockResolvedValue(baseTrip) },
        $transaction: jest.fn(),
      };
      eventBus = new DecisionEventBus();
      eventBus['enableHistoryRecording'](true);
      eventBus['clearHistory']();
      eventEmitter = new DecisionEventEmitter(eventBus);
      persistenceService = {
        persist: jest.fn().mockResolvedValue({ persisted: true, eventId: 'event-1' }),
      };
      subscriber = new TravelEventSubscriberService(
        eventBus,
        persistenceService as unknown as TravelEventPersistenceService,
      );
      subscriber.onModuleInit();

      service = new TripsService(
        prisma as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        new TripLifecycleValidatorService(eventEmitter),
        eventEmitter,
      );
      jest.spyOn(service as any, 'enrichTripData').mockImplementation(async (trip: any) => trip);
    });

    afterEach(() => {
      subscriber.onModuleDestroy();
      eventBus.removeAllListeners();
    });

    it('returns validation error even if persistence fails', async () => {
      persistenceService.persist.mockRejectedValue(new Error('db unavailable'));

      await expect(
        service.update(baseTrip.id, { status: TripStatus.PLANNING }, 'user-456'),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      await flushAsync();
      expect(persistenceService.persist).toHaveBeenCalledTimes(1);
    });
  });
});
