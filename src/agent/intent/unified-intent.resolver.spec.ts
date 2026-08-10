/**
 * Unified Intent P0 — 典型话术 + Shadow mismatch 验收。
 */

import { resolveUnifiedIntent } from './unified-intent.resolver';
import { buildUnifiedIntentShadowCompare } from './unified-intent.shadow';

describe('UnifiedIntentResolver P0', () => {
  it('Day3 安排午餐 → LOCAL_EDIT / LOCAL_EDIT_DRAFT（主题 MEAL 不抢意图）', () => {
    const d = resolveUnifiedIntent({
      message: 'Day3行程我要安排午餐',
      tripId: 't1',
      entryPoint: 'itinerary_day_editor',
    });
    expect(d.semanticIntent).toBe('LOCAL_EDIT');
    expect(d.topic).toBe('MEAL');
    expect(d.scope).toBe('DAY');
    expect(d.target.dayIndex).toBe(3);
    expect(d.mutationPolicy).toBe('DRAFT_ONLY');
    expect(d.routeClass).toBe('LOCAL_EDIT_DRAFT');
    expect(d.requestedOperation).toBe('CREATE_DRAFT');
  });

  it('Day3 附近午餐推荐 → CONSULT / STATEFUL_QA', () => {
    const d = resolveUnifiedIntent({
      message: 'Day 3 附近有什么午餐推荐？',
      tripId: 't1',
    });
    expect(d.semanticIntent).toBe('CONSULT');
    expect(d.topic).toBe('MEAL');
    expect(d.routeClass).toBe('STATEFUL_QA');
    expect(d.mutationPolicy).toBe('READ_ONLY');
  });

  it('加午餐会不会赶不上 → ASSESS_IMPACT', () => {
    const d = resolveUnifiedIntent({
      message: 'Day 3 加午餐会不会赶不上冰川徒步？',
      tripId: 't1',
    });
    expect(d.semanticIntent).toBe('ASSESS_IMPACT');
    expect(d.routeClass).toBe('IMPACT_SIMULATION');
    expect(d.mutationPolicy).toBe('READ_ONLY');
  });

  it('明天会下雨吗 → CONSULT（天气是主题）', () => {
    const d = resolveUnifiedIntent({
      message: '明天会下雨吗？',
      tripId: 't1',
    });
    expect(d.semanticIntent).toBe('CONSULT');
    expect(d.topic).toBe('WEATHER');
    expect(d.mutationPolicy).toBe('READ_ONLY');
  });

  it('明天下雨会影响哪些安排 → ASSESS_IMPACT', () => {
    const d = resolveUnifiedIntent({
      message: '明天下雨会影响哪些安排？',
      tripId: 't1',
    });
    expect(d.semanticIntent).toBe('ASSESS_IMPACT');
    expect(d.routeClass).toBe('IMPACT_SIMULATION');
  });

  it('明天下雨换成室内 → LOCAL_EDIT', () => {
    const d = resolveUnifiedIntent({
      message: '明天下雨，把户外活动换成室内的',
      tripId: 't1',
    });
    expect(d.semanticIntent).toBe('LOCAL_EDIT');
    expect(d.routeClass).toBe('LOCAL_EDIT_DRAFT');
  });

  it('总体行程怎么样 → CONSULT / STATEFUL_QA（非 GLOBAL_PLAN）', () => {
    const d = resolveUnifiedIntent({
      message: '我的总体行程怎么样？',
      tripId: 't1',
    });
    expect(d.semanticIntent).toBe('CONSULT');
    expect(d.routeClass).toBe('STATEFUL_QA');
    expect(d.scope).toBe('TRIP');
  });

  it('重新规划整个行程 → GLOBAL_PLAN', () => {
    const d = resolveUnifiedIntent({
      message: '帮我重新规划整个行程',
      tripId: 't1',
    });
    expect(d.semanticIntent).toBe('GLOBAL_PLAN');
    expect(d.routeClass).toBe('FULL_PLAN_DRAFT');
  });

  it('先别改 + 影响 → READ_ONLY ASSESS/CONSULT', () => {
    const d = resolveUnifiedIntent({
      message: '看看明天下雨会影响什么，先别改',
      tripId: 't1',
    });
    expect(d.mutationPolicy).toBe('READ_ONLY');
    expect(['ASSESS_IMPACT', 'CONSULT']).toContain(d.semanticIntent);
    expect(d.routeClass).not.toBe('LOCAL_EDIT_DRAFT');
    expect(d.routeClass).not.toBe('FULL_PLAN_DRAFT');
  });

  it('trip_id 存在不会单独把意图升成 GLOBAL_PLAN', () => {
    const d = resolveUnifiedIntent({
      message: '雷克雅未克有什么特色食物？',
      tripId: 't1',
      entryPoint: 'itinerary_day_editor',
    });
    expect(d.semanticIntent).toBe('CONSULT');
    expect(d.routeClass).not.toBe('FULL_PLAN_DRAFT');
  });
});

describe('UnifiedIntentShadow P0', () => {
  it('安排午餐被旧路由当成 DATA_LOOKUP → routeMismatch', () => {
    const shadow = buildUnifiedIntentShadowCompare({
      message: 'Day3行程我要安排午餐',
      tripId: 't1',
      legacyTaskType: 'DATA_LOOKUP',
      legacyActionKind: 'TRIP_SCOPED_CONSULTATION',
      legacyCreOperation: 'ASK_TRIP_QUESTION',
      legacyRouteMode: 'LIGHTWEIGHT',
    });
    expect(shadow.decision.semanticIntent).toBe('LOCAL_EDIT');
    expect(shadow.routeMismatch).toBe(true);
    expect(shadow.mismatchReasons.some((r) => r.includes('local_edit_misrouted'))).toBe(
      true,
    );
  });

  it('总体行程 CONSULT 对齐 STATEFUL_QA 旧轻量 → 可匹配', () => {
    const shadow = buildUnifiedIntentShadowCompare({
      message: '我的总体行程怎么样？',
      tripId: 't1',
      legacyTaskType: 'DATA_LOOKUP',
      legacyActionKind: 'TRIP_SCOPED_CONSULTATION',
      legacyCreOperation: 'ASK_TRIP_QUESTION',
      legacyRouteMode: 'LIGHTWEIGHT',
    });
    expect(shadow.decision.semanticIntent).toBe('CONSULT');
    expect(shadow.decision.routeClass).toBe('STATEFUL_QA');
    expect(shadow.routeMismatch).toBe(false);
  });
});

describe('UnifiedIntent P2 read-only takeover', () => {
  it('tryReadOnlyRouteTakeover：CONSULT / ASSESS 接管，LOCAL_EDIT 不进只读接管', () => {
    const { tryReadOnlyRouteTakeover, tryLiveRouteTakeover } = require('./unified-intent.execution-route') as typeof import('./unified-intent.execution-route');
    const { resolveUnifiedIntent } = require('./unified-intent.resolver') as typeof import('./unified-intent.resolver');

    const consult = tryReadOnlyRouteTakeover(
      resolveUnifiedIntent({ message: '总体行程怎么样', tripId: 't1' }),
    );
    expect(consult?.kind).toBe('CONSULT');

    const assess = tryReadOnlyRouteTakeover(
      resolveUnifiedIntent({ message: '明天下雨会影响哪些安排？', tripId: 't1' }),
    );
    expect(assess?.kind).toBe('ASSESS_IMPACT');

    const editDecision = resolveUnifiedIntent({
      message: 'Day3行程我要安排午餐',
      tripId: 't1',
    });
    expect(tryReadOnlyRouteTakeover(editDecision)).toBeNull();
    const live = tryLiveRouteTakeover(editDecision, 'Day3行程我要安排午餐');
    expect(live?.kind).toBe('LOCAL_EDIT');
    if (live?.kind === 'LOCAL_EDIT') {
      expect(live.creOperation).toBe('ADD_ACTIVITY_TO_DAY');
      expect(live.smEntry).toBe('bound_trip_itinerary_adjust');
    }
  });

  it('CRE：unifiedSemanticIntent=CONSULT 禁止 OPTIMIZE', () => {
    const { buildContextRequirementPlan } = require('../context-requirement/context-requirement.service') as typeof import('../context-requirement/context-requirement.service');
    const plan = buildContextRequirementPlan({
      message: '总体行程怎么样',
      tripId: 't1',
      actionKind: 'FULL_TRIP_PLANNING',
      routingTaskType: 'TRIP_PLANNING',
      unifiedSemanticIntent: 'CONSULT',
      hints: { tripId: 't1', message: '总体行程怎么样' },
    });
    expect(plan.operation).toBe('ASK_TRIP_QUESTION');
    expect(plan.acquisition.slimLoad).toBe(true);
  });

  it('CRE：unifiedSemanticIntent=ASSESS_IMPACT → CHECK_EXECUTABILITY', () => {
    const { buildContextRequirementPlan } = require('../context-requirement/context-requirement.service') as typeof import('../context-requirement/context-requirement.service');
    const plan = buildContextRequirementPlan({
      message: '明天天气会影响行程吗？',
      tripId: 't1',
      actionKind: 'FULL_TRIP_PLANNING',
      routingTaskType: 'TRIP_PLANNING',
      unifiedSemanticIntent: 'ASSESS_IMPACT',
      hints: { tripId: 't1', message: '明天天气会影响行程吗？' },
    });
    expect(plan.operation).toBe('CHECK_EXECUTABILITY');
    expect(plan.reason).toBe('unified_intent_assess_impact');
    expect(plan.acquisition.slimLoad).toBe(false);
  });

  it('P3 CRE：LOCAL_EDIT 安排午餐 → ADD_ACTIVITY_TO_DAY，非 OPTIMIZE', () => {
    const { buildContextRequirementPlan } = require('../context-requirement/context-requirement.service') as typeof import('../context-requirement/context-requirement.service');
    const plan = buildContextRequirementPlan({
      message: 'Day3行程我要安排午餐',
      tripId: 't1',
      actionKind: 'FULL_TRIP_PLANNING',
      routingTaskType: 'TRIP_PLANNING',
      unifiedSemanticIntent: 'LOCAL_EDIT',
      hints: { tripId: 't1', message: 'Day3行程我要安排午餐' },
    });
    expect(plan.operation).toBe('ADD_ACTIVITY_TO_DAY');
    expect(plan.reason).toBe('unified_intent_local_edit');
    expect(plan.target.dayIndex).toBe(3);
    expect(plan.acquisition.slimLoad).toBe(false);
  });

  it('P3 CRE：LOCAL_EDIT 换成室内 → REPLACE_ACTIVITY', () => {
    const { buildContextRequirementPlan } = require('../context-requirement/context-requirement.service') as typeof import('../context-requirement/context-requirement.service');
    const plan = buildContextRequirementPlan({
      message: '明天下雨，把户外活动换成室内的',
      tripId: 't1',
      unifiedSemanticIntent: 'LOCAL_EDIT',
      hints: { tripId: 't1', message: '明天下雨，把户外活动换成室内的' },
    });
    expect(plan.operation).toBe('REPLACE_ACTIVITY');
  });

  it('P3 CRE：优化一下第六天的路线 → OPTIMIZE_DAY（勿 ADD_ACTIVITY 阻断）', () => {
    const { tryLiveRouteTakeover } = require('./unified-intent.execution-route') as typeof import('./unified-intent.execution-route');
    const { buildContextRequirementPlan } = require('../context-requirement/context-requirement.service') as typeof import('../context-requirement/context-requirement.service');
    const msg = '优化一下第六天的路线';
    const d = resolveUnifiedIntent({ message: msg, tripId: 't1' });
    expect(d.semanticIntent).toBe('LOCAL_EDIT');
    expect(d.target.dayIndex).toBe(6);
    const live = tryLiveRouteTakeover(d, msg);
    expect(live?.kind).toBe('LOCAL_EDIT');
    if (live?.kind === 'LOCAL_EDIT') {
      expect(live.creOperation).toBe('OPTIMIZE_DAY');
    }
    const plan = buildContextRequirementPlan({
      message: msg,
      tripId: 't1',
      unifiedSemanticIntent: 'LOCAL_EDIT',
      hints: { tripId: 't1', message: msg },
    });
    expect(plan.operation).toBe('OPTIMIZE_DAY');
    expect(plan.target.dayIndex).toBe(6);
    expect(plan.reason).toBe('unified_intent_local_edit');
  });
});
