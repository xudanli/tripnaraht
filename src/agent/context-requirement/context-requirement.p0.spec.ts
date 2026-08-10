/**
 * CRE P0 验收：合同展开、汉堡问答瘦身、加活动缺口闸。
 */

import {
  expandCreContractFields,
  getCreContextContract,
} from './context-contract.registry';
import {
  buildContextRequirementPlan,
  serializeCrePlanForObservability,
} from './context-requirement.service';
import { resolveCreOperation } from './operation-resolver.util';
import { buildCreAskUserResult } from '../routing/cre-ask-user-result.util';

describe('Context Requirement Engine P0', () => {
  describe('contract registry', () => {
    it('ASK_TRIP_QUESTION 合同不含 DayPlan / 车辆', () => {
      const c = getCreContextContract('ASK_TRIP_QUESTION');
      const keys = c.fields.map((f) => f.key);
      expect(keys).toContain('trip.destination');
      expect(keys).not.toContain('targetDay.activities');
      expect(keys).not.toContain('vehicle.profile');
      expect(keys).not.toContain('roadConditions');
    });

    it('ADD_ACTIVITY_TO_DAY 在自驾+户外时展开 CONDITIONAL 字段', () => {
      const c = getCreContextContract('ADD_ACTIVITY_TO_DAY');
      const expanded = expandCreContractFields(c, {
        travelMode: 'SELF_DRIVE',
        containsOutdoorActivity: true,
        containsReservableActivity: false,
      });
      const keys = expanded.map((f) => f.key);
      expect(keys).toContain('vehicle.profile');
      expect(keys).toContain('roadConditions');
      expect(keys).toContain('participants.fitnessProfile');
      expect(keys).not.toContain('booking.availability');
    });

    it('同一 operation 的 required 列表可静态读出', () => {
      const required = getCreContextContract('ADD_ACTIVITY_TO_DAY')
        .fields.filter((f) => f.necessity === 'REQUIRED')
        .map((f) => f.key);
      expect(required).toEqual(
        expect.arrayContaining([
          'trip.id',
          'targetDay.date',
          'targetDay.activities',
          'experience.product',
          'participants',
        ]),
      );
    });
  });

  describe('operation resolver + hamburger', () => {
    it('「我想吃汉堡」→ ASK_TRIP_QUESTION，无 BLOCKING，slimLoad', () => {
      const plan = buildContextRequirementPlan({
        message: '我想吃汉堡',
        tripId: '5945a3ab-75d2-4911-ae82-9647c8c29e96',
        routingTaskType: 'DATA_LOOKUP',
        actionKind: 'TRIP_SCOPED_CONSULTATION',
        hints: {
          tripId: '5945a3ab-75d2-4911-ae82-9647c8c29e96',
          destinationKnown: true,
          message: '我想吃汉堡',
        },
      });
      expect(plan.operation).toBe('ASK_TRIP_QUESTION');
      expect(plan.blockingGaps).toEqual([]);
      expect(plan.nextAction).toBe('ANSWER');
      expect(plan.acquisition.slimLoad).toBe(true);
      expect(plan.acquisition.skipRisksRag).toBe(true);
      expect(plan.acquisition.skipQueryExpansion).toBe(true);
      expect(plan.requirements.every((r) => r.key !== 'vehicle.profile')).toBe(true);
      expect(plan.requirements.every((r) => r.key !== 'targetDay.activities')).toBe(true);
    });

    it('咨询信号优先于未识别话术', () => {
      const op = resolveCreOperation({
        message: '附近有什么好吃的',
        tripId: 't1',
        routingTaskType: 'GENERIC_QA',
        actionKind: 'TRIP_SCOPED_CONSULTATION',
      });
      expect(op.operation).toBe('ASK_TRIP_QUESTION');
    });
  });

  describe('dining consultation vs planning fallback', () => {
    it('「帮我找附近的午餐」在 FULL_TRIP_PLANNING 下仍走 ASK_TRIP_QUESTION（slim，不进 ROR 节奏追问）', () => {
      const plan = buildContextRequirementPlan({
        message: '帮我找附近的午餐',
        tripId: 't1',
        actionKind: 'FULL_TRIP_PLANNING',
        routingTaskType: 'TRIP_PLANNING',
        hints: { tripId: 't1', message: '帮我找附近的午餐' },
      });
      expect(plan.operation).toBe('ASK_TRIP_QUESTION');
      expect(plan.acquisition.slimLoad).toBe(true);
      expect(plan.nextAction).not.toBe('ASK_USER');
    });
  });

  describe('trip overview consultation vs planning fallback', () => {
    it('「总体行程」在 FULL_TRIP_PLANNING 下仍走 ASK_TRIP_QUESTION（slim，不进 ROR DAY_PACE ASK）', () => {
      const plan = buildContextRequirementPlan({
        message: '总体行程',
        tripId: 't1',
        actionKind: 'FULL_TRIP_PLANNING',
        routingTaskType: 'TRIP_PLANNING',
        hints: { tripId: 't1', message: '总体行程' },
      });
      expect(plan.operation).toBe('ASK_TRIP_QUESTION');
      expect(plan.acquisition.slimLoad).toBe(true);
      expect(plan.nextAction).not.toBe('ASK_USER');
    });

    it('「最大的问题是什么」在 FULL_TRIP_PLANNING 下仍走 ASK_TRIP_QUESTION（勿 DAY_PACE ASK）', () => {
      const msg = '我这个行程现在最大的问题是什么？';
      const plan = buildContextRequirementPlan({
        message: msg,
        tripId: 't1',
        actionKind: 'FULL_TRIP_PLANNING',
        routingTaskType: 'TRIP_PLANNING',
        hints: { tripId: 't1', message: msg },
      });
      expect(plan.operation).toBe('ASK_TRIP_QUESTION');
      expect(plan.acquisition.slimLoad).toBe(true);
      expect(plan.nextAction).not.toBe('ASK_USER');
      expect(plan.reason).toBe('trip_status_overview_consultation');
    });

    it('「day1会不会太赶」走 ASK_TRIP_QUESTION slim（勿 OPTIMIZE_DAY / 全量 PLAN_GEN）', () => {
      const msg = 'day1会不会太赶';
      const plan = buildContextRequirementPlan({
        message: msg,
        tripId: 't1',
        actionKind: 'SAFETY_OR_TRADEOFF_REVIEW',
        routingTaskType: 'TRIP_PLANNING',
        hints: { tripId: 't1', focusDayIndex: 1, message: msg },
      });
      expect(plan.operation).toBe('ASK_TRIP_QUESTION');
      expect(plan.reason).toBe('day_pace_assessment');
      expect(plan.acquisition.slimLoad).toBe(true);
      expect(plan.target.dayIndex).toBe(1);
      expect(plan.nextAction).not.toBe('ASK_USER');
    });

    it('「给我推荐19号的酒店」仍 ASK_TRIP_QUESTION 但关闭 slimLoad（须跑 hotel MCP）', () => {
      const plan = buildContextRequirementPlan({
        message: '给我推荐19号的酒店',
        tripId: 't1',
        unifiedSemanticIntent: 'CONSULT',
        routingTaskType: 'DATA_LOOKUP',
        hints: { tripId: 't1', message: '给我推荐19号的酒店' },
      });
      expect(plan.operation).toBe('ASK_TRIP_QUESTION');
      expect(plan.acquisition.slimLoad).toBe(false);
    });

    it('「推荐租车公司」仍 ASK_TRIP_QUESTION 但关闭 slimLoad（须跑 car_rental MCP / 卡片）', () => {
      const plan = buildContextRequirementPlan({
        message: '推荐租车公司',
        tripId: 't1',
        unifiedSemanticIntent: 'CONSULT',
        routingTaskType: 'DATA_LOOKUP',
        hints: { tripId: 't1', message: '推荐租车公司' },
      });
      expect(plan.operation).toBe('ASK_TRIP_QUESTION');
      expect(plan.acquisition.slimLoad).toBe(false);
    });
  });

  describe('weather impact vs slim consultation', () => {
    it('「明天天气会影响行程吗」→ CHECK_EXECUTABILITY，非 slim，不因缺日 ASK_USER', () => {
      const plan = buildContextRequirementPlan({
        message: '明天天气会影响行程吗？',
        tripId: 't1',
        actionKind: 'SAFETY_OR_TRADEOFF_REVIEW',
        routingTaskType: 'TRIP_PLANNING',
        hints: { tripId: 't1', message: '明天天气会影响行程吗？' },
      });
      expect(plan.operation).toBe('CHECK_EXECUTABILITY');
      expect(plan.reason).toBe('weather_impact_on_itinerary');
      expect(plan.acquisition.slimLoad).toBe(false);
      expect(plan.nextAction).not.toBe('ASK_USER');
      expect(plan.requirements.some((r) => r.key === 'weather.forecast')).toBe(true);
    });
  });

  describe('ADD_ACTIVITY_TO_DAY gaps', () => {
    it('「把冰川徒步排到第 3 天」识别操作与目标日', () => {
      const op = resolveCreOperation({
        message: '把冰川徒步排到第 3 天',
        tripId: 't1',
        actionKind: 'LOCAL_ITINERARY_EDIT',
      });
      expect(op.operation).toBe('ADD_ACTIVITY_TO_DAY');
      expect(op.target.dayIndex).toBe(3);
    });

    it('缺目标日时 ASK_USER，不直接进 Gate/Solver', () => {
      const plan = buildContextRequirementPlan({
        message: '把冰川徒步加到行程里',
        tripId: 't1',
        actionKind: 'LOCAL_ITINERARY_EDIT',
        hints: {
          tripId: 't1',
          message: '把冰川徒步加到行程里',
          containsOutdoorActivity: true,
        },
      });
      expect(plan.operation).toBe('ADD_ACTIVITY_TO_DAY');
      expect(plan.nextAction).toBe('ASK_USER');
      expect(plan.blockingGaps.some((g) => g.key === 'targetDay.date')).toBe(true);
    });

    it('有目标日但未装载 DayPlan/产品时走 FETCH_CONTEXT', () => {
      const plan = buildContextRequirementPlan({
        message: '把冰川徒步排到第 3 天',
        tripId: 't1',
        actionKind: 'LOCAL_ITINERARY_EDIT',
        hints: {
          tripId: 't1',
          message: '把冰川徒步排到第 3 天',
          focusDayIndex: 3,
          containsOutdoorActivity: true,
        },
      });
      expect(plan.operation).toBe('ADD_ACTIVITY_TO_DAY');
      expect(plan.blockingGaps).toEqual([]);
      expect(plan.nextAction).toBe('FETCH_CONTEXT');
      expect(plan.acquisition.fetchKeys).toEqual(
        expect.arrayContaining(['targetDay.activities', 'experience.product', 'participants']),
      );
    });
  });

  describe('observability + ASK_USER short-circuit', () => {
    it('serializeCrePlanForObservability 含 operation/requirements/nextAction', () => {
      const plan = buildContextRequirementPlan({
        message: '我想吃汉堡',
        tripId: 't1',
        routingTaskType: 'DATA_LOOKUP',
        actionKind: 'TRIP_SCOPED_CONSULTATION',
        hints: { tripId: 't1', destinationKnown: true, message: '我想吃汉堡' },
      });
      const obs = serializeCrePlanForObservability(plan);
      expect(obs.operation).toBe('ASK_TRIP_QUESTION');
      expect(obs.nextAction).toBe('ANSWER');
      expect(Array.isArray(obs.requirements)).toBe(true);
      expect(Array.isArray(obs.blockingGaps)).toBe(true);
    });

    it('ASK_USER 短路结果禁止进 Solver，并带可审计 plan', () => {
      const plan = buildContextRequirementPlan({
        message: '把冰川徒步加到行程里',
        tripId: 't1',
        actionKind: 'LOCAL_ITINERARY_EDIT',
        hints: {
          tripId: 't1',
          message: '把冰川徒步加到行程里',
          containsOutdoorActivity: true,
        },
      });
      expect(plan.nextAction).toBe('ASK_USER');
      const result = buildCreAskUserResult({
        request: {
          request_id: 'req-cre-1',
          user_id: 'u1',
          message: '把冰川徒步加到行程里',
          trip_id: 't1',
        } as any,
        plan,
        startTime: Date.now() - 10,
      });
      expect(result.status).toBe('NEED_USER_INPUT');
      expect(result.result?.needsUserConfirmation).toBe(true);
      expect((result.result as any)?.contextRequirementPlan?.operation).toBe(
        'ADD_ACTIVITY_TO_DAY',
      );
      expect(result.decisionLog?.[0]?.metadata?.context_requirement_plan).toBeTruthy();
    });
  });
});
