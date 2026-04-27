import type { HardRuleFact } from './hard-rule-snapshot.types';
import { DRIVE_SAFETY_V1, driveSafetyWindThresholdMps } from '../../ontology/environment/weather.schema';

/**
 * Best-effort derive HardRuleFact[] from metadata shape.
 * Primary target: Pattern A (`metadata.details.evidence`) used by IronShield/constraints.
 */
export function deriveFactsFromMetadata(params: {
  metadata: Record<string, unknown>;
  reasonCodes?: string[];
  timestampIso?: string;
}): HardRuleFact[] {
  const meta = params.metadata ?? {};
  const details = (meta as any)?.details;
  const evidence = details?.evidence;
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) return [];

  const rule_id = String((meta as any)?.rule_id ?? (meta as any)?.ruleId ?? params.reasonCodes?.[0] ?? '').trim();
  if (!rule_id) return [];

  const facts: HardRuleFact[] = [];
  const evType = String((evidence as any)?.type ?? '');

  // Pattern: wind threshold/value in m/s (matches ConstraintsEngine + Neptune weather evidence)
  const threshold_mps = (evidence as any)?.threshold_mps;
  const value_mps = (evidence as any)?.value_mps;
  if (typeof threshold_mps === 'number' && typeof value_mps === 'number') {
    facts.push({
      rule_id,
      actual_value: value_mps,
      threshold: threshold_mps,
      unit: 'm/s',
      is_violated: value_mps > threshold_mps,
      severity: 'HARD',
      evidence: evidence as any,
      ...(params.timestampIso ? { at: params.timestampIso } : {}),
    });
  }

  // Pattern: solar physics window (sunset/civil dusk) — offset minutes constraint.
  // Evidence shape from ConstraintsEngineService (DYNAMIC_WINDOW/DERIVE_SUNSET_WINDOW):
  // { type:'solar_physics', offset_min, twilight_buffer_min, mode, baseline, source }
  const offset_min = (evidence as any)?.offset_min;
  if (typeof offset_min === 'number') {
    facts.push({
      rule_id,
      actual_value: offset_min,
      threshold: null,
      unit: 'min',
      // Offset itself isn't a violation; treat as NOT violated unless evidence explicitly says so.
      is_violated: Boolean((evidence as any)?.is_violated) === true,
      severity: 'HARD',
      evidence: evidence as any,
      ...(params.timestampIso ? { at: params.timestampIso } : {}),
    });
  }

  // Pattern: visibility threshold (meters) — if present, derive a violation fact.
  const visibility_meters = (evidence as any)?.visibility_meters;
  const visibility_threshold_meters = (evidence as any)?.visibility_threshold_meters;
  if (typeof visibility_meters === 'number' && typeof visibility_threshold_meters === 'number') {
    facts.push({
      rule_id,
      actual_value: visibility_meters,
      threshold: visibility_threshold_meters,
      unit: 'm',
      is_violated: visibility_meters < visibility_threshold_meters,
      severity: 'HARD',
      evidence: evidence as any,
      ...(params.timestampIso ? { at: params.timestampIso } : {}),
    });
  }

  // Pattern: weather physics (wind lock) — derive DRIVE_SAFETY_V1 as a HARD fact.
  // Evidence shape:
  // {
  //   type:'weather_physics',
  //   wind_speed_mps,
  //   vehicle_type?: 'SUV'|'CAMPERVAN'|...,
  //   threshold_mps?: number,
  //   source, snapshotId?, is_violated?
  // }
  if (evType === 'weather_physics') {
    const wind = (evidence as any)?.wind_speed_mps ?? (evidence as any)?.windSpeedMps ?? (evidence as any)?.wind_speed;
    if (typeof wind === 'number') {
      const thr =
        typeof (evidence as any)?.threshold_mps === 'number'
          ? (evidence as any)?.threshold_mps
          : driveSafetyWindThresholdMps((evidence as any)?.vehicle_type ?? (evidence as any)?.vehicleType);
      const isViolated = Boolean((evidence as any)?.is_violated) === true || wind > thr;
      facts.push({
        rule_id: DRIVE_SAFETY_V1.rule_id,
        actual_value: wind,
        threshold: thr,
        unit: 'm/s',
        is_violated: isViolated,
        severity: 'HARD',
        evidence: { ...(evidence as any), threshold_mps: thr, wind_speed_mps: wind },
        ...(params.timestampIso ? { at: params.timestampIso } : {}),
      });
    }
  }

  // Pattern: fatigue stats (Dr.Dre optimizer) — emit max fatigue and overloaded days facts.
  // Evidence shape:
  // { type:'fatigue_stats', threshold_fatigue_index, original:{...}, recommended:{ mean, variance, max, overloadedDays } }
  if (evType === 'fatigue_stats') {
    const thr = (evidence as any)?.threshold_fatigue_index;
    const rec = (evidence as any)?.recommended;
    const max = rec?.max;
    const overloadedDays = rec?.overloadedDays;
    if (typeof max === 'number') {
      facts.push({
        rule_id: String((meta as any)?.rule_id ?? rule_id ?? 'fatigue.max_daily'),
        actual_value: max,
        threshold: typeof thr === 'number' ? thr : null,
        unit: 'fatigue_index',
        is_violated: typeof thr === 'number' ? max > thr : false,
        severity: 'SOFT',
        evidence: evidence as any,
        ...(params.timestampIso ? { at: params.timestampIso } : {}),
      });
    }
    if (typeof overloadedDays === 'number') {
      facts.push({
        rule_id: 'fatigue.overloaded_days',
        actual_value: overloadedDays,
        threshold: 0,
        unit: 'days',
        is_violated: overloadedDays > 0,
        severity: 'SOFT',
        evidence: evidence as any,
        ...(params.timestampIso ? { at: params.timestampIso } : {}),
      });
    }
  }

  // Pattern: road state closure (Emergency hard-forbidden injection)
  // Evidence shape: { type:'road_state', status:'CLOSED', segment_id, reason_code }
  if (evType === 'road_state') {
    const status = String((evidence as any)?.status ?? '').toUpperCase();
    if (status === 'CLOSED') {
      facts.push({
        rule_id: String((meta as any)?.rule_id ?? rule_id ?? 'road_closed_v1'),
        actual_value: 1,
        threshold: 0,
        unit: 'closed',
        is_violated: true,
        severity: 'HARD',
        evidence: evidence as any,
        ...(params.timestampIso ? { at: params.timestampIso } : {}),
      });
    }
  }

  // Pattern: solar safety window (fixed sunset / twilight buffer)
  // Evidence shape:
  // {
  //   type:'solar_safety',
  //   actual_end_time_iso, sunset_time_iso, safety_threshold_iso,
  //   buffer_min, unit:'ISO_8601', is_violated:true
  // }
  if (evType === 'solar_safety') {
    const isViolated = Boolean((evidence as any)?.is_violated) === true;
    if (isViolated) {
      facts.push({
        rule_id: String((meta as any)?.rule_id ?? rule_id ?? 'solar_safety_v1'),
        actual_value: String((evidence as any)?.actual_end_time_iso ?? ''),
        threshold: String((evidence as any)?.safety_threshold_iso ?? ''),
        unit: 'ISO_8601',
        is_violated: true,
        severity: 'HARD',
        evidence: evidence as any,
        ...(params.timestampIso ? { at: params.timestampIso } : {}),
      });
    }
  }

  // Pattern: opening hours conflict (POI closed at planned window)
  // Evidence shape:
  // {
  //   type:'opening_hours',
  //   poi_id, planned_start, planned_end, open_window, date, timezone, is_violated:true
  // }
  if (evType === 'opening_hours') {
    const isViolated = Boolean((evidence as any)?.is_violated) === true;
    if (isViolated) {
      facts.push({
        rule_id: String((meta as any)?.rule_id ?? rule_id ?? 'temporal_opening_v1'),
        actual_value: String((evidence as any)?.planned_start ?? ''),
        threshold: String((evidence as any)?.open_window ?? ''),
        unit: 'ISO_8601',
        is_violated: true,
        severity: 'HARD',
        evidence: evidence as any,
        ...(params.timestampIso ? { at: params.timestampIso } : {}),
      });
    }
  }

  // Pattern: public transport hard fact (GTFS / transit API snapshot)
  // Evidence shape (C1 strict):
  // {
  //   type:'public_transit',
  //   segmentId, routeId?, operator?, serviceDate?,
  //   departureTime, arrivalTime?,
  //   serviceStatus: 'ACTIVE'|'CANCELLED'|'UNKNOWN',
  //   transferWindowMin?, plannedTransferWindowMin?,
  //   source, snapshotId, is_violated?
  // }
  if (evType === 'public_transit') {
    const status = String((evidence as any)?.serviceStatus ?? (evidence as any)?.boardingStatus ?? '').toUpperCase();
    const required = (evidence as any)?.transferWindowMin ?? (evidence as any)?.transferWindow ?? (evidence as any)?.transfer_window_min;
    const planned = (evidence as any)?.plannedTransferWindowMin ?? (evidence as any)?.planned_transfer_window_min;
    const hasWindow = typeof required === 'number' && typeof planned === 'number';
    const isCancelled = status === 'CANCELLED' || status === 'CANCELED';
    const windowViolated = hasWindow ? planned < required : false;
    const isViolated = Boolean((evidence as any)?.is_violated) === true || isCancelled || windowViolated;
    facts.push({
      rule_id: String((meta as any)?.rule_id ?? rule_id ?? 'public_transport_v1'),
      actual_value: hasWindow ? planned : String((evidence as any)?.departureTime ?? (evidence as any)?.departure_time ?? ''),
      threshold: hasWindow ? required : String(status || 'UNKNOWN'),
      unit: hasWindow ? 'min' : 'ISO_8601',
      is_violated: isViolated,
      severity: 'HARD',
      evidence: evidence as any,
      ...(params.timestampIso ? { at: params.timestampIso } : {}),
    });
  }

  return facts;
}

