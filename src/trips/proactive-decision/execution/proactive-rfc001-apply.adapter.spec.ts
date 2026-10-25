import type { Rfc001DecisionProblem } from '../../guardian-decision-core/contracts/decision-problem.types';
import {
  ProactiveRfc001ApplyAdapterService,
  runProactiveRfc001FinalizeForProblem,
} from './proactive-rfc001-apply.adapter';
import type { ProactiveChangeDraftV1 } from './proactive-change-draft.types';

describe('PD-7.3 ProactiveRfc001ApplyAdapter', () => {
  const baseProblem = (
    cap: string,
  ): Rfc001DecisionProblem =>
    ({
      problemId: 'problem_pd_apply',
      tripId: 'trip_pd_apply',
      planVersionId: 'plan_1',
      type: 'FEASIBILITY_FAILURE',
      triggerEventId: 'evt_1',
      semanticCapability: cap,
      affectedEntityRefs: [],
      affectedPlanItemIds: ['item_1'],
      worldStateSnapshotId: 'wss_1',
      detectedAt: '2026-08-11T12:00:00.000Z',
      urgency: 'HIGH',
      status: 'OPEN',
    }) as Rfc001DecisionProblem;

  it('routes weather + postpone to weather runner', async () => {
    const weather = {
      evaluateAndFinalizeByProblemId: jest.fn(async () => ({
        record: { decisionId: 'dec_w' },
        planVersion: { planVersionId: 'pv_w' },
        shadowMode: false,
        humanDecisionRequired: true,
      })),
    };
    const road = { evaluateAndFinalizeByProblemId: jest.fn() };
    const load = { evaluateAndFinalizeByProblemId: jest.fn() };

    const a = await runProactiveRfc001FinalizeForProblem({
      problem: baseProblem('WEATHER_ACTIVITY_PROHIBITED'),
      weather,
      road,
      load,
    });
    expect(a.ok).toBe(true);
    expect(weather.evaluateAndFinalizeByProblemId).toHaveBeenCalled();

    const b = await runProactiveRfc001FinalizeForProblem({
      problem: baseProblem('ACTIVITY_WINDOW_MISSED'),
      weather,
      road,
      load,
    });
    expect(b.ok).toBe(true);
    expect(weather.evaluateAndFinalizeByProblemId).toHaveBeenCalledTimes(2);
    expect(road.evaluateAndFinalizeByProblemId).not.toHaveBeenCalled();
  });

  it('routes road / load and rejects unknown capability', async () => {
    const weather = { evaluateAndFinalizeByProblemId: jest.fn() };
    const road = {
      evaluateAndFinalizeByProblemId: jest.fn(async () => ({
        record: { decisionId: 'dec_r' },
        planVersion: { planVersionId: 'pv_r' },
        shadowMode: false,
        humanDecisionRequired: true,
      })),
    };
    const load = {
      evaluateAndFinalizeByProblemId: jest.fn(async () => ({
        record: { decisionId: 'dec_l' },
        planVersion: { planVersionId: 'pv_l' },
        shadowMode: true,
        humanDecisionRequired: false,
      })),
    };

    const r = await runProactiveRfc001FinalizeForProblem({
      problem: baseProblem('ROAD_SEGMENT_UNAVAILABLE'),
      weather,
      road,
      load,
    });
    expect(r.ok).toBe(true);

    const l = await runProactiveRfc001FinalizeForProblem({
      problem: baseProblem('EXCESSIVE_DAILY_LOAD'),
      weather,
      road,
      load,
    });
    expect(l.ok).toBe(true);

    const u = await runProactiveRfc001FinalizeForProblem({
      problem: baseProblem('UNKNOWN_CAP'),
      weather,
      road,
      load,
    });
    expect(u.ok).toBe(false);
    if (!u.ok) expect(u.errorZh).toContain('不支持');
  });

  it('Nest adapter: flag off / shadow / authorize+execute', async () => {
    const problemStore = {
      get: jest.fn(async () => baseProblem('WEATHER_ACTIVITY_PROHIBITED')),
    };
    const weatherRunner = {
      evaluateAndFinalizeByProblemId: jest.fn(async () => ({
        record: { decisionId: 'dec_1', recordStatus: 'PROPOSED' },
        planVersion: { planVersionId: 'pv_1' },
        shadowMode: false,
        humanDecisionRequired: true,
      })),
    };
    const authorization = {
      authorize: jest.fn(async () => ({})),
    };
    const executor = {
      execute: jest.fn(async () => ({
        record: { decisionId: 'dec_1' },
        planVersion: { planVersionId: 'pv_1' },
        itineraryMaterialized: true,
      })),
    };

    const svc = new ProactiveRfc001ApplyAdapterService(
      problemStore as never,
      weatherRunner as never,
      { evaluateAndFinalizeByProblemId: jest.fn() } as never,
      { evaluateAndFinalizeByProblemId: jest.fn() } as never,
      authorization as never,
      executor as never,
    );

    const draft = {
      draftId: 'draft_1',
      tripId: 'trip_pd_apply',
      decisionProblemId: 'problem_pd_apply',
      status: 'CONFIRMED',
      applyAllowed: true,
    } as ProactiveChangeDraftV1;

    const closed = await svc.applyConfirmedDraft(draft, {
      PROACTIVE_DECISION_V1_ENABLED: '1',
      PROACTIVE_DECISION_CONFIRM_APPLY_WRITE_ENABLED: '0',
    } as NodeJS.ProcessEnv);
    expect(closed.ok).toBe(false);

    const openEnv = {
      PROACTIVE_DECISION_V1_ENABLED: '1',
      PROACTIVE_DECISION_CONFIRM_APPLY_WRITE_ENABLED: '1',
    } as NodeJS.ProcessEnv;

    const applied = await svc.applyConfirmedDraft(draft, openEnv);
    expect(applied.ok).toBe(true);
    expect(authorization.authorize).toHaveBeenCalledWith({
      tripId: 'trip_pd_apply',
      decisionId: 'dec_1',
    });
    expect(executor.execute).toHaveBeenCalledWith({
      tripId: 'trip_pd_apply',
      decisionId: 'dec_1',
      idempotencyKey: 'pd_v1:apply:draft_1',
    });
    expect(applied.planVersionId).toBe('pv_1');
    expect(applied.appliedToItinerary).toBe(true);

    weatherRunner.evaluateAndFinalizeByProblemId.mockResolvedValueOnce({
      record: { decisionId: 'dec_shadow', recordStatus: 'PROPOSED' },
      planVersion: null,
      shadowMode: true,
      humanDecisionRequired: true,
    });
    const shadow = await svc.applyConfirmedDraft(draft, openEnv);
    expect(shadow.ok).toBe(true);
    expect(shadow.appliedToItinerary).toBe(false);
    expect(shadow.shadowMode).toBe(true);
    expect(authorization.authorize).toHaveBeenCalledTimes(1);
  });
});
