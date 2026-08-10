import { runPlanMutationCommand } from './plan-mutation-command.gateway';

jest.mock('../../decision-runtime/execution/effective-plan-write-chain-blocked.util', () => ({
  isDirectPlanMutationBlocked: jest.fn(),
  buildEffectivePlanWriteChainBlockedPayload: jest.fn(() => ({
    code: 'EFFECTIVE_PLAN_WRITE_CHAIN_REQUIRED',
    message: 'blocked',
    authorizedPaths: ['canary'],
  })),
}));

const {
  isDirectPlanMutationBlocked,
} = require('../../decision-runtime/execution/effective-plan-write-chain-blocked.util') as {
  isDirectPlanMutationBlocked: jest.Mock;
};

describe('runPlanMutationCommand', () => {
  beforeEach(() => {
    isDirectPlanMutationBlocked.mockReturnValue(false);
  });

  it('rejects when write chain blocks direct mutation', async () => {
    isDirectPlanMutationBlocked.mockReturnValue(true);
    const execute = jest.fn();
    const out = await runPlanMutationCommand(
      { getSkill: () => ({ execute }) },
      {
        tripId: 't1',
        commandType: 'APPLY_EDITS',
        source: 'test',
        mode: 'db',
        edits: [{ type: 'delete', itemId: 'i1' } as any],
      },
    );
    expect(out.success).toBe(false);
    expect(out.blocked).toBe(true);
    expect(out.reason).toBe('write_chain_blocked');
    expect(execute).not.toHaveBeenCalled();
  });

  it('calls trip.applyEdit exactly once when allowed', async () => {
    const execute = jest.fn().mockResolvedValue({ success: true, mode: 'db' });
    const out = await runPlanMutationCommand(
      { getSkill: (name: string) => (name === 'trip.applyEdit' ? { execute } : undefined) },
      {
        tripId: 't1',
        commandType: 'ITINERARY_ITEM_DELETE',
        source: 'test_delete',
        mode: 'db',
        edits: [{ type: 'delete', itemId: 'i1' } as any],
      },
    );
    expect(out.success).toBe(true);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0][0].tripId).toBe('t1');
  });

  it('returns unavailable when skill missing', async () => {
    const out = await runPlanMutationCommand(undefined, {
      tripId: 't1',
      commandType: 'APPLY_EDITS',
      source: 'test',
      mode: 'db',
      edits: [{ type: 'delete', itemId: 'i1' } as any],
    });
    expect(out.success).toBe(false);
    expect(out.reason).toBe('trip_apply_edit_unavailable');
  });
});
