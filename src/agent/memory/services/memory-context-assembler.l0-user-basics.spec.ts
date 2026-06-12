import { Test, TestingModule } from '@nestjs/testing';
import { MemoryContextAssemblerService } from './memory-context-assembler.service';
import { MemoryService } from './memory.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { WORLD_DECISION_MEMORY_ARCHIVE } from '../decision-memory/world-decision-memory-archive.port';
import type { RouteAndRunRequestDto } from '../../dto/route-and-run.dto';
import { createDefaultUserTravelProfile } from '../interfaces/user-travel-profile.interface';

describe('MemoryContextAssemblerService (L0 userBasics)', () => {
  it('loads userBasics from UserProfile.preferences in parallel with L1', async () => {
    const userId = 'user-l0-test-1';
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        MemoryContextAssemblerService,
        {
          provide: MemoryService,
          useValue: {
            getUserTravelProfile: jest.fn().mockResolvedValue(createDefaultUserTravelProfile(userId)),
            getUserRouteDirectionDecisions: jest.fn().mockResolvedValue([]),
            getUserTripFeedbacksTail: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            isDbConnected: () => true,
            userProfile: {
              findUnique: jest.fn().mockResolvedValue({
                preferences: {
                  nationality: 'CN',
                  tags: ['photography'],
                  preferredAttractionTypes: ['MUSEUM'],
                },
                updatedAt: new Date('2026-03-01T12:00:00.000Z'),
              }),
            },
          },
        },
        {
          provide: WORLD_DECISION_MEMORY_ARCHIVE,
          useValue: {
            isEnabled: () => false,
            persist: jest.fn(),
            listRecentForTrip: jest.fn(),
          },
        },
      ],
    }).compile();

    const asm = moduleRef.get(MemoryContextAssemblerService);
    const prisma = moduleRef.get(PrismaService);
    const req = {
      request_id: 'req-l0',
      user_id: userId,
    } as RouteAndRunRequestDto;

    const ctx = await asm.loadForRouteAndRun(req);
    expect(ctx.userProfile?.userId).toBe(userId);
    expect(ctx.userBasics).toMatchObject({
      nationality: 'CN',
      tags: ['photography'],
      preferredAttractionTypes: ['MUSEUM'],
    });
    expect(ctx.travelPreference?.mergedInterests).toEqual(['MUSEUM', 'NATURE', 'SCENIC']);
    expect(ctx.travelPreference?.hasExplicitSettings).toBe(true);
    expect(ctx.travelPreference?.constraintStrictness).toBe('high');
    expect(ctx.observability.layers).toEqual(expect.arrayContaining(['L0_user_basics', 'L1_user_profile']));
    expect(prisma.userProfile.findUnique).toHaveBeenCalledWith({
      where: { userId },
      select: { preferences: true, updatedAt: true },
    });
  });
});
