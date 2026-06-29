import { JourneyMapDecisionItemsService } from './journey-map-decision-items.service';

describe('JourneyMapDecisionItemsService', () => {
  const prisma = {
    trip: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  let service: JourneyMapDecisionItemsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new JourneyMapDecisionItemsService(prisma as any);
    prisma.trip.findUnique.mockResolvedValue({
      id: 'trip-1',
      metadata: { constraintsVersion: 2 },
    });
    prisma.trip.update.mockResolvedValue({});
  });

  it('creates decision item and bumps constraints version', async () => {
    const result = await service.create(
      'trip-1',
      {
        activityId: 'item-hike',
        title: '确认 Day 3 冰川装备',
        severity: 'high',
        riskLabels: ['天气变化'],
      },
      'user-1',
    );

    expect(result.item.title).toBe('确认 Day 3 冰川装备');
    expect(result.item.activityId).toBe('item-hike');
    expect(result.item.status).toBe('open');
    expect(result.constraintsVersion).toBe(3);
    expect(prisma.trip.update).toHaveBeenCalled();
  });

  it('rejects empty title', async () => {
    await expect(service.create('trip-1', { title: '  ' }, 'user-1')).rejects.toThrow('title is required');
  });
});
