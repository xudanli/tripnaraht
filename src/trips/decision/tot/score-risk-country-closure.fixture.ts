/**
 * scoreRisk v2：与 decision-closure 国家包 golden 对齐的路政/天气 stress 场景。
 */
import type { OptimizationResult } from '../../../itinerary-optimization/interfaces/plan-request.interface';
import type { TripPlan } from '../plan-model';
import type { ActivityCandidate, TripWorldState } from '../world-model';
import type { ScoreRiskCalibrationScenario } from './score-risk-calibration.fixture';

function closureStressWorld(params: {
  destination: string;
  startDate: string;
  countryLabel: string;
}): TripWorldState {
  return {
    context: {
      destination: params.destination,
      startDate: params.startDate,
      durationDays: 5,
      preferences: {
        intents: { nature: 0.7, scenic: 0.6 },
        pace: 'moderate',
        riskTolerance: 'low',
      },
    },
    candidatesByDate: {
      [params.startDate]: [
        {
          id: 'poi-scenic-drive',
          name: { en: `${params.countryLabel} scenic drive` },
          type: 'sightseeing',
          durationMin: 240,
          riskLevel: 'high',
          weatherSensitivity: 3,
          inventoryRisk: 3,
          requiresBooking: true,
        } satisfies ActivityCandidate,
      ],
    },
    signals: { lastUpdatedAt: `${params.startDate}T08:00:00.000Z` },
  } as TripWorldState;
}

function closureStressPlan(startDate: string): TripPlan {
  return {
    days: [{ date: startDate, timeSlots: [{ id: 's1', time: '09:00', poiId: 'poi-scenic-drive' }] }],
    metrics: { robustnessScore: 0.35 },
  } as TripPlan;
}

function roadClosedOptimization(slackMin: number): OptimizationResult {
  return {
    robustness: {
      top3_min_slack_nodes: [{ slack_min: slackMin }],
      risk_level: 'high',
      total_buffer_minutes: 20,
    },
    diagnostics: {
      critical_windows: [{ slack_to_close_min: Math.max(5, slackMin - 2) }],
    },
  } as OptimizationResult;
}

/** 与 COUNTRY_DECISION_CLOSURE_FIXTURES 路政 golden 对齐的 scoreRisk stress 场景 */
export const SCORE_RISK_COUNTRY_CLOSURE_SCENARIOS: readonly ScoreRiskCalibrationScenario[] = [
  {
    id: 'country-nz-sh94-closure-stress',
    description: 'NZ Milford SH94 封路 stress（低 slack + 高活动风险）',
    world: closureStressWorld({
      destination: 'Fiordland NZ',
      startDate: '2026-03-12',
      countryLabel: 'Milford',
    }),
    plan: closureStressPlan('2026-03-12'),
    optimizationResult: roadClosedOptimization(12),
    maxScore: 0.52,
  },
  {
    id: 'country-au-b100-closure-stress',
    description: 'AU Great Ocean Road B100 山火封路 stress',
    world: closureStressWorld({
      destination: 'Great Ocean Road AU',
      startDate: '2026-01-18',
      countryLabel: 'GOR',
    }),
    plan: closureStressPlan('2026-01-18'),
    optimizationResult: roadClosedOptimization(10),
    maxScore: 0.52,
  },
  {
    id: 'country-jp-route134-closure-stress',
    description: 'JP 伊豆 Route 134 台风雨封路 stress',
    world: closureStressWorld({
      destination: 'Izu Peninsula JP',
      startDate: '2026-09-15',
      countryLabel: 'Izu',
    }),
    plan: closureStressPlan('2026-09-15'),
    optimizationResult: roadClosedOptimization(8),
    maxScore: 0.52,
  },
];
