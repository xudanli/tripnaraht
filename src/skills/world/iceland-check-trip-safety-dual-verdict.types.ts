/**
 * MCP check_trip_safety dual-audit verdict — lives under skills so P2 skills can consume it without importing MCP handlers.
 */

import type {
  FeasibilityRiskLevel,
  IcelandGasEvPlannerOutput,
  IcelandRouteFeasibilityOutput,
} from './iceland-world-driving-contracts';

export type EnergyAuditStatus = 'SUFFICIENT' | 'TIGHT' | 'CRITICAL';

/** MCP snake_case — 与 route.tunnelProtocol 对齐 */
export interface CheckTripSafetyTunnelProtocolV1 {
  triggered: boolean;
  protocol_code: string | null;
  /** 供 Agent 直接朗读的合并文案 */
  driving_notes: string;
  affected_segments: string[];
}

/** MCP snake_case — 与 route.roadSurfaceAlerts 对齐（碎石 / 租车承保方向） */
export interface CheckTripSafetyRoadSurfaceAlertsV1 {
  triggered: boolean;
  protocol_code: string | null;
  driving_notes: string;
  affected_segments: string[];
}

export interface CheckTripSafetyDualVerdictV1 {
  feasible: boolean;
  risk_level: FeasibilityRiskLevel;
  /** 机器可读短摘要 */
  summary: string;
  /** 硬挡时的人类可读「叙事级」处方（无 LLM） */
  narrative_summary?: string;
  physical_constraints: {
    daylight: IcelandRouteFeasibilityOutput['daylightSummary'] & {
      driving_window_hours: number | null;
      anchor_region: string | null;
      weather_regions_assessed: string[];
    };
    road_status: {
      blocked_reasons: string[];
      f_road_segments_declared: boolean;
    };
    wind_risk: {
      route_risk_level: FeasibilityRiskLevel;
      inferred_from_composite: true;
      notes: string;
    };
    tunnel_protocol: CheckTripSafetyTunnelProtocolV1;
    road_surface_alerts: CheckTripSafetyRoadSurfaceAlertsV1;
  };
  energy_logistics: {
    refuel_or_charge_required: boolean;
    energy_status: EnergyAuditStatus;
    estimated_remaining_range_km: number;
    recommended_stops: Array<{ id: string; name: string; action: string }>;
    safety_alerts: string[];
    metrics?: IcelandGasEvPlannerOutput['metrics'];
  };
  recommended_adjustments: string[];
  audit_degraded: boolean;
  audit_degraded_reasons: string[];
}
