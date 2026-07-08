import { BadRequestException } from '@nestjs/common';
import { TripFileService } from './services/trip-file.service';
import { TripFileAccessService } from './services/trip-file-access.service';
import { TripFileStorageService } from './services/trip-file-storage.service';
import { DEFAULT_STORAGE_QUOTA_BYTES } from './trip-file.constants';

describe('TripFileService', () => {
  const tripId = 'trip-1';
  const userId = 'user-1';

  const prisma = {
    tripFile: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const access = {
    assertTripMember: jest.fn().mockResolvedValue(undefined),
  };

  const storage = {
    save: jest.fn(),
    delete: jest.fn(),
    signDownloadUrl: jest.fn(),
  };

  let service: TripFileService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TripFileService(
      prisma as never,
      access as unknown as TripFileAccessService,
      storage as unknown as TripFileStorageService,
    );
    prisma.tripFile.updateMany.mockResolvedValue({ count: 0 });
  });

  it('computes stats with category breakdown', async () => {
    prisma.tripFile.findMany.mockResolvedValue([
      {
        id: 'f1',
        category: 'booking',
        status: 'UPLOADED',
        fileSizeBytes: 1024,
        expiresAt: null,
      },
      {
        id: 'f2',
        category: 'visa',
        status: 'PENDING',
        fileSizeBytes: 0,
        expiresAt: null,
      },
      {
        id: 'f3',
        category: 'booking',
        status: 'UPLOADED',
        fileSizeBytes: 2048,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    ]);

    const stats = await service.getStats(tripId, userId);

    expect(stats.totalCount).toBe(3);
    expect(stats.uploadedCount).toBe(2);
    expect(stats.pendingCount).toBe(1);
    expect(stats.expiringSoonCount).toBe(1);
    expect(stats.storageUsedBytes).toBe(3072);
    expect(stats.storageQuotaBytes).toBe(DEFAULT_STORAGE_QUOTA_BYTES);
    expect(stats.categories.find((c) => c.id === 'booking')?.count).toBe(2);
    expect(stats.categories.find((c) => c.id === 'visa')?.count).toBe(1);
  });

  it('rejects invalid category on upload', async () => {
    await expect(
      service.uploadFile(tripId, userId, {
        buffer: Buffer.from('x'),
        originalname: 'a.pdf',
        mimetype: 'application/pdf',
        size: 1,
      }, { category: 'invalid' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
