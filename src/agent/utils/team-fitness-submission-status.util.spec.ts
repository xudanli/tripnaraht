import {
  buildTeamFitnessSubmissionStatusAnswer,
  isTeamFitnessSubmissionStatusQuery,
  loadTeamFitnessSubmissionStatuses,
} from './team-fitness-submission-status.util';

describe('team-fitness-submission-status.util', () => {
  it('detects 谁还没有提交体能信息 with optional schedule suffix', () => {
    expect(isTeamFitnessSubmissionStatusQuery('谁还没有提交体能信息？')).toBe(true);
    expect(
      isTeamFitnessSubmissionStatusQuery(
        '谁还没有提交体能信息？\n\n[日程] Day1 Day 1 · 抵达雷克雅未克',
      ),
    ).toBe(true);
    expect(isTeamFitnessSubmissionStatusQuery('哪些人还没完成体能评估')).toBe(true);
    expect(isTeamFitnessSubmissionStatusQuery('who has not submitted fitness assessment')).toBe(
      true,
    );
    expect(isTeamFitnessSubmissionStatusQuery('问一下大家，谁愿意开车？')).toBe(false);
    expect(isTeamFitnessSubmissionStatusQuery('帮我找附近的午餐')).toBe(false);
  });

  it('builds answer listing missing members', () => {
    const text = buildTeamFitnessSubmissionStatusAnswer({
      tripName: '冰岛环岛',
      members: [
        {
          userId: 'u1',
          displayName: 'Danny',
          role: '队长',
          submitted: true,
          fitnessLevel: 'MEDIUM_HIGH',
        },
        {
          userId: 'u2',
          displayName: 'danli xu',
          role: '成员',
          submitted: false,
        },
      ],
    });
    expect(text).toContain('冰岛环岛');
    expect(text).toContain('danli xu');
    expect(text).toContain('未提交');
    expect(text).toContain('Danny');
  });

  it('loads statuses via prisma', async () => {
    const prisma = {
      trip: {
        findUnique: jest.fn().mockResolvedValue({ name: 'Trip A', metadata: {} }),
      },
      tripCollaborator: {
        findMany: jest.fn().mockResolvedValue([
          { userId: 'u-missing', role: 'VIEWER' },
          { userId: 'u-ok', role: 'OWNER' },
        ]),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'u-missing', displayName: 'Missing', email: null },
          { id: 'u-ok', displayName: 'Ok', email: null },
        ]),
      },
      $queryRawUnsafe: jest
        .fn()
        .mockResolvedValue([{ user_id: 'u-ok', fitness_level: 'HIGH' }]),
    };

    const out = await loadTeamFitnessSubmissionStatuses(prisma as never, 'trip-1');
    expect(out.tripName).toBe('Trip A');
    expect(out.members).toHaveLength(2);
    expect(out.members.find((m) => m.userId === 'u-missing')?.submitted).toBe(false);
    expect(out.members.find((m) => m.userId === 'u-ok')?.submitted).toBe(true);
  });
});
