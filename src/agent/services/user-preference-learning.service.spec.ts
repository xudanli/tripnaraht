import { UserPreferenceLearningService, GLOBAL_ROLLBACK_BIAS_EFFORT } from './user-preference-learning.service';

describe('UserPreferenceLearningService', () => {
  it('prefers decision_dna bias_map when confidence is high enough', async () => {
    const prisma = {
      userProfile: {
        findUnique: jest.fn().mockResolvedValue({
          preferences: { decision_dna: { confidence_score: 0.9, bias_map: { UPGRADE_TO_DRIVE: 0.15 } } },
        }),
      },
      itineraryRevision: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as any;
    const svc = new UserPreferenceLearningService(prisma);
    await expect(svc.getRollbackBiasEffortDelta('user-1', 'UPGRADE_TO_DRIVE')).resolves.toBe(0.15);
    expect(prisma.itineraryRevision.findMany).not.toHaveBeenCalled();
  });

  it('adds effort delta when one alternative dominates recent rollbacks', async () => {
    const prisma = {
      userProfile: {
        findUnique: jest.fn().mockResolvedValue({ preferences: {} }),
      },
      itineraryRevision: {
        findMany: jest.fn().mockResolvedValue([
          { alternativeId: 'POSTPONE_SCHEDULE' },
          { alternativeId: 'POSTPONE_SCHEDULE' },
          { alternativeId: 'POSTPONE_SCHEDULE' },
        ]),
      },
    } as any;
    const svc = new UserPreferenceLearningService(prisma);
    await expect(svc.getRollbackBiasEffortDelta('user-1', 'POSTPONE_SCHEDULE')).resolves.toBe(GLOBAL_ROLLBACK_BIAS_EFFORT);
    await expect(svc.getRollbackBiasEffortDelta('user-1', 'UPGRADE_TO_DRIVE')).resolves.toBe(0);
  });

  it('returns 0 without prisma', async () => {
    const svc = new UserPreferenceLearningService(undefined);
    await expect(svc.getRollbackBiasEffortDelta('u', 'POSTPONE_SCHEDULE')).resolves.toBe(0);
  });
});
