import { NotFoundException, BadRequestException } from '@nestjs/common';
import { CanonicalDecisionEngineAdapter } from './canonical-decision-engine.adapter';
import type { Rfc001DecisionProblem } from '../../../trips/guardian-decision-core/contracts/decision-problem.types';

describe('CanonicalDecisionEngineAdapter', () => {
  const weatherResult = {
    runId: 'run_wx',
    tripId: 'trip_1',
    workspace: null,
    record: { decisionId: 'dec_wx' },
  };
  const roadResult = {
    runId: 'run_rd',
    tripId: 'trip_1',
    workspace: null,
    record: { decisionId: 'dec_rd' },
  };

  function buildAdapter(problem?: Rfc001DecisionProblem) {
    const weatherRunner = {
      evaluateAndFinalizeByProblemId: jest.fn(async () => weatherResult),
    };
    const roadRunner = {
      evaluateAndFinalizeByProblemId: jest.fn(async () => roadResult),
    };
    const loadRunner = {
      evaluateAndFinalizeByProblemId: jest.fn(async () => ({
        runId: 'run_ld',
        tripId: 'trip_1',
        workspace: { workspaceId: 'ws_1' },
        record: { decisionId: 'dec_ld', selectedCandidateId: 'cand_split_day' },
      })),
      runFullFromPlanScan: jest.fn(async () => ({
        runId: 'run_scan',
        tripId: 'trip_1',
        workspace: { workspaceId: 'ws_1' },
        record: { decisionId: 'dec_ld' },
      })),
    };
    const loadPipeline = {
      scanTrip: jest.fn(async () => null),
    };
    const problemStore = {
      get: jest.fn(async () => problem),
    };
    const readModel = {
      getProblemView: jest.fn(async () => ({
        options: [
          {
            id: 'cand_split_day',
            problemId: 'problem_ld',
            type: 'REPAIR',
            title: '候选 cand_split_day',
            tradeoffs: [
              {
                dimension: 'TIME',
                direction: 'IMPROVE',
                value: 30,
                unit: 'MINUTE',
                explanation: '行程时长变化',
              },
            ],
          },
        ],
        candidates: [
          {
            candidateId: 'cand_split_day',
            label: 'SPLIT_DAY',
            generationMethod: 'SPLIT_DAY',
            intentPreservation: 0.82,
            estimatedAddedDurationMinutes: 0,
            preservedIntentRefs: ['intent_split_overloaded_day'],
            blocked: false,
          },
        ],
        leadingPersona: 'DRDRE',
        impactScopeView: {
          schemaId: 'tripnara.impact_scope@v1',
          narrative: {
            templateKey: 'impact.daily_load.affects_arrangements',
            params: {
              capability: 'EXCESSIVE_DAILY_LOAD',
              subjectKind: 'DAY_LOAD',
              dayIndexes: [6],
              overloadedDayIndex: 6,
              primaryDayIndex: 6,
              arrangementLabels: ['Langjökull'],
              arrangementCount: 1,
              directCount: 1,
              downstreamCount: 0,
            },
          },
          trigger: {
            capability: 'EXCESSIVE_DAILY_LOAD',
            subjectKind: 'DAY_LOAD',
            dayIndex: 6,
          },
          chain: [],
          arrangements: [],
          affectedDayIndexes: [5],
        },
        rfc001Problem: {
          semanticCapability: 'EXCESSIVE_DAILY_LOAD',
          type: 'EXCESSIVE_LOAD',
          triggerEventId: 'evt_ld_1',
          affectedEntityRefs: [{ kind: 'PLAN_ITEM', id: 'i1', label: 'day5' }],
          affectedPlanItemIds: ['i1'],
        },
        workspace: {
          repairCandidates: [
            {
              candidateId: 'cand_split_day',
              preservedIntentRefs: ['intent_split_overloaded_day'],
              estimatedAddedCost: { amount: 0, currency: 'ISK' },
              generationMethod: 'SPLIT_DAY',
              estimatedIntentPreservation: 0.82,
              estimatedAddedDurationMinutes: 0,
            },
          ],
        },
        record: {
          selectedCandidateId: 'cand_split_day',
          rejectedCandidates: [],
          utilityEvaluation: [],
        },
        problemSummary: {},
      })),
    };
    const prisma = {
      trip: {
        findUnique: jest.fn(async () => ({ destination: 'IS' })),
      },
    };
    const adapter = new CanonicalDecisionEngineAdapter(
      readModel as never,
      prisma as never,
      {} as never,
      {} as never,
      roadRunner as never,
      weatherRunner as never,
      loadRunner as never,
      {} as never,
      {} as never,
      loadPipeline as never,
      {} as never,
      problemStore as never,
    );
    return { adapter, weatherRunner, roadRunner, loadRunner, loadPipeline, problemStore, readModel, prisma };
  }

  it('GATE-WX-001: routes weather problems to weather runner', async () => {
    const { adapter, weatherRunner, roadRunner } = buildAdapter({
      problemId: 'problem_wx',
      type: 'WEATHER_HAZARD',
      triggerEventId: 'evt_wx_1',
      semanticCapability: 'WEATHER_ACTIVITY_PROHIBITED',
    } as Rfc001DecisionProblem);

    const result = await adapter.evaluate('trip_1', 'problem_wx');

    expect(weatherRunner.evaluateAndFinalizeByProblemId).toHaveBeenCalledWith(
      'trip_1',
      'problem_wx',
    );
    expect(roadRunner.evaluateAndFinalizeByProblemId).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        runId: 'run_wx',
        options: [],
        candidates: [],
      }),
    );
  });

  it('GATE-WX-002: routes road problems to road runner', async () => {
    const { adapter, weatherRunner, roadRunner } = buildAdapter({
      problemId: 'problem_rd',
      type: 'FEASIBILITY_FAILURE',
      triggerEventId: 'evt_rd_1',
      semanticCapability: 'ROAD_SEGMENT_UNAVAILABLE',
    } as Rfc001DecisionProblem);

    const result = await adapter.evaluate('trip_1', 'problem_rd');

    expect(roadRunner.evaluateAndFinalizeByProblemId).toHaveBeenCalledWith(
      'trip_1',
      'problem_rd',
    );
    expect(weatherRunner.evaluateAndFinalizeByProblemId).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        runId: 'run_rd',
        options: [],
        candidates: [],
      }),
    );
  });

  it('GATE-WX-003: resolveProblemSemanticKey uses capability resolver', async () => {
    const { adapter } = buildAdapter({
      problemId: 'problem_wx',
      type: 'WEATHER_HAZARD',
      triggerEventId: 'evt_wx_1',
      semanticCapability: 'WEATHER_ACTIVITY_PROHIBITED',
    } as Rfc001DecisionProblem);

    const key = await adapter.resolveProblemSemanticKey('trip_1', 'problem_wx');
    expect(key).toBe('WEATHER_ACTIVITY_PROHIBITED:evt_wx_1');
  });

  it('GATE-WX-004: missing problem throws NotFoundException', async () => {
    const { adapter } = buildAdapter(undefined);

    await expect(adapter.evaluate('trip_1', 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('GATE-LOAD-001: routes load problems to load runner', async () => {
    const { adapter, loadRunner, roadRunner, weatherRunner } = buildAdapter({
      problemId: 'problem_ld',
      type: 'EXCESSIVE_LOAD',
      triggerEventId: 'evt_ld_1',
      semanticCapability: 'EXCESSIVE_DAILY_LOAD',
    } as Rfc001DecisionProblem);

    const result = await adapter.evaluate('trip_1', 'problem_ld');
    expect(loadRunner.evaluateAndFinalizeByProblemId).toHaveBeenCalledWith(
      'trip_1',
      'problem_ld',
    );
    expect(roadRunner.evaluateAndFinalizeByProblemId).not.toHaveBeenCalled();
    expect(weatherRunner.evaluateAndFinalizeByProblemId).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ runId: 'run_ld' }));
  });

  it('GATE-EVAL-001: evaluate attaches per-candidate options with tradeoffs', async () => {
    const { adapter, readModel } = buildAdapter({
      problemId: 'problem_ld',
      type: 'EXCESSIVE_LOAD',
      triggerEventId: 'evt_ld_1',
      semanticCapability: 'EXCESSIVE_DAILY_LOAD',
    } as Rfc001DecisionProblem);

    const result = await adapter.evaluate('trip_1', 'problem_ld');

    expect(readModel.getProblemView).toHaveBeenCalledWith('trip_1', 'problem_ld');
    expect(result.options).toHaveLength(1);
    expect(result.options[0].tradeoffs).toHaveLength(1);
    expect(result.candidates[0].candidateId).toBe('cand_split_day');
    expect(result.leadingPersona).toBe('DRDRE');
    expect(result.comparisonView?.schemaId).toBe('tripnara.candidate_comparison@v1');
    expect(result.comparisonView?.rows.length).toBeGreaterThan(0);
    expect(result.impactScopeView?.schemaId).toBe('tripnara.impact_scope@v1');
    expect(result.impactScopeView?.narrative.templateKey).toBe(
      'impact.daily_load.affects_arrangements',
    );
    expect(result.impactScopeView?.narrative.params.primaryDayIndex).toBe(6);
    expect(result.generatedAt).toBeDefined();
  });

  it('GATE-LOAD-002: scanDailyLoad runFull delegates to load runner', async () => {
    const pipelineResult = {
      evidence: {},
      impact: { dayIndex: 1, drivingHours: 10 },
      problem: { problemId: 'problem_ld' },
    };
    const runFullResult = {
      runId: 'run_scan',
      tripId: 'trip_1',
      workspace: { workspaceId: 'ws_1' },
      record: { decisionId: 'dec_ld' },
      problem: { problemId: 'problem_ld' },
    };
    const { adapter, loadPipeline, loadRunner, readModel } = buildAdapter(undefined);
    loadPipeline.scanTrip = jest.fn(async () => pipelineResult as never);
    loadRunner.runFullFromPlanScan = jest.fn(async () => runFullResult as never);

    const result = await adapter.scanDailyLoad('trip_1', true);

    expect(loadPipeline.scanTrip).toHaveBeenCalledWith('trip_1');
    expect(loadRunner.runFullFromPlanScan).toHaveBeenCalledWith('trip_1');
    expect(result).toEqual(
      expect.objectContaining({
        runFull: true,
        runId: 'run_scan',
        options: expect.any(Array),
        candidates: expect.any(Array),
      }),
    );
    expect(readModel.getProblemView).toHaveBeenCalled();
  });

  it('GATE-AUTH-001: authorize passes when policy gateway enabled with choice', async () => {
    process.env.AUTHORIZATION_POLICY_GATEWAY_ENABLED = '1';
    const authorization = {
      authorize: jest.fn(async () => ({
        record: { decisionId: 'dec_1', recordStatus: 'AUTHORIZED' },
        planVersion: { planVersionId: 'pv_1' },
      })),
    };
    const authPolicyGateway = {
      isEnabled: () => true,
      evaluate: jest.fn(async () => ({
        schemaId: 'tripnara.authorization_policy_result@v1',
        scope: 'DECISION',
        outcome: 'ASK',
        reasonCodes: ['L2_USER_CONFIRMATION_REQUIRED'],
        evaluatedAt: new Date().toISOString(),
      })),
    };
    const { adapter } = buildAdapter(undefined);
    const wired = new CanonicalDecisionEngineAdapter(
      (adapter as unknown as { readModel: unknown }).readModel as never,
      {} as never,
      authorization as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      authPolicyGateway as never,
    );

    const result = await wired.authorize({
      tripId: 'trip_1',
      decisionId: 'dec_1',
      choice: 'cand_a',
    });

    expect(authorization.authorize).toHaveBeenCalled();
    expect(result.authorizationPolicy?.outcome).toBe('ASK');
    delete process.env.AUTHORIZATION_POLICY_GATEWAY_ENABLED;
  });

  it('GATE-AUTH-002: authorize denied when policy gateway enabled without choice', async () => {
    process.env.AUTHORIZATION_POLICY_GATEWAY_ENABLED = '1';
    const authPolicyGateway = {
      isEnabled: () => true,
      evaluate: jest.fn(async () => ({
        schemaId: 'tripnara.authorization_policy_result@v1',
        scope: 'DECISION',
        outcome: 'DENY',
        reasonCodes: ['MISSING_CANDIDATE_CHOICE'],
        evaluatedAt: new Date().toISOString(),
      })),
    };
    const { adapter } = buildAdapter(undefined);
    const wired = new CanonicalDecisionEngineAdapter(
      {} as never,
      {} as never,
      { authorize: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      authPolicyGateway as never,
    );

    await expect(
      wired.authorize({ tripId: 'trip_1', decisionId: 'dec_1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    delete process.env.AUTHORIZATION_POLICY_GATEWAY_ENABLED;
  });
});
