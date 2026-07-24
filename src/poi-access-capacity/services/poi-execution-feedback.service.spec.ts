import { BadRequestException } from '@nestjs/common';
import { PoiExecutionFeedbackService } from './poi-execution-feedback.service';

describe('PoiExecutionFeedbackService', () => {
  const prisma = {
    poiExecutionFeedback: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    poiCrowdingSnapshot: {
      create: jest.fn(),
    },
  };

  let service: PoiExecutionFeedbackService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PoiExecutionFeedbackService(prisma as never);
  });

  it('recordAndAggregate writes feedback then crowding snapshot', async () => {
    prisma.poiExecutionFeedback.create.mockResolvedValue({ id: 'fb-1' });
    prisma.poiExecutionFeedback.findMany.mockResolvedValue([
      { parkingWaitMin: 10, couldNotPark: false, abandonedDueToCrowd: false },
      { parkingWaitMin: 25, couldNotPark: false, abandonedDueToCrowd: false },
    ]);
    prisma.poiCrowdingSnapshot.create.mockResolvedValue({ id: 'snap-1' });

    const result = await service.recordAndAggregate({
      poiId: 'is.gullfoss',
      dateISO: '2026-07-15',
      parkingWaitMin: 12,
    });

    expect(result.id).toBe('fb-1');
    expect(result.aggregatedSnapshot?.poiId).toBe('is.gullfoss');
    expect(result.aggregatedSnapshot?.signalSources).toEqual(['USER']);
    expect(prisma.poiCrowdingSnapshot.create).toHaveBeenCalled();
  });

  it('rejects missing poiId', async () => {
    await expect(
      service.recordFeedback({ poiId: '', dateISO: '2026-07-15' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
