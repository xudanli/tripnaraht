/**
 * Exploration 前端 UI 辅助 — badge / 文案 / 候选生命周期
 * 与 frontend-exploration-api-client.ts 一并复制到前端工程
 */

import type {
  ConsumerIssue,
  ExplorationCandidatesStatus,
  IssuesView,
  RouteCandidate,
  RouteMapGeometry,
  RouteMapLayerView,
} from './frontend-exploration-api.types';

export type GenerationSourceCode =
  | 'STATIC_CATALOG'
  | 'PERSONALIZED'
  | 'ENGINE_MAPBOX'
  | 'LLM';

export interface GenerationSourceBadge {
  label: string;
  tone: 'neutral' | 'primary' | 'accent';
}

export const GENERATION_SOURCE_BADGES: Record<GenerationSourceCode, GenerationSourceBadge> = {
  STATIC_CATALOG: { label: '典型走法', tone: 'neutral' },
  PERSONALIZED: { label: '已个性化', tone: 'primary' },
  ENGINE_MAPBOX: { label: '引擎计算', tone: 'accent' },
  LLM: { label: 'AI 生成', tone: 'accent' },
};

export function getGenerationSourceBadge(
  source?: RouteCandidate['generationSource'],
): GenerationSourceBadge | null {
  if (!source) return null;
  return GENERATION_SOURCE_BADGES[source] ?? { label: source, tone: 'neutral' };
}

export function shouldRegenerateCandidates(
  status?: ExplorationCandidatesStatus['status'],
): boolean {
  return status === 'STALE';
}

export function shouldShowComparePage(
  status?: ExplorationCandidatesStatus['status'],
): boolean {
  return status === 'READY' || status === 'SELECTED';
}

/** 对比页主标题 — 按 generationMode 区分对外话术 */
export function getComparePageHeadline(
  generationMode?: ExplorationCandidatesStatus['generationMode'],
): string {
  switch (generationMode) {
    case 'ENGINE':
      return '三种走法对比 · 引擎已计算驾驶路线';
    case 'PERSONALIZED':
      return '三种典型走法对比 · 已按你的条件个性化';
    case 'STATIC':
    default:
      return '三种典型走法对比';
  }
}

/** STALE 状态提示条文案 */
export function getStaleCandidatesBannerText(): string {
  return '旅行原则或条件已更新，请重新生成路线对比后再选择。';
}

export type ExplorationIssueSourceKind = 'gateway' | 'ontology' | 'cpre-poi' | 'unknown';

/** issueId 前缀识别 — Ontology Snapshot 投影 */
export function isOntologyConsumerIssue(issue: Pick<ConsumerIssue, 'issueId'>): boolean {
  return issue.issueId.startsWith('ontology:');
}

export function isCprePoiConsumerIssue(issue: Pick<ConsumerIssue, 'issueId'>): boolean {
  return issue.issueId.startsWith('cpre-poi-');
}

export function getExplorationIssueSourceKind(
  issue: Pick<ConsumerIssue, 'issueId'>,
): ExplorationIssueSourceKind {
  if (isOntologyConsumerIssue(issue)) return 'ontology';
  if (isCprePoiConsumerIssue(issue)) return 'cpre-poi';
  if (issue.issueId.length > 0) return 'gateway';
  return 'unknown';
}

/** Issues 页摘要 — 含 Ontology / POI 分项计数 */
export function formatExplorationIssuesSummary(issues: IssuesView): string {
  const parts: string[] = [`共 ${issues.totalIssueCount} 项`];
  if (issues.blockerIssueCount != null && issues.blockerIssueCount > 0) {
    parts.push(`${issues.blockerIssueCount} 项阻断`);
  }
  if (issues.ontologyIssueCount != null && issues.ontologyIssueCount > 0) {
    parts.push(`${issues.ontologyIssueCount} 项本体约束`);
  }
  if (issues.unresolvedPoiIssueCount != null && issues.unresolvedPoiIssueCount > 0) {
    parts.push(`${issues.unresolvedPoiIssueCount} 项待确认地点`);
  }
  return parts.join(' · ');
}

/** 条件 PATCH 后提示 — 物化后改车辆/日期等 */
export function getConditionsChangedBannerText(tripSynced?: boolean): string {
  if (tripSynced) {
    return '旅行条件已更新并同步到行程，请重新生成路线对比后再选择。';
  }
  return '旅行条件已更新，继续下一步前请确认路线对比是否需要重新生成。';
}

/** 从 preview.map 或 detail.map 取可绘制图层（优先 layers，否则 fallback mainLine/fRoadLine） */
export function getRouteMapLayers(map?: RouteMapGeometry): RouteMapLayerView[] {
  if (!map) return [];
  if (map.layers?.length) return map.layers;
  const layers: RouteMapLayerView[] = [];
  if (map.mainLine?.length) {
    layers.push({
      id: 'main',
      label: '主线路',
      coordinates: map.mainLine,
      lineStyle: 'solid',
    });
  }
  if (map.fRoadLine?.length) {
    layers.push({
      id: 'fRoad',
      label: 'F 路',
      coordinates: map.fRoadLine,
      lineStyle: 'dashed',
      requires4wd: true,
    });
  }
  return layers;
}

/** CPRE — POI 解析状态 badge（Compare 卡片 / 行程锚点） */
export function getPoiResolutionBadge(poi: {
  resolved?: boolean;
  confidence?: number;
  status?: string;
}): { label: string; tone: 'success' | 'warning' | 'muted' } {
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
  return pois.filter((p) => !p.resolved || p.status === 'NEEDS_CONFIRMATION').length;
}
