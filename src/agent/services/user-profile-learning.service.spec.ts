import { UserProfileLearningService } from './user-profile-learning.service';

describe('UserProfileLearningService', () => {
  it('syncPreferenceToProfile writes decision_dna with bias_map for dominant rollbacks', async () => {
    const upserts: any[] = [];
    const prisma = {
      itineraryRevision: {
        findMany: jest.fn().mockResolvedValue([
          { alternativeId: 'UPGRADE_TO_DRIVE' },
          { alternativeId: 'UPGRADE_TO_DRIVE' },
          { alternativeId: 'UPGRADE_TO_DRIVE' },
          { alternativeId: 'UPGRADE_TO_DRIVE' },
          { alternativeId: 'UPGRADE_TO_DRIVE' },
        ]),
      },
      userProfile: {
        findUnique: jest.fn().mockResolvedValue({ preferences: { existing: true } }),
        upsert: jest.fn().mockImplementation(async (x: any) => {
          upserts.push(x);
          return x;
        }),
      },
    } as any;

    const svc = new UserProfileLearningService(prisma);
    const dna = await svc.syncPreferenceToProfile({ userId: 'user-1', now: new Date('2026-01-01T00:00:00.000Z') });
    expect(dna).toBeTruthy();
    expect(dna!.bias_map.UPGRADE_TO_DRIVE).toBeDefined();
    expect(dna!.confidence_score).toBeGreaterThan(0);
    expect(dna!.last_synced_at).toBe('2026-01-01T00:00:00.000Z');
    expect(upserts.length).toBe(1);
    expect(upserts[0].update.preferences.decision_dna).toBeTruthy();
  });
});

