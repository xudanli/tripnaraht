/**
 * Multi-Constraint POI Arrangement Benchmark — deterministic constraint evaluator.
 * 测试假数据专用；传播 POI 变更 → 硬/软约束 → 计划状态。
 */
import {
  MCPOI_BENCHMARK_POI_CATALOG,
  MCPOI_BENCHMARK_TRIP_DAYS,
  MCPOI_BENCHMARK_WORLD_FACTS,
  type McpoiMemberId,
  type McpoiPlanVariant,
  type McpoiScheduledItem,
  type McpoiWorldFact,
} from '../fixtures/multi-constraint-poi-arrangement-benchmark.fixture';

export type McpoiPlanStatus =
  | 'INFEASIBLE'
  | 'FEASIBLE_WITH_TRADEOFF'
  | 'FEASIBLE_WITH_SPLIT'
  | 'FEASIBLE';

export type McpoiConstraintState = 'SATISFIED' | 'VIOLATED' | 'WARN';

export interface McpoiConstraintAssessment {
  constraintId: string;
  severity: 'HARD' | 'SOFT';
  state: McpoiConstraintState;
  message: string;
  affectedMembers?: McpoiMemberId[];
}

export interface McpoiPlanEvaluation {
  variantId?: string;
  dayIndex: number;
  dayDate: string;
  status: McpoiPlanStatus;
  assessments: McpoiConstraintAssessment[];
  hardViolations: string[];
  softViolations: string[];
  metrics: {
    elderWalkKm: number;
    poiCount: number;
    minBufferMinutes: number;
    hasSplit: boolean;
    childLunchOnTime: boolean;
    photographyScore: number;
    extraDriveMinutes?: number;
  };
}

function parseMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function overlaps(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
): boolean {
  return startA < endB && endA > startB;
}

function dayDateForIndex(dayIndex: number): string {
  return MCPOI_BENCHMARK_TRIP_DAYS[dayIndex]?.date ?? MCPOI_BENCHMARK_DATE_RANGE_FALLBACK(dayIndex);
}

function MCPOI_BENCHMARK_DATE_RANGE_FALLBACK(dayIndex: number): string {
  const base = new Date('2026-10-04T00:00:00.000Z');
  base.setUTCDate(base.getUTCDate() + dayIndex);
  return base.toISOString().slice(0, 10);
}

function worldFactsForDate(date: string): McpoiWorldFact[] {
  return MCPOI_BENCHMARK_WORLD_FACTS.filter((wf) => wf.date === date);
}

function poiWalkKm(poiId: string | undefined, extraKm = 0): number {
  if (!poiId) return 0;
  const entry = MCPOI_BENCHMARK_POI_CATALOG[poiId];
  return (entry?.walkKm ?? 0) + extraKm;
}

function isIndoorPoi(poiId: string | undefined): boolean {
  if (!poiId) return false;
  return MCPOI_BENCHMARK_POI_CATALOG[poiId]?.indoor === true;
}

function activityItems(items: McpoiScheduledItem[]): McpoiScheduledItem[] {
  return items.filter((i) => i.type === 'ACTIVITY' && i.poiId);
}

function membersForItem(item: McpoiScheduledItem): McpoiMemberId[] {
  return item.memberIds ?? ['M1', 'M2', 'M3', 'M4', 'M5'];
}

function assessWindBlock(
  items: McpoiScheduledItem[],
  dayDate: string,
): McpoiConstraintAssessment {
  const wf = worldFactsForDate(dayDate).find((f) => f.id === 'WF-01');
  if (!wf) {
    return {
      constraintId: 'H-07',
      severity: 'HARD',
      state: 'SATISFIED',
      message: '无强风阻断窗口',
    };
  }
  const [wfStart, wfEnd] = wf.effectiveTime.split('-').map(parseMinutes);
  const hit = items.find((item) => {
    if (item.poiId !== 'POI-DYRHOLAEY') return false;
    const start = parseMinutes(item.startTime);
    const end = parseMinutes(item.endTime);
    return overlaps(start, end, wfStart, wfEnd);
  });
  return {
    constraintId: 'H-07',
    severity: 'HARD',
    state: hit ? 'VIOLATED' : 'SATISFIED',
    message: hit
      ? `Dyrhólaey ${hit.startTime} 落入强风阻断窗口 ${wf.effectiveTime}`
      : '悬崖 POI 未落入强风窗口',
    affectedMembers: hit ? ['M1', 'M3', 'M4', 'M5'] : undefined,
  };
}

function elderWalkKmForItem(item: McpoiScheduledItem): number {
  if (!item.poiId || isIndoorPoi(item.poiId)) return 0;
  if (item.poiId === 'POI-SKOGAFOSS') {
    if (item.note === '含登顶' || item.label.includes('登顶')) return 1.8;
    if (parseMinutes(item.startTime) >= parseMinutes('13:00')) return 1.2;
    return 1.8;
  }
  return poiWalkKm(item.poiId);
}

function assessElderWalk(items: McpoiScheduledItem[]): McpoiConstraintAssessment {
  const totalKm = activityItems(items)
    .filter((item) => membersForItem(item).includes('M4'))
    .reduce((sum, item) => sum + elderWalkKmForItem(item), 0);
  return {
    constraintId: 'H-03',
    severity: 'HARD',
    state: totalKm > 5 ? 'VIOLATED' : 'SATISFIED',
    message: `老人累计步行 ${totalKm.toFixed(1)}km（上限 5km）`,
    affectedMembers: ['M4'],
  };
}

function assessChildGlacier(items: McpoiScheduledItem[]): McpoiConstraintAssessment {
  const glacier = items.find((i) => i.poiId === 'POI-GLACIER-HIKE');
  if (!glacier) {
    return {
      constraintId: 'H-04',
      severity: 'HARD',
      state: 'SATISFIED',
      message: '无冰川活动',
    };
  }
  const members = membersForItem(glacier);
  const childIncluded = members.includes('M5');
  return {
    constraintId: 'H-04',
    severity: 'HARD',
    state: childIncluded ? 'VIOLATED' : 'SATISFIED',
    message: childIncluded ? '儿童参加 10+ 冰川徒步' : '儿童未参加冰川徒步',
    affectedMembers: ['M5'],
  };
}

function assessGlacierCheckIn(
  items: McpoiScheduledItem[],
  dayIndex: number,
): McpoiConstraintAssessment {
  if (dayIndex !== 3) {
    return {
      constraintId: 'H-05',
      severity: 'HARD',
      state: 'SATISFIED',
      message: '非冰川日',
    };
  }
  const glacierIdx = items.findIndex((i) => i.poiId === 'POI-GLACIER-HIKE');
  if (glacierIdx < 0) {
    return {
      constraintId: 'H-05',
      severity: 'HARD',
      state: 'VIOLATED',
      message: '冰川日缺少冰川活动（核心预约失效）',
      affectedMembers: ['M2'],
    };
  }
  const glacier = items[glacierIdx];
  const arrivalMinutes = parseMinutes(glacier.startTime);
  const checkInBy = parseMinutes('09:30');
  return {
    constraintId: 'H-05',
    severity: 'HARD',
    state: arrivalMinutes > checkInBy ? 'VIOLATED' : 'SATISFIED',
    message:
      arrivalMinutes > checkInBy
        ? `冰川签到 ${glacier.startTime} 晚于 09:30`
        : `冰川签到 ${glacier.startTime} 满足 09:30 前到达`,
    affectedMembers: ['M1', 'M2', 'M3'],
  };
}

function assessHotelArrival(items: McpoiScheduledItem[]): McpoiConstraintAssessment {
  const hotel = items.find((i) => i.type === 'HOTEL');
  if (!hotel) {
    return {
      constraintId: 'H-06',
      severity: 'HARD',
      state: 'SATISFIED',
      message: '无酒店节点',
    };
  }
  const arrival = parseMinutes(hotel.startTime);
  const latest = parseMinutes('21:00');
  const violated = arrival > latest;
  return {
    constraintId: 'H-06',
    severity: 'HARD',
    state: violated ? 'VIOLATED' : 'SATISFIED',
    message: violated
      ? `酒店到达 ${hotel.startTime} 晚于 21:00`
      : `酒店到达 ${hotel.startTime}`,
    affectedMembers: ['M1'],
  };
}

function assessParallelMembers(items: McpoiScheduledItem[]): McpoiConstraintAssessment {
  const activities = items.filter((i) => i.type === 'ACTIVITY');
  for (let i = 0; i < activities.length; i++) {
    for (let j = i + 1; j < activities.length; j++) {
      const a = activities[i];
      const b = activities[j];
      const startA = parseMinutes(a.startTime);
      const endA = parseMinutes(a.endTime);
      const startB = parseMinutes(b.startTime);
      const endB = parseMinutes(b.endTime);
      if (!overlaps(startA, endA, startB, endB)) continue;
      const shared = membersForItem(a).filter((m) => membersForItem(b).includes(m));
      if (shared.length > 0) {
        return {
          constraintId: 'H-08',
          severity: 'HARD',
          state: 'VIOLATED',
          message: `成员 ${shared.join(',')} 并行冲突：${a.label} / ${b.label}`,
          affectedMembers: shared,
        };
      }
    }
  }
  return {
    constraintId: 'H-08',
    severity: 'HARD',
    state: 'SATISFIED',
    message: '无成员并行冲突',
  };
}

function assessChildLunch(items: McpoiScheduledItem[]): McpoiConstraintAssessment {
  const meal = items.find(
    (i) =>
      i.type === 'MEAL' ||
      (i.label.includes('午餐') &&
        (membersForItem(i).includes('M5') || !i.memberIds?.length)),
  );
  const windowStart = parseMinutes('12:00');
  const windowEnd = parseMinutes('13:30');
  if (!meal) {
    return {
      constraintId: 'S-02',
      severity: 'SOFT',
      state: 'VIOLATED',
      message: '未安排儿童午餐',
      affectedMembers: ['M5'],
    };
  }
  const mealStart = parseMinutes(meal.startTime);
  const onTime = mealStart >= windowStart && mealStart <= windowEnd;
  return {
    constraintId: 'S-02',
    severity: 'SOFT',
    state: onTime ? 'SATISFIED' : 'VIOLATED',
    message: onTime ? `午餐 ${meal.startTime} 在窗口内` : `午餐 ${meal.startTime} 偏离 12:00—13:30`,
    affectedMembers: ['M5'],
  };
}

function assessElderIndoorRest(items: McpoiScheduledItem[]): McpoiConstraintAssessment {
  const afternoonStart = parseMinutes('12:00');
  const afternoonEnd = parseMinutes('18:00');
  let totalMinutes = 0;
  for (const item of items) {
    if (!membersForItem(item).includes('M4')) continue;
    const indoor =
      isIndoorPoi(item.poiId) || item.label.includes('室内') || item.label.includes('Visitor Center');
    if (!indoor) continue;
    const start = parseMinutes(item.startTime);
    const end = parseMinutes(item.endTime);
    const overlapStart = Math.max(start, afternoonStart);
    const overlapEnd = Math.min(end, afternoonEnd);
    if (overlapEnd > overlapStart) totalMinutes += overlapEnd - overlapStart;
  }
  return {
    constraintId: 'S-03',
    severity: 'SOFT',
    state: totalMinutes >= 45 ? 'SATISFIED' : 'VIOLATED',
    message: `老人下午室内恢复 ${totalMinutes} 分钟（需要 ≥45）`,
    affectedMembers: ['M4'],
  };
}

function assessAvoidSplit(items: McpoiScheduledItem[]): McpoiConstraintAssessment {
  const activities = items.filter((i) => i.type === 'ACTIVITY' && i.memberIds?.length);
  const hasSplit = activities.some((a) => {
    const others = activities.filter(
      (b) =>
        b !== a &&
        overlaps(
          parseMinutes(a.startTime),
          parseMinutes(a.endTime),
          parseMinutes(b.startTime),
          parseMinutes(b.endTime),
        ),
    );
    return others.some((b) => {
      const setA = new Set(membersForItem(a));
      const setB = new Set(membersForItem(b));
      return [...setA].some((m) => !setB.has(m));
    });
  });
  return {
    constraintId: 'S-04',
    severity: 'SOFT',
    state: hasSplit ? 'VIOLATED' : 'SATISFIED',
    message: hasSplit ? '存在成员分流' : '全员统一行动',
  };
}

function assessGlacierCore(items: McpoiScheduledItem[], dayIndex: number): McpoiConstraintAssessment {
  if (dayIndex !== 3) {
    return {
      constraintId: 'S-05',
      severity: 'SOFT',
      state: 'SATISFIED',
      message: '非冰川日',
    };
  }
  const glacier = items.find((i) => i.poiId === 'POI-GLACIER-HIKE');
  const m2Included = glacier ? membersForItem(glacier).includes('M2') : false;
  return {
    constraintId: 'S-05',
    severity: 'SOFT',
    state: m2Included ? 'SATISFIED' : 'VIOLATED',
    message: m2Included ? 'M2 获得冰川体验' : 'M2 核心体验未满足',
    affectedMembers: ['M2'],
  };
}

function assessBuffer(items: McpoiScheduledItem[]): McpoiConstraintAssessment {
  const sorted = [...items].sort(
    (a, b) => parseMinutes(a.startTime) - parseMinutes(b.startTime),
  );
  let minBuffer = Number.POSITIVE_INFINITY;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const prevEnd = parseMinutes(prev.endTime);
    const currStart = parseMinutes(curr.startTime);
    const prevStart = parseMinutes(prev.startTime);
    const currEnd = parseMinutes(curr.endTime);
    if (overlaps(prevStart, prevEnd, currStart, currEnd)) continue;
    const gap = currStart - prevEnd;
    minBuffer = Math.min(minBuffer, gap);
  }
  if (!Number.isFinite(minBuffer)) minBuffer = 999;
  return {
    constraintId: 'S-06',
    severity: 'SOFT',
    state: minBuffer >= 45 ? 'SATISFIED' : 'VIOLATED',
    message: `最小日程缓冲 ${minBuffer} 分钟`,
    affectedMembers: ['M1', 'M5'],
  };
}

function assessPoiCount(items: McpoiScheduledItem[]): McpoiConstraintAssessment {
  const count = activityItems(items).length;
  const sorted = [...items].sort(
    (a, b) => parseMinutes(a.startTime) - parseMinutes(b.startTime),
  );
  let minBuffer = Number.POSITIVE_INFINITY;
  for (let i = 1; i < sorted.length; i++) {
    const gap = parseMinutes(sorted[i].startTime) - parseMinutes(sorted[i - 1].endTime);
    minBuffer = Math.min(minBuffer, gap);
  }
  const packed = Number.isFinite(minBuffer) && minBuffer < 45;
  const violated = count > 5 || (count >= 5 && packed);
  return {
    constraintId: 'S-07',
    severity: 'SOFT',
    state: violated ? 'VIOLATED' : 'SATISFIED',
    message: `单日 POI 数量 ${count}${packed ? '（日程紧凑）' : ''}`,
  };
}

function assessPhotography(
  items: McpoiScheduledItem[],
  dayDate: string,
): McpoiConstraintAssessment {
  let score = 0;
  const dyr = items.find((i) => i.poiId === 'POI-DYRHOLAEY');
  if (dyr && parseMinutes(dyr.startTime) <= parseMinutes('11:00')) score += 40;
  else if (dyr) score += 15;

  const jok = items.find((i) => i.poiId === 'POI-JOKULSARLON');
  const clearWindow = worldFactsForDate(dayDate).find((f) => f.id === 'WF-03');
  if (jok && clearWindow) {
    const [wStart, wEnd] = clearWindow.effectiveTime.split('-').map(parseMinutes);
    const jStart = parseMinutes(jok.startTime);
    if (jStart >= wStart && jStart <= wEnd) score += 60;
    else score += 20;
  } else if (jok) {
    score += 30;
  }

  return {
    constraintId: 'S-01',
    severity: 'SOFT',
    state: score >= 60 ? 'SATISFIED' : score >= 35 ? 'WARN' : 'VIOLATED',
    message: `摄影满意度估计 ${score}/100`,
    affectedMembers: ['M3'],
  };
}

function deriveStatus(
  assessments: McpoiConstraintAssessment[],
  hasSplit: boolean,
  extraDriveMinutes?: number,
): McpoiPlanStatus {
  const hardViolations = assessments.filter(
    (a) => a.severity === 'HARD' && a.state === 'VIOLATED',
  );
  if (hardViolations.length > 0) return 'INFEASIBLE';
  if (hasSplit) return 'FEASIBLE_WITH_SPLIT';
  const softViolations = assessments.filter(
    (a) => a.severity === 'SOFT' && a.state === 'VIOLATED',
  );
  if (softViolations.length > 0 || (extraDriveMinutes ?? 0) >= 30) {
    return 'FEASIBLE_WITH_TRADEOFF';
  }
  return 'FEASIBLE';
}

function detectSplit(items: McpoiScheduledItem[]): boolean {
  return assessAvoidSplit(items).state === 'VIOLATED' &&
    items.some((i) => i.memberIds && i.memberIds.length > 0 && i.memberIds.length < 5);
}

export function evaluateMcpoiPlanDay(input: {
  items: McpoiScheduledItem[];
  dayIndex: number;
  variantId?: string;
  extraDriveMinutes?: number;
}): McpoiPlanEvaluation {
  const dayDate = dayDateForIndex(input.dayIndex);
  const assessments: McpoiConstraintAssessment[] = [
    assessWindBlock(input.items, dayDate),
    assessElderWalk(input.items),
    assessChildGlacier(input.items),
    assessGlacierCheckIn(input.items, input.dayIndex),
    assessHotelArrival(input.items),
    assessParallelMembers(input.items),
    assessChildLunch(input.items),
    assessElderIndoorRest(input.items),
    assessAvoidSplit(input.items),
    assessGlacierCore(input.items, input.dayIndex),
    assessBuffer(input.items),
    assessPoiCount(input.items),
    assessPhotography(input.items, dayDate),
  ];

  const hardViolations = assessments
    .filter((a) => a.severity === 'HARD' && a.state === 'VIOLATED')
    .map((a) => a.constraintId);
  const softViolations = assessments
    .filter((a) => a.severity === 'SOFT' && a.state === 'VIOLATED')
    .map((a) => a.constraintId);

  const elderWalkKm = activityItems(input.items)
    .filter((item) => membersForItem(item).includes('M4'))
    .reduce((sum, item) => sum + elderWalkKmForItem(item), 0);
  const photo = assessments.find((a) => a.constraintId === 'S-01');
  const photoScore = photo?.message.match(/(\d+)\/100/)?.[1];
  const buffer = assessments.find((a) => a.constraintId === 'S-06');
  const bufferMatch = buffer?.message.match(/(\d+)/);

  const hasSplit = detectSplit(input.items);
  return {
    variantId: input.variantId,
    dayIndex: input.dayIndex,
    dayDate,
    status: deriveStatus(assessments, hasSplit, input.extraDriveMinutes),
    assessments,
    hardViolations,
    softViolations,
    metrics: {
      elderWalkKm,
      poiCount: activityItems(input.items).length,
      minBufferMinutes: bufferMatch ? Number(bufferMatch[1]) : 0,
      hasSplit,
      childLunchOnTime: assessments.find((a) => a.constraintId === 'S-02')?.state === 'SATISFIED',
      photographyScore: photoScore ? Number(photoScore) : 0,
      extraDriveMinutes: input.extraDriveMinutes,
    },
  };
}

export function evaluateMcpoiPlanVariant(
  variant: McpoiPlanVariant,
  extraDriveMinutes?: number,
): McpoiPlanEvaluation {
  return evaluateMcpoiPlanDay({
    items: variant.items,
    dayIndex: variant.dayIndex,
    variantId: variant.variantId,
    extraDriveMinutes:
      extraDriveMinutes ?? (variant.variantId === 'B' ? 35 : undefined),
  });
}

export function diffConstraintStates(
  before: McpoiPlanEvaluation,
  after: McpoiPlanEvaluation,
): Array<{ constraintId: string; before: string; after: string }> {
  const beforeMap = new Map(before.assessments.map((a) => [a.constraintId, a.state]));
  const out: Array<{ constraintId: string; before: string; after: string }> = [];
  for (const a of after.assessments) {
    const prev = beforeMap.get(a.constraintId);
    if (prev && prev !== a.state) {
      out.push({ constraintId: a.constraintId, before: prev, after: a.state });
    }
  }
  return out;
}

export function buildDownstreamImpacts(
  before: McpoiPlanEvaluation,
  after: McpoiPlanEvaluation,
): Array<Record<string, unknown>> {
  const impacts: Array<Record<string, unknown>> = [];
  if (
    after.metrics.extraDriveMinutes != null &&
    (before.metrics.extraDriveMinutes ?? 0) !== after.metrics.extraDriveMinutes
  ) {
    impacts.push({
      type: 'DRIVE_TIME',
      deltaMinutes: (after.metrics.extraDriveMinutes ?? 0) - (before.metrics.extraDriveMinutes ?? 0),
    });
  }
  if (before.metrics.photographyScore !== after.metrics.photographyScore) {
    impacts.push({
      type: 'MEMBER_SATISFACTION',
      memberId: 'M3',
      delta: after.metrics.photographyScore - before.metrics.photographyScore,
    });
  }
  if (before.metrics.childLunchOnTime !== after.metrics.childLunchOnTime) {
    impacts.push({
      type: 'MEAL_WINDOW',
      memberId: 'M5',
      before: before.metrics.childLunchOnTime ? 'ON_TIME' : 'LATE',
      after: after.metrics.childLunchOnTime ? 'ON_TIME' : 'LATE',
    });
  }
  if (before.metrics.elderWalkKm !== after.metrics.elderWalkKm) {
    impacts.push({
      type: 'ELDER_WALK',
      memberId: 'M4',
      beforeKm: before.metrics.elderWalkKm,
      afterKm: after.metrics.elderWalkKm,
    });
  }
  return impacts;
}

export function affectedMembersFromEval(evalResult: McpoiPlanEvaluation): McpoiMemberId[] {
  const set = new Set<McpoiMemberId>();
  for (const a of evalResult.assessments) {
    if (a.state === 'VIOLATED' && a.affectedMembers) {
      for (const m of a.affectedMembers) set.add(m);
    }
  }
  return [...set];
}
