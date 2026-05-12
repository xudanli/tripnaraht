/**
 * 持久化前归一化决策日志，满足 PRD §13.B（关键动作须带 reasonCodes）及 §I6（结构化风险/责任默认值）。
 */

import type { DecisionLogEntry } from './decision-result.types';
import type { DecisionRiskTier } from './decision-log-metadata-prd.types';
import { isCriticalDecisionActionValue } from './decision-log-metadata-prd.types';

/** 遗留路径未填 reasonCodes 时的占位码（可检索 `prd_reason_codes_fallback`） */
export const PRD_FALLBACK_REASON_CODE = 'DECISION_REASON_UNSPECIFIED';

function slugReasonToken(raw: string, maxLen: number): string | undefined {
  const slug = raw.trim().replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, maxLen);
  return slug || undefined;
}

/** 从 metadata 推导辅助 reasonCodes（不全然语义完备，但优于仅有 UNSPECIFIED）；可与占位符并存。 */
function deriveAuxiliaryReasonCodesFromMetadata(meta: Record<string, unknown>): string[] {
  const codes: string[] = [];
  const rid = meta.ruleId ?? meta.rule_id;
  if (typeof rid === 'string' && rid.trim()) {
    const s = slugReasonToken(rid, 80);
    if (s) codes.push(`RULE_${s}`);
  }
  const cat = meta.category;
  if (typeof cat === 'string' && cat.trim()) {
    const s = slugReasonToken(cat, 64);
    if (s) codes.push(`CATEGORY_${s}`);
  }
  const mod = meta.modificationType ?? meta.modification_type;
  if (typeof mod === 'string' && mod.trim()) {
    const s = slugReasonToken(mod, 64);
    if (s) codes.push(`MOD_${s}`);
  }
  const src = meta.source;
  if (typeof src === 'string' && src.trim()) {
    const s = slugReasonToken(src, 48);
    if (s) codes.push(`SRC_${s}`);
  }
  const ev = meta.event;
  if (typeof ev === 'string' && ev.trim()) {
    const s = slugReasonToken(ev, 80);
    if (s) codes.push(`EVT_${s}`);
  }
  const dp = meta.decisionPoint ?? meta.decision_point;
  if (typeof dp === 'string' && dp.trim()) {
    const s = slugReasonToken(dp, 64);
    if (s) codes.push(`DP_${s}`);
  }
  const reqId = meta.requestId ?? meta.request_id;
  if (typeof reqId === 'string' && reqId.trim()) {
    const s = slugReasonToken(reqId, 48);
    if (s) codes.push(`REQ_${s}`);
  }
  const tripRun = meta.tripRunId ?? meta.trip_run_id;
  if (typeof tripRun === 'string' && tripRun.trim()) {
    const s = slugReasonToken(tripRun, 48);
    if (s) codes.push(`TRIPRUN_${s}`);
  }
  const pvRaw = meta.plan_version ?? meta.planVersion;
  if (typeof pvRaw === 'number' && Number.isFinite(pvRaw)) {
    codes.push(`PV_${Math.floor(pvRaw)}`);
  } else if (typeof pvRaw === 'string' && pvRaw.trim()) {
    const n = parseInt(pvRaw, 10);
    if (Number.isFinite(n)) codes.push(`PV_${n}`);
  }
  return Array.from(new Set(codes));
}

function defaultRiskTierForCriticalAction(action: string): DecisionRiskTier {
  if (action === 'REJECT') return 'HIGH';
  return 'MEDIUM';
}

/**
 * 关键决策补充默认审计字段（仅当调用方未提供）。
 * 标记 `prd_*_defaulted` 便于后续替换为显式策略输出。
 */
function enrichCriticalPrdAuditFields(entry: DecisionLogEntry): DecisionLogEntry {
  if (!isCriticalDecisionActionValue(entry.action)) {
    return entry;
  }
  const baseMeta =
    entry.metadata && typeof entry.metadata === 'object' && !Array.isArray(entry.metadata)
      ? { ...(entry.metadata as Record<string, unknown>) }
      : {};
  let touched = false;
  if (baseMeta.risk_tier === undefined) {
    baseMeta.risk_tier = defaultRiskTierForCriticalAction(entry.action);
    baseMeta.prd_risk_tier_defaulted = true;
    touched = true;
  }
  if (baseMeta.responsibility_mode === undefined) {
    baseMeta.responsibility_mode = 'ASSIST_ONLY';
    baseMeta.prd_responsibility_mode_defaulted = true;
    touched = true;
  }
  if (!touched) return entry;
  return { ...entry, metadata: baseMeta };
}

export function normalizeDecisionLogEntryForPersistence(entry: DecisionLogEntry): DecisionLogEntry {
  let next = entry;

  if (isCriticalDecisionActionValue(next.action) && (!Array.isArray(next.reasonCodes) || next.reasonCodes.length === 0)) {
    const baseMeta =
      next.metadata && typeof next.metadata === 'object' && !Array.isArray(next.metadata)
        ? (next.metadata as Record<string, unknown>)
        : {};
    const auxiliary = deriveAuxiliaryReasonCodesFromMetadata(baseMeta);
    const reasonCodes =
      auxiliary.length > 0
        ? [PRD_FALLBACK_REASON_CODE, ...auxiliary]
        : [PRD_FALLBACK_REASON_CODE];
    next = {
      ...next,
      reasonCodes,
      metadata: {
        ...baseMeta,
        prd_reason_codes_fallback: true,
        ...(auxiliary.length > 0 ? { prd_reason_codes_auxiliary: auxiliary } : {}),
      },
    };
  }

  return enrichCriticalPrdAuditFields(next);
}
