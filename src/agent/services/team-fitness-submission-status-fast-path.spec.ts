import { tryBuildTeamFitnessSubmissionStatusFastPath } from './execution-gateway.route-and-run.orchestration';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';

describe('tryBuildTeamFitnessSubmissionStatusFastPath', () => {
  it('returns missing members for 谁还没有提交体能信息', async () => {
    const prisma = {
      trip: {
        findUnique: jest.fn().mockResolvedValue({ name: '冰岛环岛', metadata: {} }),
      },
      tripCollaborator: {
        findMany: jest.fn().mockResolvedValue([
          { userId: 'u-missing', role: 'VIEWER' },
          { userId: 'u-ok', role: 'OWNER' },
        ]),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'u-missing', displayName: 'danli xu', email: null },
          { id: 'u-ok', displayName: 'Danny', email: null },
        ]),
      },
      $queryRawUnsafe: jest
        .fn()
        .mockResolvedValue([{ user_id: 'u-ok', fitness_level: 'MEDIUM_HIGH' }]),
    };
    const agent = { prisma, logger: { warn: jest.fn() } };
    const req = {
      request_id: 'req-fitness',
      user_id: 'u-ok',
      trip_id: '5945a3ab-75d2-4911-ae82-9647c8c29e96',
      message: '谁还没有提交体能信息？\n\n[日程] Day1 Day 1 · 抵达雷克雅未克',
    } as RouteAndRunRequestDto;

    const res = await tryBuildTeamFitnessSubmissionStatusFastPath(agent, req, Date.now());
    expect(res).not.toBeNull();
    expect(res!.result.status).toBe('OK');
    expect(res!.result.answer_text).toContain('danli xu');
    expect(res!.result.answer_text).toContain('未提交');
    expect(res!.observability?.orchestration_mode_final).toBe(
      'TEAM_FITNESS_SUBMISSION_STATUS_FAST_PATH',
    );
    const payload = res!.result.payload as {
      team_fitness_submission_status?: { missing_count?: number };
    };
    expect(payload.team_fitness_submission_status?.missing_count).toBe(1);
  });

  it('returns null without trip_id', async () => {
    const req = {
      request_id: 'req-fitness',
      user_id: 'u1',
      message: '谁还没有提交体能信息？',
    } as RouteAndRunRequestDto;
    expect(
      await tryBuildTeamFitnessSubmissionStatusFastPath({ prisma: {} }, req, Date.now()),
    ).toBeNull();
  });
});
