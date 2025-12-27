// src/trips/decision/tot/__tests__/fixtures/test-fixtures.ts

/**
 * 黄金单测夹具
 * 
 * 6 个典型 plan/world 场景，用于保证调参不翻车
 */

import { TripWorldState, TripContextState, UserPreferenceProfile, ActivityCandidate } from '../../../world-model';
import { TripPlan, PlanDay, PlanSlot } from '../../../plan-model';

/**
 * 1. Baseline 可行（moderate、预算中、无硬节点）
 */
export function createBaselineFixture(): { world: TripWorldState; plan: TripPlan } {
  const preferences: UserPreferenceProfile = {
    intents: { nature: 0.8, culture: 0.4 },
    pace: 'moderate',
    riskTolerance: 'medium',
    maxDailyActiveMinutes: 480,
  };

  const context: TripContextState = {
    destination: 'Iceland',
    startDate: '2026-01-01',
    durationDays: 3,
    budget: {
      amount: 1500,
      currency: 'USD',
      style: 'medium',
    },
    preferences,
  };

  const world: TripWorldState = {
    context,
    candidatesByDate: {
      '2026-01-01': [
        createActivityCandidate('poi1', 'Geysir', { nature: 0.9 }, 0.8, 0.7),
        createActivityCandidate('poi2', 'Gullfoss', { nature: 0.9 }, 0.9, 0.8),
      ],
    },
    signals: {
      lastUpdatedAt: new Date().toISOString(),
    },
    policies: {
      dayStart: '09:00',
      dayEnd: '18:00',
      bufferMinBetweenActivities: 15,
    },
  };

  const plan: TripPlan = {
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    days: [
      {
        day: 1,
        date: '2026-01-01',
        timeSlots: [
          createPlanSlot('slot1', '09:00', '10:00', 'Geysir', 'poi1'),
          createPlanSlot('slot2', '11:00', '12:00', 'Gullfoss', 'poi2'),
        ],
      },
    ],
    metrics: {
      estTotalCost: 100,
      estActiveMinutes: 120,
      estTravelMinutes: 60,
      robustnessScore: 0.8,
    },
  };

  return { world, plan };
}

/**
 * 2. 超预算（验证 cost 指数惩罚）
 */
export function createOverBudgetFixture(): { world: TripWorldState; plan: TripPlan } {
  const { world, plan } = createBaselineFixture();
  
  // 修改预算为 100，但计划成本为 200
  world.context.budget = {
    amount: 100,
    currency: 'USD',
    style: 'medium',
  };
  
  plan.metrics = {
    ...plan.metrics,
    estTotalCost: 200, // 超预算 100%
  };

  return { world, plan };
}

/**
 * 3. 低风险容忍 + 高风险活动（risk 应明显掉）
 */
export function createLowRiskToleranceFixture(): { world: TripWorldState; plan: TripPlan } {
  const { world, plan } = createBaselineFixture();
  
  // 设置低风险容忍度
  world.context.preferences.riskTolerance = 'low';
  
  // 添加高风险活动
  const highRiskActivity = createActivityCandidate(
    'poi3',
    'Glacier Hike',
    { nature: 0.9 },
    0.7,
    0.6
  );
  highRiskActivity.riskLevel = 'high';
  highRiskActivity.weatherSensitivity = 3;
  highRiskActivity.inventoryRisk = 4;
  
  world.candidatesByDate['2026-01-01'].push(highRiskActivity);
  
  plan.days[0].timeSlots.push(
    createPlanSlot('slot3', '14:00', '17:00', 'Glacier Hike', 'poi3')
  );

  return { world, plan };
}

/**
 * 4. 时间窗很紧（slack<30 → time/risk 下滑）
 */
export function createTightTimeWindowFixture(): { world: TripWorldState; plan: TripPlan } {
  const { world, plan } = createBaselineFixture();
  
  // 压缩时间窗
  world.policies = {
    dayStart: '09:00',
    dayEnd: '12:00', // 只有 3 小时
    bufferMinBetweenActivities: 5,
  };
  
  // 计划很满，几乎没有 slack
  plan.metrics = {
    ...plan.metrics,
    estActiveMinutes: 150,
    estTravelMinutes: 30,
  };

  return { world, plan };
}

/**
 * 5. 有 anchors/locked（w_req 下限生效，丢硬点直接 hard gate）
 */
export function createAnchorsFixture(): { world: TripWorldState; plan: TripPlan } {
  const { world, plan } = createBaselineFixture();
  
  // 添加固定事件
  world.context.anchors = {
    fixedEvents: [
      {
        date: '2026-01-01',
        start: '10:00',
        end: '11:00',
        title: 'Hotel Check-in',
      },
    ],
  };
  
  // 标记第一个 slot 为 locked
  plan.days[0].timeSlots[0].locked = true;
  plan.days[0].timeSlots[0].priorityTag = 'anchor';

  return { world, plan };
}

/**
 * 6. 同类活动过多 + dislike 命中（pref 被扣）
 */
export function createLowDiversityFixture(): { world: TripWorldState; plan: TripPlan } {
  const { world, plan } = createBaselineFixture();
  
  // 设置 dislike tags
  world.context.preferences.dislikeTags = ['museum'];
  
  // 添加多个同类活动（都是 nature）
  const natureActivities = [
    createActivityCandidate('poi3', 'Waterfall 1', { nature: 0.9 }, 0.7, 0.6),
    createActivityCandidate('poi4', 'Waterfall 2', { nature: 0.9 }, 0.7, 0.6),
    createActivityCandidate('poi5', 'Waterfall 3', { nature: 0.9 }, 0.7, 0.6),
  ];
  
  world.candidatesByDate['2026-01-01'].push(...natureActivities);
  
  // 添加一个 dislike 的活动
  const museumActivity = createActivityCandidate(
    'poi6',
    'Museum',
    { culture: 0.8, museum: 1.0 },
    0.6,
    0.5
  );
  world.candidatesByDate['2026-01-01'].push(museumActivity);
  
  // 计划中包含这些活动
  plan.days[0].timeSlots.push(
    createPlanSlot('slot3', '13:00', '14:00', 'Waterfall 1', 'poi3'),
    createPlanSlot('slot4', '15:00', '16:00', 'Waterfall 2', 'poi4'),
    createPlanSlot('slot5', '17:00', '18:00', 'Museum', 'poi6'), // dislike
  );

  return { world, plan };
}

// Helper functions

function createActivityCandidate(
  id: string,
  name: string,
  intentTags: Record<string, number>,
  qualityScore: number,
  uniquenessScore: number
): ActivityCandidate {
  return {
    id,
    name: { en: name },
    type: 'nature',
    durationMin: 60,
    intentTags: Object.keys(intentTags),
    qualityScore,
    uniquenessScore,
    cost: {
      amount: 50,
      currency: 'USD',
    },
    riskLevel: 'low',
    weatherSensitivity: 1,
  };
}

function createPlanSlot(
  id: string,
  time: string,
  endTime: string,
  title: string,
  poiId: string
): PlanSlot {
  return {
    id,
    time,
    endTime,
    title,
    type: 'sightseeing',
    poiId,
  };
}

