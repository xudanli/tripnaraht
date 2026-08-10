/**
 * P4 InteractionPolicy + GLOBAL_PLAN takeover 验收。
 */

import {
  interactionPolicyShouldShortCircuitAsk,
  resolveCreInteractionPolicy,
  resolveRorInteractionPolicy,
} from './interaction-policy';
import { resolveUnifiedIntent } from './unified-intent.resolver';
import { tryLiveRouteTakeover } from './unified-intent.execution-route';
import { buildContextRequirementPlan } from '../context-requirement/context-requirement.service';
import { signalsFromRequest } from '../utils/orchestration-signals.util';
import { resolveOrchestrateEntry } from '../routing/request-router.util';
import type { RorRealitySnapshot } from '../reality-observation/reality-observation.types';

describe('P4 GLOBAL_PLAN takeover', () => {
  it('重新规划整个行程 → GLOBAL_PLAN live takeover', () => {
    const d = resolveUnifiedIntent({
      message: '帮我重新规划整个行程',
      tripId: 't1',
    });
    expect(d.semanticIntent).toBe('GLOBAL_PLAN');
    const live = tryLiveRouteTakeover(d, '帮我重新规划整个行程', 't1');
    expect(live?.kind).toBe('GLOBAL_PLAN');
    if (live?.kind === 'GLOBAL_PLAN') {
      expect(live.smEntry).toBe('bound_trip_planning');
      expect(live.creOperation).toBe('OPTIMIZE_TRIP');
    }
    const entry = resolveOrchestrateEntry({
      tripId: 't1',
      message: '帮我重新规划整个行程',
      routingTaskType: 'DATA_LOOKUP',
    });
    expect(entry).toMatchObject({
      mode: 'PLANNING_STATE_MACHINE',
      entry: 'bound_trip_planning',
      reason: 'unified_intent_global_plan_takeover',
    });
  });

  it('P4：有 trip 但无规划动作 → 不再默认 TRIP_PLANNING', () => {
    const s = signalsFromRequest({
      request_id: 'r1',
      user_id: 'u1',
      trip_id: 't1',
      message: '你好',
    } as any);
    expect(s.taskType).toBe('DATA_LOOKUP');
  });

  it('CRE GLOBAL_PLAN → OPTIMIZE_TRIP', () => {
    const plan = buildContextRequirementPlan({
      message: '帮我重新规划整个行程',
      tripId: 't1',
      unifiedSemanticIntent: 'GLOBAL_PLAN',
      hints: { tripId: 't1', message: '帮我重新规划整个行程' },
    });
    expect(plan.operation).toBe('OPTIMIZE_TRIP');
    expect(plan.reason).toBe('unified_intent_global_plan');
  });
});

describe('P4 InteractionPolicy', () => {
  it('CONSULT + CRE ASK → ANSWER_WITH_LIMITS（不短路）', () => {
    const intent = resolveUnifiedIntent({
      message: '总体行程怎么样',
      tripId: 't1',
    });
    const plan = buildContextRequirementPlan({
      message: '把活动加到行程里',
      tripId: 't1',
      actionKind: 'LOCAL_ITINERARY_EDIT',
      unifiedSemanticIntent: 'CONSULT',
      hints: { tripId: 't1', message: '把活动加到行程里' },
    });
    /** 强制模拟 ASK 场景：用 LOCAL_EDIT 合同缺日 */
    const askPlan = buildContextRequirementPlan({
      message: '把冰川徒步加到行程里',
      tripId: 't1',
      actionKind: 'LOCAL_ITINERARY_EDIT',
      hints: { tripId: 't1', message: '把冰川徒步加到行程里' },
    });
    expect(askPlan.nextAction).toBe('ASK_USER');
    const ix = resolveCreInteractionPolicy({
      intent: { ...intent, semanticIntent: 'CONSULT' },
      plan: askPlan,
    });
    expect(ix.outcome).toBe('ANSWER_WITH_LIMITS');
    expect(interactionPolicyShouldShortCircuitAsk(ix)).toBe(false);
  });

  it('LOCAL_EDIT 缺目标日 → ASK_ONE_CRITICAL', () => {
    const intent = resolveUnifiedIntent({
      message: '帮我安排一个午餐',
      tripId: 't1',
    });
    /** 无 Day 锚点 */
    const plan = buildContextRequirementPlan({
      message: '帮我安排一个午餐',
      tripId: 't1',
      unifiedSemanticIntent: 'LOCAL_EDIT',
      hints: { tripId: 't1', message: '帮我安排一个午餐' },
    });
    expect(plan.operation).toBe('ADD_ACTIVITY_TO_DAY');
    const ix = resolveCreInteractionPolicy({ intent, plan });
    if (plan.nextAction === 'ASK_USER') {
      expect(ix.outcome).toBe('ASK_ONE_CRITICAL');
      expect(interactionPolicyShouldShortCircuitAsk(ix)).toBe(true);
    } else {
      /** 相对日 FETCHABLE 时可不追问 */
      expect(['CONTINUE', 'CREATE_DRAFT', 'FETCH_THEN_ANSWER']).toContain(ix.outcome);
    }
  });

  it('ROR 节奏缺口对 ASSESS → ANSWER_WITH_LIMITS', () => {
    const intent = resolveUnifiedIntent({
      message: '明天天气会影响行程吗？',
      tripId: 't1',
    });
    const snapshot = {
      unknowns: [
        {
          key: 'user.pacePreference',
          question: '您能接受几点到酒店？',
          mustAskUser: true,
        },
      ],
      nextActionAfterFreeze: 'ASK_USER',
    } as unknown as RorRealitySnapshot;
    const ix = resolveRorInteractionPolicy({ intent, snapshot });
    expect(ix.outcome).toBe('ANSWER_WITH_LIMITS');
    expect(interactionPolicyShouldShortCircuitAsk(ix)).toBe(false);
  });

  it('LOCAL_EDIT 优化第六天路线：ROR 固定订单/体能缺口软继续，勿 ASK 阻断', () => {
    const intent = resolveUnifiedIntent({
      message: '优化一下第六天的路线',
      tripId: 't1',
    });
    expect(intent.semanticIntent).toBe('LOCAL_EDIT');
    const snapshot = {
      operation: 'DAY_PACE',
      unknowns: [
        {
          key: 'booking.fixedCommitments',
          question: '是否有不可移动的订单',
          mustAskUser: true,
        },
        {
          key: 'team.memberCapability',
          question: '团队体能是否有限制',
          mustAskUser: true,
        },
        {
          key: 'route.travelTimeMatrix',
          question: '活动之间实际需要多少交通时间',
          mustAskUser: true,
        },
      ],
      nextActionAfterFreeze: 'ASK_USER',
    } as unknown as RorRealitySnapshot;
    const ix = resolveRorInteractionPolicy({ intent, snapshot });
    expect(ix.outcome).toBe('CONTINUE');
    expect(interactionPolicyShouldShortCircuitAsk(ix)).toBe(false);
    expect(ix.suppressedAskKeys?.length).toBeGreaterThan(0);
  });

  it('GLOBAL_PLAN REPLAN：改由 PLAN.DAY_REPLAN MDS takeover，InteractionPolicy defer', () => {
    const intent = resolveUnifiedIntent({
      message: '重新规划一下第一天',
      tripId: 't1',
    });
    expect(intent.semanticIntent).toBe('GLOBAL_PLAN');
    const {
      buildDecisionStateShadow,
      resolveDecisionTakeover,
    } = require('../decision-state') as typeof import('../decision-state');
    const shadow = buildDecisionStateShadow({
      message: '重新规划一下第一天',
      transportHints: { tripId: 't1', focusDayIndex: 1 },
      legacy: {
        wouldAskUser: true,
        blockKeys: [
          'team.memberCapability',
          'user.currentFatigue',
          'experience.physicalIntensity',
        ],
      },
    });
    expect(shadow.classified.decisionClass).toBe('PLAN.DAY_REPLAN');
    expect(resolveDecisionTakeover(shadow).kind).toBe('OBSERVE_ONLY_CONTINUE');
    const snapshot = {
      operation: 'DAY_PACE',
      unknowns: [
        {
          key: 'team.memberCapability',
          question: '团队体能是否有限制',
          mustAskUser: true,
        },
        {
          key: 'user.currentFatigue',
          question: '现在感觉累不累',
          mustAskUser: true,
        },
        {
          key: 'experience.physicalIntensity',
          question: '体验强度如何',
          mustAskUser: true,
        },
      ],
      nextActionAfterFreeze: 'ASK_USER',
    } as unknown as RorRealitySnapshot;
    const ix = resolveRorInteractionPolicy({
      intent,
      snapshot,
      decisionStateDefer: true,
    });
    expect(ix.outcome).toBe('CONTINUE');
    expect(ix.reason).toBe('decision_state_owns_ask');
    expect(interactionPolicyShouldShortCircuitAsk(ix)).toBe(false);
  });
});

describe('P4 ModeLock 意图族变化', () => {
  const baseSignals = {
    taskType: 'TRIP_PLANNING' as const,
    capability: 'PLANNING_AND_REVISION' as const,
    actionKind: 'FULL_TRIP_PLANNING' as const,
    risk: 'LOW' as const,
    needsAudit: false,
    latencyBudgetMs: 30_000,
    complexity: 'MODERATE' as const,
    requiresStructuredOutput: true,
    expectsToolCalls: true,
    legacyWellSupported: true,
    intent_mode_requested: 'AUTO' as const,
    intent_mode_resolved: 'TRIP_PLANNING' as const,
  };

  it('CONSULT 可旁路 ModeLock 锁死的 CLAUDE_SM', () => {
    const { routePolicy } = require('../routing/gateway-route-policy.util') as typeof import('../routing/gateway-route-policy.util');
    const { ModeLock } = require('../services/orchestration-stability.util') as typeof import('../services/orchestration-stability.util');
    const lock = new ModeLock();
    const ctx = {
      tripId: 't1',
      userId: 'u1',
      requestHash: 'h1',
      modeLockOperationId: 'planop:h1',
    };
    lock.set(ctx, 'CLAUDE_SM');
    const d = routePolicy(
      { ...process.env, ORCHESTRATION_MODE: 'CLAUDE_DYNAMIC' } as NodeJS.ProcessEnv,
      {},
      { ...baseSignals, taskType: 'DATA_LOOKUP', intent_mode_resolved: 'DATA_LOOKUP' },
      ctx,
      lock,
      undefined,
      { message: '总体行程怎么样', tripId: 't1' },
    );
    expect(
      d.matchedRules.some(
        (r) =>
          r === 'rule_mode_lock_bypass_readonly_unified_intent' ||
          r === 'rule_mode_lock_bypass_planning_admission_denied',
      ),
    ).toBe(true);
    expect(d.mode).not.toBe('CLAUDE_SM');
  });

  it('LOCAL_EDIT / GLOBAL_PLAN 可强制 ModeLock 离开 CLAUDE_DYNAMIC', () => {
    const { routePolicy } = require('../routing/gateway-route-policy.util') as typeof import('../routing/gateway-route-policy.util');
    const { ModeLock } = require('../services/orchestration-stability.util') as typeof import('../services/orchestration-stability.util');
    const lock = new ModeLock();
    const ctx = {
      tripId: 't1',
      userId: 'u1',
      requestHash: 'h2',
      modeLockOperationId: 'planop:h2',
    };
    lock.set(ctx, 'CLAUDE_DYNAMIC');
    for (const message of ['Day3行程我要安排午餐', '帮我重新规划整个行程'] as const) {
      const d = routePolicy(
        { ...process.env, ORCHESTRATION_MODE: 'CLAUDE_DYNAMIC' } as NodeJS.ProcessEnv,
        {},
        baseSignals,
        ctx,
        lock,
        undefined,
        { message, tripId: 't1' },
      );
      expect(d.mode).toBe('CLAUDE_SM');
      expect(d.matchedRules).toContain('rule_mode_lock_force_sm_for_unified_edit_or_assess');
    }
  });

  it('无 trip 的 GLOBAL_PLAN 不误接管，保留 new_trip country', () => {
    const live = tryLiveRouteTakeover(
      resolveUnifiedIntent({ message: '规划冰岛7日行程', tripId: null }),
      '规划冰岛7日行程',
      null,
    );
    expect(live).toBeNull();
    const entry = resolveOrchestrateEntry({
      tripId: '',
      message: '规划冰岛7日行程',
      routingTaskType: 'TRIP_PLANNING',
      extractCountryCode: () => 'IS',
    });
    expect(entry).toMatchObject({
      mode: 'PLANNING_STATE_MACHINE',
      entry: 'new_trip_with_country',
      countryCode: 'IS',
    });
  });

  it('「把第2天行程轻松一点」仍为 LOCAL_EDIT 而非 GLOBAL_PLAN', () => {
    const d = resolveUnifiedIntent({ message: '把第2天行程轻松一点', tripId: 't1' });
    expect(d.semanticIntent).toBe('LOCAL_EDIT');
  });
});
