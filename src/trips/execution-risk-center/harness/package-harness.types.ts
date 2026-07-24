import type { ActiveRiskType } from '../types/execution-risk.types';

export interface PackageHarnessScenario {
  scenarioId: string;
  name: string;
  description: string;
  destination: string;
  category: string;
  tripPlan?: {
    day: number;
    activities: Array<Record<string, unknown>>;
    totalDrivingHours?: number;
  };
  members?: Array<{
    memberId: string;
    role: string;
    age?: number;
    attributes?: Record<string, unknown>;
  }>;
  environmentEvents?: Array<Record<string, unknown>>;
  roadEvents?: Array<Record<string, unknown>>;
  memberEvents?: Array<Record<string, unknown>>;
  observedMetrics?: Record<string, number | string | boolean>;
  context?: Record<string, unknown>;
  expected: PackageHarnessExpected;
}

export interface PackageHarnessExpected {
  activeRisks: Array<{
    knowledgeCode: string;
    severityLevel?: string;
    matchedRuleId?: string;
  }>;
  clusters?: Array<{
    primaryKnowledgeCode: string;
    memberRiskCodes?: string[];
    suppressedDecisionCount?: number;
    severity?: string;
  }>;
  severityLevel?: string;
  plans?: PackageHarnessExpectedPlan[];
  memberImpacts?: PackageHarnessExpectedMemberImpact[];
  planB?: PackageHarnessExpectedPlanB;
  affectedMembersScope?: 'ALL_MEMBERS' | 'FOCUSED';
  affectedMemberIds?: string[];
}

export interface PackageHarnessExpectedPlan {
  planType: 'RECOMMENDED' | 'CONSERVATIVE' | 'MINIMAL_CHANGE' | 'UNAVAILABLE';
  actionCodes: string[];
  timeDeltaMinutes?: { min: number; max: number };
  experienceRetention?: { min: number; max: number };
  safetyDelta?: { min: number; max: number };
  status?: 'AVAILABLE' | 'UNAVAILABLE';
}

export interface PackageHarnessExpectedMemberImpact {
  memberId: string;
  impactType: string;
  direction: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  degree: 'LOW' | 'MEDIUM' | 'HIGH';
  explanation: string;
}

export interface PackageHarnessExpectedPlanB {
  trigger: string;
  action: string;
  autoSwitch: boolean;
}

export type PlanBRuntimeStatus = 'IDLE' | 'MONITORING' | 'TRIGGERED';

export interface PlanBRuntimeState {
  status: PlanBRuntimeStatus;
  proximityPercent?: number;
  autoSwitch: boolean;
  trigger: string;
  action: string;
}

export interface PackageHarnessFile {
  version: string;
  scenarios: PackageHarnessScenario[];
}

export const PACKAGE_HARNESS_SCENARIO_IDS_1_10 = [
  'SH-ENV-001',
  'SH-ENV-002',
  'SH-ENV-003',
  'SH-ENV-004',
  'SH-ENV-005',
  'SH-ROAD-001',
  'SH-ROAD-002',
  'SH-ROAD-003',
  'SH-ROAD-004',
  'SH-ROAD-005',
] as const;

export const PACKAGE_HARNESS_SCENARIO_IDS_11_20 = [
  'SH-HUMAN-001',
  'SH-HUMAN-002',
  'SH-HUMAN-003',
  'SH-HUMAN-004',
  'SH-HUMAN-005',
  'SH-SCHED-001',
  'SH-SCHED-002',
  'SH-SCHED-003',
  'SH-SCHED-004',
  'SH-SCHED-005',
] as const;

export const PACKAGE_HARNESS_SCENARIO_IDS_ALL = [
  ...PACKAGE_HARNESS_SCENARIO_IDS_1_10,
  ...PACKAGE_HARNESS_SCENARIO_IDS_11_20,
] as const;

export type PackageHarnessCategory = 'ENVIRONMENT' | 'ROAD' | 'HUMAN_FACTOR' | 'SCHEDULE';

export function harnessCategoryToRiskType(category: string): ActiveRiskType {
  switch (category) {
    case 'ENVIRONMENT':
      return 'ENVIRONMENT';
    case 'ROAD':
      return 'ROAD_TRANSPORT';
    case 'HUMAN_FACTOR':
      return 'MEMBER_STATE';
    default:
      return 'SCHEDULE';
  }
}
