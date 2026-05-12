import { SagaReconciliationCron } from './saga-reconciliation.cron';
import { AgentActionReconcilerService } from '../services/agent-action-reconciler.service';
import { AGENT_ACTION_LOG_STATUS } from '../constants/agent-action-log.constants';
import { SideEffectCleanupAdapterRegistry } from '../services/side-effect-cleanup-adapter.registry';
import { AgentEventType } from '../services/event-telemetry.service';

describe('Saga reconciliation — full loop proof', () => {
  it('FAILED + COMPENSATION_FAILED hold -> cron tick -> expire -> ledger updated -> CLEANED', async () => {
    const holdId = 'hold_123';
    const oldUpdatedAt = new Date(Date.now() - 6 * 60 * 1000); // > 5min stale

    const agentActionLog = {
      isEnabled: jest.fn().mockReturnValue(true),
      listStaleForReconciliation: jest.fn().mockResolvedValue([
        {
          id: 'log-123',
          status: AGENT_ACTION_LOG_STATUS.FAILED,
          updatedAt: oldUpdatedAt,
          payload: {
            realized_state: {
              side_effects_ledger: [
                {
                  handler_id: 'side_effect.financial_hold.book_flight_v1',
                  kind: 'FINANCIAL_HOLD',
                  status: 'COMPENSATION_FAILED',
                  retry_count: 2,
                  last_error: 'GATEWAY_TIMEOUT',
                  resource_ref: { type: 'FINANCIAL_HOLD', id: holdId },
                  provider_reference: null,
                  updated_at: oldUpdatedAt.toISOString(),
                },
              ],
            },
          },
        },
      ]),
      listPaginated: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
      mergePayload: jest.fn().mockResolvedValue(undefined),
      updateStatus: jest.fn().mockResolvedValue(undefined),
    };

    const financialHoldStore = {
      expire: jest.fn().mockResolvedValue(true),
    };

    const reconciler = new AgentActionReconcilerService(agentActionLog as any, financialHoldStore as any);
    const cron = new SagaReconciliationCron(reconciler);

    await cron.handleTick();

    // 1) resource release is attempted using resource_ref.id
    expect(financialHoldStore.expire).toHaveBeenCalledWith(holdId);

    // 2) saga status is sealed as CLEANED
    expect(agentActionLog.updateStatus).toHaveBeenCalledWith('log-123', AGENT_ACTION_LOG_STATUS.CLEANED);

    // 3) ledger is updated to COMPENSATED and persisted back
    expect(agentActionLog.mergePayload).toHaveBeenCalled();
    const mergeArg = (agentActionLog.mergePayload as jest.Mock).mock.calls[0]?.[1];
    const ledger = mergeArg?.realized_state?.side_effects_ledger;
    expect(Array.isArray(ledger)).toBe(true);
    expect(ledger[0]?.status).toBe('COMPENSATED');
    expect(ledger[0]?.last_error).toBeNull();
  });

  it('async cleanup: 1st tick PENDING -> CLEANING_IN_PROGRESS; 2nd tick DONE -> CLEANED', async () => {
    const adapterRegistry = new SideEffectCleanupAdapterRegistry();
    const calls: string[] = [];
    let pollCount = 0;
    adapterRegistry.register({
      resource_type: 'INVENTORY_FLIGHT',
      provider: 'amadeus',
      cleanup: async ({ phase }) => {
        calls.push(phase);
        if (phase === 'START') return { status: 'PENDING' };
        pollCount += 1;
        return pollCount >= 1 ? { status: 'DONE' } : { status: 'PENDING' };
      },
    });

    const oldUpdatedAt = new Date(Date.now() - 6 * 60 * 1000);
    let status: string = AGENT_ACTION_LOG_STATUS.FAILED;
    let payload: any = {
      realized_state: {
        side_effects_ledger: [
          {
            handler_id: 'side_effect.inventory.flight_cancel_v1',
            status: 'COMPENSATION_FAILED',
            retry_count: 0,
            last_error: 'CANCEL_TIMEOUT',
            resource_ref: { type: 'INVENTORY_FLIGHT', id: 'pnr_abc' },
            provider_reference: { provider: 'amadeus', reference_type: 'pnr', reference_id: 'ABC' },
            updated_at: oldUpdatedAt.toISOString(),
          },
        ],
      },
    };

    const agentActionLog = {
      isEnabled: jest.fn().mockReturnValue(true),
      listStaleForReconciliation: jest.fn().mockImplementation(async () => [
        { id: 'log-async', status, updatedAt: oldUpdatedAt, payload },
      ]),
      listPaginated: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
      mergePayload: jest.fn().mockImplementation(async (_id: string, patch: any) => {
        // emulate DB merge semantics used by AgentActionLogService.mergePayload
        payload = { ...(payload ?? {}), ...(patch ?? {}) };
      }),
      updateStatus: jest.fn().mockImplementation(async (_id: string, s: string) => {
        status = s;
      }),
    };

    const reconciler = new AgentActionReconcilerService(agentActionLog as any, undefined as any, adapterRegistry as any);
    const cron = new SagaReconciliationCron(reconciler);

    // tick #1: START -> PENDING
    await cron.handleTick();
    expect(calls).toEqual(['START']);
    expect(status).toBe(AGENT_ACTION_LOG_STATUS.CLEANING_IN_PROGRESS);
    expect(payload.realized_state.side_effects_ledger[0].status).toBe('CLEANING_IN_PROGRESS');

    // fast-forward due time (backoff guard)
    payload.realized_state.side_effects_ledger[0].next_poll_after = new Date(Date.now() - 1000).toISOString();

    // tick #2: POLL -> DONE
    await cron.handleTick();
    expect(calls).toEqual(['START', 'POLL']);
    expect(status).toBe(AGENT_ACTION_LOG_STATUS.CLEANED);
    expect(payload.realized_state.side_effects_ledger[0].status).toBe('COMPENSATED');
  });

  it('poll guard: respects next_poll_after and stops after max attempts (manual intervention)', async () => {
    const adapterRegistry = new SideEffectCleanupAdapterRegistry();
    const calls: string[] = [];
    adapterRegistry.register({
      resource_type: 'INVENTORY_HOTEL',
      provider: 'booking',
      cleanup: async ({ phase }) => {
        calls.push(phase);
        return { status: 'PENDING' };
      },
    });

    const oldUpdatedAt = new Date(Date.now() - 6 * 60 * 1000);
    let status: string = AGENT_ACTION_LOG_STATUS.FAILED;
    let payload: any = {
      realized_state: {
        side_effects_ledger: [
          {
            handler_id: 'side_effect.inventory.hotel_cancel_v1',
            status: 'CLEANING_IN_PROGRESS',
            poll_count: 1,
            next_poll_after: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1h later => should skip
            cleanup_deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            resource_ref: { type: 'INVENTORY_HOTEL', id: 'order_1' },
            provider_reference: { provider: 'booking', reference_type: 'order_ref', reference_id: 'order_1' },
            updated_at: oldUpdatedAt.toISOString(),
          },
        ],
      },
    };

    const agentActionLog = {
      isEnabled: jest.fn().mockReturnValue(true),
      listStaleForReconciliation: jest.fn().mockImplementation(async () => [
        { id: 'log-guard', status, updatedAt: oldUpdatedAt, createdAt: oldUpdatedAt, requestId: 'req-guard', payload },
      ]),
      listPaginated: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
      mergePayload: jest.fn().mockImplementation(async (_id: string, patch: any) => {
        payload = { ...(payload ?? {}), ...(patch ?? {}) };
      }),
      updateStatus: jest.fn().mockImplementation(async (_id: string, s: string) => {
        status = s;
      }),
    };

    const telemetry = { recordEvent: jest.fn() };
    const metrics = {
      setSagaReconciliationActiveTasks: jest.fn(),
      incSagaManualIntervention: jest.fn(),
      observeSagaCleanupLatencySeconds: jest.fn(),
    };
    const reconciler = new AgentActionReconcilerService(
      agentActionLog as any,
      undefined as any,
      adapterRegistry as any,
      telemetry as any,
      metrics as any,
    );
    const cron = new SagaReconciliationCron(reconciler);

    // tick should skip because next_poll_after in future
    await cron.handleTick();
    expect(calls).toEqual([]);

    // force it to be due, but already over max attempts => MANUAL_INTERVENTION_REQUIRED
    payload.realized_state.side_effects_ledger[0].next_poll_after = new Date(Date.now() - 1000).toISOString();
    payload.realized_state.side_effects_ledger[0].poll_count = 12;
    await cron.handleTick();
    expect(status).toBe(AGENT_ACTION_LOG_STATUS.MANUAL_INTERVENTION_REQUIRED);
    expect(calls).toEqual([]); // should not hit adapter once max attempts exceeded
    expect(payload.realized_state.side_effects_ledger[0].status).toBe('MANUAL_INTERVENTION_REQUIRED');

    expect(telemetry.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: AgentEventType.SAGA_STUCK,
        request_id: 'req-guard',
        data: expect.objectContaining({
          log_id: 'log-guard',
          last_error: expect.any(String),
        }),
      }),
    );
  });
});

