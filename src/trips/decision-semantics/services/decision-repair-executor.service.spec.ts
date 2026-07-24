import { DecisionRepairExecutorService } from '../services/decision-repair-executor.service';
import type { DecisionProblemDetail } from '../types/decision-semantics.types';

describe('DecisionRepairExecutorService', () => {
  const feasibility = {
    applyRepair: jest.fn(),
    validate: jest.fn(),
    getRepairOptions: jest.fn(),
  };
  const service = new DecisionRepairExecutorService(feasibility as any);

  const issue = {
    id: 'issue-drive-1',
    priority: 'must_handle' as const,
    category: 'transport',
    title: 't',
    message: 'm',
    affectedDays: [2],
    severity: 'high' as const,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('skips non-repair option ids', () => {
    expect(service.canExecuteRepair('planb_0_x', issue)).toBe(false);
    expect(service.canExecuteRepair('ack_abc', issue)).toBe(false);
    expect(service.canExecuteRepair('insert_rest', issue)).toBe(true);
  });

  it('returns applied with persistence patch', async () => {
    feasibility.applyRepair.mockResolvedValue({
      tripId: 'trip1',
      blockerId: 'b1',
      optionId: 'insert_rest',
      actionType: 'insert_rest_day',
      status: 'applied',
      message: 'ok',
      persistence: {
        applied: true,
        createdItemIds: ['item-new'],
        updatedItemIds: ['item-a'],
        removedItemIds: [],
        skippedLockedItemIds: [],
      },
    });

    const result = await service.executeRepair({
      tripId: 'trip1',
      userId: 'u1',
      issue,
      body: {
        problemId: 'dp_x',
        selectedOptionId: 'insert_rest',
      },
    });

    expect(result.applied).toBe(true);
    expect(result.mutationsPatch?.operations?.length).toBe(2);
    expect(feasibility.applyRepair).toHaveBeenCalledWith(
      'trip1',
      'issue-drive-1',
      expect.objectContaining({
        optionId: 'insert_rest',
        persistDecision: true,
        runGuardianNegotiation: false,
      }),
      'u1',
    );
  });

  it('does not mark applied when deferred', async () => {
    feasibility.applyRepair.mockResolvedValue({
      status: 'deferred',
      message: 'need human',
    });

    const result = await service.executeRepair({
      tripId: 'trip1',
      userId: 'u1',
      issue,
      body: { problemId: 'dp_x', selectedOptionId: 'insert_rest' },
    });

    expect(result.applied).toBe(false);
    expect(result.applyResult).toBeDefined();
  });

  it('executes gate revalidate via feasibility.validate', async () => {
    feasibility.validate.mockResolvedValue({ tripId: 'trip1' });

    const detail: DecisionProblemDetail = {
      id: 'dp_gate',
      tripId: 'trip1',
      type: 'INFEASIBILITY',
      title: '数据缺失',
      description: '证据不足',
      detectedBy: 'GATE',
      detectedAt: '2026-06-30T08:00:00Z',
      tripVersion: '1',
      affectedScope: [],
      status: 'OPEN',
      semanticKey: 'gate:DATA_MISSING:x',
      sourceRefs: [],
      assertionIds: [],
      assertions: [],
    };

    const result = await service.executeGateRepair({
      tripId: 'trip1',
      userId: 'u1',
      body: { problemId: 'dp_gate', selectedOptionId: 'gate_data_revalidate' },
      detail,
      feasibilityIssues: [],
    });

    expect(result.applied).toBe(true);
    expect(feasibility.validate).toHaveBeenCalledWith('trip1', {});
  });
});
