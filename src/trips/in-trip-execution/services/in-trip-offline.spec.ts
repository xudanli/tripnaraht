import { BadRequestException } from '@nestjs/common';
import { InTripOfflineSyncService } from './in-trip-offline-sync.service';
import { resolveInTripRuntimePolicy } from '../utils/in-trip-runtime-policy.util';

describe('InTripOfflineSyncService', () => {
  const prisma = {
    tripInTripOfflineQueueEntry: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const access = {
    assertInTripPhase: jest.fn(),
    assertTripMember: jest.fn(),
  };
  const transactions = { record: jest.fn() };
  const groupPulse = {
    submitMoodCheck: jest.fn(),
    submitMotion: jest.fn(),
    submitMicroFeedback: jest.fn(),
  };
  const experiencePulse = { submit: jest.fn() };

  let service: InTripOfflineSyncService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.IN_TRIP_EXECUTION_ENABLED = 'true';
    service = new InTripOfflineSyncService(
      prisma as never,
      access as never,
      transactions as never,
      groupPulse as never,
      experiencePulse as never,
    );
  });

  it('applies operations in clientSeq order', async () => {
    prisma.tripInTripOfflineQueueEntry.findFirst.mockResolvedValue(null);
    prisma.tripInTripOfflineQueueEntry.create.mockResolvedValue({ id: 'q1' });
    const callOrder: string[] = [];
    transactions.record.mockImplementation(async () => {
      callOrder.push('record');
      return { id: 'tx1' };
    });
    groupPulse.submitMoodCheck.mockImplementation(async () => {
      callOrder.push('mood');
      return { userId: 'u1' };
    });

    const result = await service.sync('trip-1', 'user-1', {
      operations: [
        {
          clientSeq: 2,
          operationType: 'mood_check',
          payload: { score: 4 },
          recordedAt: '2026-06-18T10:00:00.000Z',
        },
        {
          clientSeq: 1,
          operationType: 'record_transaction',
          payload: {
            captureMethod: 'manual',
            amountLocal: 100,
            currencyLocal: 'ISK',
            category: 'food',
            splitAmongUserIds: ['user-1'],
            paidByUserId: 'user-1',
          },
          recordedAt: '2026-06-18T09:00:00.000Z',
        },
      ],
    });

    expect(result.applied).toBe(2);
    expect(result.skipped).toBe(0);
    expect(callOrder).toEqual(['record', 'mood']);
  });

  it('skips already-synced clientSeq', async () => {
    prisma.tripInTripOfflineQueueEntry.findFirst.mockResolvedValue({
      id: 'existing',
      syncedAt: new Date(),
    });

    const result = await service.sync('trip-1', 'user-1', {
      operations: [
        {
          clientSeq: 1,
          operationType: 'mood_check',
          payload: { score: 3 },
          recordedAt: '2026-06-18T10:00:00.000Z',
        },
      ],
    });

    expect(result.skipped).toBe(1);
    expect(groupPulse.submitMoodCheck).not.toHaveBeenCalled();
  });

  it('marks manual_review on apply failure', async () => {
    prisma.tripInTripOfflineQueueEntry.findFirst.mockResolvedValue(null);
    prisma.tripInTripOfflineQueueEntry.create.mockResolvedValue({ id: 'q1' });
    transactions.record.mockRejectedValue(new Error('wallet unavailable'));

    const result = await service.sync('trip-1', 'user-1', {
      operations: [
        {
          clientSeq: 1,
          operationType: 'record_transaction',
          payload: { captureMethod: 'manual' },
          recordedAt: '2026-06-18T10:00:00.000Z',
        },
      ],
    });

    expect(result.conflicts).toHaveLength(1);
    expect(prisma.tripInTripOfflineQueueEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ conflictStatus: 'manual_review' }),
      }),
    );
  });

  it('rejects when module disabled', async () => {
    process.env.IN_TRIP_EXECUTION_ENABLED = 'false';
    await expect(
      service.sync('trip-1', 'user-1', { operations: [] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('resolveInTripRuntimePolicy', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it('uses conservative defaults in low power mode', () => {
    process.env.IN_TRIP_LOW_POWER_MODE = 'true';
    const policy = resolveInTripRuntimePolicy();
    expect(policy.syncIntervalMinutes).toBe(15);
    expect(policy.lowPowerMode.disableMotionPolling).toBe(true);
    expect(policy.networkPolicy.wifiOnlyPackDownload).toBe(true);
  });
});
