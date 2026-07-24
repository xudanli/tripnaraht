/**
 * scoreRisk 阈值校准场景（离线 golden，供报告与单调性门禁）。
 */
import type { OptimizationResult } from '../../../itinerary-optimization/interfaces/plan-request.interface';
import type { TripPlan } from '../plan-model';
import type { ActivityCandidate, TripWorldState, UserPreferenceProfile } from '../world-model';

function baseWorld(prefs?: Partial<UserPreferenceProfile>): TripWorldState {
  return {
    context: {
      destination: 'calibration-fixture',
      startDate: '2026-03-12',
      durationDays: 5,
      preferences: {
        intents: { nature: 0.8 },
        pace: 'moderate',
        riskTolerance: 'medium',
        ...prefs,
      },
    },
    candidatesByDate: {
      '2026-03-12': [
        {
          id: 'poi-glacier',
          name: { en: 'Glacier Hike' },
          type: 'nature',
          durationMin: 180,
          riskLevel: 'high',
          weatherSensitivity: 3,
          inventoryRisk: 4,
          bookingDifficulty: 3,
          requiresBooking: true,
        } satisfies ActivityCandidate,
      ],
      '2026-03-13': [
        {
          id: 'poi-drive',
          name: { en: 'Scenic Drive' },
          type: 'sightseeing',
          durationMin: 120,
          riskLevel: 'low',
          weatherSensitivity: 1,
        } satisfies ActivityCandidate,
      ],
    },
    signals: { lastUpdatedAt: '2026-03-12T08:00:00.000Z' },
  } as TripWorldState;
}

function basePlan(robustnessScore = 0.5): TripPlan {
  return {
    days: [
      {
        date: '2026-03-12',
        timeSlots: [{ id: 's1', time: '09:00', poiId: 'poi-glacier' }],
      },
      {
        date: '2026-03-13',
        timeSlots: [{ id: 's2', time: '10:00', poiId: 'poi-drive' }],
      },
    ],
    metrics: { robustnessScore },
  } as TripPlan;
}

export type ScoreRiskCalibrationScenario = {
  id: string;
  description: string;
  world: TripWorldState;
  plan: TripPlan;
  optimizationResult?: OptimizationResult;
  /** 期望 score 上界（含） */
  maxScore?: number;
  /** 期望 score 下界（含） */
  minScore?: number;
};

export const SCORE_RISK_CALIBRATION_SCENARIOS: readonly ScoreRiskCalibrationScenario[] = [
  {
    id: 'baseline-relaxed-medium-tolerance',
    description: '中等风险活动 + 充足 slack + 中等风险容忍',
    world: baseWorld(),
    plan: basePlan(0.55),
    optimizationResult: {
      robustness: {
        top3_min_slack_nodes: [{ slack_min: 90 }],
        risk_level: 'low',
        total_buffer_minutes: 120,
      },
      diagnostics: { critical_windows: [] },
    } as unknown as OptimizationResult,
    minScore: 0.45,
  },
  {
    id: 'tight-slack-storm-window',
    description: '关键窗 slack=10min + 高风险等级 → 紧张度拉高',
    world: baseWorld({ riskTolerance: 'low' }),
    plan: basePlan(0.4),
    optimizationResult: {
      robustness: {
        top3_min_slack_nodes: [{ slack_min: 10 }],
        risk_level: 'high',
        total_buffer_minutes: 15,
      },
      diagnostics: {
        critical_windows: [{ slack_to_close_min: 8 }],
      },
    } as unknown as OptimizationResult,
    maxScore: 0.55,
  },
  {
    id: 'high-activity-risk-low-tolerance',
    description: '高风险活动 + 低容忍用户 → sRiskBase 惩罚加重',
    world: baseWorld({ riskTolerance: 'low', pace: 'intense' }),
    plan: basePlan(0.35),
    optimizationResult: {
      robustness: {
        top3_min_slack_nodes: [{ slack_min: 25 }],
        risk_level: 'medium',
        total_buffer_minutes: 30,
      },
    } as unknown as OptimizationResult,
    maxScore: 0.56,
  },
  {
    id: 'buffered-robust-plan',
    description: '大 buffer + 高 robustnessScore → sRobust 抬升',
    world: baseWorld({ riskTolerance: 'high', pace: 'relaxed' }),
    plan: basePlan(0.85),
    optimizationResult: {
      robustness: {
        top3_min_slack_nodes: [{ slack_min: 120 }],
        risk_level: 'low',
        total_buffer_minutes: 180,
      },
    } as unknown as OptimizationResult,
    minScore: 0.55,
  },
];
