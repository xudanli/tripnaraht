import { AgentOpsAdminController } from './agent-ops-admin.controller';

describe('AgentOpsAdminController', () => {
  const mkController = () => {
    const prisma: any = { isDbConnected: jest.fn().mockReturnValue(false) };
    const ruleSyncer: any = {};
    const agentActionLog: any = { findById: jest.fn(), listPaginated: jest.fn(), isEnabled: jest.fn().mockReturnValue(true) };
    const sideEffectRegistry: any = {};
    const actionExecution: any = {};
    const actionRegistry: any = {};
    const financialHolds: any = {};
    const hardTruthRules: any = {};
    const adminAudit: any = {};
    const qualityMarks: any = {};
    const autoSampler: any = {};
    const sagaReplay: any = {};
    const controller = new AgentOpsAdminController(
      prisma,
      ruleSyncer,
      agentActionLog,
      sideEffectRegistry,
      actionExecution,
      actionRegistry,
      financialHolds,
      hardTruthRules,
      adminAudit,
      qualityMarks,
      autoSampler,
      sagaReplay,
    );
    return { controller, agentActionLog };
  };

  it('sagaLogDetail lifts evidence_requirement_context from payload', async () => {
    const { controller, agentActionLog } = mkController();
    agentActionLog.findById.mockResolvedValue({
      id: 'log-1',
      payload: {
        evidence_requirement_context: {
          required_action_type: 'FINANCIAL_HOLD',
          required_evidence_type: 'EvidenceCard',
          side_effect_kind: 'FINANCIAL_HOLD',
        },
      },
    });

    const res = await controller.sagaLogDetail('log-1');
    expect(res.ok).toBe(true);
    expect(res.evidence_requirement_context).toEqual({
      required_action_type: 'FINANCIAL_HOLD',
      required_evidence_type: 'EvidenceCard',
      side_effect_kind: 'FINANCIAL_HOLD',
    });
  });

  it('sagaLogDetail returns null evidence context when absent', async () => {
    const { controller, agentActionLog } = mkController();
    agentActionLog.findById.mockResolvedValue({
      id: 'log-2',
      payload: {},
    });

    const res = await controller.sagaLogDetail('log-2');
    expect(res.ok).toBe(true);
    expect(res.evidence_requirement_context).toBeNull();
  });

  it('sagaLogs lifts evidence_requirement_context for each row', async () => {
    const { controller, agentActionLog } = mkController();
    agentActionLog.listPaginated.mockResolvedValue({
      rows: [
        {
          id: 'log-a',
          payload: {
            evidence_requirement_context: {
              required_action_type: 'FINANCIAL_HOLD',
              required_evidence_type: 'EvidenceCard',
              side_effect_kind: 'FINANCIAL_HOLD',
            },
          },
        },
        {
          id: 'log-b',
          payload: {},
        },
      ],
      total: 2,
    });

    const res = await controller.sagaLogs({ take: 20, skip: 0 } as any);
    expect(res.rows[0].evidence_requirement_context).toEqual({
      required_action_type: 'FINANCIAL_HOLD',
      required_evidence_type: 'EvidenceCard',
      side_effect_kind: 'FINANCIAL_HOLD',
    });
    expect(res.rows[1].evidence_requirement_context).toBeNull();
  });

  it('sagaLogs filters by hasEvidenceRequirementContext', async () => {
    const { controller, agentActionLog } = mkController();
    agentActionLog.listPaginated.mockImplementation(async (opts: any) => {
      if (opts?.hasEvidenceRequirementContext === true) {
        return {
          rows: [
            {
              id: 'log-a',
              payload: {
                evidence_requirement_context: {
                  required_action_type: 'FINANCIAL_HOLD',
                  required_evidence_type: 'EvidenceCard',
                  side_effect_kind: 'FINANCIAL_HOLD',
                },
              },
            },
          ],
          total: 1,
        };
      }
      return {
        rows: [
          {
            id: 'log-b',
            payload: {},
          },
        ],
        total: 1,
      };
    });

    const withContext = await controller.sagaLogs({ hasEvidenceRequirementContext: true } as any);
    expect(withContext.rows).toHaveLength(1);
    expect(withContext.rows[0].id).toBe('log-a');
    expect(withContext.total).toBe(1);
    expect(agentActionLog.listPaginated).toHaveBeenCalledWith(
      expect.objectContaining({ hasEvidenceRequirementContext: true }),
    );

    const withoutContext = await controller.sagaLogs({ hasEvidenceRequirementContext: false } as any);
    expect(withoutContext.rows).toHaveLength(1);
    expect(withoutContext.rows[0].id).toBe('log-b');
    expect(withoutContext.total).toBe(1);
    expect(agentActionLog.listPaginated).toHaveBeenCalledWith(
      expect.objectContaining({ hasEvidenceRequirementContext: false }),
    );
  });

  it('sagaLogs forwards combined filters to query layer', async () => {
    const { controller, agentActionLog } = mkController();
    agentActionLog.listPaginated.mockResolvedValue({ rows: [], total: 0 });

    await controller.sagaLogs({
      status: 'FAILED',
      tripId: 'trip-42',
      hasEvidenceRequirementContext: true,
      hasApplyFailed: true,
      take: 30,
      skip: 10,
    } as any);

    expect(agentActionLog.listPaginated).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'FAILED',
        tripId: 'trip-42',
        hasEvidenceRequirementContext: true,
        hasApplyFailed: true,
        take: 30,
        skip: 10,
      }),
    );
  });

  it('sagaLogs forwards hasApplyFailed filter to query layer', async () => {
    const { controller, agentActionLog } = mkController();
    agentActionLog.listPaginated.mockResolvedValue({ rows: [], total: 0 });

    await controller.sagaLogs({ hasApplyFailed: false } as any);

    expect(agentActionLog.listPaginated).toHaveBeenCalledWith(
      expect.objectContaining({ hasApplyFailed: false }),
    );
  });

  it('sagaLogs forwards hasCompensationFailed filter to query layer', async () => {
    const { controller, agentActionLog } = mkController();
    agentActionLog.listPaginated.mockResolvedValue({ rows: [], total: 0 });

    await controller.sagaLogs({ hasCompensationFailed: true } as any);

    expect(agentActionLog.listPaginated).toHaveBeenCalledWith(
      expect.objectContaining({ hasCompensationFailed: true }),
    );
  });

  it('sagaLogs forwards minRetryCount filter to query layer', async () => {
    const { controller, agentActionLog } = mkController();
    agentActionLog.listPaginated.mockResolvedValue({ rows: [], total: 0 });

    await controller.sagaLogs({ minRetryCount: 2 } as any);

    expect(agentActionLog.listPaginated).toHaveBeenCalledWith(
      expect.objectContaining({ minRetryCount: 2 }),
    );
  });

  it('sagaLogs forwards hasManualInterventionRequired filter to query layer', async () => {
    const { controller, agentActionLog } = mkController();
    agentActionLog.listPaginated.mockResolvedValue({ rows: [], total: 0 });

    await controller.sagaLogs({ hasManualInterventionRequired: true } as any);

    expect(agentActionLog.listPaginated).toHaveBeenCalledWith(
      expect.objectContaining({ hasManualInterventionRequired: true }),
    );
  });

  it('sagaLogsMetrics aggregates rates and distribution', async () => {
    const { controller, agentActionLog } = mkController();
    agentActionLog.listPaginated.mockResolvedValue({
      rows: [
        {
          id: 'log-1',
          createdAt: new Date('2026-01-02T10:00:00.000Z'),
          payload: {
            realized_state: {
              side_effects_ledger: [
                { kind: 'FINANCIAL_HOLD', status: 'APPLY_FAILED', retry_count: 2 },
                { kind: 'FINANCIAL_HOLD', status: 'COMPENSATION_FAILED', retry_count: 3 },
              ],
            },
          },
        },
        {
          id: 'log-2',
          createdAt: new Date('2026-01-03T10:00:00.000Z'),
          payload: {
            realized_state: {
              side_effects_ledger: [{ kind: 'INVENTORY_LOCK', status: 'MANUAL_INTERVENTION_REQUIRED', retry_count: 0 }],
            },
          },
        },
      ],
      total: 2,
    });

    const res = await controller.sagaLogsMetrics({
      status: 'FAILED',
      since: '2026-01-01T00:00:00.000Z',
      until: '2026-01-31T23:59:59.000Z',
      take: 100,
    } as any);
    expect(res.ok).toBe(true);
    expect((res as any).cache_hit).toBe(false);
    expect(res.sampled_logs).toBe(2);
    expect(res.overview.with_apply_failed_count).toBe(1);
    expect(res.overview.with_compensation_failed_count).toBe(1);
    expect(res.overview.with_manual_intervention_required_count).toBe(1);
    expect(res.retry_distribution['3-5']).toBe(1);
    expect(res.by_side_effect_type.FINANCIAL_HOLD.apply_failed).toBe(1);
    expect(res.by_side_effect_type.FINANCIAL_HOLD.compensation_failed).toBe(1);
    expect(res.by_strategy_dimension['FINANCIAL_HOLD::none'].total_entries).toBe(2);
    expect(Array.isArray((res as any).daily_trend)).toBe(true);
    expect((res as any).daily_trend).toHaveLength(2);
    expect((res as any).daily_trend[0].date).toBe('2026-01-02');
    expect(agentActionLog.listPaginated).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'FAILED',
        createdAtFrom: expect.any(Date),
        createdAtTo: expect.any(Date),
        take: 100,
        skip: 0,
      }),
    );
  });

  it('sagaLogsMetrics filters by retryStrategy', async () => {
    const { controller, agentActionLog } = mkController();
    agentActionLog.listPaginated.mockResolvedValue({
      rows: [
        {
          id: 'log-1',
          payload: {
            realized_state: {
              side_effects_ledger: [{ kind: 'FINANCIAL_HOLD', status: 'APPLY_FAILED', retry_count: 1 }],
            },
          },
        },
      ],
      total: 1,
    });

    const res = await controller.sagaLogsMetrics({ retryStrategy: 'none' } as any);
    expect(res.ok).toBe(true);
    expect(res.sampled_logs).toBe(1);
    expect((res as any).filters.retryStrategy).toBe('none');
    expect((res as any).by_strategy_dimension['FINANCIAL_HOLD::none'].apply_failed).toBe(1);
  });

  it('sagaLogsMetrics returns cached response for same query within ttl', async () => {
    const { controller, agentActionLog } = mkController();
    agentActionLog.listPaginated.mockResolvedValue({
      rows: [
        {
          id: 'log-1',
          payload: {
            realized_state: {
              side_effects_ledger: [{ kind: 'FINANCIAL_HOLD', status: 'APPLY_FAILED', retry_count: 1 }],
            },
          },
        },
      ],
      total: 1,
    });

    const first = await controller.sagaLogsMetrics({ status: 'FAILED', take: 100 } as any);
    const second = await controller.sagaLogsMetrics({ status: 'FAILED', take: 100 } as any);

    expect((first as any).cache_hit).toBe(false);
    expect((second as any).cache_hit).toBe(true);
    expect({ ...(first as any), cache_hit: true }).toEqual(second);
    expect(agentActionLog.listPaginated).toHaveBeenCalledTimes(1);
  });

  it('sagaDecisionContract lifts evidence_requirement_context from payload', async () => {
    const { controller, agentActionLog } = mkController();
    agentActionLog.findById.mockResolvedValue({
      id: 'log-dc-1',
      payload: {
        decision_contract: { version: 'v1' },
        realized_state: { holds: [] },
        evidence_requirement_context: {
          required_action_type: 'FINANCIAL_HOLD',
          required_evidence_type: 'EvidenceCard',
          side_effect_kind: 'FINANCIAL_HOLD',
        },
      },
    });

    const res = await controller.sagaDecisionContract('log-dc-1');
    expect(res.ok).toBe(true);
    expect((res as any).evidence_requirement_context).toEqual({
      required_action_type: 'FINANCIAL_HOLD',
      required_evidence_type: 'EvidenceCard',
      side_effect_kind: 'FINANCIAL_HOLD',
    });
  });
});
