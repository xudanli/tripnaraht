/**
 * P5：旧 keyword 路由补丁收敛 — 统一意图扩面 + RequestRouter 去特判。
 */

import { resolveUnifiedIntent } from './unified-intent.resolver';
import { tryLiveRouteTakeover } from './unified-intent.execution-route';
import { resolveOrchestrateEntry } from '../routing/request-router.util';
import { buildContextRequirementPlan } from '../context-requirement/context-requirement.service';
import { signalsFromRequest } from '../utils/orchestration-signals.util';

describe('P5 legacy patch retirement', () => {
  it.each([
    { msg: 'Day1 会不会太赶', intent: 'CONSULT' as const },
    { msg: '帮我找附近的午餐', intent: 'CONSULT' as const },
    { msg: '详细6天住宿和餐饮方案', intent: 'CONSULT' as const },
    { msg: '明天天气会影响行程吗？', intent: 'ASSESS_IMPACT' as const },
    { msg: 'Day3行程我要安排午餐', intent: 'LOCAL_EDIT' as const },
  ])('$msg → $intent + live takeover', ({ msg, intent }) => {
    const d = resolveUnifiedIntent({ message: msg, tripId: 't1' });
    expect(d.semanticIntent).toBe(intent);
    expect(d.confidence).toBeGreaterThanOrEqual(0.75);
    const live = tryLiveRouteTakeover(d, msg, 't1');
    expect(live?.kind).toBe(intent);
  });

  it('天气影响不再依赖 bound_trip_weather_impact_assessment reason', () => {
    const entry = resolveOrchestrateEntry({
      tripId: 't1',
      message: '明天天气会影响行程吗？',
      routingTaskType: 'DATA_LOOKUP',
    });
    expect(entry).toMatchObject({
      mode: 'PLANNING_STATE_MACHINE',
      reason: 'unified_intent_assess_impact_takeover',
    });
    expect(String(entry.reason)).not.toContain('weather_impact');
  });

  it('局部改排不再依赖 bound_trip_adjust_overrides_* reason', () => {
    const entry = resolveOrchestrateEntry({
      tripId: 't1',
      message: '把第2天行程轻松一点',
      routingTaskType: 'DATA_LOOKUP',
    });
    expect(entry).toMatchObject({
      mode: 'PLANNING_STATE_MACHINE',
      entry: 'bound_trip_itinerary_adjust',
      reason: 'unified_intent_local_edit_takeover',
    });
    expect(String(entry.reason)).not.toContain('adjust_overrides');
  });

  it('节奏诊断 CRE 走 unified CONSULT，而非 day_pace_assessment keyword', () => {
    const d = resolveUnifiedIntent({ message: 'Day1 会不会太赶', tripId: 't1' });
    const plan = buildContextRequirementPlan({
      message: 'Day1 会不会太赶',
      tripId: 't1',
      unifiedSemanticIntent: d.semanticIntent,
      hints: { tripId: 't1', message: 'Day1 会不会太赶' },
    });
    expect(plan.operation).toBe('ASK_TRIP_QUESTION');
    expect(plan.reason).toBe('unified_intent_consult');
  });

  it('餐饮检索 taskType 为 DATA_LOOKUP（非默认规划）', () => {
    const s = signalsFromRequest({
      request_id: 'r1',
      user_id: 'u1',
      trip_id: 't1',
      message: '帮我找附近的午餐',
    } as any);
    expect(s.taskType).toBe('DATA_LOOKUP');
  });

  it('「我是不是要先去预订车呢？」→ CONSULT 轻量，不进全量 SM', () => {
    const msg = '我是不是要先去预订车呢？';
    const d = resolveUnifiedIntent({ message: msg, tripId: 't1' });
    expect(d.semanticIntent).toBe('CONSULT');
    expect(d.confidence).toBeGreaterThanOrEqual(0.75);
    expect(d.topic).toBe('VEHICLE');
    const live = tryLiveRouteTakeover(d, msg, 't1');
    expect(live?.kind).toBe('CONSULT');
    const entry = resolveOrchestrateEntry({
      tripId: 't1',
      message: msg,
      routingTaskType: 'DATA_LOOKUP',
    });
    expect(entry.mode).toBe('LIGHTWEIGHT');
    expect(entry.reason).toBe('unified_intent_consult_readonly_takeover');
  });

  it('无 trip 规划仍走 new_trip_with_country', () => {
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
});
