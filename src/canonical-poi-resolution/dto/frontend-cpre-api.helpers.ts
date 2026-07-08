/**
 * CPRE 前端 UI 辅助 — 与 frontend-cpre-api.types.ts 一并复制
 */

import type {
  ResolutionEvidenceStep,
  ResolutionResult,
  ResolvedPoiRef,
  PoiResolutionBadge,
} from './frontend-cpre-api.types';

export function getPoiResolutionBadge(poi: {
  resolved?: boolean;
  confidence?: number;
  status?: string;
}): PoiResolutionBadge {
  if (poi.resolved && (poi.confidence ?? 0) >= 0.75) {
    const pct = Math.round((poi.confidence ?? 0) * 100);
    return { label: `已验证 ${pct}%`, tone: 'success' };
  }
  if (poi.status === 'AMBIGUOUS' || poi.status === 'NEEDS_CONFIRMATION') {
    return { label: '等待确认', tone: 'warning' };
  }
  if (poi.status === 'NOT_FOUND' || !poi.resolved) {
    return { label: '未解析', tone: 'muted' };
  }
  return { label: '待确认', tone: 'warning' };
}

export function countUnresolvedPois(
  pois?: Array<{ resolved?: boolean; status?: string }>,
): number {
  if (!pois?.length) return 0;
  return pois.filter(
    (p) => !p.resolved || p.status === 'NEEDS_CONFIRMATION' || p.status === 'AMBIGUOUS',
  ).length;
}

export function needsPoiConfirmation(poi: ResolvedPoiRef): boolean {
  return (
    !poi.resolved ||
    poi.status === 'NEEDS_CONFIRMATION' ||
    poi.status === 'AMBIGUOUS' ||
    poi.status === 'NOT_FOUND'
  );
}

/** Evidence 抽屉 — 人类可读步骤标签 */
export const EVIDENCE_STAGE_LABELS: Record<string, string> = {
  INPUT: 'AI 识别',
  EXACT: '精确匹配',
  ALIAS: '别名命中',
  CANONICAL: '官方 POI',
  HUMAN: '用户确认',
  FUZZY: '模糊匹配',
  EMBEDDING: '语义检索',
};

export function formatEvidenceChain(
  evidence?: ResolutionEvidenceStep[],
): Array<{ title: string; subtitle?: string }> {
  return (evidence ?? []).map((step) => ({
    title: EVIDENCE_STAGE_LABELS[step.stage] ?? step.stage,
    subtitle: step.detail ? `${step.label} — ${step.detail}` : step.label,
  }));
}

export function isVerifiedPoi(poi: ResolvedPoiRef): boolean {
  return poi.resolved === true && (poi.confidence ?? 0) >= 0.75 && !!poi.poiId;
}

export function pickDisplayPoiName(poi: ResolvedPoiRef): string {
  return poi.canonicalName ?? poi.name;
}

/** Compare 页 banner：存在待确认 POI 时提示 */
export function getUnresolvedPoisBannerText(count: number): string {
  if (count <= 0) return '';
  return `有 ${count} 个地点待确认，请选择正确 POI 后再继续规划。`;
}

export function resolutionResultToResolvedRef(
  queryName: string,
  result: ResolutionResult,
): ResolvedPoiRef {
  return {
    name: queryName,
    resolved: result.status === 'MATCHED',
    poiId: result.poiId,
    confidence: result.confidence,
    method: result.method,
    status: result.status,
    canonicalName: result.matchedPoi?.canonicalName,
  };
}
