/**
 * Single-call dual audit: routeFeasibility + gasAndEvChargePlanner → one scannable verdict (MCP check_trip_safety).
 */

import type {
  CheckTripSafetyDualVerdictV1,
  CheckTripSafetyRoadSurfaceAlertsV1,
  CheckTripSafetyTunnelProtocolV1,
  EnergyAuditStatus,
} from '../../skills/world/iceland-check-trip-safety-dual-verdict.types';
import type {
  FeasibilityRiskLevel,
  IcelandGasEvPlannerOutput,
  IcelandRouteFeasibilityOutput,
  IcelandRouteFeasibilitySegment,
  IcelandRouteRoadSurfaceAlertsSummary,
  IcelandRouteTunnelProtocolSummary,
} from '../../skills/world/iceland-world-driving-contracts';
import { normalizeFeasibilityRegion } from '../../skills/world/utils/iceland-feasibility-regions.util';

export type {
  CheckTripSafetyDualVerdictV1,
  CheckTripSafetyRoadSurfaceAlertsV1,
  CheckTripSafetyTunnelProtocolV1,
  EnergyAuditStatus,
} from '../../skills/world/iceland-check-trip-safety-dual-verdict.types';

const RISK_ORDER: Record<FeasibilityRiskLevel, number> = {
  SAFE: 0,
  CAUTION: 1,
  HIGH: 2,
  DANGEROUS: 3,
};

function maxRisk(a: FeasibilityRiskLevel, b: FeasibilityRiskLevel): FeasibilityRiskLevel {
  return RISK_ORDER[a] >= RISK_ORDER[b] ? a : b;
}

function energyStatusFrom(
  energy: IcelandGasEvPlannerOutput | null,
): { status: EnergyAuditStatus; alerts: string[] } {
  if (!energy) {
    return {
      status: 'TIGHT',
      alerts: ['Energy audit skipped: iceland.gasAndEvChargePlanner unavailable.'],
    };
  }
  if (!energy.feasible || (energy.refuel_or_charge_required && energy.recommended_stops.length === 0)) {
    return { status: 'CRITICAL', alerts: [] };
  }
  if (energy.refuel_or_charge_required) {
    return { status: 'TIGHT', alerts: [] };
  }
  return { status: 'SUFFICIENT', alerts: [] };
}

function remainingRangeKmFromMetrics(m: IcelandGasEvPlannerOutput['metrics'] | undefined): number {
  if (!m) return 0;
  const nom = m.nominal_range_km;
  const trip = m.total_km;
  return Math.round((nom - trip) * 10) / 10;
}

function stopAction(
  stopId: string,
  energy: IcelandGasEvPlannerOutput | null,
  matchReason: string,
): string {
  if (energy?.must_refill_before?.station_id === stopId) {
    return 'REFILL_BEFORE_HIGHLANDS';
  }
  if (/before_highlands/i.test(matchReason) || /before_highlands/i.test(stopId)) {
    return 'REFILL_BEFORE_HIGHLANDS';
  }
  return 'REFILL_OR_CHARGE_RECOMMENDED';
}

function desertTagFromAlerts(alerts: string[]): string {
  const hit = alerts.find((a) => /supply desert|highlands/i.test(a));
  if (hit) {
    if (/highlands/i.test(hit)) return 'highlands / supply-desert exposure';
    return 'low-density supply corridor';
  }
  return 'remote or low-density corridor';
}

function buildNarrativeSummary(input: {
  routeFeasible: boolean;
  blocked: string[];
  regime: string;
  energy: IcelandGasEvPlannerOutput | null;
  energyAlerts: string[];
}): string | undefined {
  if (input.routeFeasible) return undefined;
  const blocked = input.blocked.length ? input.blocked.join(', ') : 'unspecified hard constraints';
  const desert = desertTagFromAlerts(input.energyAlerts);
  const mustId = input.energy?.must_refill_before?.station_id;
  const stationName =
    mustId && input.energy
      ? input.energy.recommended_stops.find((s) => s.station_id === mustId)?.name
      : undefined;
  const stationBit = stationName
    ? `mandatory refuel or regroup at “${stationName}”`
    : 'review corridor fuel using recommended stops before leaving paved services';
  return (
    `Critical safety block: ${blocked}. ` +
    `Under ${input.regime} daylight regime, civil-window driving is highly constrained. ` +
    `Energy strategy: ${stationBit} due to ${desert}. ` +
    `Re-plan using Ring Road corridors and non-F segments; re-run iceland.routeFeasibility + iceland.gasAndEvChargePlanner on each alternative.`
  );
}

function mapTunnelProtocolToMcp(tp: IcelandRouteTunnelProtocolSummary): CheckTripSafetyTunnelProtocolV1 {
  return {
    triggered: tp.triggered,
    protocol_code: tp.triggered && tp.protocolCode ? tp.protocolCode : null,
    driving_notes: (tp.drivingNotes ?? []).join(' '),
    affected_segments: tp.affectedSegments ?? [],
  };
}

function mapRoadSurfaceAlertsToMcp(s: IcelandRouteRoadSurfaceAlertsSummary): CheckTripSafetyRoadSurfaceAlertsV1 {
  return {
    triggered: s.triggered,
    protocol_code: s.triggered && s.protocolCode ? s.protocolCode : null,
    driving_notes: (s.drivingNotes ?? []).join(' '),
    affected_segments: s.affectedSegments ?? [],
  };
}

export function collectUnknownRegionDegradation(segments: IcelandRouteFeasibilitySegment[]): {
  degraded: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  for (const s of segments) {
    const a = normalizeFeasibilityRegion(s.from_region);
    const b = normalizeFeasibilityRegion(s.to_region);
    if (!a) {
      reasons.push(`Unknown preset region (from): "${s.from_region}" — corridor/station seed matching may miss.`);
    }
    if (!b) {
      reasons.push(`Unknown preset region (to): "${s.to_region}" — corridor/station seed matching may miss.`);
    }
  }
  return { degraded: reasons.length > 0, reasons };
}

export function assembleCheckTripSafetyDualVerdictV1(input: {
  route: IcelandRouteFeasibilityOutput;
  energy: IcelandGasEvPlannerOutput | null;
  segments: IcelandRouteFeasibilitySegment[];
}): CheckTripSafetyDualVerdictV1 {
  const { route, energy, segments } = input;
  const { degraded, reasons } = collectUnknownRegionDegradation(segments);

  const { status: energyStatus, alerts: energyMetaAlerts } = energyStatusFrom(energy);
  let risk_level = route.riskLevel;
  if (energy) {
    if (energyStatus === 'CRITICAL') {
      risk_level = 'DANGEROUS';
    } else if (energyStatus === 'TIGHT') {
      risk_level = maxRisk(risk_level, 'HIGH');
    }
  }
  if (!route.feasible) {
    risk_level = maxRisk(risk_level, 'DANGEROUS');
  }

  const feasible = route.feasible && (!energy || energy.feasible);

  const windNotes =
    route.recommendedAdjustments.includes('REVIEW_WIND_EXPOSURE')
      ? 'Route adjustments include REVIEW_WIND_EXPOSURE; crosswind detail is embedded in composite gate (iceland.routeFeasibility).'
      : 'No explicit wind exposure adjustment on this snapshot; see route risk level.';

  const summaryParts = [
    `Route feasibility: ${route.feasible ? 'pass' : 'BLOCK'} (${route.riskLevel}).`,
    `Energy logistics: ${energyStatus}${energy?.refuel_or_charge_required ? '; refuel/charge planning triggered' : ''}.`,
  ];
  if (degraded) summaryParts.push('Degraded: unknown preset region(s) — use exact distances and manual map check.');
  const summary = summaryParts.join(' ');

  const allEnergyAlerts = [...energyMetaAlerts, ...(energy?.safety_alerts ?? [])];
  if (degraded) {
    allEnergyAlerts.push(
      'Conservative mode: one or more regions are not in the preset atlas — mileage-only and manual corridor verification recommended.',
    );
  }

  const recommended_stops =
    energy?.recommended_stops.map((s) => ({
      id: s.station_id,
      name: s.name,
      action: stopAction(s.station_id, energy, s.match_reason),
    })) ?? [];

  const daylightRegime = route.daylightSummary.regime;
  const narrative_summary = buildNarrativeSummary({
    routeFeasible: route.feasible,
    blocked: route.blockedReasons.map(String),
    regime: daylightRegime,
    energy,
    energyAlerts: Array.from(new Set(allEnergyAlerts)),
  });

  const base: CheckTripSafetyDualVerdictV1 = {
    feasible,
    risk_level,
    summary,
    physical_constraints: {
      daylight: {
        ...route.daylightSummary,
        driving_window_hours: route.constraints.effectiveSafeDrivingWindowHours,
        anchor_region: route.constraints.daylightAnchorRegion,
        weather_regions_assessed: route.constraints.weatherRegionsAssessed,
      },
      road_status: {
        blocked_reasons: route.blockedReasons,
        f_road_segments_declared: segments.some((s) => Boolean(s.roadId && /^F\d{1,4}$/i.test(s.roadId))),
      },
      wind_risk: {
        route_risk_level: route.riskLevel,
        inferred_from_composite: true,
        notes: windNotes,
      },
      tunnel_protocol: mapTunnelProtocolToMcp(route.tunnelProtocol),
      road_surface_alerts: mapRoadSurfaceAlertsToMcp(route.roadSurfaceAlerts),
    },
    energy_logistics: {
      refuel_or_charge_required: energy?.refuel_or_charge_required ?? false,
      energy_status: energyStatus,
      estimated_remaining_range_km: remainingRangeKmFromMetrics(energy?.metrics),
      recommended_stops,
      safety_alerts: Array.from(new Set(allEnergyAlerts)),
      metrics: energy?.metrics,
    },
    recommended_adjustments: route.recommendedAdjustments.map(String),
    audit_degraded: degraded,
    audit_degraded_reasons: reasons,
  };

  if (narrative_summary) {
    return { ...base, narrative_summary };
  }
  return base;
}
