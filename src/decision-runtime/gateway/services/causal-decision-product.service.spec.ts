import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CausalDecisionProductService } from './causal-decision-product.service';
import { buildStrongWindAppointmentFixture } from '../../../travel-causal-decision/fixtures';

describe('CausalDecisionProductService', () => {
  const decision = buildStrongWindAppointmentFixture();
  const optionId =
    decision.recommendation?.optionId ?? decision.interventions[0]!.optionId;

  function buildService(opts?: {
    actions?: Array<{ actionId: string; allowed: boolean }>;
    resolution?: { status: string; selectedActionId: string } | null;
  }) {
    const actions = opts?.actions ?? [{ actionId: optionId, allowed: true }];
    const gateway = {
      listProblems: jest.fn().mockResolvedValue({
        items: [{ problemId: 'prob_wind_1', travelCausalDecision: decision }],
      }),
      getProblem: jest.fn().mockResolvedValue({
        problem: { problemId: 'prob_wind_1', travelCausalDecision: decision },
        travelCausalDecision: decision,
        actions,
        causalTraceRef: { traceId: 'tr_1', schemaVersion: 'v1' },
      }),
      submitResolution: jest.fn().mockResolvedValue({ ok: true }),
      applyResolution: jest.fn().mockResolvedValue({ ok: true }),
    };
    const resolutionStore = {
      getForProblem: jest.fn().mockResolvedValue(opts?.resolution ?? null),
    };
    const causalTrace = { bindSelected: jest.fn() };

    return {
      service: new CausalDecisionProductService(
        gateway as never,
        resolutionStore as never,
        causalTrace as never,
      ),
      gateway,
      resolutionStore,
      causalTrace,
    };
  }

  it('lists only problems with travelCausalDecision', async () => {
    const { service } = buildService();
    const list = await service.list('trip_1');
    expect(list.schema).toBe('tripnara.causal_decision_list@v1');
    expect(list.items).toHaveLength(1);
    expect(list.items[0]!.card.whatHappened).toBeTruthy();
  });

  it('gets by dec_ prefix or raw problemId', async () => {
    const { service } = buildService();
    const a = await service.get('trip_1', 'dec_prob_wind_1');
    const b = await service.get('trip_1', 'prob_wind_1');
    expect(a.problemId).toBe('prob_wind_1');
    expect(b.decisionId).toBe(decision.decisionId);
  });

  it('select submits Gateway resolution when action exists', async () => {
    const { service, gateway, causalTrace } = buildService();
    await service.select('trip_1', 'dec_prob_wind_1', 'user_1', { optionId });
    expect(gateway.submitResolution).toHaveBeenCalled();
    expect(causalTrace.bindSelected).not.toHaveBeenCalled();
  });

  it('select falls back to Trace bind when option is causal-only', async () => {
    const { service, gateway, causalTrace } = buildService({
      actions: [{ actionId: 'other_action', allowed: true }],
    });
    await service.select('trip_1', 'dec_prob_wind_1', 'user_1', { optionId });
    expect(gateway.submitResolution).not.toHaveBeenCalled();
    expect(causalTrace.bindSelected).toHaveBeenCalledWith(
      expect.objectContaining({ optionId, traceId: 'tr_1' }),
    );
  });

  it('apply requires gateway resolution', async () => {
    const { service } = buildService({
      actions: [{ actionId: 'other_action', allowed: true }],
      resolution: null,
    });
    await expect(
      service.apply('trip_1', 'dec_prob_wind_1', 'user_1', {}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('getOutcome never invents CONFIRMED', async () => {
    const { service } = buildService();
    const outcome = await service.getOutcome('trip_1', 'prob_wind_1');
    expect(outcome.schema).toBe('tripnara.causal_decision_outcome@v1');
    expect(outcome.outcome?.reconciliation).not.toBe('CONFIRMED');
  });

  it('throws when decision missing', async () => {
    const { service, gateway } = buildService();
    gateway.getProblem.mockResolvedValue({
      problem: { problemId: 'x' },
      actions: [],
    });
    await expect(service.get('trip_1', 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
