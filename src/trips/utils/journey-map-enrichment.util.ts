import type { CoverageMapData, PoiCoverage, SegmentCoverage } from '../readiness/types/coverage-map.types';
import { DateTime } from 'luxon';
import type { PlanningDaySplitDto } from '../trip-constraint-solver/types/planning-conflicts.types';
import type {
  JourneyMapDaySummaryDto,
  JourneyMapDiversionDto,
  JourneyMapDataFeedDto,
  JourneyMapMemberDto,
  JourneyMapMemberGroupDto,
  JourneyMapMemberGroupId,
  JourneyMapStatsDto,
} from '../dto/journey-map.dto';

export type TravelerSlotType = 'ADULT' | 'ELDERLY' | 'CHILD';

export interface JourneyMapKnownMember {
  id: string;
  name: string;
}

const MEMBER_GROUP_LABELS: Record<JourneyMapMemberGroupId, string> = {
  young: '年轻人组',
  elderly: '长者组',
  children: '儿童组',
};

const AVATAR_COLORS = [
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#f97316',
  '#14b8a6',
  '#0ea5e9',
  '#a855f7',
  '#ef4444',
  '#22c55e',
  '#eab308',
];

const VARIANT_COLORS: Record<string, string> = {
  blue: '#8b5cf6',
  orange: '#f97316',
  purple: '#a855f7',
};

const ACTIVITY_ITEM_TYPES = new Set(['ACTIVITY', 'REST', 'MEAL_ANCHOR', 'MEAL_FLOATING']);

function travelerTypeToGroupId(type: TravelerSlotType): JourneyMapMemberGroupId {
  if (type === 'ELDERLY') return 'elderly';
  if (type === 'CHILD') return 'children';
  return 'young';
}

export function buildMemberInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
  }
  return trimmed.slice(0, 2);
}

export function resolveAvatarColor(memberId: string): string {
  let hash = 0;
  for (let i = 0; i < memberId.length; i += 1) {
    hash = (hash * 31 + memberId.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]!;
}

function readTravelersArray(raw: unknown): TravelerSlotType[] | null {
  if (!raw || typeof raw !== 'object') return null;
  const travelers = (raw as { travelers?: unknown[] }).travelers;
  if (!Array.isArray(travelers) || travelers.length === 0) return null;
  return travelers.map((entry) => {
    const type = (entry as { type?: string })?.type;
    if (type === 'ELDERLY' || type === 'CHILD') return type;
    return 'ADULT';
  });
}

function readTravelersFromFlags(raw: unknown): TravelerSlotType[] | null {
  if (!raw || typeof raw !== 'object') return null;
  const meta = raw as {
    hasChildren?: boolean;
    hasElderly?: boolean;
    has_children?: boolean;
    has_elderly?: boolean;
  };
  const hasChildren = meta.hasChildren === true || meta.has_children === true;
  const hasElderly = meta.hasElderly === true || meta.has_elderly === true;
  if (!hasChildren && !hasElderly) return null;

  const slots: TravelerSlotType[] = ['ADULT'];
  if (hasElderly) slots.push('ELDERLY');
  if (hasChildren) slots.push('CHILD');
  return slots;
}

export function resolveTravelerSlots(input: {
  pacingConfig?: unknown;
  metadata?: unknown;
  budgetConfig?: unknown;
  fallbackCount?: number;
}): TravelerSlotType[] {
  const fromConfig =
    readTravelersArray(input.pacingConfig) ??
    readTravelersArray(input.metadata) ??
    readTravelersArray(input.budgetConfig) ??
    readTravelersFromFlags(input.metadata) ??
    readTravelersFromFlags(input.pacingConfig);

  if (fromConfig?.length) return fromConfig;

  const count = Math.max(1, input.fallbackCount ?? 1);
  return Array.from({ length: count }, () => 'ADULT' as TravelerSlotType);
}

export function buildJourneyMapMembers(input: {
  tripId: string;
  knownMembers: JourneyMapKnownMember[];
  travelerSlots: TravelerSlotType[];
}): JourneyMapMemberDto[] {
  const slotCount = Math.max(input.travelerSlots.length, input.knownMembers.length, 1);
  const members: JourneyMapMemberDto[] = [];

  for (let index = 0; index < slotCount; index += 1) {
    const known = input.knownMembers[index];
    const slotType = input.travelerSlots[index] ?? input.travelerSlots.at(-1) ?? 'ADULT';
    const id = known?.id ?? `traveler-${input.tripId.slice(0, 8)}-${index + 1}`;
    const name = known?.name?.trim() || `旅行者 ${index + 1}`;

    members.push({
      id,
      name,
      initials: buildMemberInitials(name),
      groupId: travelerTypeToGroupId(slotType),
      avatarColor: resolveAvatarColor(id),
    });
  }

  return members;
}

export function buildJourneyMapMemberGroups(
  members: JourneyMapMemberDto[],
): JourneyMapMemberGroupDto[] {
  const counts: Record<JourneyMapMemberGroupId, number> = {
    young: 0,
    elderly: 0,
    children: 0,
  };
  for (const member of members) {
    counts[member.groupId] += 1;
  }

  return (Object.keys(MEMBER_GROUP_LABELS) as JourneyMapMemberGroupId[]).map((id) => ({
    id,
    label: MEMBER_GROUP_LABELS[id],
    count: counts[id],
  }));
}

function isTransitPoi(poi: PoiCoverage): boolean {
  const type = poi.type?.toUpperCase() ?? '';
  return type.includes('TRANSIT') || type.includes('TRANSPORT');
}

export function buildDaySummaries(input: {
  tripDays: Array<{ id: string; date: string; theme?: string | null }>;
  coverage: Pick<CoverageMapData, 'pois' | 'segments'>;
  itineraryItems: Record<string, unknown>[];
}): JourneyMapDaySummaryDto[] {
  const poiById = new Map(input.coverage.pois.map((poi) => [poi.id, poi]));
  const sortedDays = [...input.tripDays].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  return sortedDays.map((tripDay, index) => {
    const day = index + 1;

    const dayItems = input.itineraryItems
      .filter((item) => item.tripDayId === tripDay.id)
      .sort((a, b) =>
        String(a.startTime ?? '').localeCompare(String(b.startTime ?? '')),
      );

    if (dayItems.length >= 2) {
      const firstPlace = dayItems[0]?.Place as { nameCN?: string; name?: string } | undefined;
      const lastPlace = dayItems[dayItems.length - 1]?.Place as
        | { nameCN?: string; name?: string }
        | undefined;
      const from = firstPlace?.nameCN ?? firstPlace?.name;
      const to = lastPlace?.nameCN ?? lastPlace?.name;
      if (from && to && from !== to) return { day, routeLabel: `${from} → ${to}` };
      if (from) return { day, routeLabel: from };
    }

    const daySegments = input.coverage.segments
      .filter((segment) => segment.day === day)
      .sort((a, b) => (a.sequenceIndex ?? 0) - (b.sequenceIndex ?? 0));

    if (daySegments.length > 0) {
      const first = daySegments[0]!;
      const last = daySegments[daySegments.length - 1]!;
      const from = poiById.get(first.fromPoiId)?.name;
      const to = poiById.get(last.toPoiId)?.name;
      if (from && to && from !== to) return { day, routeLabel: `${from} → ${to}` };
      if (from) return { day, routeLabel: from };
    }

    const dayPois = input.coverage.pois
      .filter((poi) => poi.day === day && !isTransitPoi(poi))
      .sort((a, b) => a.order - b.order);

    if (dayPois.length >= 2) {
      const from = dayPois[0]!.name;
      const to = dayPois[dayPois.length - 1]!.name;
      if (from !== to) return { day, routeLabel: `${from} → ${to}` };
    }
    if (dayPois.length === 1) return { day, routeLabel: dayPois[0]!.name };

    if (tripDay.theme) return { day, routeLabel: tripDay.theme };
    return { day, routeLabel: `第 ${day} 天` };
  });
}

function formatFeedTs(iso?: string | null): string {
  if (!iso) return '—';
  try {
    const dt = DateTime.fromISO(iso);
    if (!dt.isValid) return '—';
    return dt.setLocale('zh-CN').toFormat('M/d HH:mm');
  } catch {
    return '—';
  }
}

export function buildDataFeeds(coverage: Pick<CoverageMapData, 'dataFreshness' | 'calculatedAt'>): JourneyMapDataFeedDto[] {
  const freshness = coverage.dataFreshness;
  const inventoryIso = freshness?.inventory ?? coverage.calculatedAt;

  return [
    {
      id: 'weather',
      label: '天气',
      updatedAt: formatFeedTs(freshness?.weather),
      status: freshness?.weather ? 'fresh' : 'stale',
    },
    {
      id: 'road',
      label: '道路状况',
      updatedAt: formatFeedTs(freshness?.roadClosure),
      status: freshness?.roadClosure ? 'fresh' : 'stale',
    },
    {
      id: 'hours',
      label: '开放时间',
      updatedAt: formatFeedTs(freshness?.openingHours),
      status: freshness?.openingHours ? 'fresh' : 'stale',
    },
    {
      id: 'inventory',
      label: '住宿库存',
      updatedAt: formatFeedTs(inventoryIso),
      status: inventoryIso ? 'fresh' : 'stale',
    },
  ];
}

function extractItemIdFromSegmentId(segmentId: string): string | undefined {
  const match = segmentId.match(/^seg_(.+)$/);
  return match?.[1];
}

function toActivityId(itemId: string | undefined, fallbackSegmentId: string): string {
  const raw = itemId ?? fallbackSegmentId.replace(/^seg_/, '');
  if (raw.startsWith('item-') || raw.startsWith('poi-')) return raw;
  return `item-${raw}`;
}

function resolveBranchColor(variant?: string, index = 0): string {
  if (variant && VARIANT_COLORS[variant]) return VARIANT_COLORS[variant]!;
  return index === 0 ? VARIANT_COLORS.blue! : VARIANT_COLORS.orange!;
}

function resolveSplitCoordinates(input: {
  daySplit: PlanningDaySplitDto;
  pois: PoiCoverage[];
  itineraryItems: Record<string, unknown>[];
}): [number, number] | undefined {
  const forkSegmentId = input.daySplit.fork?.afterSegmentId;
  const forkItemId = forkSegmentId ? extractItemIdFromSegmentId(forkSegmentId) : undefined;

  if (forkItemId) {
    const poi = input.pois.find((entry) => entry.itemId === forkItemId);
    if (poi?.coordinates) {
      return [poi.coordinates.lng, poi.coordinates.lat];
    }

    const item = input.itineraryItems.find((entry) => entry.id === forkItemId);
    const place = item?.Place as { metadata?: { lng?: number; lat?: number; coordinates?: number[] } } | undefined;
    const metadata = place?.metadata;
    if (metadata?.lng != null && metadata?.lat != null) {
      return [metadata.lng, metadata.lat];
    }
    if (Array.isArray(metadata?.coordinates) && metadata.coordinates.length >= 2) {
      return [metadata.coordinates[0]!, metadata.coordinates[1]!];
    }
  }

  const anchorSegment =
    input.daySplit.sharedBefore.at(-1) ??
    input.daySplit.branches[0]?.segments[0];
  if (!anchorSegment) return undefined;

  const anchorItemId = extractItemIdFromSegmentId(anchorSegment.id);
  if (!anchorItemId) return undefined;

  const poi = input.pois.find((entry) => entry.itemId === anchorItemId);
  if (poi?.coordinates) {
    return [poi.coordinates.lng, poi.coordinates.lat];
  }
  return undefined;
}

function buildDiversionGroupLabel(branch: PlanningDaySplitDto['branches'][number], fallback: string): string {
  const segmentTitle = branch.segments[0]?.title?.trim();
  const base = branch.groupLabel?.trim() || segmentTitle || fallback;
  const letter = branch.id?.includes('b') || branch.variant === 'orange' ? 'B' : 'A';
  if (/^[AB]组/.test(base)) return base;
  return `${letter}组 · ${base}`;
}

export function buildDiversionsFromDaySplits(input: {
  daySplits?: PlanningDaySplitDto[];
  pois: PoiCoverage[];
  itineraryItems: Record<string, unknown>[];
}): JourneyMapDiversionDto[] {
  if (!input.daySplits?.length) return [];

  return input.daySplits
    .filter((daySplit) => daySplit.branches.length >= 2)
    .map((daySplit) => {
      const branchA = daySplit.branches[0]!;
      const branchB = daySplit.branches[1]!;
      const segmentA = branchA.segments[0];
      const segmentB = branchB.segments[0];
      const itemIdA = segmentA ? extractItemIdFromSegmentId(segmentA.id) : undefined;
      const itemIdB = segmentB ? extractItemIdFromSegmentId(segmentB.id) : undefined;

      return {
        id: daySplit.splitPlanId || daySplit.id,
        dayIndex: daySplit.dayIndex ?? Math.max(0, daySplit.dayNumber - 1),
        title: daySplit.title,
        groupA: {
          label: buildDiversionGroupLabel(branchA, segmentA?.title ?? 'A组活动'),
          activityId: toActivityId(itemIdA, segmentA?.id ?? branchA.id),
          color: resolveBranchColor(branchA.variant, 0),
          participantIds: branchA.members?.map((member) => member.id),
        },
        groupB: {
          label: buildDiversionGroupLabel(branchB, segmentB?.title ?? 'B组活动'),
          activityId: toActivityId(itemIdB, segmentB?.id ?? branchB.id),
          color: resolveBranchColor(branchB.variant, 1),
          participantIds: branchB.members?.map((member) => member.id),
        },
        splitCoordinates: resolveSplitCoordinates({
          daySplit,
          pois: input.pois,
          itineraryItems: input.itineraryItems,
        }),
      };
    });
}

export function buildSplitParticipantMap(
  daySplits?: PlanningDaySplitDto[],
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  if (!daySplits?.length) return map;

  for (const daySplit of daySplits) {
    for (const branch of daySplit.branches) {
      const participantIds = branch.members?.map((member) => member.id) ?? [];
      if (participantIds.length === 0) continue;

      for (const segment of branch.segments) {
        const itemId = extractItemIdFromSegmentId(segment.id);
        if (itemId) {
          map.set(itemId, participantIds);
        }
      }
    }
  }

  return map;
}

export function enrichItineraryItemsWithParticipants(
  itineraryItems: Record<string, unknown>[],
  participantMap: Map<string, string[]>,
): Record<string, unknown>[] {
  if (participantMap.size === 0) return itineraryItems;

  return itineraryItems.map((item) => {
    const itemId = typeof item.id === 'string' ? item.id : undefined;
    if (!itemId) return item;
    const participantIds = participantMap.get(itemId);
    if (!participantIds?.length) return item;
    return { ...item, participantIds };
  });
}

function isActivityItem(item: Record<string, unknown>): boolean {
  const type = String(item.type ?? '').toUpperCase();
  if (!ACTIVITY_ITEM_TYPES.has(type)) return false;

  const place = item.Place as { category?: string } | undefined;
  const category = place?.category?.toUpperCase() ?? '';
  if (category.includes('HOTEL') || category.includes('ACCOMMODATION')) return false;
  return true;
}

export function buildJourneyMapStats(input: {
  dayCount: number;
  coverage: { segments: SegmentCoverage[] };
  itineraryItems: Record<string, unknown>[];
  diversions: JourneyMapDiversionDto[];
}): JourneyMapStatsDto {
  const totalDistanceKm = input.coverage.segments.reduce(
    (sum, segment) => sum + (segment.distance ?? 0),
    0,
  );

  return {
    totalDays: input.dayCount,
    totalDistanceKm: Math.round(totalDistanceKm),
    activityCount: input.itineraryItems.filter(isActivityItem).length,
    diversionCount: input.diversions.length,
  };
}

export function buildKnownMembers(input: {
  owner?: JourneyMapKnownMember | null;
  collaborators: Array<{ userId: string; displayName?: string | null }>;
}): JourneyMapKnownMember[] {
  const seen = new Set<string>();
  const members: JourneyMapKnownMember[] = [];

  if (input.owner?.id && !seen.has(input.owner.id)) {
    seen.add(input.owner.id);
    members.push({
      id: input.owner.id,
      name: input.owner.name?.trim() || '发起人',
    });
  }

  for (const collaborator of input.collaborators) {
    if (seen.has(collaborator.userId)) continue;
    seen.add(collaborator.userId);
    members.push({
      id: collaborator.userId,
      name: collaborator.displayName?.trim() || `成员 ${collaborator.userId.slice(0, 6)}`,
    });
  }

  return members;
}

export function extractTripOwnerId(metadata: unknown): string | undefined {
  const ownerId = (metadata as { userId?: string } | null)?.userId;
  return typeof ownerId === 'string' && ownerId.length > 0 ? ownerId : undefined;
}
