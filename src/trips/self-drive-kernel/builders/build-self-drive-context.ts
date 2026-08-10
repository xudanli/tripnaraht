/**
 * SelfDriveContext 构建器 — ADR-SELF-DRIVE-KERNEL K1
 * 将 CN drivingContext / IS icelandSelfDrive 等碎片收成同构上下文。
 */
import { getCnClassicRouteById } from '../../readiness/utils/cn-classic-routes.util';
import { resolveSelfDriveProfile } from '../../tep/resolvers/self-drive-profile.resolver';
import type { RoadStatus } from '../../../data-contracts/interfaces/road-status.interface';
import {
  resolveDestinationPackId,
  resolveDestinationSelfDriveCapabilities,
} from '../capabilities/resolve-destination-self-drive-capabilities';
import { SELF_DRIVE_CONTEXT_SCHEMA } from '../contracts/self-drive-context.types';
import type {
  EnvironmentSlice,
  RoadConditionSlice,
  RegulationSlice,
  ResourceSlice,
  SelfDriveContext,
  TripExecutionSlice,
} from '../contracts/self-drive-context.types';
import {
  buildContextRoadEvidence,
  roadEvidenceToEvidenceRefs,
} from '../evidence/build-context-road-evidence';
import { buildRouteUnderstandingFromSkeleton } from '../route/build-route-understanding-from-skeleton';
import { projectPackAdvisories } from './project-pack-advisories';

export interface BuildSelfDriveContextInput {
  tripId: string;
  destination: string;
  localDate?: string;
  timezone?: string;
  dayIndex?: number;
  metadata?: unknown;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  classicRouteId?: string | null;
  /** 行程天数（选骨架 variant） */
  preferredDays?: number | null;
  /** K2：可选 live 路况（由 Evidence Adapter 注入） */
  corridorLiveRoadStatus?: RoadStatus | null;
  liveRoadStatusBySegmentId?: Record<string, RoadStatus>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeCountry(destination: string): string {
  const d = destination.trim().toUpperCase();
  if (d === 'CHINA' || d === 'CHN' || d === '中国' || d.startsWith('CN')) return 'CN';
  if (d === 'ICELAND' || d.startsWith('IS')) return 'IS';
  if (d === 'NEW ZEALAND' || d.startsWith('NZ')) return 'NZ';
  return d.slice(0, 2) || 'UNKNOWN';
}

function toIsoDate(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

function todayLocalFallback(): string {
  return new Date().toISOString().slice(0, 10);
}

function resolveClassicRouteId(
  meta: Record<string, unknown> | null,
  explicit?: string | null,
): string | null {
  if (explicit && String(explicit).trim()) return String(explicit).trim();
  if (!meta) return null;
  if (typeof meta.classicRouteId === 'string' && meta.classicRouteId.trim()) {
    return meta.classicRouteId.trim();
  }
  const driving = asRecord(meta.drivingContext);
  if (typeof driving?.classicRouteId === 'string' && driving.classicRouteId.trim()) {
    return driving.classicRouteId.trim();
  }
  const isd = asRecord(meta.icelandSelfDrive);
  if (typeof isd?.classicRouteId === 'string' && isd.classicRouteId.trim()) {
    return isd.classicRouteId.trim();
  }
  // IS routeStrategy → 常见经典线 id（弱映射）
  const strategy = String(isd?.routeStrategy ?? '').toUpperCase();
  if (strategy.includes('GOLDEN')) return 'is.route.golden_circle';
  if (strategy.includes('SOUTH')) return 'is.route.ring_road_south';
  if (strategy.includes('RING')) return 'is.route.ring_road';
  if (strategy.includes('HIGHLAND') || strategy.includes('FROAD')) {
    return 'is.route.highlands';
  }
  return null;
}

function mapRoadStatus(raw: unknown): RoadConditionSlice['status'] {
  const s = String(raw ?? '').toUpperCase();
  if (s === 'OPEN') return 'OPEN';
  if (s === 'CLOSED') return 'CLOSED';
  if (s === 'DIFFICULT') return 'DIFFICULT';
  if (s === 'RESTRICTED' || s === 'LIMITED' || s === 'CAUTION') return 'RESTRICTED';
  if (!s) return 'UNKNOWN';
  return 'RESTRICTED';
}

function buildRoadConditions(
  countryCode: string,
  meta: Record<string, unknown> | null,
  primaryEvidenceStatus?: string,
  primaryReasonZh?: string,
  primarySource?: string,
  primaryGrade?: string,
): RoadConditionSlice {
  if (primaryEvidenceStatus) {
    return {
      status: mapRoadStatus(primaryEvidenceStatus),
      reasonZh: primaryReasonZh,
      source: primarySource,
      evidenceGrade: primaryGrade,
    };
  }
  const driving = asRecord(meta?.drivingContext);
  if (driving?.roadStatus != null) {
    return {
      status: mapRoadStatus(driving.roadStatus),
      riskLevel:
        typeof driving.roadRiskLevel === 'number' ? driving.roadRiskLevel : undefined,
      reasonZh:
        Array.isArray(driving.advisoriesCN) && typeof driving.advisoriesCN[0] === 'string'
          ? driving.advisoriesCN[0]
          : undefined,
      source: countryCode === 'CN' ? 'cn.seasonal-advisory' : undefined,
      evidenceGrade: 'seasonal_static',
    };
  }
  return { status: 'UNKNOWN' };
}

function buildEnvironment(
  meta: Record<string, unknown> | null,
): EnvironmentSlice {
  const driving = asRecord(meta?.drivingContext);
  const seasonWindowIds = Array.isArray(driving?.seasonWindowIds)
    ? driving!.seasonWindowIds.filter((x): x is string => typeof x === 'string')
    : Array.isArray(driving?.highSeveritySeasonHits)
      ? driving!.highSeveritySeasonHits.filter((x): x is string => typeof x === 'string')
      : undefined;

  return {
    requiresAltitudeAcclimatization: Boolean(
      driving?.requiresAltitudeAcclimatization,
    ),
    seasonWindowIds,
  };
}

function buildRegulations(
  meta: Record<string, unknown> | null,
  profileRentalCodes: string[],
): RegulationSlice {
  const driving = asRecord(meta?.drivingContext);
  const cityLimitCities = Array.isArray(driving?.cityLimitCities)
    ? driving!.cityLimitCities.filter((x): x is string => typeof x === 'string')
    : undefined;

  return {
    checkpointLikely: Boolean(driving?.checkpointLikely),
    cityLimitCities,
    etcRecommended:
      typeof driving?.etcRecommended === 'boolean' ? driving.etcRecommended : undefined,
    rentalRestrictionCodes: profileRentalCodes,
    wantsRestrictedRegion: Boolean(driving?.wantsXizang || driving?.wantsSichuan),
  };
}

function buildResources(meta: Record<string, unknown> | null): ResourceSlice {
  const driving = asRecord(meta?.drivingContext);
  const constraints = asRecord(meta?.constraints);
  const thresholds = asRecord(constraints?.drivingSegmentThresholds);

  return {
    drivingThresholdPackCode:
      typeof driving?.drivingThresholdPackCode === 'string'
        ? driving.drivingThresholdPackCode
        : typeof constraints?.drivingThresholdPackCode === 'string'
          ? constraints.drivingThresholdPackCode
          : null,
    warnSegmentDistanceKm:
      typeof thresholds?.warnSegmentDistanceKm === 'number'
        ? thresholds.warnSegmentDistanceKm
        : undefined,
    maxSegmentDistanceKm:
      typeof thresholds?.maxSegmentDistanceKm === 'number'
        ? thresholds.maxSegmentDistanceKm
        : undefined,
  };
}

function buildTripExecution(meta: Record<string, unknown> | null): TripExecutionSlice {
  const productLine =
    typeof meta?.productLine === 'string' ? meta.productLine : null;
  const isSelfDrive =
    meta?.isSelfDrive === true ||
    meta?.travelMode === 'self_drive' ||
    Boolean(productLine && /self_drive/i.test(productLine)) ||
    Boolean(asRecord(meta?.icelandSelfDrive));

  return { productLine, isSelfDrive };
}

function corridorNameZh(countryCode: string, corridorId: string | null): string | null {
  if (!corridorId) return null;
  if (countryCode === 'CN') {
    return getCnClassicRouteById(corridorId)?.nameCN ?? null;
  }
  return null;
}

function routeSeverityHigh(countryCode: string, corridorId: string | null): boolean {
  if (countryCode !== 'CN' || !corridorId) return false;
  return getCnClassicRouteById(corridorId)?.severity === 'high';
}

function preferredDaysFromDates(
  start: string | null,
  end: string | null,
  explicit?: number | null,
): number | null {
  if (explicit != null && Number.isFinite(explicit)) return explicit;
  if (!start || !end) return null;
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.round((b - a) / 86400000) + 1;
}

function legacyAdvisories(meta: Record<string, unknown> | null): string[] {
  const driving = asRecord(meta?.drivingContext);
  if (!Array.isArray(driving?.advisoriesCN)) return [];
  return driving.advisoriesCN.filter((x): x is string => typeof x === 'string');
}

export function buildSelfDriveContext(
  input: BuildSelfDriveContextInput,
): SelfDriveContext {
  const countryCode = normalizeCountry(input.destination);
  const meta = asRecord(input.metadata);
  const localDate =
    toIsoDate(input.localDate) ||
    toIsoDate(input.startDate) ||
    todayLocalFallback();
  const timezone =
    input.timezone ||
    (countryCode === 'CN' ? 'Asia/Shanghai' : countryCode === 'IS' ? 'Atlantic/Reykjavik' : 'UTC');
  const dayIndex = Math.max(1, Math.floor(input.dayIndex ?? 1));
  const corridorId = resolveClassicRouteId(meta, input.classicRouteId);
  const start = toIsoDate(input.startDate);
  const end = toIsoDate(input.endDate);
  const preferredDays = preferredDaysFromDates(start, end, input.preferredDays);

  const capabilities = resolveDestinationSelfDriveCapabilities(countryCode);
  const destinationPackId =
    capabilities.packId || resolveDestinationPackId(countryCode);

  const profile = resolveSelfDriveProfile({
    tripId: input.tripId,
    tripMetadata: meta,
    destinationCountry: countryCode,
  });

  const resources = buildResources(meta);
  const environment = buildEnvironment(meta);
  const regulations = buildRegulations(
    meta,
    (profile.rentalRestrictions ?? []).map((r) => r.code),
  );
  const tripExecution = buildTripExecution(meta);

  const route = buildRouteUnderstandingFromSkeleton({
    countryCode,
    corridorId,
    corridorNameZh: corridorNameZh(countryCode, corridorId),
    dayIndex,
    preferredDays,
    warnSegmentDistanceKm: resources.warnSegmentDistanceKm,
    routeSeverityHigh: routeSeverityHigh(countryCode, corridorId),
    wantsAltitude: environment.requiresAltitudeAcclimatization,
    checkpointLikely: regulations.checkpointLikely,
  });

  const roadEvidence = buildContextRoadEvidence({
    countryCode,
    corridorId,
    asOfDate: localDate,
    segments: route.segments,
    corridorLive: input.corridorLiveRoadStatus,
    liveBySegmentId: input.liveRoadStatusBySegmentId,
  });
  const primaryEv = roadEvidence[0];
  const roadConditions = buildRoadConditions(
    countryCode,
    meta,
    primaryEv?.status,
    primaryEv?.reasonZh,
    primaryEv?.source,
    primaryEv?.evidenceGrade,
  );

  const advisories = projectPackAdvisories({
    roadConditions,
    environment,
    regulations,
    route,
    legacyAdvisoryLinesZh: legacyAdvisories(meta),
  });

  const builtAt = new Date().toISOString();

  return {
    schemaId: SELF_DRIVE_CONTEXT_SCHEMA,
    tripId: input.tripId,
    localDate,
    timezone,
    destinationPackId,
    countryCode,
    capabilities,
    profile,
    vehicle: profile.vehicle,
    driver: profile.drivers,
    route,
    roadConditions,
    environment,
    regulations,
    tripExecution,
    resources,
    advisories,
    roadEvidence,
    evidence: roadEvidenceToEvidenceRefs(roadEvidence),
    builtAt,
  };
}
