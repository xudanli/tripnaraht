/**
 * RequiredEvidenceSpec × 现有 Evidence → 本轮 Acquisition Plan。
 * FETCH / ASK_USER / ANSWER_CONDITIONALLY 由合同决定，不再由 Fast Path 硬编码。
 */

import type {
  EvidenceAcquisitionItem,
  EvidenceAcquisitionPlan,
  RequiredEvidenceSpec,
  System1Evidence,
  System1EvidenceSourceType,
  System1EvidenceStatus,
} from './system1-runtime.types';

const STATUS_RANK: Record<System1EvidenceStatus, number> = {
  VERIFIED: 0,
  STALE: 1,
  ASSUMED: 2,
  UNAVAILABLE: 3,
};

export type EvidenceAcquisitionContext = {
  tripId?: string | null;
  /** 测试注入：禁止打外部传感器 */
  skipExternalFetch?: boolean;
  /** 本轮已 FETCH 过的 key，避免 ASK_USER 合同在有 tripId 时死循环再拉 */
  alreadyFetched?: string[];
};

function bestStatus(rows: System1Evidence[]): System1EvidenceStatus | null {
  if (rows.length === 0) return null;
  return rows.reduce<System1EvidenceStatus>((acc, row) => {
    return STATUS_RANK[row.status] < STATUS_RANK[acc] ? row.status : acc;
  }, rows[0]!.status);
}

function isExpired(spec: RequiredEvidenceSpec, rows: System1Evidence[]): boolean {
  const maxAge = spec.freshnessRequirement?.maxAgeSeconds;
  if (!maxAge || maxAge <= 0) return false;
  const now = Date.now();
  return rows.every((r) => {
    if (!r.observedAt) return false;
    const t = Date.parse(r.observedAt);
    if (!Number.isFinite(t)) return false;
    return now - t > maxAge * 1000;
  });
}

function canAttemptFetch(
  spec: RequiredEvidenceSpec,
  ctx: EvidenceAcquisitionContext,
): boolean {
  if (ctx.skipExternalFetch) {
    /** 仍允许 TRIP_STATE 本地取证 */
    return (
      Boolean(ctx.tripId?.trim()) &&
      spec.acceptableSources.includes('TRIP_STATE')
    );
  }
  const sources = new Set(spec.acceptableSources);
  const external: System1EvidenceSourceType[] = [
    'WORLD_STATE',
    'TOOL',
    'EXTERNAL_API',
    'ONTOLOGY',
  ];
  if (external.some((s) => sources.has(s))) return true;
  if (sources.has('KNOWLEDGE')) return true;
  if (sources.has('TRIP_STATE') && ctx.tripId?.trim()) return true;
  return false;
}

export function planEvidenceAcquisition(input: {
  required: RequiredEvidenceSpec[];
  evidence: System1Evidence[];
  context?: EvidenceAcquisitionContext;
}): EvidenceAcquisitionPlan {
  const ctx = input.context ?? {};
  const items: EvidenceAcquisitionItem[] = [];
  const fetchKeys: string[] = [];
  const askKeys: string[] = [];
  const escalateKeys: string[] = [];

  for (const spec of input.required) {
    const rows = input.evidence.filter((e) => e.key === spec.key);
    const status = bestStatus(rows);
    const requireLive = spec.freshnessRequirement?.requireLive === true;
    const expired = isExpired(spec, rows);
    const satisfied =
      status === 'VERIFIED' ||
      (status === 'STALE' && !requireLive && !expired);
    const needsRefresh =
      (status === 'STALE' && requireLive) ||
      (status === 'VERIFIED' && expired);

    if (satisfied && !needsRefresh) {
      items.push({
        key: spec.key,
        action: 'SKIP',
        reason: `have_${status?.toLowerCase() ?? 'unknown'}`,
      });
      continue;
    }

    const fetchable = canAttemptFetch(spec, ctx);
    const onMissing = spec.onMissing;
    const already = new Set(ctx.alreadyFetched ?? []);
    if (!satisfied && already.has(spec.key)) {
      if (onMissing === 'ASK_USER') {
        items.push({ key: spec.key, action: 'ASK_USER', reason: 'fetched_still_missing_ask' });
        askKeys.push(spec.key);
      } else if (onMissing === 'ESCALATE') {
        items.push({ key: spec.key, action: 'ESCALATE', reason: 'fetched_still_missing_escalate' });
        escalateKeys.push(spec.key);
      } else {
        items.push({
          key: spec.key,
          action: 'ANSWER_CONDITIONALLY',
          reason: 'fetched_still_missing',
        });
      }
      continue;
    }

    if (needsRefresh && fetchable) {
      items.push({ key: spec.key, action: 'FETCH', reason: 'stale_or_expired_refresh' });
      fetchKeys.push(spec.key);
      continue;
    }

    if (onMissing === 'FETCH' && fetchable) {
      items.push({ key: spec.key, action: 'FETCH', reason: 'missing_fetch' });
      fetchKeys.push(spec.key);
      continue;
    }

    if (onMissing === 'ASK_USER') {
      if (fetchable) {
        items.push({
          key: spec.key,
          action: 'FETCH',
          reason: 'ask_user_but_fetchable_source',
        });
        fetchKeys.push(spec.key);
      } else {
        items.push({ key: spec.key, action: 'ASK_USER', reason: 'missing_ask_user' });
        askKeys.push(spec.key);
      }
      continue;
    }

    if (onMissing === 'ESCALATE') {
      items.push({ key: spec.key, action: 'ESCALATE', reason: 'missing_escalate' });
      escalateKeys.push(spec.key);
      continue;
    }

    if (onMissing === 'FETCH' && !fetchable) {
      items.push({
        key: spec.key,
        action: 'ANSWER_CONDITIONALLY',
        reason: 'fetch_not_available',
      });
      continue;
    }

    items.push({
      key: spec.key,
      action: 'ANSWER_CONDITIONALLY',
      reason: 'missing_answer_conditionally',
    });
  }

  return {
    items,
    fetchKeys: [...new Set(fetchKeys)],
    askKeys: [...new Set(askKeys)],
    escalateKeys: [...new Set(escalateKeys)],
  };
}

export function buildSystem1AskUserAnswerZh(askKeys: string[]): string {
  const labels: Record<string, string> = {
    'trip.day_list': '行程日程（有哪些天）',
    'trip.accommodation_anchors': '各天住宿安排',
    'trip.current_day': '今天对应哪一天',
    'trip.timeline': '当日时间线',
    'trip.next_activity': '下一站活动',
    'trip.current_location': '当前位置',
    'vehicle.profile': '车辆类型',
    'route.status': '路况',
    'weather.wind': '风力/天气',
    'knowledge.hit': '知识库或地点检索结果',
    'decision.options': '可选方案',
    'trip.constraints': '行程约束（天数/季节）',
    'inventory.hit': '库存/检索结果（酒店/租车/餐饮等）',
  };
  const lines = askKeys.map((k) => `- ${labels[k] ?? k}`);
  return (
    `继续前还需要补充信息：\n\n` +
    (lines.length ? `${lines.join('\n')}\n\n` : '') +
    `请补充后重试；System1 不会在关键上下文缺失时给出强硬结论。`
  );
}
