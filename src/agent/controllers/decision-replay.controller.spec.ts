import { UnauthorizedException } from '@nestjs/common';
import { DecisionReplayController } from './decision-replay.controller';
import type { DecisionReplayService } from '../services/decision-replay.service';

describe('DecisionReplayController', () => {
  describe('listSessions', () => {
    it('returns sessions and items with same payload', async () => {
      const rows = [
        {
          session_id: '550e8400-e29b-41d4-a716-446655440001',
          id: '550e8400-e29b-41d4-a716-446655440001',
          trip_id: '550e8400-e29b-41d4-a716-446655440002',
          trip_run_id: '550e8400-e29b-41d4-a716-446655440001',
          created_at: '2026-05-01T12:00:00.000Z',
          status: 'IN_PROGRESS',
        },
      ];
      const replayService = {
        listSessionsForUser: jest.fn().mockResolvedValue(rows),
      } as unknown as DecisionReplayService;

      const controller = new DecisionReplayController(replayService);
      const out = await controller.listSessions({ userId: 'user-a' } as any, '550e8400-e29b-41d4-a716-446655440002');

      expect(replayService.listSessionsForUser).toHaveBeenCalledWith(
        'user-a',
        '550e8400-e29b-41d4-a716-446655440002',
      );
      expect(out.sessions).toEqual(rows);
      expect(out.items).toEqual(rows);
      expect(out.sessions).toBe(out.items);
    });

    it('throws when user missing', async () => {
      const controller = new DecisionReplayController({
        listSessionsForUser: jest.fn(),
      } as any);
      await expect(controller.listSessions(undefined as any, undefined)).rejects.toThrow(UnauthorizedException);
    });
  });
});
