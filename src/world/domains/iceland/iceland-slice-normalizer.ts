/**
 * Maps Iceland domain skill outputs → typed OperationalSlice (severity lattice + TTL + freshness).
 */

import {
  OperationalSeverity,
  maxOperationalSeverity,
  operationalSlice,
  OPERATIONAL_SLICE_TTL_SECONDS,
  type OperationalSlice,
} from '../../contracts/operational-severity.contract';
import type { SafetravelGetAdvisoriesOutput } from '../../../skills/world/safetravel-get-advisories.skill';
import type { IcelandFRoadStatusOutput } from '../../../skills/world/iceland-f-road-status.skill';
import type { IcelandDaylightWindowOutput } from '../../../skills/world/iceland-world-driving-contracts';
import type { IcelandRentalGuidanceOutput } from '../../../skills/world/iceland-rental-guidance.skill';
import type {
  IcelandSafetravelStructured,
  IcelandFRoadBundleStructured,
  IcelandDaylightStructured,
  IcelandRentalStructured,
} from '../../contracts/iceland-operational-slice-types';

export function sliceFromSafetravelOutput(
  out: SafetravelGetAdvisoriesOutput,
  nowMs = Date.now(),
): OperationalSlice<IcelandSafetravelStructured> {
  let severity = OperationalSeverity.INFO;
  const g = out.gate_recommendation;
  if (g === 'BLOCK') severity = OperationalSeverity.BLOCKED;
  else if (g === 'ADJUST_REQUIRED') severity = OperationalSeverity.WARNING;
  else if (g === 'NEED_USER_CONFIRM') severity = OperationalSeverity.CAUTION;

  const structured: IcelandSafetravelStructured = {
    gate_recommendation: out.gate_recommendation,
    summary: out.summary,
    lastUpdated: out.lastUpdated,
    alertCount: Array.isArray(out.alerts) ? out.alerts.length : 0,
  };

  return operationalSlice(
    'iceland.safetravel.advisories',
    severity,
    structured,
    OPERATIONAL_SLICE_TTL_SECONDS.safetravel,
    nowMs,
    { reasonCodes: [`safetravel_gate:${g}`] },
  );
}

export function sliceFromFRoadStatusOutput(
  out: IcelandFRoadStatusOutput,
  nowMs = Date.now(),
): OperationalSlice<IcelandFRoadBundleStructured> {
  let severity = OperationalSeverity.INFO;
  const roads = out.roads || [];
  for (const r of roads) {
    if (r.status === 'closed' || r.status === 'impassable') {
      severity = OperationalSeverity.BLOCKED;
      break;
    }
    if (r.status === 'snow_covered') {
      severity = maxOperationalSeverity(severity, OperationalSeverity.WARNING);
    }
  }
  if (out.dataGaps?.length && severity === OperationalSeverity.INFO) {
    severity = OperationalSeverity.CAUTION;
  }

  const structured: IcelandFRoadBundleStructured = {
    roads: roads.map((r) => ({ ...r })),
    dataGaps: [...(out.dataGaps || [])],
    sources: [...(out.sources || [])],
  };

  return operationalSlice(
    'iceland.froad.status_bundle',
    severity,
    structured,
    OPERATIONAL_SLICE_TTL_SECONDS.road,
    nowMs,
    {
      reasonCodes: roads
        .filter((r) => r.status !== 'open')
        .map((r) => `froad:${r.roadId}:${r.status}`),
    },
  );
}

export function sliceFromDaylightOutput(
  out: IcelandDaylightWindowOutput,
  nowMs = Date.now(),
): OperationalSlice<IcelandDaylightStructured> {
  let severity = OperationalSeverity.INFO;
  if (out.nightDrivingRisk === 'high' || (out.daylightRisk === 'HIGH' && out.daylightRegime === 'polar_night')) {
    severity = OperationalSeverity.DANGEROUS;
  } else if (out.nightDrivingRisk === 'medium' || out.daylightRisk === 'MEDIUM') {
    severity = OperationalSeverity.WARNING;
  } else if (out.daylightRegime === 'polar_night') {
    severity = OperationalSeverity.CAUTION;
  }

  const structured: IcelandDaylightStructured = {
    daylightHours: out.daylightHours,
    nightDrivingRisk: out.nightDrivingRisk,
    daylightRegime: out.daylightRegime,
    daylightRisk: out.daylightRisk,
    temporalMileageUnbounded: out.temporalMileageUnbounded,
    civilTwilightHours: out.civilTwilightHours,
  };

  return operationalSlice(
    'iceland.daylight.window',
    severity,
    structured,
    OPERATIONAL_SLICE_TTL_SECONDS.daylight,
    nowMs,
    { reasonCodes: [`daylight:${out.nightDrivingRisk}:${out.daylightRegime}`] },
  );
}

export function sliceFromRentalGuidanceOutput(
  out: IcelandRentalGuidanceOutput,
  nowMs = Date.now(),
): OperationalSlice<IcelandRentalStructured> {
  const structured: IcelandRentalStructured = {
    intent_profile: out.intent_profile,
    summary_zh: out.summary_zh,
    vehicle_policy_hints_zh: out.vehicle_policy_hints_zh,
  };

  return operationalSlice(
    'iceland.rental.guidance',
    OperationalSeverity.INFO,
    structured,
    OPERATIONAL_SLICE_TTL_SECONDS.rental_guidance,
    nowMs,
    { reasonCodes: [`rental_intent:${out.intent_profile}`] },
  );
}
