// src/trips/decision/decision-log.ts

/**
 * Decision Log - "自我纠偏"的证据链
 * 
 * 每次计划生成/修复都可审计、可回放、可学习
 */

import { ISODatetime, ISODate } from './world-model';
import { TripPlan } from './plan-model';

export type DecisionTrigger =
  | 'initial_generate'
  | 'user_edit'
  | 'signal_update'        // weather / alerts update
  | 'availability_update'  // opening hours / inventory change
  | 'time_overrun'
  | 'budget_overrun'
  | 'manual_repair';

export interface ConstraintViolation {
  code: string;                 // e.g., 'CLOSED', 'WEATHER_UNSAFE', 'TIME_WINDOW_MISS'
  date?: ISODate;
  slotId?: string;
  details?: Record<string, any>;
}

export interface PlanDiffSummary {
  changedSlots: number;
  movedSlots: number;
  removedSlots: number;
  addedSlots: number;
  // min-edit style: quantify "改动幅度"
  editDistanceScore: number; // smaller = less change
}

export interface DecisionRunLog {
  runId: string;
  at: ISODatetime;
  trigger: DecisionTrigger;

  plannerVersion: string;
  strategyMix: Array<'abu' | 'drdre' | 'neptune'>;

  // key inputs snapshot (keep small, store full snapshot in DB if needed)
  inputDigest: {
    tripId?: string;
    destination: string;
    startDate: ISODate;
    durationDays: number;
    signalUpdatedAt: ISODatetime;
  };

  violations?: ConstraintViolation[];
  chosenActions: Array<{
    actionType: 'prioritize' | 'drop' | 'swap' | 'reorder' | 'insert_buffer' | 'shorten';
    reasonCodes: string[];
    payload: Record<string, any>;
  }>;

  predictedImpact?: {
    costChange?: number;
    activeMinutesChange?: number;
    travelMinutesChange?: number;
    robustnessChange?: number;
  };

  diff?: PlanDiffSummary;

  // optional: store old/new plan refs
  planBeforeRef?: string;
  planAfterRef?: string;

  // quick explain to UI
  explanation?: string;

  // RouteDirection selection info (for E2E testing and observability)
  routeDirection?: {
    selected: {
      id: number;
      uuid?: string;
      name?: string;
      nameCN?: string;
    };
    scoreBreakdown?: {
      tagMatch?: {
        score: number;
        matchedTags?: string[];
      };
      seasonMatch?: {
        score: number;
        month?: number;
        bestMonths?: number[];
      };
      paceMatch?: {
        score: number;
        userPace?: string;
        routePace?: string;
      };
      riskMatch?: {
        score: number;
        userRiskTolerance?: string;
        routeRiskLevel?: string;
      };
      totalScore?: number;
    };
    constraints?: Record<string, any>;
    matchedSignals?: Record<string, any>;
  };
}

