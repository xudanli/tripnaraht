import { orchestrateTeamStructuredDiscussionBypass } from './team-structured-discussion-bypass.runner';
import type { TeamStructuredDiscussionBypassHost } from './team-structured-discussion-bypass.host';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { AgentContext } from '../interfaces/claude-orchestration.interface';

describe('team-structured-discussion-bypass.runner', () => {
  it('returns scaffold success without trip/user', async () => {
    const host: TeamStructuredDiscussionBypassHost = {
      logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
      prisma: { trip: { findUnique: jest.fn() } } as any,
    };
    const result = await orchestrateTeamStructuredDiscussionBypass(
      host,
      { request_id: 'r1' } as RouteAndRunRequestDto,
      {} as AgentContext,
      '我们团队怎么讨论行程偏好？',
      Date.now() - 5,
    );
    expect(result.success).toBe(true);
    expect(result.result?.teamStructuredDiscussionBypass).toBe(true);
    expect(result.answerText).toBeTruthy();
  });
});
