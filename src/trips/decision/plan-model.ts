// src/trips/decision/plan-model.ts

/**
 * Plan Model - 可执行的计划输出结构
 * 
 * 贴近现有 days -> timeSlots 结构，增强决策信息
 */

import { ActivityType, GeoPoint, ISODate, ISOTime, TravelLeg } from './world-model';

export interface PlanSlot {
  id: string;
  time: ISOTime;                 // keep your current field
  endTime?: ISOTime;             // optional but strongly recommended
  title: string;
  type: ActivityType;

  poiId?: string;                // link back to ActivityCandidate.id
  coordinates?: GeoPoint;

  // optional enriched details
  travelLegFromPrev?: TravelLeg;
  notes?: string;

  // for governance & repair
  locked?: boolean;              // user locked / booked
  priorityTag?: 'anchor' | 'core' | 'optional';
  reasons?: string[];            // explainability
}

export interface PlanDay {
  day: number;
  date: ISODate;
  timeSlots: PlanSlot[];
  // Terrain facts for the day (at least maxElevation/totalAscent for E2E testing)
  terrainFacts?: {
    maxElevation?: number; // 最高海拔（米）
    totalAscent?: number;   // 累计爬升（米）
    minElevation?: number; // 最低海拔（米）
    totalDescent?: number; // 累计下降（米）
    effortLevel?: 'RELAX' | 'MODERATE' | 'CHALLENGE' | 'EXTREME';
    riskFlags?: Array<{
      type: string;
      severity: 'LOW' | 'MEDIUM' | 'HIGH';
      message: string;
    }>;
  };
}

export interface TripPlan {
  version: string;               // semantic version of your planner
  createdAt: string;
  days: PlanDay[];

  // predicted metrics (for UI / evaluation)
  metrics?: {
    estTotalCost?: number;
    estActiveMinutes?: number;
    estTravelMinutes?: number;
    robustnessScore?: number;    // 0~1
  };
}

