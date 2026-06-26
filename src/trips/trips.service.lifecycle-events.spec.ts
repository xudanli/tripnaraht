import { DecisionEventBus, DecisionEventEmitter, DecisionEventType, TripStateChangedEvent } from './decision/optimization/events/decision-events';
import { TripStatus } from './dto/trip-status.dto';
import { TripLifecycleValidatorService } from './services/trip-lifecycle-validator.service';
import { TripsService } from './trips.service';

describe('TripsService lifecycle event integration', () => {
  let service: TripsService;
  let prisma: {
    trip: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let eventBus: DecisionEventBus;
  let eventEmitter: DecisionEventEmitter;

  const baseTrip = {
    id: 'trip-123',
    name: 'Japan Trip',
    destination: 'JP',
    startDate: new Date('2026-07-01T00:00:00.000Z'),
    endDate: new Date('2026-07-07T00:00:00.000Z'),
    status: TripStatus.PLANNING,
    budgetConfig: { totalBudget: 1000 },
    metadata: { planConfirmed: true },
    pacingConfig: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  beforeEach(() => {
    prisma = {
      trip: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    };
    eventBus = new DecisionEventBus();
    eventEmitter = new DecisionEventEmitter(eventBus);

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
    eventBus['enableHistoryRecording'](true);
    eventBus['clearHistory']();
  });

  afterEach(() => {
    eventBus.removeAllListeners();
    eventBus['clearHistory']();
    jest.restoreAllMocks();
  });

  function mockTripUpdate(existingTrip: any, updatedTrip: any) {
    prisma.trip.findUnique.mockResolvedValue(existingTrip);
    prisma.$transaction.mockImplementation(async (callback: any) => callback({
      trip: {
        update: jest.fn().mockResolvedValue(updatedTrip),
        findUnique: jest.fn().mockResolvedValue(updatedTrip),
      },
      tripDay: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
      itineraryItem: {
        update: jest.fn(),
      },
    }));
  }

  it('emits TRIP_STATE_CHANGED after status actually changes', async () => {
    const updatedTrip = { ...baseTrip, status: TripStatus.TRAVELING };
    mockTripUpdate(baseTrip, updatedTrip);

    await service.update(baseTrip.id, { status: TripStatus.TRAVELING }, 'user-456');

    const history = eventBus['getEventHistory']({ type: DecisionEventType.TRIP_STATE_CHANGED });
    expect(history).toHaveLength(1);

    const event = history[0] as TripStateChangedEvent;
    expect(event.tripId).toBe(baseTrip.id);
    expect(event.previousStatus).toBe(TripStatus.PLANNING);
    expect(event.newStatus).toBe(TripStatus.TRAVELING);
    expect(event.userId).toBe('user-456');
  });

  it('does not emit TRIP_STATE_CHANGED for non-status updates', async () => {
    const updatedTrip = { ...baseTrip, name: 'Updated Japan Trip' };
    mockTripUpdate(baseTrip, updatedTrip);

    await service.update(baseTrip.id, { name: 'Updated Japan Trip' }, 'user-456');

    const history = eventBus['getEventHistory']({ type: DecisionEventType.TRIP_STATE_CHANGED });
    expect(history).toHaveLength(0);
  });

  it('does not emit TRIP_STATE_CHANGED when normalized status is unchanged', async () => {
    const existingTrip = { ...baseTrip, status: TripStatus.IN_PROGRESS };
    const updatedTrip = { ...baseTrip, status: TripStatus.TRAVELING };
    mockTripUpdate(existingTrip, updatedTrip);

    await service.update(baseTrip.id, { status: TripStatus.TRAVELING }, 'user-456');

    const history = eventBus['getEventHistory']({ type: DecisionEventType.TRIP_STATE_CHANGED });
    expect(history).toHaveLength(0);
  });

  it('does not fail the update if event emission fails', async () => {
    const updatedTrip = { ...baseTrip, status: TripStatus.TRAVELING };
    mockTripUpdate(baseTrip, updatedTrip);
    jest.spyOn(eventEmitter, 'tripStateChanged').mockImplementation(() => {
      throw new Error('event failure');
    });

    await expect(
      service.update(baseTrip.id, { status: TripStatus.TRAVELING }, 'user-456'),
    ).resolves.toEqual(updatedTrip);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
