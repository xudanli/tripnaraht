/**
 * Admin 行程世界状态投影 — 对齐产品「世界状态建模」六域面板。
 * schemaId: tripnara.admin_trip_world_state@v1
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const ADMIN_TRIP_WORLD_STATE_SCHEMA_ID = 'tripnara.admin_trip_world_state@v1';

export type AdminWorldRiskLevel = 'low' | 'medium' | 'high' | 'unknown';

export type AdminWorldStateDomain =
  | 'environment'
  | 'road'
  | 'vehicle'
  | 'plan'
  | 'team'
  | 'constraints'
  | 'riskOverview';

export interface AdminWorldStateProvenance {
  domain: AdminWorldStateDomain;
  source: string;
  observedAt?: string | null;
}

export interface AdminWorldEnvironmentView {
  location: string | null;
  weather: string | null;
  precipitation: string | null;
  visibility: string | null;
  alerts: string[];
}

export interface AdminWorldRoadView {
  currentSegment: string | null;
  surfaceCondition: string | null;
  riskLevel: AdminWorldRiskLevel;
  closures: string | null;
  recommendedSpeedLimit: string | null;
}

export interface AdminWorldVehicleView {
  model: string | null;
  tires: string | null;
  driveMode: string | null;
  heightLimit: string | null;
  wadingAbility: string | null;
}

export interface AdminWorldPlanView {
  currentDay: string | null;
  origin: string | null;
  destination: string | null;
  plannedDriveTime: string | null;
  midpointStops: number | null;
  lodging: string | null;
}

export interface AdminWorldTeamView {
  size: number | null;
  composition: string | null;
  staminaStatus: string | null;
  driverStatus: string | null;
  preferences: string | null;
}

export interface AdminWorldConstraintsView {
  latestArrivalTime: string | null;
  maxDailyDrivingHours: number | null;
  drivingPreferences: string | null;
  budgetLevel: string | null;
  safetyPriority: string | null;
}

export interface AdminWorldRiskImpactsView {
  safety: AdminWorldRiskLevel;
  time: AdminWorldRiskLevel;
  experience: AdminWorldRiskLevel;
  cost: AdminWorldRiskLevel;
}

export interface AdminWorldRiskOverviewView {
  overallRiskLevel: AdminWorldRiskLevel;
  recommendationText: string | null;
  impacts: AdminWorldRiskImpactsView;
}

export interface AdminWorldStateCompleteness {
  environment: number;
  road: number;
  vehicle: number;
  plan: number;
  team: number;
  constraints: number;
}

export interface AdminTripWorldStateView {
  schemaId: typeof ADMIN_TRIP_WORLD_STATE_SCHEMA_ID;
  tripId: string;
  capturedAt: string;
  environment: AdminWorldEnvironmentView;
  road: AdminWorldRoadView;
  vehicle: AdminWorldVehicleView;
  plan: AdminWorldPlanView;
  team: AdminWorldTeamView;
  constraints: AdminWorldConstraintsView;
  riskOverview: AdminWorldRiskOverviewView;
  completeness: AdminWorldStateCompleteness;
  provenance: AdminWorldStateProvenance[];
}

/** Swagger 响应壳（data 字段） */
export class AdminTripWorldStateResponseDto {
  @ApiProperty({ example: ADMIN_TRIP_WORLD_STATE_SCHEMA_ID })
  schemaId!: string;

  @ApiProperty({ example: '64392463-e7db-4a16-be9b-dae445fc78e4' })
  tripId!: string;

  @ApiProperty({ example: '2026-08-13T08:00:00.000Z' })
  capturedAt!: string;

  @ApiProperty({ description: '环境域（地点/天气/告警）' })
  environment!: AdminWorldEnvironmentView;

  @ApiProperty({ description: '道路域' })
  road!: AdminWorldRoadView;

  @ApiProperty({ description: '车辆域' })
  vehicle!: AdminWorldVehicleView;

  @ApiProperty({ description: '行程计划域' })
  plan!: AdminWorldPlanView;

  @ApiProperty({ description: '团队域' })
  team!: AdminWorldTeamView;

  @ApiProperty({ description: '约束域' })
  constraints!: AdminWorldConstraintsView;

  @ApiProperty({ description: '综合风险与四维影响' })
  riskOverview!: AdminWorldRiskOverviewView;

  @ApiProperty({ description: '各域完整度 0..1' })
  completeness!: AdminWorldStateCompleteness;

  @ApiPropertyOptional({ description: '字段来源追溯' })
  provenance!: AdminWorldStateProvenance[];
}
