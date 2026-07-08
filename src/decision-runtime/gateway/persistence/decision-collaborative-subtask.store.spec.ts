import { DecisionCollaborativeSubTaskStoreService } from '../persistence/decision-collaborative-subtask.store';

describe('DecisionCollaborativeSubTaskStoreService', () => {
  it('removes sub-task from trip metadata', async () => {
    const metadata = {
      decisionProblemCollaborativeSubTasks: {
        items: [
          {
            id: 'csub_a',
            tripId: 'trip1',
            problemId: 'p1',
            resolutionId: 'res_p1',
            kind: 'OTHER',
            title: 't',
            status: 'pending',
            createdAt: '2026-07-03T00:00:00Z',
            createdByUserId: 'u1',
          },
          {
            id: 'csub_b',
            tripId: 'trip1',
            problemId: 'p1',
            resolutionId: 'res_p1',
            kind: 'TEAM_CONFIRM',
            title: 't2',
            status: 'pending',
            createdAt: '2026-07-03T00:00:00Z',
            createdByUserId: 'u1',
          },
        ],
      },
    };

    const prisma = {
      trip: {
        findUnique: jest.fn().mockResolvedValue({ metadata }),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    const store = new DecisionCollaborativeSubTaskStoreService(prisma as never);
    const deleted = await store.remove('trip1', 'csub_a');

    expect(deleted).toBe(true);
    const payload = prisma.trip.update.mock.calls[0][0].data.metadata as {
      decisionProblemCollaborativeSubTasks: { items: Array<{ id: string }> };
    };
    expect(payload.decisionProblemCollaborativeSubTasks.items).toHaveLength(1);
    expect(payload.decisionProblemCollaborativeSubTasks.items[0].id).toBe('csub_b');
  });
});
