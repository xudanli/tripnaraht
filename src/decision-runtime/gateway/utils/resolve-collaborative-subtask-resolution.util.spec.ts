import { BadRequestException, NotFoundException } from '@nestjs/common';
import { resolveCollaborativeSubTaskResolution } from './resolve-collaborative-subtask-resolution.util';

describe('resolveCollaborativeSubTaskResolution', () => {
  const resolution = {
    resolutionId: 'res_p1_abc',
    problemId: 'p1',
    decisionId: 'dec_123',
    selectedActionId: 'option-1',
    writeChain: 'APPLY_AND_POLL' as const,
    status: 'AUTHORIZED' as const,
    decidedAt: '2026-07-03T00:00:00Z',
    decidedByUserId: 'user1',
  };

  it('defaults to stored resolution when requested id omitted', () => {
    expect(resolveCollaborativeSubTaskResolution(resolution, 'p1')).toBe(resolution);
  });

  it('accepts resolutionId match', () => {
    expect(resolveCollaborativeSubTaskResolution(resolution, 'p1', 'res_p1_abc')).toBe(resolution);
  });

  it('accepts decisionId alias', () => {
    expect(resolveCollaborativeSubTaskResolution(resolution, 'p1', 'dec_123')).toBe(resolution);
  });

  it('throws when resolution missing', () => {
    expect(() => resolveCollaborativeSubTaskResolution(undefined, 'p1')).toThrow(NotFoundException);
  });

  it('throws mismatch with structured details', () => {
    try {
      resolveCollaborativeSubTaskResolution(resolution, 'p1', 'res_stale');
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      const resp = (e as BadRequestException).getResponse() as {
        message?: string;
        details?: Record<string, unknown>;
      };
      expect(resp.message).toBe('COLLAB_SUBTASK_RESOLUTION_MISMATCH');
      expect(resp.details?.expectedResolutionId).toBe('res_p1_abc');
      return;
    }
    throw new Error('expected throw');
  });
});
