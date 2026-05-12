import { AgentActionReconcilerService } from './agent-action-reconciler.service';
import { AGENT_ACTION_LOG_STATUS } from '../constants/agent-action-log.constants';

describe('AgentActionReconcilerService', () => {
  it('expires dangling holds and marks log CLEANED when compensation completes', async () => {
    const agentActionLog = {
      isEnabled: jest.fn().mockReturnValue(true),
      listPaginated: jest.fn().mockResolvedValue({
        rows: [
          {
            id: 'log-1',
            status: AGENT_ACTION_LOG_STATUS.FAILED,
            payload: {
              realized_state: {
                side_effects_ledger: [
                  {
                    handler_id: 'side_effect.financial_hold.book_flight_v1',
                    status: 'COMPENSATION_FAILED',
                    retry_count: 2,
                    last_error: 'GATEWAY_TIMEOUT',
                    hold_id: 'hold_a1',
                    resource_ref: { type: 'FINANCIAL_HOLD', id: 'hold_a1' },
                    updated_at: new Date().toISOString(),
                  },
                ],
              },
            },
          },
        ],
        total: 1,
      }),
      mergePayload: jest.fn().mockResolvedValue(undefined),
      updateStatus: jest.fn().mockResolvedValue(undefined),
    };
    const financialHoldStore = {
      expire: jest.fn().mockResolvedValue(true),
    };

    const svc = new AgentActionReconcilerService(agentActionLog as any, financialHoldStore as any);
    const res = await svc.reconcileOnce({ take: 10 });

    expect(res.scanned).toBeGreaterThan(0);
    expect(res.attempted).toBe(1);
    expect(res.cleaned).toBe(1);
    expect(financialHoldStore.expire).toHaveBeenCalledWith('hold_a1');
    expect(agentActionLog.updateStatus).toHaveBeenCalledWith('log-1', AGENT_ACTION_LOG_STATUS.CLEANED);
  });
});

