/**
 * 节奏/疲劳改排：温泉下午收束、瀑布上午唤醒、午间留白（体验脑，非硬约束脑）
 */

import type { Itinerary, ItineraryItem, OrchestratorState } from '../../agent/interfaces/trip-plan.interface';
import {
  classifyPoiExperienceCategory,
} from './experience-poi-taxonomy.util';

const NON_EXPERIENCE_ITEM_TYPES = new Set([
  'DRIVE',
  'TRANSIT',
  'WALK',
  'REST',
  'HOTEL',
  'STAY',
  'ACCOMMODATION',
  'MEAL',
  'FOOD',
  'RESTAURANT',
  'SHOPPING',
]);

function isPacingRelaxIntent(userIntent?: string): boolean {
  const t = String(userIntent ?? '');
  return /太累|好累|疲惫|轻松|别早起|不要太赶|慢节奏|放缓|休息|relax|tired|exhausted/i.test(
    t,
  );
}

function setItemWindow(
  item: ItineraryItem,
  dateIso: string,
  start: string,
  end: string,
): void {
  item.start_window = `${dateIso}T${start}:00`;
  item.end_window = `${dateIso}T${end}:00`;
}

function buildMiddayRest(dateIso: string): ItineraryItem {
  return {
    id: `pacing-midday-rest-${dateIso}`,
    type: 'REST',
    start_window: `${dateIso}T13:00:00`,
    end_window: `${dateIso}T14:00:00`,
    location_ref: { name: '午间景观路段留白' },
    evidence_refs: [],
    verified: false,
    notes: '节奏留白：车内安静休憩，不堆景点',
  };
}

/**
 * 当用户要「轻松」且同日含瀑布+温泉时：瀑布上午 → 午间留白 → 温泉下午收束。
 */
export function applyPacingRelaxationCuration(params: {
  items: ItineraryItem[];
  dateIso: string;
  userIntent?: string;
}): { items: ItineraryItem[]; notes_zh: string[] } {
  if (!isPacingRelaxIntent(params.userIntent)) {
    return { items: params.items, notes_zh: [] };
  }

  const items = params.items.map((it) => ({ ...it }));
  const pois = items.filter(
    (it) => !NON_EXPERIENCE_ITEM_TYPES.has(String(it.type ?? 'POI').toUpperCase()),
  );
  const waterfall = pois.find(
    (p) => classifyPoiExperienceCategory(p.location_ref.name, p.notes) === 'waterfall',
  );
  const hotspring = pois.find(
    (p) => classifyPoiExperienceCategory(p.location_ref.name, p.notes) === 'hotspring_spa',
  );
  if (!waterfall || !hotspring) {
    return { items, notes_zh: [] };
  }

  setItemWindow(waterfall, params.dateIso, '11:00', '13:00');
  setItemWindow(hotspring, params.dateIso, '14:00', '16:00');

  const hasMiddayRest = items.some(
    (it) =>
      it.type === 'REST' &&
      /留白|休憩|休息/i.test(`${it.location_ref?.name ?? ''} ${it.notes ?? ''}`),
  );
  if (!hasMiddayRest) {
    items.push(buildMiddayRest(params.dateIso));
  }

  const wfIdx = items.findIndex((it) => it.id === waterfall.id);
  const restIdx = items.findIndex((it) => it.type === 'REST' && /午间景观路段留白/.test(it.location_ref?.name ?? ''));
  const hsIdx = items.findIndex((it) => it.id === hotspring.id);
  const ordered: ItineraryItem[] = [];
  const used = new Set<string>();
  for (const idx of [wfIdx, restIdx, hsIdx]) {
    if (idx >= 0 && items[idx] && !used.has(items[idx].id)) {
      ordered.push(items[idx]);
      used.add(items[idx].id);
    }
  }
  for (const it of items) {
    if (!used.has(it.id)) ordered.push(it);
  }

  const isMyvatn =
    /米湖|mývatn|myvatn|众神|goðafoss|godafoss/i.test(
      `${waterfall.location_ref.name} ${hotspring.location_ref.name}`,
    );
  const notes_zh = isMyvatn
    ? [
        `热量顺序：先「${waterfall.location_ref.name}」（西侧约 40km，冷风徒步）再「${hotspring.location_ref.name}」（东侧温泉收束），避免清晨泡软后强风二次户外。`,
        `动线闭环：泡完温泉当日不再排户外强体力点，可回米湖酒店或 40–45 分钟放空车程转场。`,
        '节奏留白：午间保留车内安静休憩，错开众神瀑布 11:00–14:00 大巴高峰。',
      ]
    : [
        `冰火感官顺序：上午先「${waterfall.location_ref.name}」唤醒，下午再进入「${hotspring.location_ref.name}」疗愈收束。`,
        '节奏留白：午间保留车内安静休憩，不把转场时间塞满景点。',
      ];

  return { items: ordered, notes_zh };
}

function readAdjustUserIntent(state: OrchestratorState): string {
  const md = (state.metadata ?? {}) as Record<string, unknown>;
  return (
    (typeof md.intake_user_message === 'string' ? md.intake_user_message : '') ||
    state.trip_plan_request?.message ||
    ''
  );
}

/**
 * ITINERARY_ADJUST 目标日：在写草案卡片 / 出站前强制套用瀑布上午→温泉下午（兜底，不依赖 curator 是否执行）。
 */
export function applyPacingRelaxToAdjustTargetState(state: OrchestratorState): boolean {
  if (!state.itinerary?.days?.length) return false;

  const md = (state.metadata ?? {}) as Record<string, unknown>;
  const userIntent = readAdjustUserIntent(state);
  if (!isPacingRelaxIntent(userIntent) && md.adaptive_replan_trigger !== 'pacing') {
    return false;
  }

  const targetIso = String(
    md.itinerary_adjust_target_date_iso ??
      (md.itinerary_adjust_neighbor_anchors as { targetDateIso?: string } | undefined)
        ?.targetDateIso ??
      '',
  ).slice(0, 10);
  if (!targetIso) return false;

  const dayIdx = state.itinerary.days.findIndex(
    (d) => String(d.date ?? '').slice(0, 10) === targetIso,
  );
  if (dayIdx < 0) return false;

  const day = state.itinerary.days[dayIdx];
  const { items, notes_zh } = applyPacingRelaxationCuration({
    items: day.items,
    dateIso: targetIso,
    userIntent,
  });
  if (notes_zh.length === 0 && items === day.items) return false;

  state.itinerary = {
    ...state.itinerary,
    days: state.itinerary.days.map((d, i) =>
      i === dayIdx ? { ...d, items } : d,
    ),
  };

  const existing = (md.experience_curator_rationale_zh as string[] | undefined) ?? [];
  md.experience_curator_rationale_zh = [...existing, ...notes_zh].slice(-6);
  return true;
}

/** 对单日 items 做 pacing relax（供 assembler timeline 补丁） */
export function applyPacingRelaxToDayItems(params: {
  items: Itinerary['days'][0]['items'];
  dateIso: string;
  userIntent?: string;
  pacingTrigger?: boolean;
}): Itinerary['days'][0]['items'] {
  const intent = params.userIntent ?? '';
  if (!isPacingRelaxIntent(intent) && !params.pacingTrigger) {
    return params.items;
  }
  return applyPacingRelaxationCuration({
    items: params.items,
    dateIso: params.dateIso,
    userIntent: intent,
  }).items;
}
