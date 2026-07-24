import {
  ROUTE_TEMPLATE_HIGHLIGHT_THRESHOLD,
  ROUTE_TEMPLATE_SUGGEST_THRESHOLD,
  ROUTE_TEMPLATE_INTENT_CATALOG,
} from '../config/route-template-intent-bindings.config';
import type { VibeRecruitmentFormSuggestions } from '../types/vibe-llm.types';
import type { VibeLlmParsePayload } from '../types/vibe-llm.types';
import type {
  RouteTemplateIntentCatalogEntry,
  RouteTemplateIntentMatch,
  RouteTemplateIntentMatchPlan,
} from '../types/route-template-intent.types';
import { ROUTE_TEMPLATE_INTENT_VERSION } from '../types/route-template-intent.types';
import type { TrekkingVibeOrchestrationPlan } from '../types/trekking-vibe-orchestration.types';

function scoreCatalogEntry(
  entry: RouteTemplateIntentCatalogEntry,
  sourceText: string,
  payload: VibeLlmParsePayload,
  suggestions: VibeRecruitmentFormSuggestions,
  orchestration: TrekkingVibeOrchestrationPlan | null,
): number {
  const text = sourceText.toLowerCase();
  let score = 0;

  if (payload.recruitment_script_id && entry.recruitmentScriptIds?.includes(payload.recruitment_script_id)) {
    score += 0.45;
  }

  if (
    suggestions.destinationSubScopeId &&
    entry.destinationSubScopeIds?.includes(suggestions.destinationSubScopeId)
  ) {
    score += 0.2;
  }

  const keywordHits = entry.matchKeywords.filter((kw) =>
    text.includes(kw.toLowerCase()),
  ).length;
  if (keywordHits > 0) {
    score += Math.min(0.3, keywordHits * 0.06);
  }

  const chipText = payload.vibe_chips.map((c) => `${c.id} ${c.label}`).join(' ').toLowerCase();
  const chipHits = entry.matchKeywords.filter((kw) => chipText.includes(kw.toLowerCase())).length;
  if (chipHits > 0) {
    score += Math.min(0.1, chipHits * 0.03);
  }

  if (orchestration) {
    const routeHit = orchestration.worldModel.routeDirectionCandidates.some(
      (r) => r.routeDirectionName === entry.routeDirectionName,
    );
    if (routeHit) score += 0.2;
  }

  return Math.min(1, score);
}

function toConfidence(
  score: number,
  threshold: number,
): RouteTemplateIntentMatch['confidence'] {
  if (score >= threshold || score >= ROUTE_TEMPLATE_HIGHLIGHT_THRESHOLD) return 'highlight';
  if (score >= ROUTE_TEMPLATE_SUGGEST_THRESHOLD) return 'suggest';
  return 'low';
}

function toMatch(
  entry: RouteTemplateIntentCatalogEntry,
  score: number,
): RouteTemplateIntentMatch {
  const confidence = toConfidence(score, entry.autoSuggestThreshold);
  return {
    catalogId: entry.catalogId,
    routeDirectionName: entry.routeDirectionName,
    durationDays: entry.durationDays,
    titleZh: entry.titleZh,
    subtitleZh: entry.subtitleZh ?? null,
    matchScore: score,
    matchPercent: Math.round(score * 100),
    confidence,
    physicalConstraints: [...(entry.physicalConstraints ?? [])],
    slotAugmentations: [...(entry.slotAugmentations ?? [])],
    vaultMilestoneIds: [...(entry.vaultMilestoneIds ?? [])],
    launchRecruitmentAction: confidence === 'highlight' ? 'confirm_template' : 'preview_only',
  };
}

export function buildRouteTemplateIntentMatchPlan(input: {
  sourceText: string;
  payload: VibeLlmParsePayload;
  suggestedFields: VibeRecruitmentFormSuggestions;
  trekkingOrchestration?: TrekkingVibeOrchestrationPlan | null;
}): RouteTemplateIntentMatchPlan | null {
  const text = input.sourceText.trim();
  if (!text && !input.payload.recruitment_script_id && input.payload.vibe_chips.length === 0) {
    return null;
  }

  const scored = ROUTE_TEMPLATE_INTENT_CATALOG.map((entry) => ({
    entry,
    score: scoreCatalogEntry(
      entry,
      text,
      input.payload,
      input.suggestedFields,
      input.trekkingOrchestration ?? null,
    ),
  }))
    .filter((row) => row.score >= ROUTE_TEMPLATE_SUGGEST_THRESHOLD)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return null;

  const matches = scored.map(({ entry, score }) => toMatch(entry, score));
  const primary = matches[0] ?? null;

  const associationHint =
    primary && primary.confidence === 'highlight'
      ? `🗺️ AI 已为你一键关联最佳路线模板：《${primary.titleZh}》`
      : primary
        ? `🗺️ 推荐路线模板：《${primary.titleZh}》（匹配度 ${primary.matchPercent}%）`
        : null;

  return {
    version: ROUTE_TEMPLATE_INTENT_VERSION,
    primaryMatch: primary,
    suggestions: matches.slice(0, 3),
    associationHint,
  };
}
