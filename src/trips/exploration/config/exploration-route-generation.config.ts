/** AI 路线生成 — 模式与 feature flag SSOT */

export type ExplorationRouteGenerationMode =
  | 'STATIC'
  | 'PERSONALIZED'
  | 'ENGINE';

export type ExplorationRouteGenerationSource =
  | 'STATIC_CATALOG'
  | 'PERSONALIZED'
  | 'ENGINE_MAPBOX'
  | 'LLM';

export function isExplorationAiRouteGenerationEnabled(): boolean {
  return process.env.EXPLORATION_AI_ROUTE_GENERATION === '1';
}

export function resolveRouteGenerationMode(): ExplorationRouteGenerationMode {
  const explicit = process.env.EXPLORATION_ROUTE_GENERATION_MODE?.trim().toUpperCase();
  if (explicit === 'STATIC' || explicit === 'PERSONALIZED' || explicit === 'ENGINE') {
    return explicit;
  }
  return isExplorationAiRouteGenerationEnabled() ? 'PERSONALIZED' : 'STATIC';
}

export function isLlmRouteNarrativeEnabled(): boolean {
  return process.env.EXPLORATION_LLM_ROUTE_NARRATIVE === '1';
}

/** 真实 LLM 调用（需 API key）；未开时 LLM flag 仍走模板 stub */
export function isLlmRouteNarrativeLive(): boolean {
  return process.env.EXPLORATION_LLM_ROUTE_NARRATIVE_LIVE === '1';
}

export function explorationRouteGeometryCacheTtlSec(): number {
  const raw = process.env.EXPLORATION_ROUTE_GEOMETRY_CACHE_TTL_SEC;
  const parsed = raw ? Number.parseInt(raw, 10) : 86400;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 86400;
}
