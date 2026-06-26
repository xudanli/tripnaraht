/**
 * 轻量行程咨询：结构化「一键操作」供前端渲染按钮并与 route_and_run / 路由联动。
 */

import { extractConsultationDraftDayRows } from './trip-dining-consultation.util';

export type TripConsultationSuggestedOperationKind =
  | 'route_and_run_message'
  | 'client_navigation';

export interface TripConsultationSuggestedOperation {
  id: string;
  label: string;
  kind: TripConsultationSuggestedOperationKind;
  /** route_and_run_message：点击后作为用户 message 提交；client_navigation：仅前端路由 */
  payload?: {
    message?: string;
    route?: string;
    trip_id?: string;
    [key: string]: unknown;
  };
}

const MARK_START = '<<<SUGGESTED_OPS_JSON>>>';
const MARK_END = '<<<END_SUGGESTED_OPS_JSON>>>';

const ALLOWED_NAV_ROUTES = new Set([
  'timeline',
  'replay',
  'planning',
  'itinerary',
  'decision_cockpit',
  'structured_negotiation',
]);

function sanitizeOperation(
  raw: unknown,
  fallbackTripId: string,
): TripConsultationSuggestedOperation | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === 'string' && o.id.trim() ? o.id.trim().slice(0, 64) : '';
  const label = typeof o.label === 'string' && o.label.trim() ? o.label.trim().slice(0, 36) : '';
  const kind = o.kind === 'route_and_run_message' || o.kind === 'client_navigation' ? o.kind : null;
  if (!id || !label || !kind) return null;

  const payloadIn = o.payload && typeof o.payload === 'object' ? (o.payload as Record<string, unknown>) : {};
  const payload: TripConsultationSuggestedOperation['payload'] = { ...payloadIn };

  if (kind === 'route_and_run_message') {
    const msg =
      typeof payload.message === 'string' && payload.message.trim()
        ? payload.message.trim().slice(0, 4000)
        : '';
    if (!msg) return null;
    payload.message = msg;
    payload.trip_id = fallbackTripId;
  }

  if (kind === 'client_navigation') {
    const route = typeof payload.route === 'string' ? payload.route.trim() : '';
    if (!route || !ALLOWED_NAV_ROUTES.has(route)) return null;
    payload.route = route;
    payload.trip_id = fallbackTripId;
  }

  return { id, label, kind, payload };
}

/**
 * 从 LLM 正文中抽取 <<<SUGGESTED_OPS_JSON>>>…<<<END_SUGGESTED_OPS_JSON>>>，返回去除标记后的正文。
 */
export function extractSuggestedOperationsFromAnswer(
  raw: string,
  tripId: string,
): { cleanText: string; operations: TripConsultationSuggestedOperation[] } {
  const tid = tripId.trim();
  if (!tid) {
    return { cleanText: raw.trim(), operations: [] };
  }
  const idx = raw.indexOf(MARK_START);
  const idxEnd = raw.indexOf(MARK_END);
  if (idx === -1 || idxEnd === -1 || idxEnd <= idx) {
    return { cleanText: raw.trim(), operations: [] };
  }
  const jsonStr = raw.slice(idx + MARK_START.length, idxEnd).trim();
  const before = raw.slice(0, idx).trim();
  const after = raw.slice(idxEnd + MARK_END.length).trim();
  const cleanText = [before, after].filter(Boolean).join('\n\n').trim();

  try {
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) {
      return { cleanText: raw.trim(), operations: [] };
    }
    const operations = parsed
      .map((x) => sanitizeOperation(x, tid))
      .filter((x): x is TripConsultationSuggestedOperation => Boolean(x))
      .slice(0, 6);
    return { cleanText: cleanText || raw.trim(), operations };
  } catch {
    return { cleanText: raw.trim(), operations: [] };
  }
}

/**
 * 餐饮咨询未锚定时：为草案中的前若干天生成「锚定第 N 天」按钮（优先插入 merge 列表前部）。
 */
export function buildDiningAnchorSuggestedOperations(
  tripId: string,
  consultationSummaryBlob: string,
  maxDays = 4,
): TripConsultationSuggestedOperation[] {
  const tid = tripId.trim();
  if (!tid) return [];
  const rows = extractConsultationDraftDayRows(consultationSummaryBlob).slice(0, Math.max(0, maxDays));
  return rows.map((r) => ({
    id: `dining_anchor_day_${r.dayIndex1}`,
    label: `第${r.dayIndex1}天附近吃`,
    kind: 'route_and_run_message' as const,
    payload: {
      trip_id: tid,
      message: `请围绕我行程草案第${r.dayIndex1}天（${r.dateLabel}）活动区域，推荐午/晚餐各 1–2 家合适餐厅，并说明价位带与是否需预订。`,
    },
  }));
}

export type BuildDefaultTripConsultationSuggestedOperationsOpts = {
  /**
   * 用户本轮自然语言；非空时生成「用行程规划改稿」按钮（先泛问后规划），
   * `payload.intent_mode=TRIP_PLANNING` 供客户端下一轮 route_and_run 透传。
   */
  planning_handoff_message?: string;
};

export function buildDefaultTripConsultationSuggestedOperations(
  tripId: string,
  opts?: BuildDefaultTripConsultationSuggestedOperationsOpts,
): TripConsultationSuggestedOperation[] {
  const tid = tripId.trim();
  if (!tid) return [];

  const userAsk = typeof opts?.planning_handoff_message === 'string' ? opts.planning_handoff_message.trim() : '';
  const handoffMessage =
    userAsk.length > 0
      ? `【请使用行程规划模式】结合当前行程草案，在完整规划与校验下落实以下需求（可调整日程、交通与住宿）：\n\n${userAsk}`.slice(
          0,
          4000,
        )
      : '';

  const out: TripConsultationSuggestedOperation[] = [];
  if (handoffMessage) {
    out.push({
      id: 'handoff_trip_planning_same_ask',
      label: '用行程规划改稿',
      kind: 'route_and_run_message',
      payload: {
        trip_id: tid,
        intent_mode: 'TRIP_PLANNING',
        message: handoffMessage,
      },
    });
  }

  out.push(
    {
      id: 'apply_analysis_to_plan',
      label: '按上述建议调整行程',
      kind: 'route_and_run_message',
      payload: {
        trip_id: tid,
        intent_mode: 'TRIP_PLANNING',
        message:
          '【请使用行程规划模式】请根据上文分析与建议，帮我优化当前行程草稿：按优先级落实你提到的改动（可直接修改日程）。',
      },
    },
    {
      id: 'open_timeline',
      label: '查看行程时间轴',
      kind: 'client_navigation',
      payload: { trip_id: tid, route: 'timeline' },
    },
  );

  return out;
}

function clientNavigationRouteKey(op: TripConsultationSuggestedOperation): string | null {
  if (op.kind !== 'client_navigation') return null;
  const r = typeof op.payload?.route === 'string' ? op.payload.route.trim() : '';
  return r.length ? r : null;
}

/** 模型输出优先，不足时用默认补齐（按 id 去重；`client_navigation` 另按 route 去重避免双「时间线」按钮）。 */
export function mergeSuggestedOperations(
  parsed: TripConsultationSuggestedOperation[],
  defaults: TripConsultationSuggestedOperation[],
): TripConsultationSuggestedOperation[] {
  const seenIds = new Set<string>();
  const seenNavRoutes = new Set<string>();
  const out: TripConsultationSuggestedOperation[] = [];

  const tryPush = (op: TripConsultationSuggestedOperation) => {
    const navKey = clientNavigationRouteKey(op);
    if (navKey) {
      if (seenNavRoutes.has(navKey)) return;
      seenNavRoutes.add(navKey);
    }
    if (seenIds.has(op.id)) return;
    seenIds.add(op.id);
    out.push(op);
    return out.length >= 6;
  };

  for (const op of parsed) {
    if (tryPush(op)) return out;
  }
  for (const op of defaults) {
    if (tryPush(op)) return out;
  }
  return out;
}
