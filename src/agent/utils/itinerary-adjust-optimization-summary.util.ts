/**
 * ITINERARY_ADJUST：面向用户/前端的「优化结果」结构化描述（走廊上下文 + 草案状态）。
 */

import {
  buildItineraryAdjustDraftNarrative,
  buildItineraryAdjustExperienceValidation,
  buildPacingExperienceThemeZh,
  isBannedDraftReasoningLine,
  isItineraryAdjustPacingIntent,
  type ItineraryAdjustExperienceValidation,
} from './itinerary-adjust-narrate.util';
import type { ItineraryAdjustExecutionMode } from './itinerary-adjust-auto-apply.util';
import type { CorridorFallbackLevel } from './itinerary-adjust-corridor-fallback.util';
import type { NeighborAnchorContext } from './itinerary-adjust-neighbor-anchors.util';

export type ItineraryAdjustScheduleItem = {
  name: string;
  start_window?: string;
  end_window?: string;
  type?: string;
};

export type ItineraryAdjustOptimizationResult = {
  target_date_iso: string;
  target_day_number?: number;
  execution_mode: ItineraryAdjustExecutionMode;
  applied: boolean;
  status_label_zh: string;
  poi_names: string[];
  /** 目标日各活动时段（供「应用到行程」确认面板展示；须完整渲染，勿 slice） */
  draft_schedule_zh: string[];
  /** 卡片正文：完整「当日安排」块（与 draft_schedule_zh 同源，供单字段渲染） */
  draft_card_body_zh?: string;
  route_context_zh: string;
  /** 走廊/选点说明（不含当日时段列表，避免卡片 preview 截断后误导） */
  optimization_summary_zh: string;
  /** 用户改排意图回显（如「您希望第 6 天更轻松」） */
  user_intent_echo_zh?: string;
  /** 相对改排前正式行程的可感知变化 */
  schedule_change_bullets_zh?: string[];
  rationale_bullets_zh: string[];
  /** 点击「应用到行程」将写入的内容说明 */
  apply_confirmation_zh: string;
  /** 结构化确认行（前端勿把 apply_confirmation_zh 当单行文本拼接） */
  apply_confirmation_lines: string[];
  apply_hint_zh: string;
  corridor_fallback_level?: string;
  /** 卡片标题（如「第 2 天 · 2026-06-02」）；勿在 chat 正文重复 */
  display_title_zh?: string;
  /** 体验主题副标题（如「环米湖松弛疗愈」） */
  experience_theme_zh?: string;
  /** 理性物理事实 × 感性体验缝合（供 Agent / 前端深度展示） */
  experience_validation?: ItineraryAdjustExperienceValidation;
  /** 为何选这些景点（非二选一说明） */
  poi_selection_rationale_zh?: string[];
  /** true：chat 勿再渲染 autoLead + 重复日期行，只用结构化卡片 */
  suppress_chat_lead?: boolean;
  /** 可选：极短 chat 正文（通常为空，由前端读卡片） */
  chat_answer_text_zh?: string;
};

const FALLBACK_LEVEL_ZH: Partial<Record<CorridorFallbackLevel, string>> = {
  baseline_50km: '在前后天锚点之间的标准驾驶走廊内选点（约 50 公里缓冲）',
  expanded_80km: '候选偏少，已适度放宽走廊检索范围（约 80 公里）',
  expanded_120km: '沿途 POI 较稀疏，已扩大走廊缓冲（约 120 公里）',
  anchor_radius_35km: '在前后天落脚点附近补足候选',
  anchor_radius_55km: '在前后天落脚点较大半径内补足候选',
  best_effort_sparse: '极端稀疏区域下的尽力匹配',
};

function anchorEndpointZh(
  source: NeighborAnchorContext['startAnchorSource'] | NeighborAnchorContext['endAnchorSource'],
  role: 'start' | 'end',
): string {
  if (source === 'prev_day_last') return '前一天行程最后停留点';
  if (source === 'next_day_first') return '后一天行程首个活动点';
  if (source === 'trip_origin') return role === 'start' ? '行程起点' : '行程终点';
  if (source === 'trip_destination') return '行程目的地';
  return '凯夫拉维克（KEF）默认端点';
}

function readIntakeUserMessage(metadata: Record<string, unknown>): string {
  return String(metadata.intake_user_message ?? '').trim();
}

export function buildItineraryAdjustUserIntentEchoZh(params: {
  metadata: Record<string, unknown>;
  targetDateIso: string;
  targetDayNumber?: number;
}): string | undefined {
  const { metadata, targetDateIso, targetDayNumber } = params;
  const msg = readIntakeUserMessage(metadata);
  const trigger = metadata.adaptive_replan_trigger as
    | 'pacing'
    | 'weather'
    | 'environment'
    | 'strong_modification'
    | 'default'
    | undefined;
  const dayLabel =
    targetDayNumber != null
      ? `第 ${targetDayNumber} 天（${targetDateIso}）`
      : targetDateIso;

  if (trigger === 'pacing' || /太累|好累|疲惫|轻松|别早起|不要太赶|慢节奏|放缓/i.test(msg)) {
    return `您希望${dayLabel}更轻松一些；系统只调整这一天的节奏与安排，其余日程保持不变。`;
  }
  if (trigger === 'weather' || (/天气|强风|大风|下雨/i.test(msg) && /调整|替换|改/i.test(msg))) {
    return `您根据天气情况提出调整；系统只重排${dayLabel}，其余日程保持不变。`;
  }
  if (trigger === 'environment' || /封路|路况|拥堵/i.test(msg)) {
    return `您关注路况与可达性；系统只重排${dayLabel}，其余日程保持不变。`;
  }
  if (trigger === 'strong_modification' || /修改|重排|替换|更新行程/i.test(msg)) {
    return `您提出改排${dayLabel}；系统按您的要求更新当日草案，其余日程保持不变。`;
  }
  if (msg) {
    return `根据您的改排请求，系统只调整${dayLabel}，其余日程保持不变。`;
  }
  return undefined;
}

function normalizeScheduleHhmm(window?: string): string | undefined {
  const w = String(window ?? '').trim();
  if (!w) return undefined;
  const iso = w.match(/T(\d{2}:\d{2})/);
  if (iso?.[1]) return iso[1];
  const plain = w.match(/^(\d{1,2}:\d{2})/);
  return plain?.[1];
}

function minutesFromHhmm(hhmm?: string): number | undefined {
  if (!hhmm) return undefined;
  const [h, m] = hhmm.split(':').map((x) => Number.parseInt(x, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return undefined;
  return h * 60 + m;
}

/** 用户可读时段（对比/变更说明用，避免「由 从 09:00 起」病句） */
function formatScheduleTimeCompact(item: ItineraryAdjustScheduleItem): string {
  const start = normalizeScheduleHhmm(item.start_window);
  const end = normalizeScheduleHhmm(item.end_window);
  if (start && end) return `${start}–${end}`;
  if (start) return start;
  if (end) return `至 ${end}`;
  return '时段待定';
}

function formatScheduleTimeLabel(item: ItineraryAdjustScheduleItem): string {
  const compact = formatScheduleTimeCompact(item);
  const start = normalizeScheduleHhmm(item.start_window);
  const end = normalizeScheduleHhmm(item.end_window);
  if (start && end) return compact;
  if (start) return `从 ${start} 起`;
  if (end) return `至 ${end}`;
  return compact;
}

function normalizePoiNameKey(name: string): string {
  return name.trim().toLowerCase();
}

/** 对比改排前快照与草案，生成用户可感知的变更说明 */
export function buildItineraryAdjustScheduleChangeBullets(
  baseline: ItineraryAdjustScheduleItem[] | undefined,
  draft: ItineraryAdjustScheduleItem[] | undefined,
): string[] {
  if (!baseline?.length || !draft?.length) return [];

  const skipTypes = new Set(['DRIVE', 'TRANSIT', 'WALK']);
  const baseItems = baseline.filter(
    (it) => it.name?.trim() && !skipTypes.has(String(it.type ?? 'POI').toUpperCase()),
  );
  const draftItems = draft.filter(
    (it) => it.name?.trim() && !skipTypes.has(String(it.type ?? 'POI').toUpperCase()),
  );
  if (!baseItems.length) return [];

  const baseByName = new Map(baseItems.map((it) => [normalizePoiNameKey(it.name), it]));
  const draftByName = new Map(draftItems.map((it) => [normalizePoiNameKey(it.name), it]));
  const bullets: string[] = [];

  for (const [key, before] of baseByName) {
    const after = draftByName.get(key);
    if (!after) {
      bullets.push(`移除「${before.name}」，减轻当天行程密度。`);
      continue;
    }
    const beforeStart = minutesFromHhmm(normalizeScheduleHhmm(before.start_window));
    const afterStart = minutesFromHhmm(normalizeScheduleHhmm(after.start_window));
    const beforeT = formatScheduleTimeCompact(before);
    const afterT = formatScheduleTimeCompact(after);
    if (
      beforeStart != null &&
      afterStart != null &&
      afterStart < beforeStart - 30
    ) {
      bullets.push(`「${before.name}」${beforeT} → ${afterT}，提前以避免闭园或赶路。`);
    } else if (
      beforeStart != null &&
      afterStart != null &&
      Math.abs(afterStart - beforeStart) >= 30
    ) {
      bullets.push(`「${before.name}」${beforeT} → ${afterT}，配合当天节奏。`);
    } else if (beforeT !== afterT) {
      bullets.push(`「${before.name}」时段调整为 ${afterT}。`);
    }
  }

  for (const after of draftItems) {
    const key = normalizePoiNameKey(after.name);
    if (baseByName.has(key)) continue;
    const t = String(after.type ?? 'POI').toUpperCase();
    if (t === 'REST') {
      bullets.push(`插入${formatScheduleTimeLabel(after)} 的休息空档，方便放缓节奏。`);
    } else {
      bullets.push(`新增「${after.name}」（${formatScheduleTimeLabel(after)}）。`);
    }
  }

  const baseOrder = baseItems.map((it) => normalizePoiNameKey(it.name)).join('>');
  const draftOrder = draftItems
    .filter((it) => baseByName.has(normalizePoiNameKey(it.name)))
    .map((it) => normalizePoiNameKey(it.name))
    .join('>');
  if (
    baseOrder !== draftOrder &&
    baseOrder.length > 0 &&
    draftOrder.length > 0 &&
    !bullets.some((b) => b.includes('提前') || b.includes('调整为'))
  ) {
    bullets.push('调整了景点访问顺序，使驾车动线更连贯。');
  }

  return bullets.slice(0, 4);
}

export function buildItineraryAdjustConstraintSummaryZh(
  metadata: Record<string, unknown>,
): string {
  const parts: string[] = ['为保证与前后天驾车顺路，仅在当天驾驶走廊内选点'];
  const level = metadata.itinerary_adjust_corridor_fallback_level as CorridorFallbackLevel | undefined;
  if (level === 'expanded_120km') {
    parts.push('沿途较稀疏已适度扩大检索范围');
  } else if (level === 'expanded_80km') {
    parts.push('候选偏少已适度放宽走廊');
  } else if (metadata.itinerary_adjust_corridor_poi_search) {
    parts.push('已沿走廊补检候选');
  }

  const crossDayExcluded = metadata.itinerary_adjust_cross_day_excluded_count;
  if (typeof crossDayExcluded === 'number' && crossDayExcluded > 0) {
    parts.push(`去掉其它天已出现的 ${crossDayExcluded} 个景点以防重复游览`);
  }

  const diagnostics = metadata.itinerary_adjust_corridor_fallback as
    | { tierAttempts?: Array<{ droppedGoldenCircle?: number }> }
    | undefined;
  const droppedGc = diagnostics?.tierAttempts?.slice(-1)?.[0]?.droppedGoldenCircle ?? 0;
  if (droppedGc > 0) {
    parts.push('避免折返内陆黄金圈绕路');
  }

  return `${parts.join('，')}。`;
}

function humanizeAdaptiveReplanLine(line: string): string {
  return line
    .replace(/^疲劳\/节奏控制：/, '节奏：')
    .replace(/^人格对齐：/, '节奏：')
    .replace(/^环境约束：/, '路况/天气：')
    .trim();
}

export function buildItineraryAdjustRouteContextZh(
  anchors: NeighborAnchorContext | undefined,
): string {
  if (!anchors) {
    return '在绑定行程的邻日锚点之间做单日插值重排，避免与前后天驾驶链脱节。';
  }
  const from = anchorEndpointZh(anchors.startAnchorSource, 'start');
  const to = anchorEndpointZh(anchors.endAnchorSource, 'end');
  return `以「${from}」→「${to}」的驾驶走廊为约束，只重排第 ${anchors.targetDayNumber} 天（${anchors.targetDateIso}），其余日程保持不变。`;
}

/** 卡片 / chat 用的短说明（2–4 句，无走廊/选点术语文案） */
export function buildItineraryAdjustUserFacingBullets(
  metadata: Record<string, unknown>,
  opts?: {
    targetDateIso?: string;
    targetDayNumber?: number;
    scheduleItems?: ItineraryAdjustScheduleItem[];
  },
): string[] {
  const targetDateIso =
    opts?.targetDateIso ??
    (typeof metadata.itinerary_adjust_target_date_iso === 'string'
      ? metadata.itinerary_adjust_target_date_iso.slice(0, 10)
      : undefined);
  const anchors = metadata.itinerary_adjust_neighbor_anchors as NeighborAnchorContext | undefined;
  const targetDayNumber = opts?.targetDayNumber ?? anchors?.targetDayNumber;

  if (isItineraryAdjustPacingIntent(metadata) && targetDateIso) {
    const bullets = buildItineraryAdjustDraftNarrative({
      metadata,
      targetDateIso,
      targetDayNumber,
      scheduleItems: opts?.scheduleItems,
    });
    const applied =
      (metadata.itinerary_adjust_auto_apply as { applied?: boolean } | undefined)?.applied ===
      true;
    const mode = metadata.itinerary_adjust_execution_mode as
      | ItineraryAdjustExecutionMode
      | undefined;
    if (mode === 'AUTO' && applied) {
      bullets.push('已自动写入左侧正式行程。');
    }
    return bullets.slice(0, 4);
  }

  const dayLabel =
    targetDayNumber != null
      ? `第 ${targetDayNumber} 天`
      : targetDateIso ?? '当天';
  const msg = readIntakeUserMessage(metadata);
  const trigger = metadata.adaptive_replan_trigger as string | undefined;

  let lead = `我们只调整了${dayLabel}的安排，其它天不变。`;
  if (trigger === 'weather' || (/天气|强风|下雨/i.test(msg) && /调整|替换/i.test(msg))) {
    lead = `按天气情况，只调整了${dayLabel}的安排，其它天不变。`;
  } else if (msg) {
    lead = `按您的改排要求，只调整了${dayLabel}，其它天不变。`;
  }

  const bullets: string[] = [lead];
  const baseline = metadata.itinerary_adjust_baseline_schedule as
    | ItineraryAdjustScheduleItem[]
    | undefined;
  const scheduleChanges = buildItineraryAdjustScheduleChangeBullets(
    baseline,
    opts?.scheduleItems,
  )
    .filter((line) => !isBannedDraftReasoningLine(line))
    .slice(0, 2);
  bullets.push(...scheduleChanges);

  if (scheduleChanges.length === 0 && metadata.adaptive_replan_requested === true) {
    bullets.push('已减少景点密度并留出更宽松的时段。');
  }

  const applied =
    (metadata.itinerary_adjust_auto_apply as { applied?: boolean } | undefined)?.applied === true;
  const mode = metadata.itinerary_adjust_execution_mode as ItineraryAdjustExecutionMode | undefined;
  if (mode === 'AUTO' && applied) {
    bullets.push('已自动写入左侧正式行程。');
  }

  return bullets.slice(0, 4);
}

/** @deprecated 决策审计用；用户可见请用 buildItineraryAdjustUserFacingBullets */
export function buildItineraryAdjustRationaleBullets(
  metadata: Record<string, unknown>,
  opts?: {
    targetDateIso?: string;
    targetDayNumber?: number;
    scheduleItems?: ItineraryAdjustScheduleItem[];
  },
): string[] {
  return buildItineraryAdjustUserFacingBullets(metadata, opts);
}

const SKIP_SCHEDULE_TYPES = new Set(['DRIVE', 'TRANSIT', 'WALK', 'REST']);

function itemTypeLabelZh(type: string | undefined): string {
  const t = String(type ?? 'POI').toUpperCase();
  if (t === 'HOTEL' || t === 'STAY' || t === 'ACCOMMODATION') return '住宿';
  if (t === 'MEAL' || t === 'FOOD' || t === 'RESTAURANT') return '餐饮';
  if (t === 'SHOPPING') return '购物';
  if (t === 'ACTIVITY') return '活动';
  return '景点';
}

export function buildItineraryAdjustDraftScheduleLines(
  scheduleItems: ItineraryAdjustScheduleItem[] | undefined,
): string[] {
  if (!scheduleItems?.length) return [];
  const lines: string[] = [];
  for (const it of scheduleItems) {
    const name = String(it.name ?? '').trim();
    if (!name) continue;
    const t = String(it.type ?? 'POI').toUpperCase();
    if (SKIP_SCHEDULE_TYPES.has(t) && t !== 'REST') continue;
    const start = String(it.start_window ?? '').trim();
    const end = String(it.end_window ?? '').trim();
    const timePart =
      start && end ? `${start}–${end}` : start ? `从 ${start} 起` : end ? `至 ${end}` : '时段待定';
    if (t === 'REST') {
      lines.push(`${timePart}　${name || '休息空档'}（休整）`);
      continue;
    }
    lines.push(`${timePart}　${name}（${itemTypeLabelZh(t)}）`);
  }
  return lines;
}

function buildSinglePoiSelectionReasonZh(
  name: string,
  anchors: NeighborAnchorContext | undefined,
): string {
  const n = name.trim();
  if (/斯科加|skóga|skoga/i.test(n)) {
    return `${n}：落在「${anchorEndpointZh(anchors?.startAnchorSource ?? 'prev_day_last', 'start')}→${anchorEndpointZh(anchors?.endAnchorSource ?? 'next_day_first', 'end')}」南岸驾驶走廊上，顺路且与前后天衔接，优于折返内陆黄金圈。`;
  }
  if (/斯卡夫塔|skaftafell/i.test(n)) {
    return `${n}：在邻日锚点走廊内的国家公园停留点，适合作为南岸段核心活动。`;
  }
  if (/维克|vík|vik/i.test(n) && !/超市|supermarket/i.test(n)) {
    return `${n}：与前后天锚点同属南岸—半岛动线，减少折返。`;
  }
  if (/维克超市|supermarket/i.test(n)) {
    return `${n}：补给停留，穿插在景点之间。`;
  }
  return `${n}：在前后天锚点驾驶走廊缓冲范围内选取，保证与第 ${anchors?.targetDayNumber ?? '?'} 天整体动线一致。`;
}

export function buildPoiSelectionRationaleZh(params: {
  scheduleItems?: ItineraryAdjustScheduleItem[];
  metadata: Record<string, unknown>;
  anchors?: NeighborAnchorContext;
}): string[] {
  const items = (params.scheduleItems ?? []).filter(
    (it) => it.name?.trim() && !SKIP_SCHEDULE_TYPES.has(String(it.type ?? 'POI').toUpperCase()),
  );
  if (!items.length) return [];

  const anchors =
    params.anchors ??
    (params.metadata.itinerary_adjust_neighbor_anchors as NeighborAnchorContext | undefined);
  const lines = items.map((it) => buildSinglePoiSelectionReasonZh(it.name, anchors));

  if (items.length === 1) {
    lines.push(
      '说明：系统按走廊与单日时长从候选池排入上述景点，并非让您在斯卡夫塔与斯科加瀑布之间「二选一」；未写入草案的其它候选（若仍出现可执行性红卡）可忽略。',
    );
  } else if (items.length >= 2) {
    lines.push(
      '说明：多个景点按走廊顺序串联排布，并非互斥选项；若某候选未出现在下方草案中，其开放时间提示不必理会。',
    );
  }
  return lines;
}

export function buildItineraryAdjustApplyConfirmationZh(params: {
  applied: boolean;
  dayLabel: string;
  targetDateIso: string;
  scheduleLines: string[];
  /** 草案日程卡片/时间轴已展示时段时，确认文案不再逐条复述 */
  scheduleVisibleElsewhere?: boolean;
}): string {
  if (params.applied) {
    return `第 ${params.dayLabel}（${params.targetDateIso}）已写入正式行程；其余日期未改动。`;
  }
  if (params.scheduleLines.length === 0) {
    return `点击「应用到行程」后，将把 ${params.dayLabel}（${params.targetDateIso}）的优化草案写入正式行程，其余日期保持不变。具体时段请对照下方时间轴。`;
  }
  if (params.scheduleVisibleElsewhere !== false) {
    return `确认后点击「应用到行程」，将把 ${params.dayLabel}（${params.targetDateIso}）更新为上方草案日程；其余日期不变。`;
  }
  return [
    `点击「应用到行程」后，将把 ${params.dayLabel}（${params.targetDateIso}）更新为：`,
    ...params.scheduleLines.map((line) => `· ${line}`),
    '其余日期的安排保持不变。',
  ].join('\n');
}

/** chat / 卡片按钮区用的极短提示，避免与草案日程卡片重复 */
export function buildItineraryAdjustApplyHintZh(params: {
  applied: boolean;
  scheduleLines: string[];
}): string {
  if (params.applied) {
    return '左侧时间轴已同步为最新正式行程，可直接查看时段与地图引脚。';
  }
  if (params.scheduleLines.length > 0) {
    return '确认无误后点击「应用到行程」。';
  }
  return '确认后点击「应用到行程」写入正式行程。';
}

/** suppress_chat_lead 时 chat 正文：只输出「为何改」，不含时段列表 */
export function buildItineraryAdjustChatAnswerZh(
  rationaleBullets: string[],
): string {
  const lines = rationaleBullets.map((b) => b.trim()).filter(Boolean);
  return lines.length > 0 ? lines.join('\n') : '';
}

export function buildItineraryAdjustOptimizationResult(params: {
  metadata: Record<string, unknown>;
  targetDateIso: string;
  targetDayNumber?: number;
  poiNames: string[];
  scheduleItems?: ItineraryAdjustScheduleItem[];
}): ItineraryAdjustOptimizationResult {
  const { metadata, targetDateIso, targetDayNumber, poiNames, scheduleItems } = params;
  const anchors = metadata.itinerary_adjust_neighbor_anchors as NeighborAnchorContext | undefined;
  const executionMode =
    (metadata.itinerary_adjust_execution_mode as ItineraryAdjustExecutionMode | undefined) ??
    'ADVICE_ONLY';
  const applied =
    (metadata.itinerary_adjust_auto_apply as { applied?: boolean } | undefined)?.applied === true &&
    executionMode === 'AUTO';

  const dayLabel =
    targetDayNumber != null ? `第 ${targetDayNumber} 天` : targetDateIso;
  const statusLabel = applied ? '已更新行程' : '草案待确认';
  const routeContext = buildItineraryAdjustRouteContextZh(anchors);
  const userIntentEcho = buildItineraryAdjustUserIntentEchoZh({
    metadata,
    targetDateIso,
    targetDayNumber: targetDayNumber ?? anchors?.targetDayNumber,
  });
  const baseline = metadata.itinerary_adjust_baseline_schedule as
    | ItineraryAdjustScheduleItem[]
    | undefined;
  const scheduleChangeBullets = isItineraryAdjustPacingIntent(metadata)
    ? []
    : buildItineraryAdjustScheduleChangeBullets(baseline, scheduleItems).filter(
        (line) => !isBannedDraftReasoningLine(line),
      );
  const userFacingBullets = buildItineraryAdjustUserFacingBullets(metadata, {
    targetDateIso,
    targetDayNumber: targetDayNumber ?? anchors?.targetDayNumber,
    scheduleItems,
  });
  const draftScheduleLines = buildItineraryAdjustDraftScheduleLines(scheduleItems);
  const poiSelectionRationale = buildPoiSelectionRationaleZh({
    scheduleItems,
    metadata,
    anchors,
  });
  const experienceTheme = isItineraryAdjustPacingIntent(metadata)
    ? buildPacingExperienceThemeZh(scheduleItems)
    : undefined;
  const experienceValidation = isItineraryAdjustPacingIntent(metadata)
    ? buildItineraryAdjustExperienceValidation({ scheduleItems })
    : undefined;
  const displayTitle = experienceTheme
    ? `${dayLabel}·${experienceTheme}（${targetDateIso}）`
    : `${dayLabel}（${targetDateIso}）`;

  const optimizationSummary = userFacingBullets.join('\n');

  const scheduleVisibleElsewhere = draftScheduleLines.length > 0;
  const applyConfirmation = buildItineraryAdjustApplyConfirmationZh({
    applied,
    dayLabel: targetDayNumber != null ? `第 ${targetDayNumber} 天` : dayLabel,
    targetDateIso,
    scheduleLines: draftScheduleLines,
    scheduleVisibleElsewhere,
  });
  const chatAnswerTextZh =
    !applied && executionMode === 'ADVICE_ONLY'
      ? buildItineraryAdjustChatAnswerZh(userFacingBullets)
      : '';
  const applyConfirmationLines = applied
    ? [
        `${targetDayNumber != null ? `第 ${targetDayNumber} 天` : dayLabel}（${targetDateIso}）已写入正式行程`,
        '其余日期未改动',
      ]
    : scheduleVisibleElsewhere
      ? []
      : draftScheduleLines.length === 0
        ? [
            `将把 ${targetDayNumber != null ? `第 ${targetDayNumber} 天` : dayLabel}（${targetDateIso}）的优化草案写入正式行程`,
            '其余日期保持不变',
          ]
        : [
            `将把 ${targetDayNumber != null ? `第 ${targetDayNumber} 天` : dayLabel}（${targetDateIso}）更新为草案日程`,
            '其余日期保持不变',
          ];

  const applyHint = buildItineraryAdjustApplyHintZh({
    applied,
    scheduleLines: draftScheduleLines,
  });

  return {
    target_date_iso: targetDateIso,
    target_day_number: targetDayNumber ?? anchors?.targetDayNumber,
    execution_mode: executionMode,
    applied,
    status_label_zh: statusLabel,
    poi_names: poiNames,
    draft_schedule_zh: draftScheduleLines,
    route_context_zh: routeContext,
    optimization_summary_zh: optimizationSummary,
    ...(userIntentEcho ? { user_intent_echo_zh: userIntentEcho } : {}),
    ...(scheduleChangeBullets.length > 0
      ? { schedule_change_bullets_zh: scheduleChangeBullets }
      : {}),
    rationale_bullets_zh: userFacingBullets,
    apply_confirmation_zh: applyConfirmation,
    apply_confirmation_lines: applyConfirmationLines,
    apply_hint_zh: applyHint,
    corridor_fallback_level: metadata.itinerary_adjust_corridor_fallback_level as string | undefined,
    display_title_zh: displayTitle,
    ...(experienceTheme ? { experience_theme_zh: experienceTheme } : {}),
    ...(experienceValidation ? { experience_validation: experienceValidation } : {}),
    poi_selection_rationale_zh: poiSelectionRationale,
    suppress_chat_lead: !applied && executionMode === 'ADVICE_ONLY',
    chat_answer_text_zh: chatAnswerTextZh,
  };
}

/** 出站 payload：timeline 为空时保留 NARRATE 阶段已写入 metadata 的草案字段 */
export function coalesceItineraryAdjustOptimizationResult(
  rebuilt: ItineraryAdjustOptimizationResult,
  existing: ItineraryAdjustOptimizationResult | undefined,
): ItineraryAdjustOptimizationResult {
  if (!existing || existing.target_date_iso !== rebuilt.target_date_iso) {
    return rebuilt;
  }
  const draftSchedule =
    rebuilt.draft_schedule_zh.length > 0 ? rebuilt.draft_schedule_zh : (existing.draft_schedule_zh ?? []);
  const optimizationSummary =
    rebuilt.optimization_summary_zh.trim() || existing.optimization_summary_zh?.trim() || rebuilt.route_context_zh;
  const chatAnswer =
    rebuilt.chat_answer_text_zh?.trim() ||
    existing.chat_answer_text_zh?.trim() ||
    buildItineraryAdjustChatAnswerZh(rebuilt.rationale_bullets_zh ?? []);
  return {
    ...rebuilt,
    draft_schedule_zh: draftSchedule,
    optimization_summary_zh: optimizationSummary,
    poi_names: rebuilt.poi_names.length > 0 ? rebuilt.poi_names : (existing.poi_names ?? []),
    apply_confirmation_zh: rebuilt.apply_confirmation_zh,
    apply_confirmation_lines: rebuilt.apply_confirmation_lines,
    apply_hint_zh: rebuilt.apply_hint_zh,
    poi_selection_rationale_zh:
      (rebuilt.poi_selection_rationale_zh?.length ?? 0) > 0
        ? rebuilt.poi_selection_rationale_zh
        : existing.poi_selection_rationale_zh,
    chat_answer_text_zh: chatAnswer,
  };
}
