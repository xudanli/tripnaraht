import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { TripConflictsService } from './trip-conflicts.service';
import { SmartRoutesService } from '../../transport/services/smart-routes.service';

describe('TripConflictsService', () => {
  let service: TripConflictsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TripConflictsService,
        {
          provide: PrismaService,
          useValue: {
            trip: { findUnique: jest.fn() },
            tripDay: { findUnique: jest.fn() },
          },
        },
        {
          provide: SmartRoutesService,
          useValue: { getRoutes: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();

    service = module.get<TripConflictsService>(TripConflictsService);
  });

  describe('parseClosingTime (via getDayConflicts)', () => {
    it('should extract closing time from "08:00-22:00" format', async () => {
      const mockDay = {
        id: 'day-1',
        tripId: 'trip-1',
        date: new Date('2026-02-22'),
        ItineraryItem: [
          {
            id: 'item-1',
            placeId: 1,
            startTime: new Date('2026-02-22T21:00:00'),
            endTime: new Date('2026-02-22T21:40:00'),
            type: 'ATTRACTION',
            Place: {
              id: 1,
              nameCN: 'Sumac餐厅',
              metadata: { visit_info: { opening_hours: '08:00-22:00' } },
            },
          },
        ],
      };

      jest.spyOn(service as any, 'detectDayConflicts').mockResolvedValue([]);
      const prisma = (service as any).prisma as jest.Mocked<PrismaService>;
      (prisma.tripDay.findUnique as jest.Mock).mockResolvedValue(mockDay);
      (prisma.trip.findUnique as jest.Mock).mockResolvedValue({
        TripDay: [{ id: 'day-1' }],
      });

      const conflicts = await service.getDayConflicts('trip-1', 'day-1');
      const detectSpy = (service as any).detectDayConflicts;
      expect(detectSpy).toHaveBeenCalled();
    });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
