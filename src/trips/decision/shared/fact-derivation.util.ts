import type { HardRuleFact } from './hard-rule-snapshot.types';
import { DRIVE_SAFETY_V1, RAIL_SAFETY_V1, driveSafetyWindThresholdMps, railSafetyWindThresholdMps } from '../../ontology/environment/weather.schema';
import { calculateEnvironmentHash, getWeatherForTime } from '../../ontology/environment/environment-domain.util';

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

  /**
   * Pattern: admin-injected environment overrides (RouteDirection.metadata.environment_overrides_v1).
   *
   * Evidence shape (as attached to PhysicalRealityModel.prefetched_evidence):
   * {
   *   kind: 'environment_overrides_v1',
   *   source, at, expires_at,
   *   overrides: {
   *     weather?: { wind_mps?, visibility_m?, snow_depth_cm?, threshold_wind_mps?, visibility_threshold_m? ... }
   *     solar?: { twilightBufferMin?, ... }
   *   }
   * }
   *
   * We convert it into canonical facts by synthesizing weather_physics / visibility facts.
   */
  const evKind = String((evidence as any)?.kind ?? '');
  if (evKind === 'environment_overrides_v1' && (evidence as any)?.overrides && typeof (evidence as any).overrides === 'object') {
    const o = (evidence as any).overrides as any;
    const w = o?.weather;
    let envHash: string | undefined = undefined;
    if (w && typeof w === 'object') {
      let wind = w.wind_mps ?? w.windSpeedMps ?? w.wind_speed_mps;
      const threshold = w.threshold_wind_mps ?? w.wind_threshold_mps ?? w.threshold_mps;
      const confidenceScoreRaw = w.confidenceScore ?? w.confidence_score ?? w.confidence;
      let confidenceScore = typeof confidenceScoreRaw === 'number' && Number.isFinite(confidenceScoreRaw) ? confidenceScoreRaw : undefined;

      let visibility = w.visibility_m ?? w.visibility_meters ?? w.visibilityMeters;
      const vthr = w.visibility_threshold_m ?? w.visibility_threshold_meters ?? w.visibilityThresholdMeters;

      let precipitationMm =
        w.precipitation_mm ?? w.precipitationMm ?? w.precipitation_mm_per_hour ?? w.precipitationMmPerHour ?? w.precipitation;
      const precipThrMm = w.precipitation_threshold_mm ?? w.precipitationThresholdMm ?? w.precipitation_threshold;

      let snowDepthCm = w.snow_depth_cm ?? w.snowDepthCm ?? w.snow_depth_cm_value ?? w.snowDepth;
      const snowDepthThrCm = w.threshold_snow_depth_cm ?? w.snow_depth_threshold_cm ?? w.snowDepthThresholdCm;

      // event time:
      // - Admin override uses evidence.at (recommended)
      // - fallback to params.timestampIso (legacy)
      const atIso = (evidence as any)?.at ?? params.timestampIso;
      const effectiveTimestampIso =
        typeof atIso === 'string' && atIso.trim() ? String(atIso).trim() : params.timestampIso;

      // Optional: forecastSeries time-window matching (spec-aligned).
      // When present, we pick the forecast whose timeWindow contains effectiveTimestampIso.
      // Then we use its wind/visibility/precip/snow values for HardRuleFact derivation + environment_hash.
      const forecastSeriesRaw =
        w.forecastSeries ?? w.forecast_series ?? w.forecastSeriesList ?? w.forecast_series_list;
      if (Array.isArray(forecastSeriesRaw) && effectiveTimestampIso && typeof effectiveTimestampIso === 'string') {
        const normalizeForecast = (rf: any): any => {
          const start = rf?.start ?? rf?.timeWindow?.start ?? rf?.time_window?.start ?? rf?.window_start;
          const end = rf?.end ?? rf?.timeWindow?.end ?? rf?.time_window?.end ?? rf?.window_end;

          const windSpeedKphRaw =
            rf?.windSpeedKph ??
            rf?.wind_speed_kph ??
            (typeof rf?.wind_mps === 'number' ? Number(rf.wind_mps) * 3.6 : undefined) ??
            (typeof rf?.windSpeedMps === 'number' ? Number(rf.windSpeedMps) * 3.6 : undefined) ??
            rf?.wind_speed_kph_value;

          const visibilityMetersRaw = rf?.visibilityMeters ?? rf?.visibility_m ?? rf?.visibility_meters;
          const precipitationMmRaw = rf?.precipitationMm ?? rf?.precipitation_mm ?? rf?.precipitation;
          const snowDepthCmRaw = rf?.snowDepthCm ?? rf?.snow_depth_cm ?? rf?.snow_depth_cm_value ?? rf?.snowDepth;
          const confidenceScoreRaw2 = rf?.confidenceScore ?? rf?.confidence_score ?? rf?.confidence;

          return {
            locationId: String(rf?.locationId ?? rf?.location_id ?? ''),
            timeWindow: { start: String(start ?? ''), end: String(end ?? '') },
            windSpeedKph: typeof windSpeedKphRaw === 'number' && Number.isFinite(windSpeedKphRaw) ? windSpeedKphRaw : NaN,
            visibilityMeters:
              typeof visibilityMetersRaw === 'number' && Number.isFinite(visibilityMetersRaw) ? visibilityMetersRaw : NaN,
            precipitationMm:
              typeof precipitationMmRaw === 'number' && Number.isFinite(precipitationMmRaw) ? precipitationMmRaw : NaN,
            snowDepthCm:
              typeof snowDepthCmRaw === 'number' && Number.isFinite(snowDepthCmRaw) ? snowDepthCmRaw : NaN,
            temperatureC: typeof rf?.temperatureC === 'number' && Number.isFinite(rf.temperatureC) ? rf.temperatureC : NaN,
            condition: String(rf?.condition ?? 'CLEAR'),
            confidenceScore:
              typeof confidenceScoreRaw2 === 'number' && Number.isFinite(confidenceScoreRaw2) ? confidenceScoreRaw2 : undefined,
            source: typeof rf?.source === 'string' ? rf.source : undefined,
            updatedAt:
              typeof rf?.updatedAt === 'string'
                ? rf.updatedAt
                : typeof rf?.updated_at === 'string'
                  ? rf.updated_at
                  : undefined,
          };
        };

        const normalizedSeries = forecastSeriesRaw
          .map((x: any) => normalizeForecast(x))
          .filter((f: any) => f?.timeWindow?.start && f?.timeWindow?.end);

        const selected = getWeatherForTime({
          weatherForecasts: normalizedSeries as any[],
          timeISO: effectiveTimestampIso,
        });

        if (selected) {
          if (typeof selected.windSpeedKph === 'number' && Number.isFinite(selected.windSpeedKph)) {
            wind = (selected.windSpeedKph as number) / 3.6; // store in m/s
          }
          if (typeof selected.visibilityMeters === 'number' && Number.isFinite(selected.visibilityMeters)) {
            visibility = selected.visibilityMeters;
          }
          if (typeof (selected as any).precipitationMm === 'number' && Number.isFinite((selected as any).precipitationMm)) {
            precipitationMm = (selected as any).precipitationMm;
          }
          if (typeof (selected as any).snowDepthCm === 'number' && Number.isFinite((selected as any).snowDepthCm)) {
            snowDepthCm = (selected as any).snowDepthCm;
          }
          if (typeof selected.confidenceScore === 'number' && Number.isFinite(selected.confidenceScore)) {
            confidenceScore = selected.confidenceScore;
          }
        }
      }

      // Compute a stable hash for signature lock / drift audit.
      // Spec: environmentHash = hash(windSpeed, visibility, snowDepth, sunset).
      // Sunset best-effort:
      // - Prefer direct scalar: solar.sunset_time_iso / solar.sunsetISO / ...
      // - Else try daylightByDate[YYYY-MM-DD].(civil_dusk|sunset)
      // - Else try sunsetByDate[YYYY-MM-DD] as "HH:mm" and lift to ISO with "Z".
      const s = o?.solar;
      const directSunsetISO =
        s?.sunset_time_iso ??
        s?.sunsetISO ??
        s?.sunset_iso ??
        s?.sunsetTimeIso ??
        s?.sunset_time ??
        undefined;
      const dateKey =
        typeof effectiveTimestampIso === 'string' && effectiveTimestampIso.trim()
          ? String(effectiveTimestampIso).slice(0, 10)
          : undefined;

      const liftHHmmToIso = (hhmm: unknown): string | null => {
        if (typeof hhmm !== 'string') return null;
        const t = String(hhmm).trim();
        if (!dateKey) return null;
        // Accept only HH:mm (not full ISO) here.
        const m = t.match(/^(\d{1,2}):(\d{2})$/);
        if (!m) return null;
        const hh = String(Number(m[1])).padStart(2, '0');
        const mm = m[2];
        return `${dateKey}T${hh}:${mm}:00.000Z`;
      };

      let sunsetISO: string | undefined = typeof directSunsetISO === 'string' && directSunsetISO.trim() ? directSunsetISO.trim() : undefined;
      if (!sunsetISO && dateKey && s && typeof s === 'object' && !Array.isArray(s)) {
        const daylightByDate =
          (s as any).daylightByDate ?? (s as any).daylight_by_date ?? (s as any).daylightsByDate;
        if (daylightByDate && typeof daylightByDate === 'object' && !Array.isArray(daylightByDate)) {
          const v = (daylightByDate as any)[dateKey];
          const cand = v?.civil_dusk ?? v?.civilDusk ?? v?.sunset ?? v?.Sunset;
          if (typeof cand === 'string' && cand.trim()) sunsetISO = cand.trim();
        }

        if (!sunsetISO) {
          const sunsetByDate = (s as any).sunsetByDate ?? (s as any).sunset_by_date;
          const civilDuskByDate = (s as any).civilDuskByDate ?? (s as any).civil_dusk_by_date;
          const chosen = sunsetByDate?.[dateKey] ?? civilDuskByDate?.[dateKey];
          const lifted = liftHHmmToIso(chosen);
          if (lifted) sunsetISO = lifted;
        }
      }

      envHash = calculateEnvironmentHash({
        windSpeedKph: typeof wind === 'number' && Number.isFinite(wind) ? wind * 3.6 : null,
        visibilityMeters: typeof visibility === 'number' && Number.isFinite(visibility) ? visibility : null,
        snowDepthCm: typeof snowDepthCm === 'number' && Number.isFinite(snowDepthCm) ? snowDepthCm : null,
        sunsetISO: typeof sunsetISO === 'string' ? sunsetISO : null,
      });

      if (typeof wind === 'number' && Number.isFinite(wind)) {
        const synthesized = {
          type: 'weather_physics',
          wind_speed_mps: wind,
          ...(typeof threshold === 'number' && Number.isFinite(threshold) ? { threshold_mps: threshold } : {}),
          environment_hash: envHash,
          ...(typeof confidenceScore === 'number' ? { confidenceScore } : {}),
          source: (evidence as any)?.source ?? 'RouteDirection_Admin_Metadata',
          snapshotId: (evidence as any)?.at ?? params.timestampIso,
        };
        facts.push(
          ...deriveFactsFromMetadata({
            metadata: { rule_id: DRIVE_SAFETY_V1.rule_id, details: { evidence: synthesized } } as any,
            reasonCodes: [DRIVE_SAFETY_V1.rule_id],
            timestampIso: effectiveTimestampIso,
          }),
        );
      }

      if (typeof visibility === 'number' && Number.isFinite(visibility) && typeof vthr === 'number' && Number.isFinite(vthr)) {
        facts.push({
          rule_id: 'visibility_v1',
          actual_value: visibility,
          threshold: vthr,
          unit: 'm',
          is_violated: visibility < vthr,
          severity: 'HARD',
          evidence: { ...(evidence as any), derived_from: 'environment_overrides_v1', environment_hash: envHash, ...(typeof confidenceScore === 'number' ? { confidenceScore } : {}) },
          ...(effectiveTimestampIso ? { at: effectiveTimestampIso } : {}),
        });
      }

      // Precipitation limit (spec-aligned, confidence gated).
      if (
        typeof precipitationMm === 'number' &&
        Number.isFinite(precipitationMm) &&
        typeof precipThrMm === 'number' &&
        Number.isFinite(precipThrMm)
      ) {
        const valueExceeds = precipitationMm > precipThrMm;
        const conf = typeof confidenceScore === 'number' ? confidenceScore : null;
        // <0.6 conservative: never violate
        // If confidence is missing, treat as conservative (no hard violation).
        const shouldEvaluateHard = conf == null ? false : conf >= 0.6;
        const isViolated = valueExceeds && shouldEvaluateHard;
        const severity = conf == null ? 'SOFT' : conf >= 0.85 ? 'HARD' : conf >= 0.6 ? 'SOFT' : 'SOFT';
        facts.push({
          rule_id: 'precipitation_limit_v1',
          actual_value: precipitationMm,
          threshold: precipThrMm,
          unit: 'mm',
          is_violated: isViolated,
          severity,
          evidence: { ...(evidence as any), derived_from: 'environment_overrides_v1', environment_hash: envHash, ...(typeof confidenceScore === 'number' ? { confidenceScore } : {}) },
          ...(effectiveTimestampIso ? { at: effectiveTimestampIso } : {}),
        });
      }

      // Snow depth limit (spec-aligned, confidence gated).
      if (
        typeof snowDepthCm === 'number' &&
        Number.isFinite(snowDepthCm) &&
        typeof snowDepthThrCm === 'number' &&
        Number.isFinite(snowDepthThrCm)
      ) {
        const valueExceeds = snowDepthCm > snowDepthThrCm;
        const conf = typeof confidenceScore === 'number' ? confidenceScore : null;
        const shouldEvaluateHard = conf == null ? false : conf >= 0.6; // <0.6 conservative: never violate
        const isViolated = valueExceeds && shouldEvaluateHard;
        const severity = conf == null ? 'SOFT' : conf >= 0.85 ? 'HARD' : conf >= 0.6 ? 'SOFT' : 'SOFT';
        facts.push({
          rule_id: 'snow_depth_limit_v1',
          actual_value: snowDepthCm,
          threshold: snowDepthThrCm,
          unit: 'cm',
          is_violated: isViolated,
          severity,
          evidence: { ...(evidence as any), derived_from: 'environment_overrides_v1', environment_hash: envHash, ...(typeof confidenceScore === 'number' ? { confidenceScore } : {}) },
          ...(effectiveTimestampIso ? { at: effectiveTimestampIso } : {}),
        });
      }
    }

    const s = o?.solar;
    if (s && typeof s === 'object') {
      const twilightBufferMin = s.twilightBufferMin ?? s.twilight_buffer_min ?? s.twilightBuffer;
      if (typeof twilightBufferMin === 'number' && Number.isFinite(twilightBufferMin)) {
        facts.push({
          rule_id: 'solar_physics_v1',
          actual_value: twilightBufferMin,
          threshold: null,
          unit: 'min',
          is_violated: false,
          severity: 'HARD',
          evidence: {
            ...(evidence as any),
            derived_from: 'environment_overrides_v1',
            ...(typeof envHash === 'string' ? { environment_hash: envHash } : {}),
          },
          ...(params.timestampIso ? { at: params.timestampIso } : {}),
        });
      }
    }

    return facts;
  }

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
      const confidenceScoreRaw = (evidence as any)?.confidenceScore ?? (evidence as any)?.confidence_score ?? (evidence as any)?.confidence;
      const confidenceScore = typeof confidenceScoreRaw === 'number' && Number.isFinite(confidenceScoreRaw) ? confidenceScoreRaw : undefined;
      // Spec-aligned: low confidence should be conservative (no hard block).
      const confOk = typeof confidenceScore === 'number' ? confidenceScore >= 0.8 : true;
      const isViolated = Boolean((evidence as any)?.is_violated) === true || (confOk && wind > thr);
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

      // Also derive a rail resilience fact from the same environmental snapshot.
      // This enables multi-factor orchestration: DRIVE can be violated while RAIL remains safe.
      const railThr = railSafetyWindThresholdMps();
      facts.push({
        rule_id: RAIL_SAFETY_V1.rule_id,
        actual_value: wind,
        threshold: railThr,
        unit: 'm/s',
        is_violated: wind > railThr,
        severity: 'HARD',
        evidence: { ...(evidence as any), threshold_mps: railThr, wind_speed_mps: wind, transport_mode: 'RAIL' },
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

