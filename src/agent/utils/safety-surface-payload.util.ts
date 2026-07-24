/**
 * `route_and_run` 响应中的 **safety_surface**：供前端「痛觉 UI」稳定消费（与 LLM 文案解耦）。
 */

import type { Itinerary, GateResult } from '../interfaces/trip-plan.interface';
import {
  humanizeVerifyIssueHeadlineZh,
  surfaceRawVerifyIssueMessageForUserZh,
} from './feasibility-message-surface.zh.util';
import { filterSafetyVerifyIssuesAgainstItinerary, filterSafetyIssuesDuplicatingGateViolations } from './filter-stale-verify-violations.util';

export const SAFETY_SURFACE_VERSION = '1.0' as const;

export type SafetySurfaceSafetravelAlert = {
  id?: string;
  source?: string;
  title?: string;
  /** 已截断，避免超大 HTML */
  summary: string;
  severity?: string;
  affected_route_segment_refs: string[];
};

export type SafetySurfaceTaggedLeg = {
  day: string;
  item_id: string;
  route_segment_ref: string;
  type?: string;
  label?: string;
};

export type SafetySurfaceVerifyIssue = {
  type: string;
  severity: string;
  item_id?: string;
  day?: string;
  message: string;
  /** BFF 出站：中文标题（供前端替代直显 ROUTE_INFEASIBLE 等英码） */
  headline_zh?: string;
  suggestion?: string;
  segment_ref?: string;
};

export type SafetySurfaceSmartUpdate = {
  verified?: boolean;
  narrative?: string;
  reachability_messages?: string[];
  adjustments: Array<{ action: string; why?: string; target?: string }>;
  applied_fixes: Array<{ adjustment_type?: string; description?: string; target?: string }>;
};

export type SafetySurfacePayload = {
  version: typeof SAFETY_SURFACE_VERSION;
  safetravel_route_alerts: SafetySurfaceSafetravelAlert[];
  /** 最近一次 itinerary.verify 的 issues（若有执行步骤） */
  verify_issues: SafetySurfaceVerifyIssue[];
  smart_update?: SafetySurfaceSmartUpdate;
  tagged_drive_legs: SafetySurfaceTaggedLeg[];
};

const SUMMARY_MAX = 800;

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

function sanitizeAlerts(raw: unknown): SafetySurfaceSafetravelAlert[] {
  if (!raw || !Array.isArray(raw)) return [];
  const out: SafetySurfaceSafetravelAlert[] = [];
  for (const a of raw) {
    if (!a || typeof a !== 'object') continue;
    const x = a as Record<string, unknown>;
    const refs = x.affected_route_segment_refs;
    const refList = Array.isArray(refs) ? refs.filter((r): r is string => typeof r === 'string' && r.length > 0) : [];
    const summary = typeof x.summary === 'string' ? truncate(x.summary, SUMMARY_MAX) : '';
    if (!summary && !refList.length) continue;
    out.push({
      ...(typeof x.id === 'string' ? { id: x.id } : {}),
      ...(typeof x.source === 'string' ? { source: x.source } : {}),
      ...(typeof x.title === 'string' ? { title: x.title } : {}),
      summary: summary || (typeof x.title === 'string' ? x.title : 'SafeTravel alert'),
      ...(typeof x.severity === 'string' ? { severity: x.severity } : {}),
      affected_route_segment_refs: refList,
    });
  }
  return out;
}

function collectTaggedLegs(itinerary: Itinerary | null | undefined): SafetySurfaceTaggedLeg[] {
  if (!itinerary?.days?.length) return [];
  const legs: SafetySurfaceTaggedLeg[] = [];
  for (const d of itinerary.days) {
    const date = String(d.date ?? '');
    for (const it of d.items ?? []) {
      const ref = (it as { metadata?: { route_segment_ref?: string } }).metadata?.route_segment_ref;
      if (typeof ref === 'string' && ref.length > 0 && (it.type === 'DRIVE' || it.type === 'TRANSIT')) {
        legs.push({
          day: date,
          item_id: String(it.id),
          route_segment_ref: ref,
          type: it.type,
          label: it.location_ref?.name,
        });
      }
    }
  }
  return legs;
}

function sanitizeVerifyIssues(issues: unknown): SafetySurfaceVerifyIssue[] {
  if (!Array.isArray(issues)) return [];
  const out: SafetySurfaceVerifyIssue[] = [];
  for (const i of issues) {
    if (!i || typeof i !== 'object') continue;
    const x = i as Record<string, unknown>;
    const type = typeof x.type === 'string' ? x.type : 'UNKNOWN';
    const severity = typeof x.severity === 'string' ? x.severity : 'WARNING';
    const rawMsg = typeof x.message === 'string' ? x.message : '';
    const message = rawMsg ? truncate(surfaceRawVerifyIssueMessageForUserZh(rawMsg), SUMMARY_MAX) : '';
    if (!message) continue;
    const violation = x.violation as Record<string, unknown> | undefined;
    const entityRef = violation?.entityRef as Record<string, unknown> | undefined;
    const segmentRef = typeof entityRef?.id === 'string' ? entityRef.id : undefined;
    out.push({
      type,
      severity,
      ...(type !== 'UNKNOWN' ? { headline_zh: humanizeVerifyIssueHeadlineZh(type) } : {}),
      ...(typeof x.item_id === 'string' ? { item_id: x.item_id } : {}),
      ...(typeof x.day === 'string' ? { day: x.day } : {}),
      message,
      ...(typeof x.suggestion === 'string' ? { suggestion: truncate(x.suggestion, 400) } : {}),
      ...(segmentRef ? { segment_ref: segmentRef } : {}),
    });
  }
  return out;
}

function extractSmartUpdate(
  steps: Array<{ skillName?: string; result?: any; success?: boolean }> | undefined,
): SafetySurfaceSmartUpdate | undefined {
  if (!steps?.length) return undefined;
  const rev = [...steps].reverse();
  const step = rev.find((s) => s.skillName === 'itinerary.smart_update' && s.success && s.result && typeof s.result === 'object');
  if (!step?.result) return undefined;
  const r = step.result as Record<string, unknown>;
  const telemetry = r.telemetry as Record<string, unknown> | undefined;
  const narrative = typeof telemetry?.narrative === 'string' ? telemetry.narrative : undefined;
  let reachability_messages: string[] | undefined;
  if (typeof narrative === 'string') {
    const m = narrative.match(/reachability:\s*(.+)$/i);
    if (m?.[1]) {
      reachability_messages = m[1].split(/\s*\|\s*/).map((s) => s.trim()).filter(Boolean);
    }
  }
  const adjustments = Array.isArray(r.adjustments)
    ? (r.adjustments as Array<Record<string, unknown>>).map((a) => ({
        action: String(a?.action ?? ''),
        ...(typeof a?.why === 'string' ? { why: truncate(a.why, 400) } : {}),
        ...(typeof a?.target === 'string' ? { target: a.target } : {}),
      }))
    : [];
  const repair = r.repair as Record<string, unknown> | undefined;
  const applied = Array.isArray(repair?.applied_fixes)
    ? (repair.applied_fixes as Array<Record<string, unknown>>).map((f) => ({
        ...(typeof f?.adjustment_type === 'string' ? { adjustment_type: f.adjustment_type } : {}),
        ...(typeof f?.description === 'string' ? { description: truncate(f.description, 400) } : {}),
        ...(typeof f?.target === 'string' ? { target: f.target } : {}),
      }))
    : [];

  const hasBody =
    Boolean(narrative) ||
    (adjustments.length > 0) ||
    (applied.length > 0) ||
    (reachability_messages?.length ?? 0) > 0 ||
    typeof r.verified === 'boolean';

  if (!hasBody) return undefined;

  return {
    ...(typeof r.verified === 'boolean' ? { verified: r.verified } : {}),
    narrative,
    reachability_messages,
    adjustments,
    applied_fixes: applied,
  };
}

function extractVerifyIssuesFromSteps(
  steps: Array<{ skillName?: string; result?: any; success?: boolean }> | undefined,
): SafetySurfaceVerifyIssue[] {
  if (!steps?.length) return [];
  const rev = [...steps].reverse();
  const verifyStep = rev.find((s) => s.skillName === 'itinerary.verify' && s.success && s.result && typeof s.result === 'object');
  if (verifyStep?.result) {
    const issues = (verifyStep.result as { issues?: unknown }).issues;
    const sanitized = sanitizeVerifyIssues(issues);
    if (sanitized.length) return sanitized;
  }
  const smartStep = rev.find(
    (s) => s.skillName === 'itinerary.smart_update' && s.success && s.result && typeof s.result === 'object',
  );
  const smartIssues = (smartStep?.result as { verify_issues?: unknown } | undefined)?.verify_issues;
  const smartSan = sanitizeVerifyIssues(smartIssues);
  if (smartSan.length) return smartSan;

  const mapFf = (
    step:
      | { skillName?: string; result?: any; success?: boolean }
      | undefined,
    defaultPrefix: string,
  ): SafetySurfaceVerifyIssue[] => {
    if (!step?.success || !step.result || typeof step.result !== 'object') return [];
    const issues = (step.result as { issues?: unknown }).issues;
    const san = sanitizeVerifyIssues(issues);
    return san.map((x) => ({
      ...x,
      message: /^\[极速安全闸/.test(x.message) ? x.message : `${defaultPrefix} ${x.message}`,
    }));
  };

  const redStep = rev.find(
    (s) =>
      s.skillName === 'iceland.lightweight_red_alert_fast_fail' &&
      s.success &&
      s.result &&
      typeof s.result === 'object',
  );
  const froadStep = rev.find(
    (s) =>
      s.skillName === 'iceland.lightweight_fast_fail' &&
      s.success &&
      s.result &&
      typeof s.result === 'object',
  );
  const redSan = mapFf(redStep, '[极速安全闸·生命红线]');
  const froadSan = mapFf(froadStep, '[极速安全闸·依法裁决]');
  if (!redSan.length && !froadSan.length) return [];
  return [...redSan, ...froadSan];
}

/**
 * 从编排状态与 `stepsExecuted` 装配 **safety_surface**（无网络、纯裁剪）。
 */
export function buildSafetySurfacePayload(params: {
  research_data?: Record<string, unknown> | null;
  itinerary?: Itinerary | null;
  stepsExecuted?: Array<{ skillName?: string; result?: any; success?: boolean }>;
  /** 已清洗的 gate；用于剔除与 violations 重复的 verify_issues（避免前端双源各渲染一遍） */
  gate_result?: GateResult | null;
}): SafetySurfacePayload {
  const rawAlerts = (params.research_data as { safetravel_alerts?: unknown } | null)?.safetravel_alerts;
  const fromResearch = sanitizeAlerts(rawAlerts);
  const tagged = collectTaggedLegs(params.itinerary ?? undefined);
  const smart = extractSmartUpdate(params.stepsExecuted);
  let verifyFromStep = filterSafetyVerifyIssuesAgainstItinerary(
    extractVerifyIssuesFromSteps(params.stepsExecuted),
    params.itinerary ?? undefined,
    params.research_data ?? undefined,
  );
  verifyFromStep = filterSafetyIssuesDuplicatingGateViolations(verifyFromStep, params.gate_result);

  return {
    version: SAFETY_SURFACE_VERSION,
    safetravel_route_alerts: fromResearch,
    verify_issues: verifyFromStep,
    ...(smart ? { smart_update: smart } : {}),
    tagged_drive_legs: tagged,
  };
}
