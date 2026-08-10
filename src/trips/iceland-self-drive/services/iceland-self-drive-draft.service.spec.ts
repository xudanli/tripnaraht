import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { IcelandSelfDriveDraftService } from './iceland-self-drive-draft.service';

describe('IcelandSelfDriveDraftService', () => {
  it('creates and updates a draft without tripId', async () => {
    const createdAt = new Date('2027-01-01T00:00:00.000Z');
    const updatedAt = new Date('2027-01-02T00:00:00.000Z');
    const prisma = {
      explorationScenario: {
        create: jest.fn().mockResolvedValue({
          id: 'draft-1',
          createdAt,
          updatedAt: createdAt,
          initialInput: {
            kind: 'iceland_self_drive_draft',
            productLine: 'iceland_self_drive',
            wizard: { travelerCount: 2, startLocationCode: 'keflavik' },
            step: 1,
          },
        }),
        update: jest.fn().mockResolvedValue({
          id: 'draft-1',
          createdAt,
          updatedAt,
          initialInput: {
            kind: 'iceland_self_drive_draft',
            productLine: 'iceland_self_drive',
            wizard: {
              travelerCount: 4,
              startLocationCode: 'keflavik',
              regionIds: ['south_coast'],
            },
            step: 2,
          },
        }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'draft-1',
          userId: 'u1',
          tripId: null,
          initialInput: {
            kind: 'iceland_self_drive_draft',
            productLine: 'iceland_self_drive',
            wizard: { travelerCount: 2 },
            step: 1,
          },
        }),
        findMany: jest.fn(),
      },
    };

    const svc = new IcelandSelfDriveDraftService(prisma as never);
    const created = await svc.upsert('u1', {
      travelerCount: 2,
      startLocationCode: 'keflavik',
      step: 1,
    });
    expect(created.draftId).toBe('draft-1');
    expect(created.wizard.travelerCount).toBe(2);
    expect(prisma.explorationScenario.create).toHaveBeenCalled();

    const updated = await svc.upsert(
      'u1',
      { travelerCount: 4, regionIds: ['south_coast'], step: 2 },
      'draft-1',
    );
    expect(updated.step).toBe(2);
    expect(updated.wizard.travelerCount).toBe(4);
  });

  it('rejects foreign draft access', async () => {
    const prisma = {
      explorationScenario: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'draft-1',
          userId: 'owner',
          tripId: null,
          initialInput: {
            kind: 'iceland_self_drive_draft',
            productLine: 'iceland_self_drive',
            wizard: {},
            step: null,
          },
        }),
      },
    };
    const svc = new IcelandSelfDriveDraftService(prisma as never);
    await expect(svc.get('other', 'draft-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects non-draft scenario', async () => {
    const prisma = {
      explorationScenario: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'scn-1',
          userId: 'u1',
          tripId: null,
          initialInput: { destinationCodes: ['IS'] },
        }),
      },
    };
    const svc = new IcelandSelfDriveDraftService(prisma as never);
    await expect(svc.get('u1', 'scn-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
