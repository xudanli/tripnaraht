/**
 * NARRATOR：读取 `research_data.__research_asset_manifest`，将工程容错（如 STALE_RECOVERED）
 * 转化为可展示文案与结构化 `research_ui_hints`（BFF / UI 绑定）。
 *
 * 6.2：当 `__research_conflict_negotiation.stitch_tactic === 'AGGRESSIVE_COMPENSATION'` 时，
 * 对非合规域的 `STALE_RECOVERED` 做「实体坍缩」——合并为单条提示与聚合 hint；合规域仍分项透明。
 */

import type { NarrationLike, NarrationResearchUiHint } from '../../decision/kernel/interfaces/phase-executor.interface';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import { isResearchConflictNegotiationReport } from '../teams/research/research-conflict-negotiation.util';

const SCOPE_LABEL_ZH: Record<string, string> = {
  hotel: '酒店',
  flight: '航班',
  destination: '行程与目的地研究',
  transport: '交通与接驳',
  compliance: '签证与合规',
  common: '其他研究数据',
};

const AGGREGATED_STALE_FRESHNESS = 'AGGREGATED_STALE_RECOVERED' as const;

/** 6.2：供 NARRATE `metadata.collapsed_suture_count` 等审计消费（可变计数器） */
export type MergeResearchManifestAudit = {
  collapsed_suture_count: number;
};

function messageForStaleRecovered(scope: string): string {
  const label = SCOPE_LABEL_ZH[scope] ?? `${scope} 相关`;
  if (scope === 'hotel') {
    return '酒店信息未能在第一时间同步（实时接口波动），已为您保留原方案以供参考。';
  }
  if (scope === 'flight') {
    return '航班报价暂未刷新成功，已保留上一版检索结果供参考。';
  }
  return `${label}暂未能刷新至最新，已保留上一版结果供参考；您可稍后尝试局部刷新。`;
}

function messageForUpdated(scope: string): string {
  const label = SCOPE_LABEL_ZH[scope] ?? scope;
  if (scope === 'hotel') {
    return '已根据您的新要求更新了酒店相关研究数据。';
  }
  return `已根据您的新要求更新了${label}相关数据。`;
}

function readAggressiveManifestCollapse(rd: Record<string, unknown> | undefined): boolean {
  const raw = rd?.__research_conflict_negotiation;
  if (!isResearchConflictNegotiationReport(raw)) return false;
  return raw.stitch_tactic === 'AGGRESSIVE_COMPENSATION';
}

function consolidatedStaleMessageZh(scopesSorted: readonly string[]): string {
  const labels = scopesSorted.map((s) => SCOPE_LABEL_ZH[s] ?? s).join('、');
  return `以下非合规类研究域（${labels}）因实时检索波动曾暂未能刷新至最新，系统已将历史快照说明合并为一处展示（底层数据仍可在对应卡片中核对）；签证与合规相关更新仍分项保留。`;
}

/**
 * 将 manifest 中的 freshness 合并进叙述：前置 `tips`、填充 `research_ui_hints`、可选 `voice_tone_modifier`。
 *
 * @param audit 若传入，则在发生 6.2 实体坍缩时写入 `collapsed_suture_count`（本趟合并所坍缩的域数量）。
 */
export function mergeResearchManifestIntoNarration(
  narration: NarrationLike,
  state: OrchestratorState,
  audit?: MergeResearchManifestAudit,
): NarrationLike {
  const rd = state.research_data as Record<string, unknown> | undefined;
  const manifest = rd?.__research_asset_manifest as
    | {
        scopes?: Record<
          string,
          { freshness?: string; attribution?: string; valid?: boolean }
        >;
      }
    | undefined;
  const scopes = manifest?.scopes;
  if (!scopes || typeof scopes !== 'object') return narration;

  const aggressiveCollapse = readAggressiveManifestCollapse(rd);
  if (audit) audit.collapsed_suture_count = 0;

  const prevHints = narration.research_ui_hints ?? [];
  const seenHint = new Set(prevHints.map((h) => `${h.scope}:${h.freshness}`));
  const existingTips = narration.tips ?? [];

  const tipsPrefix: string[] = [];
  const uiHints: NarrationResearchUiHint[] = [...prevHints];
  let voice: NarrationLike['voice_tone_modifier'] = narration.voice_tone_modifier;

  const collapsedStaleScopes: string[] = [];

  for (const [scope, row] of Object.entries(scopes)) {
    if (!row || typeof row !== 'object') continue;
    const freshness = String((row as { freshness?: unknown }).freshness ?? '').trim();
    const attribution =
      typeof (row as { attribution?: unknown }).attribution === 'string'
        ? String((row as { attribution?: string }).attribution).trim()
        : undefined;

    if (freshness === 'STALE_RECOVERED') {
      if (aggressiveCollapse && scope !== 'compliance') {
        collapsedStaleScopes.push(scope);
        continue;
      }
      const hintKey = `${scope}:STALE_RECOVERED`;
      if (seenHint.has(hintKey)) continue;
      seenHint.add(hintKey);
      const message_zh = messageForStaleRecovered(scope);
      const tipLine = `[数据说明] ${message_zh}`;
      if (!existingTips.some((t) => t === tipLine || t.includes(message_zh)) && !tipsPrefix.includes(tipLine)) {
        tipsPrefix.push(tipLine);
      }
      uiHints.push({ scope, freshness, message_zh, ...(attribution ? { attribution } : {}) });
      voice = 'reassuring_transparency';
      continue;
    }
    if (freshness === 'UPDATED') {
      const hintKey = `${scope}:UPDATED`;
      if (seenHint.has(hintKey)) continue;
      seenHint.add(hintKey);
      const message_zh = messageForUpdated(scope);
      const tipLine = `[更新说明] ${message_zh}`;
      if (!existingTips.some((t) => t === tipLine || t.includes(message_zh)) && !tipsPrefix.includes(tipLine)) {
        tipsPrefix.push(tipLine);
      }
      uiHints.push({ scope, freshness, message_zh, ...(attribution ? { attribution } : {}) });
    }
  }

  if (aggressiveCollapse && collapsedStaleScopes.length > 0) {
    const sorted = [...new Set(collapsedStaleScopes)].sort();
    const aggKey = `common:${AGGREGATED_STALE_FRESHNESS}`;
    if (!seenHint.has(aggKey)) {
      seenHint.add(aggKey);
      const message_zh = consolidatedStaleMessageZh(sorted);
      const tipLine = `[数据说明] ${message_zh}`;
      if (!existingTips.some((t) => t.includes('合并为一处展示')) && !tipsPrefix.includes(tipLine)) {
        tipsPrefix.push(tipLine);
      }
      uiHints.push({
        scope: 'common',
        freshness: AGGREGATED_STALE_FRESHNESS,
        message_zh,
        attribution: 'HARNESS:STITCH_AGGREGATE',
      });
      voice = 'reassuring_transparency';
      if (audit) audit.collapsed_suture_count = sorted.length;
    }
  }

  if (tipsPrefix.length === 0 && uiHints.length === prevHints.length) return narration;

  const tips = [...tipsPrefix, ...existingTips];
  return {
    ...narration,
    tips,
    ...(uiHints.length > 0 ? { research_ui_hints: uiHints } : {}),
    ...(voice ? { voice_tone_modifier: voice } : {}),
  };
}
