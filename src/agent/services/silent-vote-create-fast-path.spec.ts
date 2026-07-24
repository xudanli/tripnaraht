import { tryBuildSilentVoteCreateFastPath } from './execution-gateway.route-and-run.orchestration';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';

describe('tryBuildSilentVoteCreateFastPath', () => {
  it('returns SilentVoteCreateDialog CTA for 发起投票 with trip_id', () => {
    const req = {
      request_id: 'req-vote',
      user_id: 'u1',
      trip_id: 'trip_15c50a69931845ca',
      conversation_context: {
        recent_messages: ['用户: 发起投票'],
        context_type: 'active_trip_summary',
      },
    } as RouteAndRunRequestDto;

    const res = tryBuildSilentVoteCreateFastPath(req, Date.now());
    expect(res).not.toBeNull();
    expect(res!.result.status).toBe('OK');
    const ops = (res!.result.payload as { suggested_operations?: Array<Record<string, unknown>> })
      ?.suggested_operations;
    expect(ops?.[0]).toMatchObject({
      id: 'start_silent_vote',
      label: '发起投票',
      kind: 'client_navigation',
      payload: {
        trip_id: 'trip_15c50a69931845ca',
        route: 'silent_vote_create',
        action: 'silent_vote_create',
      },
    });
  });

  it('returns null without trip_id', () => {
    const req = {
      request_id: 'req-vote',
      user_id: 'u1',
      message: '发起投票',
    } as RouteAndRunRequestDto;
    expect(tryBuildSilentVoteCreateFastPath(req, Date.now())).toBeNull();
  });
});
