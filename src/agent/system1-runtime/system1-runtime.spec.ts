import {
  applyCreFetchOverlay,
  buildKnowledgeQaClaims,
  buildLiveFeasibilityClaims,
  compileSystem1AcquisitionPlan,
  compileSystem1TaskFrame,
  ensureSystem1CrePlan,
  evaluateEvidenceSufficiency,
  evaluateSystem1Authority,
  getRequiredEvidenceSpec,
  groundSystem1Claims,
  inferSystem1CandidateClaimTypes,
  planEvidenceAcquisition,
  projectSystem1TurnTrace,
  replaySystem1Turn,
  resolveSystem1RequiredEvidence,
  runSystem1DecisionRuntime,
  runSystem1DecisionSupportFromProblem,
  runSystem1WeatherRoadConsultFromSensors,
  runSystem1InventoryConsultFromHits,
  adaptDayViewRead,
  type System1Evidence,
} from './index';
import { buildContextRequirementPlan } from '../context-requirement';
import { System1ExecutorService } from '../services/system1-executor.service';
import { RouteType } from '../interfaces/router.interface';
import { tryBuildLiveExecutionFastPath } from '../services/live-execution-fast-path.util';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';

function ev(
  key: string,
  status: System1Evidence['status'],
  value: string,
  id = key,
): System1Evidence {
  return {
    evidenceId: id,
    key,
    sourceType: 'WORLD_STATE',
    value,
    status,
  };
}

describe('System1 Decision Runtime', () => {
  it('P0: WRITE intent compiles to WRITE_MUTATION and authority escalates', () => {
    const frame = compileSystem1TaskFrame({ message: '删除 蓝湖', tripId: 't1' });
    expect(frame.questionType).toBe('WRITE_MUTATION');
    expect(frame.requestedAction).toBe('WRITE');
    expect(frame.target?.name).toBe('蓝湖');
    const auth = evaluateSystem1Authority(frame, '删除 蓝湖');
    expect(auth.allowed).toBe(false);
    expect(auth.escalateTo).toBe('SYSTEM2_ASSISTED');
    expect(auth.changeProposal?.applied).toBe(false);
    expect(auth.changeProposal?.kind).toBe('DELETE_ITEM');
  });

  it('P1: feasibility question becomes ASSESS / LIVE family', () => {
    const frame = compileSystem1TaskFrame({
      message: '明天还能去斯科加瀑布吗',
      tripId: 't1',
    });
    expect(frame.questionType).toBe('FEASIBILITY');
    expect(frame.requestedAction).toBe('ASSESS');
    expect(frame.temporalScope?.type).toBe('TOMORROW');
    expect(frame.target?.name).toBe('斯科加瀑布');
  });

  it('P3: stale CRITICAL road → PARTIAL / CONDITIONAL / FETCH_MORE', () => {
    const spec = getRequiredEvidenceSpec('LIVE_FEASIBILITY');
    const sufficiency = evaluateEvidenceSufficiency({
      required: spec,
      evidence: [
        ev('route.status', 'STALE', '1号公路通常通行'),
        ev('weather.wind', 'VERIFIED', '阵风 8m/s'),
        ev('vehicle.profile', 'VERIFIED', '四驱'),
        ev('trip.current_location', 'VERIFIED', '维克'),
      ],
    });
    expect(sufficiency.status).toBe('PARTIAL');
    expect(sufficiency.staleEvidence).toContain('route.status');
    expect(sufficiency.canAnswer).toBe(false);
    expect(sufficiency.answerMode).toBe('CONDITIONAL');
    expect(sufficiency.recommendedRoute).toBe('FETCH_MORE');
  });

  it('P3: all CRITICAL verified → SUFFICIENT STRONG', () => {
    const spec = getRequiredEvidenceSpec('LIVE_FEASIBILITY');
    const sufficiency = evaluateEvidenceSufficiency({
      required: spec,
      evidence: [
        ev('route.status', 'VERIFIED', '1号公路通行'),
        ev('weather.wind', 'VERIFIED', '风力低'),
        ev('vehicle.profile', 'VERIFIED', '四驱'),
        ev('trip.current_location', 'VERIFIED', '维克'),
      ],
    });
    expect(sufficiency.status).toBe('SUFFICIENT');
    expect(sufficiency.answerMode).toBe('STRONG');
    expect(sufficiency.recommendedRoute).toBe('SYSTEM1_ANSWER');
  });

  it('P3: CONFLICTED open vs closed → SYSTEM2', () => {
    const spec = getRequiredEvidenceSpec('LIVE_FEASIBILITY');
    const sufficiency = evaluateEvidenceSufficiency({
      required: spec,
      evidence: [
        ev('route.status', 'VERIFIED', '官方关闭 CLOSED', 'a'),
        ev('route.status', 'VERIFIED', '主路通行 OPEN', 'b'),
        ev('weather.wind', 'VERIFIED', '风力低'),
      ],
    });
    expect(sufficiency.status).toBe('CONFLICTED');
    expect(sufficiency.recommendedRoute).toBe('SYSTEM2_ASSISTED');
    expect(sufficiency.canAnswer).toBe(false);
  });

  it('P3: two closed road wordings are not CONFLICTED', () => {
    const spec = getRequiredEvidenceSpec('LIVE_FEASIBILITY');
    const sufficiency = evaluateEvidenceSufficiency({
      required: spec,
      evidence: [
        ev('route.status', 'VERIFIED', '官方关闭 CLOSED', 'a'),
        ev('route.status', 'VERIFIED', '路况聚合=BLOCK', 'b'),
        ev('weather.wind', 'VERIFIED', '风力低'),
      ],
    });
    expect(sufficiency.status).not.toBe('CONFLICTED');
  });

  it('P4: RISK_ASSESSMENT with UNAVAILABLE wind is UNGROUNDED and dropped', () => {
    const claims = buildLiveFeasibilityClaims({
      conclusionZh: '明天可以继续前往维克。高风风险较低。',
      verdict: 'YES',
      hasWeather: true,
      weatherText: '下午高风风险较低',
    });
    const { grounded, dropped, result } = groundSystem1Claims({
      claims,
      evidence: [
        ev('route.status', 'VERIFIED', '通行'),
        ev('weather.wind', 'UNAVAILABLE', ''),
      ],
    });
    expect(result.find((g) => g.claimId === 'c_wind')?.status).toBe('UNGROUNDED');
    expect(dropped.some((c) => c.claimId === 'c_wind')).toBe(true);
    expect(grounded.some((c) => c.type === 'RISK_ASSESSMENT')).toBe(false);
  });

  it('P2: lodging slice maps to VERIFIED trip.day_list', () => {
    const spec = getRequiredEvidenceSpec('TRIP_QUERY_LODGING');
    const sufficiency = evaluateEvidenceSufficiency({
      required: spec,
      evidence: [
        {
          evidenceId: 'd',
          key: 'trip.day_list',
          sourceType: 'TRIP_STATE',
          value: { dayCount: 7 },
          status: 'VERIFIED',
        },
        {
          evidenceId: 'a',
          key: 'trip.accommodation_anchors',
          sourceType: 'TRIP_STATE',
          value: { missingDayNumbers: [3] },
          status: 'VERIFIED',
        },
      ],
    });
    expect(sufficiency.status).toBe('SUFFICIENT');
    expect(sufficiency.answerMode).toBe('STRONG');
  });

  it('P5: runtime trace records WRITE escalate without answering STRONG', () => {
    const trace = runSystem1DecisionRuntime({
      message: '添加 蓝湖',
      tripId: 't1',
      evidence: [],
      draftAnswer: 'placeholder',
    });
    expect(trace.authority.allowed).toBe(false);
    expect(trace.routeDecision.recommendedRoute).toBe('SYSTEM2_ASSISTED');
    const proj = projectSystem1TurnTrace(trace);
    expect(proj.authority_allowed).toBe(false);
    expect(proj.change_proposal).toMatchObject({ applied: false });
  });

  it('acquisition: injected VERIFIED weather skips weather FETCH and fetches road', () => {
    const spec = getRequiredEvidenceSpec('LIVE_FEASIBILITY');
    const plan = planEvidenceAcquisition({
      required: spec,
      evidence: [ev('weather.wind', 'VERIFIED', '风力低')],
      context: { tripId: 't1' },
    });
    expect(plan.items.find((i) => i.key === 'weather.wind')?.action).toBe('SKIP');
    expect(plan.fetchKeys).toContain('route.status');
    expect(plan.fetchKeys).not.toContain('weather.wind');
  });

  it('acquisition: no tripId lodging day_list asks user instead of fetch', () => {
    const spec = getRequiredEvidenceSpec('TRIP_QUERY_LODGING');
    const plan = planEvidenceAcquisition({
      required: spec,
      evidence: [],
      context: {},
    });
    expect(plan.askKeys).toContain('trip.day_list');
    expect(plan.fetchKeys).not.toContain('trip.day_list');
  });

  it('acquisition: tripId lodging day_list fetches first', () => {
    const spec = getRequiredEvidenceSpec('TRIP_QUERY_LODGING');
    const plan = planEvidenceAcquisition({
      required: spec,
      evidence: [],
      context: { tripId: 't1' },
    });
    expect(plan.fetchKeys).toEqual(
      expect.arrayContaining(['trip.day_list', 'trip.accommodation_anchors']),
    );
    expect(plan.askKeys).toHaveLength(0);
  });

  it('acquisition: alreadyFetched missing day_list becomes ASK_USER', () => {
    const spec = getRequiredEvidenceSpec('TRIP_QUERY_LODGING');
    const plan = planEvidenceAcquisition({
      required: spec,
      evidence: [
        {
          evidenceId: 'x',
          key: 'trip.day_list',
          sourceType: 'TRIP_STATE',
          value: null,
          status: 'UNAVAILABLE',
        },
      ],
      context: { tripId: 't1', alreadyFetched: ['trip.day_list', 'trip.accommodation_anchors'] },
    });
    expect(plan.askKeys).toContain('trip.day_list');
    expect(plan.fetchKeys).not.toContain('trip.day_list');
  });
});

describe('Claim-driven RequiredEvidence', () => {
  it('RECOMMENDATION 不继承 LIVE 天气/路况合同', () => {
    const required = resolveSystem1RequiredEvidence({
      family: 'LIVE_FEASIBILITY',
      candidateClaimTypes: ['RECOMMENDATION'],
    });
    expect(required.map((r) => r.key)).toEqual(['knowledge.hit']);
  });

  it('FEASIBILITY Claim + LIVE Family 保留安全合同', () => {
    const frame = compileSystem1TaskFrame({ message: '明天还能走 F208 吗？', tripId: 't1' });
    const required = resolveSystem1RequiredEvidence({
      family: 'LIVE_FEASIBILITY',
      candidateClaimTypes: inferSystem1CandidateClaimTypes(frame),
    });
    expect(required.map((r) => r.key)).toEqual(
      expect.arrayContaining(['route.status', 'weather.wind', 'vehicle.profile']),
    );
  });

  it('STATE_FACT + lodging Family 仍用行程合同', () => {
    const required = resolveSystem1RequiredEvidence({
      family: 'TRIP_QUERY_LODGING',
      candidateClaimTypes: ['STATE_FACT'],
    });
    expect(required.map((r) => r.key)).toEqual(
      expect.arrayContaining(['trip.day_list', 'trip.accommodation_anchors']),
    );
  });

  it('Trace 投影含 candidate_claim_types 与 claims 输出协议', () => {
    const trace = runSystem1DecisionRuntime({
      message: '冰河湖和钻石沙滩哪个更值得去？',
      family: 'KNOWLEDGE_QA',
      evidence: [
        {
          evidenceId: 'k',
          key: 'knowledge.hit',
          sourceType: 'KNOWLEDGE',
          value: '都值得',
          status: 'VERIFIED',
        },
      ],
      claims: buildKnowledgeQaClaims({ text: '都值得', asRecommendation: true }),
      draftAnswer: '都值得',
    });
    const projected = projectSystem1TurnTrace(trace);
    expect(projected.candidate_claim_types).toEqual(['RECOMMENDATION']);
    expect(projected.required_evidence_keys).toEqual(['knowledge.hit']);
    expect(projected.claims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'RECOMMENDATION',
          strength: 'STRONG',
        }),
      ]),
    );
  });
});

describe('CRE as System1 acquisition orchestrator', () => {
  it('Live compiles CHECK_EXECUTABILITY and maps weather/road fetch keys', () => {
    const cre = ensureSystem1CrePlan({
      family: 'LIVE_FEASIBILITY',
      message: '还能去冰河湖吗',
      tripId: 't1',
    });
    expect(cre.operation).toBe('CHECK_EXECUTABILITY');
    expect(cre.acquisition.fetchKeys).toEqual(
      expect.arrayContaining(['weather.forecast', 'roadConditions']),
    );
    const compiled = compileSystem1AcquisitionPlan({
      family: 'LIVE_FEASIBILITY',
      evidence: [],
      tripId: 't1',
      crePlan: cre,
    });
    expect(compiled.plan.fetchKeys).toEqual(
      expect.arrayContaining(['weather.wind', 'route.status']),
    );
    expect(compiled.cre?.operation).toBe('CHECK_EXECUTABILITY');
    expect(compiled.cre?.mappedFetchKeys).toEqual(
      expect.arrayContaining(['weather.wind', 'route.status']),
    );
  });

  it('CRE hasWeather constrains family weather FETCH even without VERIFIED evidence', () => {
    const cre = ensureSystem1CrePlan({
      family: 'LIVE_FEASIBILITY',
      message: '还能去冰河湖吗',
      tripId: 't1',
      hints: { hasWeather: true, travelMode: 'SELF_DRIVE' },
    });
    expect(cre.acquisition.fetchKeys).not.toContain('weather.forecast');
    expect(cre.acquisition.fetchKeys).toContain('roadConditions');
    const compiled = compileSystem1AcquisitionPlan({
      family: 'LIVE_FEASIBILITY',
      evidence: [],
      tripId: 't1',
      crePlan: cre,
    });
    expect(compiled.plan.fetchKeys).not.toContain('weather.wind');
    expect(compiled.plan.fetchKeys).toContain('route.status');
    expect(compiled.cre?.constrainedKeys).toContain('weather.wind');
    expect(compiled.plan.items.find((i) => i.key === 'weather.wind')?.action).toBe('SKIP');
    expect(compiled.plan.items.find((i) => i.key === 'weather.wind')?.reason).toBe(
      'cre_not_fetchable',
    );
  });

  it('ASK_TRIP_QUESTION does not strip lodging family fetches', () => {
    const cre = buildContextRequirementPlan({
      message: '哪一天没住宿',
      tripId: 't1',
      unifiedSemanticIntent: 'CONSULT',
      hints: { tripId: 't1', destinationKnown: true, message: '哪一天没住宿' },
    });
    expect(cre.operation).toBe('ASK_TRIP_QUESTION');
    expect(cre.acquisition.fetchKeys).toHaveLength(0);
    const compiled = compileSystem1AcquisitionPlan({
      family: 'TRIP_QUERY_LODGING',
      evidence: [],
      tripId: 't1',
      crePlan: cre,
    });
    expect(compiled.plan.fetchKeys).toEqual(
      expect.arrayContaining(['trip.day_list', 'trip.accommodation_anchors']),
    );
    expect(compiled.cre?.constrainedKeys).toEqual([]);
  });

  it('CRE overlay does not turn vehicle ANSWER_CONDITIONALLY into ASK_USER', () => {
    const cre = ensureSystem1CrePlan({
      family: 'LIVE_FEASIBILITY',
      message: '还能去冰河湖吗',
      tripId: 't1',
    });
    expect(cre.nextAction).toBe('ASK_USER');
    const compiled = compileSystem1AcquisitionPlan({
      family: 'LIVE_FEASIBILITY',
      evidence: [],
      tripId: 't1',
      crePlan: cre,
    });
    expect(compiled.plan.askKeys).not.toContain('vehicle.profile');
    expect(
      compiled.plan.items.find((i) => i.key === 'vehicle.profile')?.action,
    ).toBe('ANSWER_CONDITIONALLY');
  });

  it('applyCreFetchOverlay is a no-op without CRE plan', () => {
    const spec = getRequiredEvidenceSpec('LIVE_FEASIBILITY');
    const raw = planEvidenceAcquisition({
      required: spec,
      evidence: [],
      context: { tripId: 't1' },
    });
    const { plan, constrainedKeys } = applyCreFetchOverlay(raw, null);
    expect(plan.fetchKeys).toEqual(raw.fetchKeys);
    expect(constrainedKeys).toEqual([]);
  });
});

describe('System1Executor authority gate', () => {
  it('CAS-118: executeAPI never deletes itinerary items', async () => {
    const remove = jest.fn();
    const create = jest.fn();
    const svc = new System1ExecutorService(
      { search: jest.fn() } as never,
      { findOne: jest.fn() } as never,
      { remove, create } as never,
    );
    const out = await (svc as any).executeAPI({
      user_input: '删除 蓝湖',
      trip: { trip_id: 'trip-1' },
      request_id: 'r-cas-118',
    });
    expect(remove).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(out.result.applied).toBe(false);
    expect(out.result.authority).toBe('ESCALATED');
    expect(String(out.answerText)).toMatch(/不能直接改行程/);
  });

  it('execute() WRITE path returns AUTHORITY_ESCALATION and does not apply', async () => {
    const remove = jest.fn();
    const svc = new System1ExecutorService(
      { search: jest.fn() } as never,
      { findOne: jest.fn() } as never,
      { remove, create: jest.fn() } as never,
    );
    const out = await svc.execute(RouteType.SYSTEM1_API, {
      request_id: 'r-auth',
      user_input: '删除 蓝湖',
      trip: { trip_id: 'trip-1', days: 1, day_boundaries: [], lunch_break: { enabled: false, duration_min: 0, window: ['', ''] }, pacing: 'normal' },
      draft: { nodes: [], hard_nodes: [], soft_nodes: [], edits: [] },
      memory: { semantic_facts: { pois: [], rules: {} }, episodic_snippets: [], user_profile: {} },
      compute: { clusters: null, time_matrix_api: null, time_matrix_robust: null, optimization_results: [], robustness: null },
      react: { step: 0, max_steps: 0, observations: [], decision_log: [] },
    } as any);
    expect(out.cardType).toBe('AUTHORITY_ESCALATION');
    expect(out.appliedToItinerary).toBe(false);
    expect(remove).not.toHaveBeenCalled();
    expect(out.system1Runtime?.authority_allowed).toBe(false);
  });

  it('Live path fetches only missing road when weather already injected', async () => {
    const weather = jest.fn(async () => ({ riskZh: '不应再拉' }));
    const road = jest.fn(async () => ({ alertZh: '1号公路通行', aggregate: 'ALLOW' }));
    const res = await tryBuildLiveExecutionFastPath(
      { fetchLiveWeatherBlock: weather, fetchLiveRoadBlock: road, logger: { log: jest.fn() } },
      {
        request_id: 'r-acq',
        user_id: 'u',
        trip_id: 't1',
        message: '我们晚两个小时，还能去冰河湖吗？',
        options: {
          remaining_drive_hours: 3.5,
          live_sensor_evidence: {
            weather_risk_zh: '南岸阵风偏大',
          },
        },
      } as RouteAndRunRequestDto,
      Date.now(),
    );
    expect(res).toBeTruthy();
    expect(weather).not.toHaveBeenCalled();
    expect(road).toHaveBeenCalled();
    const acq = (res!.observability as any).system1_runtime?.acquisition;
    expect(acq?.fetched_keys).toContain('route.status');
    expect(acq?.fetched_keys ?? []).not.toContain('weather.wind');
    expect((res!.observability as any).system1_runtime?.cre?.operation).toBe(
      'CHECK_EXECUTABILITY',
    );
  });

  it('executeAPI read guidance no longer suggests add/delete', async () => {
    const svc = new System1ExecutorService(
      { search: jest.fn() } as never,
      { findOne: jest.fn() } as never,
      { remove: jest.fn(), create: jest.fn() } as never,
    );
    const out = await svc.execute(RouteType.SYSTEM1_API, {
      request_id: 'r-api-read',
      user_input: '你好',
      trip: { trip_id: 'trip-1', days: 1, day_boundaries: [], lunch_break: { enabled: false, duration_min: 0, window: ['', ''] }, pacing: 'normal' },
      draft: { nodes: [], hard_nodes: [], soft_nodes: [], edits: [] },
      memory: { semantic_facts: { pois: [], rules: {} }, episodic_snippets: [], user_profile: {} },
      compute: { clusters: null, time_matrix_api: null, time_matrix_robust: null, optimization_results: [], robustness: null },
      react: { step: 0, max_steps: 0, observations: [], decision_log: [] },
    } as any);
    expect(String(out.answerText)).toMatch(/只能查询事实/);
    expect(String(out.answerText)).not.toMatch(/添加地点|删除地点/);
    expect(out.system1Runtime?.family).toBe('KNOWLEDGE_QA');
    expect(out.appliedToItinerary).toBe(false);
  });

  it('executeRAG verified place hit is SUFFICIENT STRONG', async () => {
    const search = jest.fn(async () => [
      { id: 'p1', nameCN: '蓝湖', nameEN: 'Blue Lagoon', address: 'Grindavík' },
    ]);
    const svc = new System1ExecutorService(
      { search } as never,
      { findOne: jest.fn() } as never,
      { remove: jest.fn(), create: jest.fn() } as never,
    );
    const out = await svc.execute(RouteType.SYSTEM1_RAG, {
      request_id: 'r-rag',
      user_input: '蓝湖',
      trip: { trip_id: 'trip-1', days: 1, day_boundaries: [], lunch_break: { enabled: false, duration_min: 0, window: ['', ''] }, pacing: 'normal' },
      draft: { nodes: [], hard_nodes: [], soft_nodes: [], edits: [] },
      memory: { semantic_facts: { pois: [], rules: {} }, episodic_snippets: [], user_profile: {} },
      compute: { clusters: null, time_matrix_api: null, time_matrix_robust: null, optimization_results: [], robustness: null },
      react: { step: 0, max_steps: 0, observations: [], decision_log: [] },
    } as any);
    expect(search).toHaveBeenCalled();
    expect(out.system1Runtime?.family).toBe('KNOWLEDGE_QA');
    expect(out.system1Runtime?.sufficiency).toBe('SUFFICIENT');
    expect(out.system1Runtime?.answer_mode).toBe('STRONG');
    expect(String(out.answerText)).toMatch(/蓝湖/);
    expect(String(out.answerText)).not.toMatch(/不是知识库核实结论/);
  });

  it('executeRAG LLM fallback is ASSUMED PARTIAL not STRONG', async () => {
    const search = jest.fn(async () => []);
    const llm = {
      getDefaultProvider: () => 'openai',
      callLlmWithSchema: jest.fn(async () => '五月高地建议带冰爪，视路况而定。'),
    };
    const svc = new System1ExecutorService(
      { search } as never,
      { findOne: jest.fn() } as never,
      { remove: jest.fn(), create: jest.fn() } as never,
      undefined,
      undefined,
      llm as never,
    );
    const out = await svc.execute(RouteType.SYSTEM1_RAG, {
      request_id: 'r-llm',
      user_input: '五月去冰岛要不要带冰爪？',
      trip: { trip_id: 'trip-1', days: 1, day_boundaries: [], lunch_break: { enabled: false, duration_min: 0, window: ['', ''] }, pacing: 'normal' },
      draft: { nodes: [], hard_nodes: [], soft_nodes: [], edits: [] },
      memory: { semantic_facts: { pois: [], rules: {} }, episodic_snippets: [], user_profile: {} },
      compute: { clusters: null, time_matrix_api: null, time_matrix_robust: null, optimization_results: [], robustness: null },
      react: { step: 0, max_steps: 0, observations: [], decision_log: [] },
    } as any);
    expect(out.system1Runtime?.sufficiency).toBe('PARTIAL');
    expect(out.system1Runtime?.answer_mode).toBe('CONDITIONAL');
    expect(String(out.answerText)).toMatch(/不是知识库核实结论/);
  });
});

describe('System1 KNOWLEDGE_QA + replay', () => {
  it('P3: ASSUMED knowledge.hit is PARTIAL not SUFFICIENT', () => {
    const spec = getRequiredEvidenceSpec('KNOWLEDGE_QA');
    const sufficiency = evaluateEvidenceSufficiency({
      required: spec,
      evidence: [
        {
          evidenceId: 'k1',
          key: 'knowledge.hit',
          sourceType: 'KNOWLEDGE',
          value: '常识推断',
          status: 'ASSUMED',
        },
      ],
    });
    expect(sufficiency.status).toBe('PARTIAL');
    expect(sufficiency.answerMode).toBe('CONDITIONAL');
    expect(sufficiency.reason).toBe('critical_assumed');
  });

  it('P5: replay of a grounded knowledge turn does not drift', () => {
    const trace = runSystem1DecisionRuntime({
      message: '蓝湖在哪',
      tripId: 't1',
      family: 'KNOWLEDGE_QA',
      evidence: [
        {
          evidenceId: 'k1',
          key: 'knowledge.hit',
          sourceType: 'TOOL',
          value: { name: '蓝湖' },
          status: 'VERIFIED',
        },
      ],
      claims: buildKnowledgeQaClaims({ text: '蓝湖在 Grindavík 附近。' }),
      draftAnswer: '蓝湖在 Grindavík 附近。',
    });
    expect(trace.sufficiency?.status).toBe('SUFFICIENT');
    const replay = replaySystem1Turn(trace);
    expect(replay.drifted).toBe(false);
    expect(replay.sufficiency?.status).toBe('SUFFICIENT');
  });
});

describe('System1 DECISION_SUPPORT + TRIP_QUERY_DAY', () => {
  it('Decision Support compiles COMPARE_OPTIONS and can answer with options', () => {
    const cre = ensureSystem1CrePlan({
      family: 'DECISION_SUPPORT',
      message: '租两驱还是四驱',
      tripId: 't1',
    });
    expect(cre.operation).toBe('COMPARE_OPTIONS');
    const trace = runSystem1DecisionSupportFromProblem({
      message: '租两驱还是四驱',
      tripId: 't1',
      draftAnswer: '请选择车型方案。',
      problem: {
        decisionId: 'd1',
        decisionKey: 'VEHICLE_ROAD_FIT',
        options: [
          { optionId: '2WD', label_zh: '两驱', feasibility: 'BLOCKED' },
          { optionId: '4WD', label_zh: '四驱', feasibility: 'FEASIBLE' },
          { optionId: '4WD_PLUS', label_zh: '高配四驱', feasibility: 'FEASIBLE' },
        ],
      },
      constraints: { dayCount: 8, winterLikely: false },
    });
    expect(trace.family).toBe('DECISION_SUPPORT');
    expect(trace.sufficiency?.status).toBe('SUFFICIENT');
    expect(trace.routeDecision.answerMode).toBe('STRONG');
    expect(trace.cre?.operation).toBe('COMPARE_OPTIONS');
  });

  it('Decision Support without dayCount is PARTIAL conditional', () => {
    const trace = runSystem1DecisionSupportFromProblem({
      message: '环岛还是南岸',
      tripId: 't1',
      draftAnswer: '请选择范围。',
      problem: {
        decisionId: 'd2',
        decisionKey: 'TRIP_SCOPE',
        options: [
          { optionId: 'RING_ROAD', feasibility: 'FEASIBLE' },
          { optionId: 'SOUTH_COAST', feasibility: 'FEASIBLE' },
        ],
      },
      constraints: {},
    });
    expect(trace.sufficiency?.status).toBe('PARTIAL');
    expect(trace.routeDecision.answerMode).toBe('CONDITIONAL');
  });

  it('Day View VERIFIED day+timeline is SUFFICIENT', () => {
    const evidence = adaptDayViewRead({
      tripId: 't1',
      dayNumber: 2,
      dateIso: '2026-06-02',
      itemCount: 3,
      success: true,
    });
    const sufficiency = evaluateEvidenceSufficiency({
      required: getRequiredEvidenceSpec('TRIP_QUERY_DAY'),
      evidence,
    });
    expect(sufficiency.status).toBe('SUFFICIENT');
    expect(sufficiency.answerMode).toBe('STRONG');
  });
});

describe('System1 WEATHER_ROAD_QA', () => {
  it('live weather → SUFFICIENT STRONG; missing weather → INSUFFICIENT with caveat', () => {
    const ok = runSystem1WeatherRoadConsultFromSensors({
      message: '今天天气怎么样',
      tripId: 't1',
      draftAnswer: '雷克雅未克 8°C，多云。',
      weatherBlock: 'Reykjavik 8°C cloudy wind 6m/s',
    });
    expect(ok.family).toBe('WEATHER_ROAD_QA');
    expect(ok.sufficiency?.status).toBe('SUFFICIENT');
    expect(ok.routeDecision.answerMode).toBe('STRONG');
    expect(ok.finalAnswer).not.toMatch(/缺少实时天气传感器依据/);

    const gap = runSystem1WeatherRoadConsultFromSensors({
      message: '今天天气和路况怎么样',
      tripId: 't1',
      draftAnswer: '一般近期注意大风。',
    });
    expect(gap.sufficiency?.status).toMatch(/INSUFFICIENT|PARTIAL/);
    expect(gap.routeDecision.answerMode).not.toBe('STRONG');
    expect(gap.finalAnswer).toMatch(/缺少实时天气传感器依据/);
  });
});

describe('System1 INVENTORY_CONSULT', () => {
  it('hotel hits → SUFFICIENT STRONG; empty inventory → INSUFFICIENT with caveat', () => {
    const ok = runSystem1InventoryConsultFromHits({
      message: '推荐19号的酒店',
      tripId: 't1',
      draftAnswer: '可看蓝湖附近两家。',
      kind: 'hotel',
      hitCount: 3,
      previewZh: 'Hotel A / Hotel B',
    });
    expect(ok.family).toBe('INVENTORY_CONSULT');
    expect(ok.sufficiency?.status).toBe('SUFFICIENT');
    expect(ok.routeDecision.answerMode).toBe('STRONG');
    expect(ok.finalAnswer).not.toMatch(/缺少实时库存/);

    const gap = runSystem1InventoryConsultFromHits({
      message: '推荐租车公司',
      tripId: 't1',
      draftAnswer: '冰岛可看几家本地车行。',
      kind: 'car_rental',
      hitCount: 0,
    });
    expect(gap.sufficiency?.status).toBe('INSUFFICIENT');
    expect(gap.routeDecision.answerMode).not.toBe('STRONG');
    expect(gap.finalAnswer).toMatch(/缺少实时库存\/检索命中/);
  });
});
