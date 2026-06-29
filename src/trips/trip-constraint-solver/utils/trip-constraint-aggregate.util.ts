/**
 * 从 Trip 存量字段合成 TripConstraint 列表（读模型 SSOT）
 */

import type { ConstraintsSummaryResponse } from '../types/constraints-summary.types';
import type { TeamWishViewItem } from '../../wishlist/types/trip-wish.types';
import type {
  StoredUnifiedConstraint,
  TripConstraint,
  TripConstraintCardTone,
  TripConstraintMetadataExtension,
  TripConstraintStatus,
  TripConstraintsListMeta,
} from '../types/trip-constraint.types';
import { TRIP_CONSTRAINT_LEGACY_IDS as LEGACY_IDS } from '../types/trip-constraint.types';
import type { PlanningConflictItem } from '../types/planning-conflicts.types';
import {
  readUserMaxSegmentDistanceKm,
  resolveSegmentDistanceThresholds,
} from './segment-distance-threshold.util';
import {
  isSelfDriveTrip,
  readUserMaxDailyDrivingHours,
  resolveMaxDailyDrivingHours,
} from './daily-drive-threshold.util';
import {
  buildConstraintsListSections,
  buildCountryOfficialConstraints,
  normalizeTripDestinationCode,
} from './country-official-constraints.util';
import { inferConflictConstraintIds } from './constraint-conflict-link.util';

type TripRow = {
  id: string;
  destination?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  pacingConfig: unknown;
  budgetConfig: unknown;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
  TripDay?: Array<{
    id: string;
    date: Date;
    ItineraryItem?: Array<{
      type?: string;
      note?: string | null;
      Place?: {
        nameCN?: string | null;
        nameEN?: string | null;
        metadata?: unknown;
      } | null;
    }>;
  }>;
};

function readMetaExt(metadata: unknown): TripConstraintMetadataExtension {
  if (!metadata || typeof metadata !== 'object') return {};
  return metadata as TripConstraintMetadataExtension;
}

function isDisabled(id: string, ext: TripConstraintMetadataExtension): boolean {
  return (ext.disabledConstraintIds ?? []).includes(id);
}

function isLocked(id: string, ext: TripConstraintMetadataExtension): boolean {
  return ext.legacyConstraintLocks?.[id] === true;
}

function baseStatus(
  id: string,
  ext: TripConstraintMetadataExtension,
  fieldReady?: boolean,
): TripConstraintStatus {
  if (isDisabled(id, ext)) return 'DISABLED';
  if (fieldReady === false) return 'DRAFT';
  if (isLocked(id, ext)) return 'LOCKED';
  return fieldReady === true ? 'ACTIVE' : 'ACTIVE';
}

function withConflict(
  c: TripConstraint,
  conflictIds: Set<string>,
): TripConstraint {
  const hasConflict = conflictIds.has(c.id);
  const merged: TripConstraint = {
    ...c,
    hasConflict,
    status: hasConflict && c.status !== 'DISABLED' ? 'CONFLICTED' : c.status,
  };
  return { ...merged, cardTone: resolveConstraintCardTone(merged) };
}

/** 约束卡片视觉 — 正常 HARD 约束不用红框，仅冲突/待确认 accent */
export function resolveConstraintCardTone(
  c: Pick<TripConstraint, 'status' | 'hasConflict'>,
): TripConstraintCardTone {
  if (c.status === 'DISABLED') return 'muted';
  if (c.hasConflict || c.status === 'CONFLICTED' || c.status === 'UNSATISFIED') {
    return 'danger';
  }
  if (c.status === 'DRAFT' || c.status === 'OUTDATED') return 'caution';
  return 'default';
}

function buildLegacyTimeRange(
  trip: TripRow,
  ext: TripConstraintMetadataExtension,
  summary: ConstraintsSummaryResponse,
  userId: string,
): TripConstraint {
  const id = LEGACY_IDS.TIME_RANGE;
  const ready = summary.timeRange.status === 'confirmed';
  return {
    id,
    tripId: trip.id,
    name: '行程总时长',
    description: '出发与返回日期及天数',
    category: 'TIME',
    type: 'HARD',
    status: baseStatus(id, ext, ready),
    scope: { type: 'TRIP' },
    operator: 'CONTAINS',
    value: {
      startDate: summary.timeRange.startDate,
      endDate: summary.timeRange.endDate,
      dayCount: summary.timeRange.dayCount,
    },
    allowRelaxation: false,
    locked: isLocked(id, ext),
    source: { type: 'USER' },
    visibility: 'TEAM',
    createdBy: userId,
    createdAt: trip.createdAt.toISOString(),
    updatedAt: trip.updatedAt.toISOString(),
    backing: { kind: 'legacy_field', field: 'startDate/endDate' },
  };
}

function buildLegacyBudget(
  trip: TripRow,
  ext: TripConstraintMetadataExtension,
  summary: ConstraintsSummaryResponse,
  userId: string,
): TripConstraint | null {
  if (summary.budget.total == null) return null;
  const id = LEGACY_IDS.BUDGET_TOTAL;
  const ready = summary.budget.status === 'confirmed';
  return {
    id,
    tripId: trip.id,
    name: '总预算上限',
    category: 'BUDGET',
    type: 'HARD',
    status: baseStatus(id, ext, ready),
    scope: { type: 'TRIP' },
    operator: 'LTE',
    value: summary.budget.total,
    unit: summary.budget.currency,
    allowRelaxation: summary.budget.gateStatus === 'NEED_ADJUST',
    locked: isLocked(id, ext),
    source: { type: 'USER' },
    visibility: 'TEAM',
    createdBy: userId,
    createdAt: trip.createdAt.toISOString(),
    updatedAt: trip.updatedAt.toISOString(),
    backing: { kind: 'legacy_field', field: 'budgetConfig' },
  };
}

function buildLegacyTravelers(
  trip: TripRow,
  ext: TripConstraintMetadataExtension,
  summary: ConstraintsSummaryResponse,
  userId: string,
): TripConstraint {
  const id = LEGACY_IDS.TRAVELERS;
  const ready = summary.travelers.status === 'confirmed';
  return {
    id,
    tripId: trip.id,
    name: '出行人数',
    category: 'MEMBER',
    type: 'HARD',
    status: baseStatus(id, ext, ready),
    scope: { type: 'TRIP' },
    operator: 'EQ',
    value: {
      count: summary.travelers.count,
      memberCount: summary.travelers.memberCount,
      profilingCompletedCount: summary.travelers.profilingCompletedCount,
    },
    allowRelaxation: false,
    locked: isLocked(id, ext),
    source: { type: 'USER' },
    visibility: 'TEAM',
    createdBy: userId,
    createdAt: trip.createdAt.toISOString(),
    updatedAt: trip.updatedAt.toISOString(),
    backing: { kind: 'legacy_field', field: 'pacingConfig/metadata.travelers' },
  };
}

function buildLegacyTransport(
  trip: TripRow,
  ext: TripConstraintMetadataExtension,
  summary: ConstraintsSummaryResponse,
  userId: string,
): TripConstraint | null {
  if (!summary.transport.travelMode) return null;
  const id = LEGACY_IDS.TRANSPORT_MODE;
  const ready = summary.transport.status === 'confirmed';
  return {
    id,
    tripId: trip.id,
    name: '出行方式',
    category: 'TRANSPORT',
    type: 'HARD',
    status: baseStatus(id, ext, ready),
    scope: { type: 'TRIP' },
    operator: 'EQ',
    value: summary.transport.travelMode,
    allowRelaxation: false,
    locked: isLocked(id, ext),
    source: { type: 'USER' },
    visibility: 'TEAM',
    createdBy: userId,
    createdAt: trip.createdAt.toISOString(),
    updatedAt: trip.updatedAt.toISOString(),
    backing: { kind: 'legacy_field', field: 'pacingConfig.travelMode' },
  };
}

function buildIntentConstraints(
  trip: TripRow,
  ext: TripConstraintMetadataExtension,
  metadata: Record<string, unknown>,
  pacing: Record<string, unknown>,
  userId: string,
): TripConstraint[] {
  const constraints = (metadata.constraints as Record<string, unknown>) ?? {};
  const out: TripConstraint[] = [];
  const now = trip.updatedAt.toISOString();

  if (pacing.level) {
    const id = LEGACY_IDS.PACING_LEVEL;
    out.push({
      id,
      tripId: trip.id,
      name: '行程节奏',
      category: 'ACTIVITY',
      type: 'SOFT',
      status: baseStatus(id, ext),
      scope: { type: 'TRIP' },
      operator: 'EQ',
      value: pacing.level,
      priority: 5,
      allowRelaxation: true,
      locked: isLocked(id, ext),
      source: { type: 'USER' },
      visibility: 'TEAM',
      createdBy: userId,
      createdAt: trip.createdAt.toISOString(),
      updatedAt: now,
      backing: { kind: 'legacy_field', field: 'pacingConfig.level' },
    });
  }

  if (Array.isArray(constraints.mustPlaces) && constraints.mustPlaces.length > 0) {
    const id = LEGACY_IDS.MUST_PLACES;
    out.push({
      id,
      tripId: trip.id,
      name: '必去地点',
      category: 'DESTINATION',
      type: 'HARD',
      status: baseStatus(id, ext),
      scope: { type: 'TRIP' },
      operator: 'IN',
      value: constraints.mustPlaces,
      allowRelaxation: false,
      locked: isLocked(id, ext),
      source: { type: 'USER' },
      visibility: 'TEAM',
      createdBy: userId,
      createdAt: trip.createdAt.toISOString(),
      updatedAt: now,
      backing: { kind: 'legacy_field', field: 'metadata.constraints.mustPlaces' },
    });
  }

  if (Array.isArray(constraints.avoidPlaces) && constraints.avoidPlaces.length > 0) {
    const id = LEGACY_IDS.AVOID_PLACES;
    out.push({
      id,
      tripId: trip.id,
      name: '避开地点',
      category: 'DESTINATION',
      type: 'SOFT',
      status: baseStatus(id, ext),
      scope: { type: 'TRIP' },
      operator: 'NOT_IN',
      value: constraints.avoidPlaces,
      priority: 6,
      allowRelaxation: true,
      locked: isLocked(id, ext),
      source: { type: 'USER' },
      visibility: 'TEAM',
      createdBy: userId,
      createdAt: trip.createdAt.toISOString(),
      updatedAt: now,
      backing: { kind: 'legacy_field', field: 'metadata.constraints.avoidPlaces' },
    });
  }

  if (typeof constraints.dailyWalkLimit === 'number') {
    const id = LEGACY_IDS.DAILY_WALK_LIMIT;
    out.push({
      id,
      tripId: trip.id,
      name: '每日步行上限',
      category: 'MEMBER',
      type: 'HARD',
      status: baseStatus(id, ext),
      scope: { type: 'TRIP' },
      operator: 'LTE',
      value: constraints.dailyWalkLimit,
      unit: 'km',
      allowRelaxation: true,
      locked: isLocked(id, ext),
      source: { type: 'USER' },
      visibility: 'TEAM',
      createdBy: userId,
      createdAt: trip.createdAt.toISOString(),
      updatedAt: now,
      backing: { kind: 'legacy_field', field: 'metadata.constraints.dailyWalkLimit' },
    });
  }

  const segmentThresholds = resolveSegmentDistanceThresholds({
    destination: trip.destination,
    metadata,
  });
  const explicitMaxSegment = readUserMaxSegmentDistanceKm(metadata);
  {
    const id = LEGACY_IDS.MAX_SEGMENT_DISTANCE;
    out.push({
      id,
      tripId: trip.id,
      name: '单段最长行驶距离',
      description: '相邻景点间单次驾驶直线距离上限（Coverage Map / road_class 检测）',
      category: 'TRANSPORT',
      type: 'HARD',
      status: baseStatus(id, ext),
      scope: { type: 'ROUTE_SEGMENT' },
      operator: 'LTE',
      value: segmentThresholds.maxSegmentDistanceKm,
      unit: 'km',
      allowRelaxation: true,
      locked: isLocked(id, ext),
      source: {
        type:
          explicitMaxSegment != null
            ? 'USER'
            : segmentThresholds.source === 'country_default'
              ? 'OFFICIAL_RULE'
              : 'OFFICIAL_RULE',
      },
      visibility: 'TEAM',
      createdBy: userId,
      createdAt: trip.createdAt.toISOString(),
      updatedAt: now,
      backing: { kind: 'legacy_field', field: 'metadata.constraints.maxSegmentDistanceKm' },
    });
  }

  const dailyDrive = resolveMaxDailyDrivingHours({
    metadata,
    pacingConfig: pacing,
    allowPacingDefault: isSelfDriveTrip(pacing),
  });
  const explicitDailyDrive = readUserMaxDailyDrivingHours(metadata);
  if (dailyDrive) {
    const id = LEGACY_IDS.MAX_DAILY_DRIVE;
    out.push({
      id,
      tripId: trip.id,
      name: '每日驾驶上限',
      description: '单日累计驾驶时长上限（planning-conflicts / decision-checker）',
      category: 'TRANSPORT',
      type: 'HARD',
      status: baseStatus(id, ext),
      scope: { type: 'TRIP' },
      operator: 'LTE',
      value: dailyDrive.maxDailyDrivingHours,
      unit: 'hour',
      allowRelaxation: true,
      locked: isLocked(id, ext),
      source: {
        type:
          explicitDailyDrive != null
            ? 'USER'
            : dailyDrive.source === 'pacing_default'
              ? 'USER'
              : 'OFFICIAL_RULE',
      },
      visibility: 'TEAM',
      createdBy: userId,
      createdAt: trip.createdAt.toISOString(),
      updatedAt: now,
      backing: { kind: 'legacy_field', field: 'metadata.constraints.maxDailyDrivingHours' },
    });
  }

  if (metadata.planningPolicy) {
    const id = LEGACY_IDS.PLANNING_POLICY;
    out.push({
      id,
      tripId: trip.id,
      name: '规划策略',
      category: 'CUSTOM',
      type: 'SOFT',
      status: baseStatus(id, ext),
      scope: { type: 'TRIP' },
      operator: 'EQ',
      value: metadata.planningPolicy,
      priority: 4,
      allowRelaxation: true,
      locked: isLocked(id, ext),
      source: { type: 'USER' },
      visibility: 'TEAM',
      createdBy: userId,
      createdAt: trip.createdAt.toISOString(),
      updatedAt: now,
      backing: { kind: 'legacy_field', field: 'metadata.planningPolicy' },
    });
  }

  const lunch =
    metadata.lunch_strategy ??
    (metadata.tripParams as Record<string, unknown> | undefined)?.lunch_strategy;
  if (lunch) {
    const id = LEGACY_IDS.LUNCH_STRATEGY;
    out.push({
      id,
      tripId: trip.id,
      name: '午餐时间窗策略',
      category: 'TIME',
      type: 'SOFT',
      status: baseStatus(id, ext),
      scope: { type: 'TRIP' },
      operator: 'EQ',
      value: lunch,
      priority: 3,
      allowRelaxation: true,
      locked: isLocked(id, ext),
      source: { type: 'USER' },
      visibility: 'TEAM',
      createdBy: userId,
      createdAt: trip.createdAt.toISOString(),
      updatedAt: now,
      backing: { kind: 'legacy_field', field: 'metadata.lunch_strategy' },
    });
  }

  return out;
}

function mapWishToConstraint(wish: TeamWishViewItem, trip: TripRow): TripConstraint {
  const id = `c_wish_${wish.id}`;
  const visibility = wish.visibility === 'anonymous' ? 'ANONYMOUS' : 'TEAM';

  return {
    id,
    tripId: trip.id,
    name: wish.categoryLabel || '成员偏好',
    description: wish.text,
    category: mapWishCategory(wish.category),
    type: wish.importance >= 8 ? 'HARD' : 'SOFT',
    status: 'ACTIVE',
    scope: { type: 'MEMBER' },
    operator: 'CONTAINS',
    value: {
      text: wish.text,
      importance: wish.importance,
      authorDisplayName: wish.authorDisplayName,
    },
    priority: wish.importance,
    allowRelaxation: wish.importance < 8,
    locked: false,
    source: { type: 'MEMBER', sourceId: wish.id },
    visibility,
    createdBy: wish.authorDisplayName ?? 'team',
    createdAt: wish.createdAt,
    updatedAt: wish.createdAt,
    backing: { kind: 'wish', wishId: wish.id },
  };
}

function mapWishCategory(category: string): TripConstraint['category'] {
  const map: Record<string, TripConstraint['category']> = {
    destination_route: 'DESTINATION',
    main_transport: 'TRANSPORT',
    accommodation: 'ACCOMMODATION',
    activities: 'ACTIVITY',
    dining: 'ACTIVITY',
    local_transport: 'TRANSPORT',
    shopping: 'ACTIVITY',
    insurance_visa: 'SAFETY',
  };
  return map[category] ?? 'CUSTOM';
}

function mapStoredUnified(stored: StoredUnifiedConstraint, tripId: string): TripConstraint {
  return {
    ...stored,
    tripId,
    status: stored.status ?? 'ACTIVE',
    backing: { kind: 'unified_store' },
  };
}

function buildWorldFeasibility(
  trip: TripRow,
  ext: TripConstraintMetadataExtension,
  userId: string,
  isStale?: boolean,
): TripConstraint | null {
  const meta = trip.metadata as Record<string, unknown> | undefined;
  const snapshot = meta?.feasibilityReportSnapshot as { verifiedAt?: string } | undefined;
  if (!snapshot?.verifiedAt) return null;

  const id = LEGACY_IDS.WORLD_FEASIBILITY;
  return {
    id,
    tripId: trip.id,
    name: '可执行性验证快照',
    description: '行前世界状态与方案可执行性综合验证',
    category: 'WORLD_STATE',
    type: 'EXTERNAL',
    status: isStale ? 'OUTDATED' : 'ACTIVE',
    scope: { type: 'TRIP' },
    operator: 'CUSTOM',
    value: { verifiedAt: snapshot.verifiedAt },
    allowRelaxation: false,
    locked: true,
    source: { type: 'WORLD_DATA' },
    visibility: 'TEAM',
    createdBy: userId,
    createdAt: trip.createdAt.toISOString(),
    updatedAt: trip.updatedAt.toISOString(),
    backing: { kind: 'world_snapshot' },
  };
}

export { inferConflictConstraintIds } from './constraint-conflict-link.util';

export function aggregateTripConstraints(input: {
  trip: TripRow;
  summary: ConstraintsSummaryResponse;
  teamWishes?: TeamWishViewItem[];
  conflicts?: PlanningConflictItem[];
  isFeasibilityStale?: boolean;
  userId: string;
}): { items: TripConstraint[]; meta: TripConstraintsListMeta } {
  const { trip, summary, teamWishes = [], conflicts = [], isFeasibilityStale, userId } = input;
  const ext = readMetaExt(trip.metadata);
  const metadata = (trip.metadata as Record<string, unknown>) ?? {};
  const pacing = (trip.pacingConfig as Record<string, unknown>) ?? {};

  const legacy: TripConstraint[] = [
    buildLegacyTimeRange(trip, ext, summary, userId),
    ...([buildLegacyBudget(trip, ext, summary, userId)].filter(Boolean) as TripConstraint[]),
    buildLegacyTravelers(trip, ext, summary, userId),
    ...([buildLegacyTransport(trip, ext, summary, userId)].filter(Boolean) as TripConstraint[]),
    ...buildIntentConstraints(trip, ext, metadata, pacing, userId),
    ...([buildWorldFeasibility(trip, ext, userId, isFeasibilityStale)].filter(Boolean) as TripConstraint[]),
  ];

  const unified = (ext.unifiedConstraints ?? []).map((s) => mapStoredUnified(s, trip.id));
  const wishes = teamWishes.map((w) => mapWishToConstraint(w, trip));
  const official = buildCountryOfficialConstraints(trip, userId);

  const conflictIds = inferConflictConstraintIds(conflicts);
  const all = [...legacy, ...unified, ...wishes, ...official].map((c) =>
    withConflict(c, conflictIds),
  );

  const countryCode = normalizeTripDestinationCode(trip.destination);
  const normalizedCountry = countryCode === 'GLOBAL' ? undefined : countryCode;

  const byType = { HARD: 0, SOFT: 0, EXTERNAL: 0 };
  const byStatus: Partial<Record<TripConstraintStatus, number>> = {};
  for (const c of all) {
    byType[c.type] += 1;
    byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
  }

  const meta: TripConstraintsListMeta = {
    tripId: trip.id,
    constraintsVersion: summary.constraintsVersion,
    total: all.length,
    byType,
    byStatus,
    conflictCount: all.filter((c) => c.hasConflict).length,
    pendingConfirmCount: summary.pendingCount,
    ...(normalizedCountry ? { countryCode: normalizedCountry } : {}),
    ...(normalizedCountry
      ? { sections: buildConstraintsListSections(normalizedCountry, all) }
      : {}),
  };

  return { items: all, meta };
}

export function classifyConstraintRefreshType(
  changes: Array<{ constraintId: string; patch: Record<string, unknown> }>,
): 'quick' | 'deep' {
  const deepIds = new Set<string>([
    LEGACY_IDS.TIME_RANGE,
    LEGACY_IDS.BUDGET_TOTAL,
    LEGACY_IDS.MUST_PLACES,
    LEGACY_IDS.TRANSPORT_MODE,
    LEGACY_IDS.DAILY_WALK_LIMIT,
    LEGACY_IDS.MAX_SEGMENT_DISTANCE,
    LEGACY_IDS.MAX_DAILY_DRIVE,
    LEGACY_IDS.TRAVELERS,
  ]);
  for (const ch of changes) {
    if (deepIds.has(ch.constraintId)) return 'deep';
    if (ch.patch.type === 'HARD') return 'deep';
    if (ch.patch.locked === true) return 'deep';
  }
  return 'quick';
}

export function isLegacyConstraintId(id: string): boolean {
  return (
    id.startsWith('c_') &&
    !id.startsWith('c_wish_') &&
    !id.startsWith('c_custom_') &&
    !id.startsWith('c_official_')
  );
}

export function newCustomConstraintId(): string {
  return `c_custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
