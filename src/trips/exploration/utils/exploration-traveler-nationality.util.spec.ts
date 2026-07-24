import { loadTravelerNationalityForExploration } from './exploration-traveler-nationality.util';

describe('loadTravelerNationalityForExploration', () => {
  it('reads nationality from user profile preferences', async () => {
    const prisma = {
      userProfile: {
        findUnique: jest.fn(async () => ({
          preferences: { nationality: 'US' },
        })),
      },
    };

    const nationality = await loadTravelerNationalityForExploration(prisma as any, 'user_1');
    expect(nationality).toBe('US');
  });

  it('returns undefined when profile has no nationality', async () => {
    const prisma = {
      userProfile: {
        findUnique: jest.fn(async () => ({ preferences: {} })),
      },
    };

    const nationality = await loadTravelerNationalityForExploration(prisma as any, 'user_1');
    expect(nationality).toBeUndefined();
  });

  it('returns undefined when profile lookup fails', async () => {
    const prisma = {
      userProfile: {
        findUnique: jest.fn(async () => {
          throw new Error('db down');
        }),
      },
    };

    const nationality = await loadTravelerNationalityForExploration(prisma as any, 'user_1');
    expect(nationality).toBeUndefined();
  });
});
