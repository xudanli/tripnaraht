/**
 * 分流方案 — 从 Schedule 真源构建 daySplits 与分组摘要
 */

import type { DecisionCheckerSplitPlanDto, DecisionCheckerMetricDto } from '../types/decision-checker.types';
import type {
  PlanningDaySplitDto,
  PlanningDaySplitMemberDto,
  PlanningDaySplitSegmentDto,
} from '../types/planning-conflicts.types';
import type { DecisionCheckerSplitGroupSegmentDto } from '../types/decision-checker.types';
import type { FeasibilityIssueDto } from '../types/trip-constraint-solver.types';
import type {
  SplitPlanScheduleItem,
  SplitPlanScheduleSource,
} from './split-plan-schedule.source.util';
import {
  analyzeRentalHotelSplit,
  findHotelDropoffForkIndex,
  formatHotelDropoffAiSuggestion,
  formatRentalHotelHighlight,
  formatRentalHotelTransport,
  isScheduledHotelItem,
} from './split-plan-rental-hotel.util';

export type SplitScheduleBuildInput = {
  schedule: SplitPlanScheduleSource;
  dayNumber: number;
  splitPlanId: string;
  kind: DecisionCheckerSplitPlanDto['kind'];
  triggerIssue?: FeasibilityIssueDto;
};

function isInternalHighlightText(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (/^\[(timelineDisplayRole|split):/i.test(t)) return true;
  if (t.startsWith('模板推荐的')) return true;
  return false;
}

function sanitizeHighlightText(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const t = raw.trim();
  if (isInternalHighlightText(t)) return undefined;
  return t.slice(0, 120);
}

const GENERIC_ACTIVITY_TITLES = new Set([
  '休息',
  '用餐',
  '转场',
  '汇合',
  '游览活动',
  '徒步活动',
  '行程点',
]);

/** 汇合点 / 时间轴节点展示用 — 优先 POI 名，避免「休息」等活动类型占位 */
function segmentPoiLabel(seg?: Pick<PlanningDaySplitSegmentDto, 'title' | 'placeName'>): string | undefined {
  if (!seg) return undefined;
  const place = seg.placeName?.trim();
  if (place && place !== '行程点' && !GENERIC_ACTIVITY_TITLES.has(place)) {
    return place;
  }
  const title = seg.title?.trim();
  if (title && title !== '汇合' && !GENERIC_ACTIVITY_TITLES.has(title)) {
    return title;
  }
  return place || title;
}

function segmentDisplayTitle(
  activityTitle: string,
  placeName: string,
  kind: PlanningDaySplitSegmentDto['kind'],
): string {
  if (kind === 'rejoin' || GENERIC_ACTIVITY_TITLES.has(activityTitle)) {
    return segmentPoiLabel({ title: activityTitle, placeName }) ?? placeName;
  }
  if (activityTitle?.trim() && !GENERIC_ACTIVITY_TITLES.has(activityTitle)) {
    return activityTitle;
  }
  return segmentPoiLabel({ title: activityTitle, placeName }) ?? placeName;
}

function segmentFromItem(
  item: SplitPlanScheduleItem,
  kind: PlanningDaySplitSegmentDto['kind'],
): PlanningDaySplitSegmentDto {
  const noteHighlight = sanitizeHighlightText(item.note);
  const placeName = item.placeName ?? item.placeLabel ?? item.title;
  const activityTitle = item.title;
  const displayTitle = segmentDisplayTitle(activityTitle, placeName, kind);
  return {
    id: `seg_${item.id}`,
    kind,
    startTime: item.startTime ?? '00:00',
    endTime: item.endTime,
    title: displayTitle,
    placeName,
    subtitle: kind === 'rejoin' && activityTitle !== displayTitle ? activityTitle : item.subtitle,
    intensity: item.intensity,
    riskLevel: item.riskLevel,
    costPerPerson: item.costPerPerson,
    // 地址已在 subtitle；勿再写入 highlights，避免时间轴重复展示
    highlights: noteHighlight ? [noteHighlight] : undefined,
  };
}

function branchMembers(
  schedule: SplitPlanScheduleSource,
  group: 'A' | 'B',
): PlanningDaySplitMemberDto[] | undefined {
  const cluster = group === 'A' ? schedule.memberCluster?.groupA : schedule.memberCluster?.groupB;
  if (!cluster?.members?.length) return undefined;
  return cluster.members.map((m) => ({
    id: m.id,
    displayName: m.displayName,
    avatarUrl: m.avatarUrl,
  }));
}

function segmentToGroupDto(seg: PlanningDaySplitSegmentDto): DecisionCheckerSplitGroupSegmentDto {
  const title = GENERIC_ACTIVITY_TITLES.has(seg.title)
    ? (segmentPoiLabel(seg) ?? seg.title)
    : seg.title;
  return {
    title,
    placeName: seg.placeName,
    startTime: seg.startTime,
    endTime: seg.endTime,
  };
}

function isSharedOnlyItem(item: SplitPlanScheduleItem): boolean {
  const note = item.note?.trim() ?? '';
  if (/^\[timelineDisplayRole:(landing_point|car_rental|departure_point)\]/i.test(note)) {
    return true;
  }
  if (item.type === 'TRANSIT') return true;
  return false;
}

/** 落地/租车/转场 — 全员同行，不参与 A/B 分支 */
function resolveSharedPrefixCount(items: SplitPlanScheduleItem[]): number {
  let count = 0;
  for (const item of items) {
    if (!isSharedOnlyItem(item)) break;
    count++;
  }
  return count;
}

function resolveForkItemId(
  items: SplitPlanScheduleItem[],
  issue?: FeasibilityIssueDto,
): string | undefined {
  const splittable = items.filter((i) => !isSharedOnlyItem(i));
  if (splittable.length === 0) return undefined;

  if (issue?.fromItemId) return issue.fromItemId;
  const proofItemId = issue?.proofs?.find((p) => p.itemId)?.itemId;
  if (proofItemId) return proofItemId;

  const high = splittable.find((i) => i.intensity === 'high');
  if (high) return high.id;

  const medium = splittable.find((i) => i.intensity === 'medium' && i.type === 'ACTIVITY');
  return medium?.id;
}

function resolveForkAt(items: SplitPlanScheduleItem[], issue?: FeasibilityIssueDto): number {
  const hotelDropoff = findHotelDropoffForkIndex(items);
  if (hotelDropoff != null) return hotelDropoff;

  const sharedPrefix = resolveSharedPrefixCount(items);
  const forkItemId = resolveForkItemId(items, issue);
  let forkIndex = forkItemId
    ? items.findIndex((i) => i.id === forkItemId)
    : items.findIndex((i) => i.intensity === 'high' && !isSharedOnlyItem(i));
  if (forkIndex < 0) {
    forkIndex = items.findIndex((i) => i.intensity === 'medium' && !isSharedOnlyItem(i));
  }
  if (forkIndex < 0) forkIndex = Math.max(sharedPrefix, Math.floor(items.length / 2));
  return Math.max(sharedPrefix, forkIndex);
}

/** 两组真正分开的时刻 — 酒店送达场景取 B 组出发时间，而非 A 组后续活动 */
function resolveForkStartTime(
  sharedBeforeItems: SplitPlanScheduleItem[],
  branchAItems: SplitPlanScheduleItem[],
  branchBItems: SplitPlanScheduleItem[],
): string {
  const bStart = branchBItems[0]?.startTime;
  const aStart = branchAItems[0]?.startTime;
  if (bStart && aStart) {
    return bStart <= aStart ? bStart : aStart;
  }
  if (bStart) return bStart;
  if (aStart) return aStart;
  const lastShared = sharedBeforeItems[sharedBeforeItems.length - 1];
  return lastShared?.endTime ?? lastShared?.startTime ?? '11:00';
}

function segmentLabels(segments: PlanningDaySplitSegmentDto[]): string {
  return segments
    .map((s) => segmentPoiLabel(s) ?? s.title)
    .filter(Boolean)
    .join('、');
}

function sharedRouteLabels(daySplit: PlanningDaySplitDto): string[] {
  return daySplit.sharedBefore
    .map((s) => segmentPoiLabel(s) ?? s.title)
    .filter((label): label is string => Boolean(label?.trim()));
}

function formatSplitPlanAiSuggestion(input: {
  daySplit: PlanningDaySplitDto;
  rentalHotel?: NonNullable<PlanningDaySplitDto['stats']>['rentalHotel'];
  branchATitles: string;
  kind: DecisionCheckerSplitPlanDto['kind'];
  trigger: FeasibilityIssueDto;
}): string {
  const { daySplit, rentalHotel, branchATitles, kind, trigger } = input;
  if (rentalHotel?.dropoffFeasible) {
    return formatHotelDropoffAiSuggestion({
      sharedRouteLabels: sharedRouteLabels(daySplit),
      forkTime: daySplit.fork?.startTime,
      hotelPlaceName: rentalHotel.hotelPlaceName,
      distanceKm: rentalHotel.distanceKm,
      driveMin: rentalHotel.driveMin,
      branchAActivities: branchATitles || undefined,
      meetupTime: daySplit.stats?.meetupTime,
    });
  }
  if (kind === 'weather_adaptive') {
    return '若天气恶化，可将户外活动切换为室内备选，B 组可延长休息时段。';
  }
  return '若体能或偏好仍有分歧，可与 Nara 讨论微调汇合时间与活动强度。';
}

function resolveRejoinItem(
  items: SplitPlanScheduleItem[],
  branchEndMs: number,
): SplitPlanScheduleItem | undefined {
  const hotel = items.find(
    (i) => i.type === 'REST' && /^\[timelineDisplayRole:hotel\]/i.test(i.note?.trim() ?? ''),
  );
  if (hotel) return hotel;

  const meal = items.find(
    (i) =>
      (i.type === 'MEAL_ANCHOR' || i.type === 'MEAL_FLOATING') &&
      i.startMs >= branchEndMs - 30 * 60 * 1000,
  );
  if (meal) return meal;

  return items.find((i) => i.startMs >= branchEndMs && i.intensity !== 'high');
}

function formatDurationHours(startMs: number, endMs: number): string {
  const hours = Math.max(1, Math.round((endMs - startMs) / (60 * 60 * 1000)));
  return `${hours} 小时`;
}

function formatHmFromMs(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

/** 汇合时刻：取全部分支最晚结束；仅当 anchor 为分支后 MEAL 时用 anchor 开始时间 */
function resolveMeetupTime(
  branchAItems: SplitPlanScheduleItem[],
  branchBItems: SplitPlanScheduleItem[],
  meetupAnchor: SplitPlanScheduleItem | undefined,
  branchEndMs: number,
): string {
  const allBranch = [...branchAItems, ...branchBItems];
  const latestEndMs = allBranch.length ? Math.max(...allBranch.map((i) => i.endMs)) : branchEndMs;
  const latestItem = allBranch.find((i) => i.endMs === latestEndMs);

  if (meetupAnchor) {
    const isMeal =
      meetupAnchor.type === 'MEAL_ANCHOR' || meetupAnchor.type === 'MEAL_FLOATING';
    const anchorStartsAfterBranches = meetupAnchor.startMs >= latestEndMs - 15 * 60 * 1000;

    if (isMeal && anchorStartsAfterBranches) {
      return meetupAnchor.startTime ?? formatHmFromMs(meetupAnchor.startMs);
    }
    // B 组先行酒店/休息：汇合点仍是 anchor POI，但时刻 = A/B 分支全部结束
    if (meetupAnchor.startMs < latestEndMs) {
      return latestItem?.endTime ?? latestItem?.startTime ?? formatHmFromMs(latestEndMs);
    }
    return meetupAnchor.startTime ?? formatHmFromMs(meetupAnchor.startMs);
  }

  return latestItem?.endTime ?? latestItem?.startTime ?? formatHmFromMs(latestEndMs);
}

function resolveRejoinEndTime(
  meetupAnchor: SplitPlanScheduleItem | undefined,
  meetupTime: string,
  branchAItems: SplitPlanScheduleItem[],
  branchBItems: SplitPlanScheduleItem[],
): string | undefined {
  if (!meetupAnchor) return undefined;
  const allBranch = [...branchAItems, ...branchBItems];
  const latestEndMs = allBranch.length ? Math.max(...allBranch.map((i) => i.endMs)) : 0;
  if (meetupAnchor.startMs >= latestEndMs - 15 * 60 * 1000) {
    return meetupAnchor.endTime;
  }
  return undefined;
}

export function buildDaySplitFromSchedule(input: SplitScheduleBuildInput): PlanningDaySplitDto | null {
  const day = input.schedule.days.find((d) => d.dayNumber === input.dayNumber);
  if (!day || day.items.length === 0) return null;

  const items = day.items;
  const forkAt = resolveForkAt(items, input.triggerIssue);

  const sharedBeforeItems = items.slice(0, forkAt);
  const branchCandidates = items.slice(forkAt);
  if (branchCandidates.length === 0) return null;

  const highBranch = branchCandidates.filter((i) => i.intensity === 'high' || i.intensity === 'medium');
  const lowBranch = branchCandidates.filter((i) => i.intensity === 'low');

  const branchPool =
    highBranch.length > 0
      ? highBranch
      : branchCandidates.slice(0, Math.ceil(branchCandidates.length / 2));
  const lowPool =
    lowBranch.length > 0
      ? lowBranch
      : branchCandidates.filter((i) => !branchPool.some((b) => b.id === i.id));

  const branchStartMs = branchPool[0]?.startMs ?? items[forkAt]?.startMs ?? 0;
  const branchEndMs = Math.max(...branchPool.map((i) => i.endMs), branchStartMs);

  const afterBranch = items.filter((i) => i.startMs > branchEndMs);
  const scheduledRejoin = resolveRejoinItem(items, branchEndMs);
  let meetupAnchor = scheduledRejoin;
  let finalLowPool = [...lowPool];

  if (!meetupAnchor && lowPool.length > 0) {
    meetupAnchor = lowPool[lowPool.length - 1];
  }

  // B 组并行活动（咖啡店）与晚间汇合（晚餐/酒店）分开：仅当 low 池里有多项时才从 B 组摘掉汇合点
  if (meetupAnchor && scheduledRejoin?.id === meetupAnchor.id && lowPool.length > 1) {
    finalLowPool = lowPool.filter((i) => i.id !== meetupAnchor!.id);
  }

  const finalBranchPool = branchPool.filter(
    (i) =>
      !(
        meetupAnchor &&
        i.id === meetupAnchor.id &&
        !finalLowPool.some((l) => l.id === meetupAnchor!.id)
      ),
  );
  const sharedAfterItems = meetupAnchor
    ? afterBranch.filter((i) => i.id !== meetupAnchor!.id)
    : afterBranch;

  const routeRefItem =
    forkAt > 0 && isScheduledHotelItem(items[forkAt])
      ? items[forkAt - 1]
      : items[forkAt];
  let rentalHotelCtx = analyzeRentalHotelSplit({
    sharedBefore: sharedBeforeItems,
    branchBItems: finalLowPool.length > 0 ? finalLowPool : lowPool,
    allDayItems: items,
    forkItem: routeRefItem,
  });

  if (rentalHotelCtx && !rentalHotelCtx.dropoffFeasible && finalLowPool.length === 1) {
    // 酒店距租车点过远：不做「送达后 A 独玩」并行分流，晚间再汇合
    finalLowPool = [];
  }

  const meetupTime = resolveMeetupTime(finalBranchPool, finalLowPool, meetupAnchor, branchEndMs);
  const rejoinEndTime = resolveRejoinEndTime(
    meetupAnchor,
    meetupTime,
    finalBranchPool,
    finalLowPool,
  );

  const dayTitle =
    branchPool[0]?.title ||
    day.items.find((i) => i.intensity === 'high')?.title ||
    `Day ${input.dayNumber}`;

  const groupAId = 'grp_a';
  const groupBId = 'grp_b';
  const totalMembers = input.schedule.totalMemberCount;
  const countA =
    input.schedule.memberCluster?.groupA.memberIds.length ??
    Math.max(1, totalMembers - Math.max(1, Math.floor(totalMembers / 3)));
  const countB =
    input.schedule.memberCluster?.groupB.memberIds.length ?? totalMembers - countA;

  return {
    id: `ds_d${input.dayNumber}`,
    splitPlanId: input.splitPlanId,
    dayIndex: day.dayIndex,
    dayNumber: input.dayNumber,
    title: dayTitle,
    dateLabel: day.dateLabel,
    stats: {
      splitDuration: formatDurationHours(branchStartMs, branchEndMs),
      meetupTime,
      feasibility: rentalHotelCtx?.dropoffFeasible === false ? '需全员同行' : '92%',
      satisfactionBadge: '两组均满意',
      ...(rentalHotelCtx
        ? {
            rentalHotel: {
              distanceKm: rentalHotelCtx.distanceKm,
              driveMin: rentalHotelCtx.driveMin,
              dropoffFeasible: rentalHotelCtx.dropoffFeasible,
              rentalPlaceName: rentalHotelCtx.rentalPlaceName,
              hotelPlaceName: rentalHotelCtx.hotelPlaceName,
            },
          }
        : {}),
    },
    fork: {
      startTime: resolveForkStartTime(sharedBeforeItems, finalBranchPool, finalLowPool),
      afterSegmentId: sharedBeforeItems.length
        ? `seg_${sharedBeforeItems[sharedBeforeItems.length - 1].id}`
        : undefined,
    },
    sharedBefore: sharedBeforeItems.map((i) => segmentFromItem(i, 'shared')),
    branches: [
      {
        id: `br_a_d${input.dayNumber}`,
        groupId: groupAId,
        groupLabel: stripGroupPrefix(input.schedule.memberCluster?.groupA.label ?? '体能较好组'),
        memberCount: countA,
        members: branchMembers(input.schedule, 'A'),
        variant: 'blue',
        segments: finalBranchPool.map((i) => segmentFromItem(i, 'branch')),
      },
      ...(finalLowPool.length > 0
        ? [
            {
              id: `br_b_d${input.dayNumber}`,
              groupId: groupBId,
              groupLabel: stripGroupPrefix(input.schedule.memberCluster?.groupB.label ?? '节奏保守组'),
              memberCount: countB,
              members: branchMembers(input.schedule, 'B'),
              variant: 'orange' as const,
              segments: finalLowPool.map((i) => segmentFromItem(i, 'branch')),
            },
          ]
        : []),
    ],
    rejoin: meetupAnchor
      ? {
          ...segmentFromItem(meetupAnchor, 'rejoin'),
          startTime: meetupTime,
          endTime: rejoinEndTime,
          subtitle: `全员 ${totalMembers} 人`,
          highlights: undefined,
        }
      : {
          id: `seg_reunion_d${input.dayNumber}`,
          kind: 'rejoin',
          startTime: meetupTime ?? '17:30',
          title: '汇合',
          subtitle: `全员 ${totalMembers} 人`,
        },
    sharedAfter: sharedAfterItems.map((i) => segmentFromItem(i, 'shared')),
  };
}

function stripGroupPrefix(label: string): string {
  return label.replace(/^Group [AB] · /, '').trim();
}

function collectBranchHighlights(segments: PlanningDaySplitSegmentDto[]): string[] {
  const fromHighlights = segments
    .flatMap((s) => s.highlights ?? [])
    .map((h) => h.trim())
    .filter((h) => h && !isInternalHighlightText(h));
  if (fromHighlights.length > 0) {
    return [...new Set(fromHighlights)].slice(0, 4);
  }
  const core = segments.filter((s) => s.intensity === 'high' || s.intensity === 'medium');
  const pool = core.length > 0 ? core : segments;
  return pool.map((s) => s.title.trim()).filter(Boolean).slice(0, 3);
}

function formatSegmentDurationHours(seg: PlanningDaySplitSegmentDto): string | undefined {
  if (!seg.startTime || !seg.endTime) return undefined;
  const [sh, sm] = seg.startTime.split(':').map(Number);
  const [eh, em] = seg.endTime.split(':').map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return undefined;
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60;
  const hours = mins / 60;
  if (hours < 0.5) return `${mins} 分钟`;
  const rounded = Math.round(hours * 10) / 10;
  return rounded % 1 === 0 ? `${Math.round(rounded)} 小时` : `${rounded} 小时`;
}

function formatGroupCardLabel(
  branch: PlanningDaySplitDto['branches'][0],
  letter: 'A' | 'B',
  kind: DecisionCheckerSplitPlanDto['kind'],
): string {
  const hint = branch.groupLabel;
  let name: string;
  if (/体能较好|活跃|高强度|年轻人/.test(hint)) {
    name = kind === 'physical_strength' ? '年轻人组' : kind === 'preference' ? '活跃组' : 'A 组';
  } else if (/节奏保守|休闲|长者|保守/.test(hint)) {
    name = kind === 'physical_strength' ? '长者组' : kind === 'preference' ? '休闲组' : 'B 组';
  } else {
    name = letter === 'A' ? 'A 组' : 'B 组';
  }
  return `${name}（${branch.memberCount} 人）`;
}

function branchActivityTheme(
  segments: PlanningDaySplitSegmentDto[],
  letter: 'A' | 'B',
  kind: DecisionCheckerSplitPlanDto['kind'],
): string {
  const intensityRank = (s: PlanningDaySplitSegmentDto) =>
    s.intensity === 'high' ? 3 : s.intensity === 'medium' ? 2 : 1;
  const maxRank = segments.reduce((max, s) => Math.max(max, intensityRank(s)), 0);

  if (kind === 'weather_adaptive') return '灵活备选';
  if (letter === 'B' || maxRank <= 1) {
    return kind === 'preference' ? '轻松体验' : '舒适休息';
  }
  if (maxRank >= 3) return '高强度体验';
  return '均衡体验';
}

function buildGroupCardHighlights(
  segments: PlanningDaySplitSegmentDto[],
  letter: 'A' | 'B',
  kind: DecisionCheckerSplitPlanDto['kind'],
  rentalHotel?: PlanningDaySplitDto['stats'] extends { rentalHotel?: infer R } ? R : never,
): string[] {
  const isRestBranch =
    letter === 'B' || segments.every((s) => s.intensity === 'low' || s.intensity === undefined);
  const highlights: string[] = [];

  if (!isRestBranch) {
    const primary = segments.find((s) => s.intensity === 'high') ?? segments[0];
    if (primary) {
      const duration = formatSegmentDurationHours(primary);
      const name = primary.title.trim();
      if (duration && name && !GENERIC_ACTIVITY_TITLES.has(name)) {
        highlights.push(`${name} ${duration}`);
      }
    }
    const guideText = segments
      .flatMap((s) => [...(s.highlights ?? []), s.subtitle ?? ''].filter(Boolean))
      .join(' ');
    if (/向导|冰爪|头盔|安全|guide/i.test(guideText)) {
      highlights.push('专业向导 & 安全保障');
    } else if (segments.some((s) => s.intensity === 'high')) {
      highlights.push('专业向导 & 安全保障');
    }
    if (segments.some((s) => s.intensity === 'high' || s.intensity === 'medium')) {
      highlights.push('拍摄与探索');
    }
    if (rentalHotel?.dropoffFeasible) {
      highlights.push('B 组已送达酒店 · 其余景点自由探索');
    }
  } else {
    for (const seg of segments) {
      const poi = segmentPoiLabel(seg) ?? seg.title;
      if (/咖啡/.test(seg.title) || /咖啡/.test(poi)) {
        highlights.push('咖啡馆时光');
      } else if (/酒店|Hotel/i.test(poi) || /酒店/.test(seg.title)) {
        highlights.push('酒店休息 & 观景');
      }
    }
    if (rentalHotel?.dropoffFeasible) {
      highlights.unshift(
        `距上一站约 ${rentalHotel.distanceKm} km（${rentalHotel.driveMin} 分钟）送达`,
      );
    } else if (rentalHotel && !rentalHotel.dropoffFeasible) {
      highlights.unshift(`距租车点约 ${rentalHotel.distanceKm} km，建议与 A 组同行游览`);
    }
    if (highlights.length === 0) {
      const poi = segmentPoiLabel(segments[0]);
      if (poi && !GENERIC_ACTIVITY_TITLES.has(poi)) {
        highlights.push(`${poi}休息`);
      }
    }
    if (kind !== 'weather_adaptive') {
      highlights.push('低疲劳 & 轻松安排');
    }
  }

  const deduped = [...new Set(highlights.filter(Boolean))];
  if (deduped.length >= 2) return deduped.slice(0, 3);
  return [...new Set([...deduped, ...collectBranchHighlights(segments)])].slice(0, 3);
}

function resolveMeetupPoint(
  daySplit: PlanningDaySplitDto,
  branchB: PlanningDaySplitDto['branches'][0] | undefined,
  trigger: FeasibilityIssueDto,
): string {
  const fromRejoin = segmentPoiLabel(daySplit.rejoin);
  if (fromRejoin) return fromRejoin;

  for (const seg of branchB?.segments ?? []) {
    const label = segmentPoiLabel(seg);
    if (label) return label;
  }

  for (const seg of [...(daySplit.sharedAfter ?? [])].reverse()) {
    const label = segmentPoiLabel(seg);
    if (label) return label;
  }

  const proof = trigger.proofs?.find((p) => p.placeLabel?.trim())?.placeLabel?.trim();
  if (proof) return proof;

  for (const seg of daySplit.branches[0]?.segments ?? []) {
    const label = segmentPoiLabel(seg);
    if (label) return label;
  }

  return '汇合点';
}

function branchCostPerPerson(segments: PlanningDaySplitSegmentDto[]): string | undefined {
  for (const seg of segments) {
    if (seg.costPerPerson?.trim()) return seg.costPerPerson.trim();
  }
  return undefined;
}

function groupDtoFromBranch(
  branch: PlanningDaySplitDto['branches'][0],
  letter: 'A' | 'B',
  kind: DecisionCheckerSplitPlanDto['kind'],
  rentalHotel?: NonNullable<PlanningDaySplitDto['stats']>['rentalHotel'],
): DecisionCheckerSplitPlanDto['groups'][0] {
  const primary = branch.segments[0];
  const members = branch.members?.map((m) => ({
    id: m.id,
    displayName: m.displayName,
  }));
  const avatarUrls = branch.members
    ?.map((m) => m.avatarUrl?.trim())
    .filter((url): url is string => Boolean(url));
  return {
    id: branch.groupId,
    letter,
    label: formatGroupCardLabel(branch, letter, kind),
    memberCount: branch.memberCount,
    members,
    activityTitle: branchActivityTheme(branch.segments, letter, kind),
    segments: branch.segments.map(segmentToGroupDto),
    highlights: buildGroupCardHighlights(branch.segments, letter, kind, rentalHotel),
    intensity: primary?.intensity ?? (letter === 'A' ? 'high' : 'low'),
    riskLevel: primary?.riskLevel ?? 'low',
    costPerPerson: branchCostPerPerson(branch.segments),
    variant: branch.variant ?? (letter === 'A' ? 'blue' : 'orange'),
    avatarUrls: avatarUrls?.length ? avatarUrls : undefined,
  };
}

export function buildSplitPlanFromDaySplit(input: {
  daySplit: PlanningDaySplitDto;
  splitPlanId: string;
  kind: DecisionCheckerSplitPlanDto['kind'];
  trigger: FeasibilityIssueDto;
  metrics: DecisionCheckerMetricDto[];
}): DecisionCheckerSplitPlanDto {
  const { daySplit, splitPlanId, kind, trigger, metrics } = input;
  const branchA = daySplit.branches[0];
  const branchB = daySplit.branches[1];
  const rentalHotel = daySplit.stats?.rentalHotel;
  const groups = [
    groupDtoFromBranch(branchA, 'A', kind, rentalHotel),
    ...(branchB ? [groupDtoFromBranch(branchB, 'B', kind, rentalHotel)] : []),
  ];

  const meetupPoint = resolveMeetupPoint(daySplit, branchB, trigger);

  const meetupTime = daySplit.stats?.meetupTime
    ? `${daySplit.stats.meetupTime}（±15 分钟弹性）`
    : daySplit.rejoin?.startTime
      ? `${daySplit.rejoin.startTime}（±15 分钟弹性）`
      : '17:30（±15 分钟弹性）';

  const branchATitles = segmentLabels(branchA.segments);
  const branchBTitles = branchB ? segmentLabels(branchB.segments) : '';

  return {
    id: splitPlanId,
    kind,
    banner: {
      title:
        kind === 'weather_adaptive'
          ? '天气变化，建议分流'
          : kind === 'preference'
            ? '检测到偏好差异，建议分流'
            : '检测到体力差异，建议分流',
      message: `Day ${daySplit.dayNumber} ${daySplit.fork?.startTime ?? branchA.segments[0]?.startTime ?? '11:00'}–${branchA.segments[branchA.segments.length - 1]?.endTime ?? '16:00'} 活动强度存在差异，已生成分流方案。`,
      affectedDays: [daySplit.dayNumber],
      tone: trigger.priority === 'must_handle' ? 'warning' : 'info',
    },
    recommendation: {
      title: '推荐分流方案',
      summary:
        branchB && branchBTitles
          ? `${branchATitles}；${branchBTitles}。`
          : `${branchATitles}。`,
      badge: daySplit.stats?.satisfactionBadge ?? '两组均满意',
      badgeTone: 'success',
    },
    metrics,
    groups,
    logistics: {
      meetupPoint,
      meetupTime,
      transport: rentalHotel
        ? formatRentalHotelTransport({
            dropoffFeasible: rentalHotel.dropoffFeasible,
            rentalPlaceName: rentalHotel.rentalPlaceName,
            hotelPlaceName: rentalHotel.hotelPlaceName,
            distanceKm: rentalHotel.distanceKm,
            driveMin: rentalHotel.driveMin,
          })
        : daySplit.rejoin?.subtitle?.includes('全员')
          ? undefined
          : '两组均返回汇合点',
      emergencyContact: '+354 112',
      guideBooking:
        kind === 'physical_strength' && branchA.memberCount > 0
          ? `${branchA.segments[0]?.title ?? '高强度活动'} · ${branchA.memberCount} 人`
          : undefined,
    },
    risks: (() => {
      const items = [
        ...(rentalHotel && !rentalHotel.dropoffFeasible
          ? [
              {
                title: '送达距离',
                description: `${rentalHotel.hotelPlaceName}距${rentalHotel.rentalPlaceName}约 ${rentalHotel.distanceKm} km（${rentalHotel.driveMin} 分钟），不建议拆分送达，建议全员同行游览后再入住。`,
              },
            ]
          : []),
        ...(kind === 'physical_strength' || trigger.severity === 'high'
          ? [
              {
                title: '天气与安全',
                description:
                  trigger.actionRequired?.trim() ||
                  '高强度活动需关注天气；恶劣天气可缩短时长或切换室内方案。',
              },
            ]
          : []),
      ];
      return items.length > 0 ? items : undefined;
    })(),
    aiSuggestion: {
      text: formatSplitPlanAiSuggestion({
        daySplit,
        rentalHotel,
        branchATitles,
        kind,
        trigger,
      }),
      source: 'rule',
    },
    actions: [
      { type: 'apply_split_plan', label: '应用分流方案', payload: { splitPlanId } },
      { type: 'view_split_alternatives', label: '查看备选', payload: { splitPlanId } },
      { type: 'discuss_with_nara', label: '与 Nara 讨论', payload: { splitPlanId } },
    ],
  };
}

export function enrichSplitPlanFromSchedule(
  splitPlan: DecisionCheckerSplitPlanDto,
  daySplit: PlanningDaySplitDto,
  schedule: SplitPlanScheduleSource,
): DecisionCheckerSplitPlanDto {
  const branchA = daySplit.branches[0];
  const branchB = daySplit.branches[1];
  const meetupPlace =
    segmentPoiLabel(daySplit.rejoin) ??
    segmentPoiLabel(branchB?.segments[0]) ??
    schedule.days
      .find((d) => d.dayNumber === daySplit.dayNumber)
      ?.items.find((i) => i.type.includes('MEAL'))?.placeLabel;

  const groups = splitPlan.groups.map((g, idx) => {
    const branch = idx === 0 ? branchA : branchB;
    if (!branch || branch.segments.length === 0) return g;
    return groupDtoFromBranch(branch, idx === 0 ? 'A' : 'B', splitPlan.kind, daySplit.stats?.rentalHotel);
  });

  return {
    ...splitPlan,
    banner: {
      ...splitPlan.banner,
      message: `Day ${daySplit.dayNumber} ${branchA?.segments[0]?.startTime ?? '11:00'}–${branchA?.segments[branchA.segments.length - 1]?.endTime ?? '16:00'} 活动强度存在差异，已生成分流方案，确保两组均满意。`,
    },
    recommendation: {
      ...splitPlan.recommendation,
      summary:
        branchA && branchB
          ? `${segmentLabels(branchA.segments)}；${segmentLabels(branchB.segments)}。`
          : splitPlan.recommendation.summary,
    },
    groups,
    logistics: {
      ...splitPlan.logistics,
      meetupPoint: meetupPlace ?? splitPlan.logistics.meetupPoint,
      meetupTime: daySplit.stats?.meetupTime
        ? `${daySplit.stats.meetupTime}（±15 分钟弹性）`
        : splitPlan.logistics.meetupTime,
    },
  };
}

export type SplitPlanApplyManifest = {
  splitPlanId: string;
  dayNumber: number;
  tripDayId: string;
  appliedAt: string;
  groups: Array<{
    groupId: string;
    memberIds?: string[];
    itemIds: string[];
  }>;
  sharedItemIds: string[];
  rejoinItemId?: string;
};

export function buildApplyManifestFromDaySplit(
  daySplit: PlanningDaySplitDto,
  schedule: SplitPlanScheduleSource,
  splitPlanId: string,
  appliedAt: string,
): SplitPlanApplyManifest {
  const day = schedule.days.find((d) => d.dayNumber === daySplit.dayNumber);
  const branchA = daySplit.branches[0];
  const branchB = daySplit.branches[1];

  const extractIds = (segments: PlanningDaySplitSegmentDto[]) =>
    segments.map((s) => s.id.replace(/^seg_/, '')).filter(Boolean);

  const sharedBeforeIds = extractIds(daySplit.sharedBefore);
  const sharedAfterIds = extractIds(daySplit.sharedAfter ?? []);
  const rejoinId = daySplit.rejoin?.id?.replace(/^seg_/, '');

  return {
    splitPlanId,
    dayNumber: daySplit.dayNumber,
    tripDayId: day?.tripDayId ?? '',
    appliedAt,
    groups: [
      {
        groupId: branchA.groupId,
        memberIds: schedule.memberCluster?.groupA.memberIds,
        itemIds: extractIds(branchA.segments),
      },
      ...(branchB
        ? [
            {
              groupId: branchB.groupId,
              memberIds: schedule.memberCluster?.groupB.memberIds,
              itemIds: extractIds(branchB.segments),
            },
          ]
        : []),
    ],
    sharedItemIds: [...sharedBeforeIds, ...sharedAfterIds, ...(rejoinId ? [rejoinId] : [])],
    rejoinItemId: rejoinId,
  };
}

export const SPLIT_NOTE_PREFIX = '[split:';

export function appendSplitNoteTag(note: string | null | undefined, groupId: string): string {
  const tag = `${SPLIT_NOTE_PREFIX}${groupId}]`;
  const base = note?.trim() ?? '';
  if (base.includes(tag)) return base;
  return base ? `${base} ${tag}` : tag;
}
