import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NarrativeThemeService } from './narrative-theme.service';
import { NarrativeThemeGeneratorService } from './narrative-theme-generator.service';
import { TravelEventPersistenceService } from '../../event-store/travel-event-persistence.service';

describe('NarrativeThemeService', () => {
  const tripId = 'trip-test-1';
  const tripRecord = {
    id: tripId,
    destination: 'Iceland',
    startDate: new Date('2026-07-01'),
    endDate: new Date('2026-07-07'),
    metadata: {},
  };

  let prisma: {
    trip: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let persistence: { persist: jest.Mock };
  let service: NarrativeThemeService;

  beforeEach(() => {
    let metadata: Record<string, unknown> = {};
    prisma = {
      trip: {
        findUnique: jest.fn().mockImplementation(async () => ({
          ...tripRecord,
          metadata,
        })),
        update: jest.fn().mockImplementation(async ({ data }) => {
          metadata = data.metadata as Record<string, unknown>;
          return { ...tripRecord, metadata };
        }),
      },
    };
    persistence = { persist: jest.fn().mockResolvedValue({ persisted: false }) };
    service = new NarrativeThemeService(
      prisma as never,
      new NarrativeThemeGeneratorService(),
      persistence as unknown as TravelEventPersistenceService,
    );
  });

  it('generates candidates and stores pending session', async () => {
    const result = await service.generateCandidates(tripId, {
      motivations: ['discovery'],
    });

    expect(result.candidates).toHaveLength(3);
    expect(result.generationRequestId).toBeTruthy();
    expect(prisma.trip.update).toHaveBeenCalled();
    const metadata = prisma.trip.update.mock.calls[0][0].data.metadata;
    expect(metadata._narrativePending.candidates).toHaveLength(3);
  });

  it('selects theme and clears pending session', async () => {
    const generated = await service.generateCandidates(tripId, {
      motivations: ['rest'],
    });
    const themeId = generated.candidates[0]!.id;

    const theme = await service.selectTheme(
      tripId,
      themeId,
      generated.generationRequestId,
    );

    expect(theme.title).toBeTruthy();
    expect(theme.arcTemplate).toBe('healing');
    expect(persistence.persist).toHaveBeenCalled();

    const metadata = prisma.trip.update.mock.calls.at(-1)![0].data.metadata;
    expect(metadata.narrativeTheme.selectedThemeId).toBe(themeId);
    expect(metadata._narrativePending).toBeUndefined();
  });

  it('rejects unknown trip', async () => {
    prisma.trip.findUnique.mockResolvedValue(null);
    await expect(
      service.generateCandidates('missing', { motivations: [] }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects mismatched themeId on select', async () => {
    const generated = await service.generateCandidates(tripId, {
      motivations: ['discovery'],
    });
    await expect(
      service.selectTheme(tripId, 'wrong-id', generated.generationRequestId),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('applyThemeDirect writes theme without pending session', async () => {
    const theme = await service.applyThemeDirect(
      tripId,
      {
        id: 'direct-1',
        title: '《直接写入》',
        tagline: 'tag',
        arcTemplate: 'neutral',
        confidence: 'high',
        fallbackGenerated: true,
      },
      { motivations: ['unsure'] },
    );
    expect(theme.title).toBe('《直接写入》');
  });

  it('clears theme metadata', async () => {
    const generated = await service.generateCandidates(tripId, {
      motivations: ['connection'],
    });
    await service.selectTheme(
      tripId,
      generated.candidates[0]!.id,
      generated.generationRequestId,
    );
    await service.clearTheme(tripId);

    const metadata = prisma.trip.update.mock.calls.at(-1)![0].data.metadata;
    expect(metadata.narrativeTheme).toBeUndefined();
  });
});
