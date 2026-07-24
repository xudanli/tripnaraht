/**
 * WP2 / RFC-002 Phase 3 — Neptune road repair (templates from destination pack).
 */

import type { RoutePlanDraft } from '../../decision/shared/world-model.types';
import type { Rfc001RepairCandidate } from '../contracts/guardian-outputs.types';
import type { Rfc001DecisionProblem } from '../contracts/decision-problem.types';
import type { RoadCloseImpactResult } from '../detection/road-close-impact.types';
import {
  buildRoadCloseStubCandidates,
  buildRepairCandidate,
} from './repair-candidate.adapter';
import type { PlanOperation } from '../contracts/plan-operation.types';
import { loadRoadRepairTemplatesForCountry } from '../../../decision-runtime/packs/repair/road-repair-template.loader';
import type { RoadRepairTemplateBundle } from '../../../decision-runtime/packs/repair/road-repair-template.types';
import { normalizeDestinationCountryCode } from '../../../decision-runtime/packs/loader/country-pack-registry.util';

export const NEPTUNE_ROAD_REPAIR_GENERATOR_VERSION =
  'neptune-road-repair-0.3.0';

export type RoadExperienceCategory =
  | 'GLACIER'
  | 'WATERFALL'
  | 'HIGHLAND'
  | 'GEOTHERMAL'
  | 'COAST';

export interface NeptuneRoadRepairTemplate {
  templateId: string;
  generationMethod: Rfc001RepairCandidate['generationMethod'];
  regionCodes: string[];
  experienceCategories: RoadExperienceCategory[];
  intentRefs: string[];
  requiresOpenRoadIds: string[];
  substitutePoiId?: string;
  routeBypassRoadId?: string;
  estimatedIntentPreservation: number;
  estimatedAddedDurationMinutes: number;
  estimatedAddedCostIsk: number;
  maxBudgetIsk?: number;
  minUrgency?: Rfc001DecisionProblem['urgency'];
}

export function resolveRoadRepairPackBundle(
  rawCountry?: string | null,
): RoadRepairTemplateBundle | null {
  return loadRoadRepairTemplatesForCountry(rawCountry);
}

/** Templates from IS destination pack (empty when pack file missing). */
export const IS_ROAD_REPAIR_TEMPLATE_REGISTRY: NeptuneRoadRepairTemplate[] =
  resolveRoadRepairPackBundle('IS')?.templates ?? [];

const DEFAULT_ROAD_REGIONS: Record<string, string[]> = {
  F208: ['IS_CENTRAL_HIGHLANDS', 'IS_SOUTH'],
};

const DEFAULT_POI_INTENT: Record<
  string,
  { intents: string[]; categories: RoadExperienceCategory[] }
> = {};

const URGENCY_RANK: Record<Rfc001DecisionProblem['urgency'], number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};

const CANDIDATE_IDS = ['cand_a', 'cand_b', 'cand_c', 'cand_d', 'cand_e'] as const;

function normalizeRoad(roadId: string): string {
  return roadId.trim().toUpperCase();
}

export function inferRoadRepairContext(input: {
  basePlan: RoutePlanDraft;
  impact: RoadCloseImpactResult;
  pack?: RoadRepairTemplateBundle | null;
}): {
  regionCodes: string[];
  experienceCategories: RoadExperienceCategory[];
  intentRefs: string[];
} {
  const closedRoad = normalizeRoad(input.impact.roadId);
  const roadRegions = input.pack?.roadRegions ?? DEFAULT_ROAD_REGIONS;
  const poiIntent = input.pack?.poiIntent ?? DEFAULT_POI_INTENT;
  const country = normalizeDestinationCountryCode(input.pack?.countryCode);
  const regionCodes = roadRegions[closedRoad] ?? (country ? [`${country}_SOUTH`] : ['GLOBAL']);

  const intents = new Set<string>(['intent_glacier', 'intent_wilderness']);
  const categories = new Set<RoadExperienceCategory>(['HIGHLAND', 'GLACIER']);

  for (const itemId of input.impact.affectedPlanItemIds) {
    const seg = input.basePlan.segments?.find(
      (s) =>
        (s.metadata as { itineraryItemId?: string })?.itineraryItemId === itemId,
    );
    const meta = seg?.metadata as
      | { intentRef?: string; poiId?: string; substitutePoiId?: string }
      | undefined;
    if (meta?.intentRef) intents.add(meta.intentRef);
    const poiId = meta?.poiId ?? meta?.substitutePoiId;
    if (poiId && poiIntent[poiId]) {
      poiIntent[poiId].intents.forEach((i) => intents.add(i));
      poiIntent[poiId].categories.forEach((c) => categories.add(c));
    }
  }

  return {
    regionCodes,
    experienceCategories: [...categories],
    intentRefs: [...intents],
  };
}

export function filterNeptuneRepairTemplates(input: {
  closedRoadId: string;
  context: ReturnType<typeof inferRoadRepairContext>;
  problem: Rfc001DecisionProblem;
  budgetCapIsk?: number;
  registry?: NeptuneRoadRepairTemplate[];
}): NeptuneRoadRepairTemplate[] {
  const closed = normalizeRoad(input.closedRoadId);
  const budget = input.budgetCapIsk ?? Number.POSITIVE_INFINITY;
  const registry = input.registry ?? IS_ROAD_REPAIR_TEMPLATE_REGISTRY;
  const urgencyOk = (t: NeptuneRoadRepairTemplate) =>
    !t.minUrgency ||
    URGENCY_RANK[input.problem.urgency] >= URGENCY_RANK[t.minUrgency];

  return registry.filter((t) => {
    if (!urgencyOk(t)) return false;
    if (t.estimatedAddedCostIsk > budget) return false;
    if (t.maxBudgetIsk != null && budget < t.maxBudgetIsk) return false;
    if (t.requiresOpenRoadIds.map(normalizeRoad).includes(closed)) return false;
    if (!t.regionCodes.some((r) => input.context.regionCodes.includes(r))) {
      return false;
    }
    if (
      !t.experienceCategories.some((c) =>
        input.context.experienceCategories.includes(c),
      )
    ) {
      return false;
    }
    if (
      !t.intentRefs.some((i) => input.context.intentRefs.includes(i)) &&
      t.generationMethod !== 'ROUTE_REPAIR'
    ) {
      return false;
    }
    return true;
  });
}

function templateToOperations(
  template: NeptuneRoadRepairTemplate,
  replaces: string[],
  primarySegmentId?: string,
): PlanOperation[] {
  if (template.generationMethod === 'ROUTE_REPAIR' && primarySegmentId) {
    return [
      {
        operationId: `op_${template.templateId}_bypass`,
        kind: 'CHANGE_ROUTE',
        targetRefs: [{ kind: 'ROUTE_SEGMENT', id: primarySegmentId }],
        parameters: {
          bypassRoadId: template.routeBypassRoadId,
          templateId: template.templateId,
        },
      },
    ];
  }
  if (!template.substitutePoiId || replaces.length === 0) return [];
  return [
    {
      operationId: `op_${template.templateId}_replace`,
      kind: 'REPLACE_ITEM',
      targetRefs: replaces.map((id) => ({ kind: 'PLAN_ITEM', id })),
      parameters: {
        itineraryItemId: replaces[0],
        substitutePoiId: template.substitutePoiId,
        intentRef: template.intentRefs[0],
        templateId: template.templateId,
      },
    },
  ];
}

function templateToCandidate(
  template: NeptuneRoadRepairTemplate,
  input: {
    workspaceId: string;
    candidateId: string;
    basePlanVersionId: string;
    replaces: string[];
    primarySegmentId?: string;
    evidenceRefs?: string[];
  },
): Rfc001RepairCandidate | null {
  const operations = templateToOperations(
    template,
    input.replaces,
    input.primarySegmentId,
  );
  if (operations.length === 0) return null;

  return buildRepairCandidate({
    workspaceId: input.workspaceId,
    candidateId: input.candidateId,
    basePlanVersionId: input.basePlanVersionId,
    replacesPlanItemIds: input.replaces,
    generationMethod: template.generationMethod,
    estimatedIntentPreservation: template.estimatedIntentPreservation,
    estimatedAddedDurationMinutes: template.estimatedAddedDurationMinutes,
    preservedIntentRefs: template.intentRefs,
    evidenceRefs: input.evidenceRefs ?? [`nep_template:${template.templateId}`],
    operations,
  });
}

function rankTemplates(
  templates: NeptuneRoadRepairTemplate[],
): NeptuneRoadRepairTemplate[] {
  const methodOrder: Record<string, number> = {
    ONTOLOGY_EQUIVALENCE: 0,
    LOCAL_SUBSTITUTION: 1,
    ROUTE_REPAIR: 2,
  };
  return [...templates].sort((a, b) => {
    const methodDiff =
      (methodOrder[a.generationMethod] ?? 9) -
      (methodOrder[b.generationMethod] ?? 9);
    if (methodDiff !== 0) return methodDiff;
    return b.estimatedIntentPreservation - a.estimatedIntentPreservation;
  });
}

function pickDiverseTemplates(
  ranked: NeptuneRoadRepairTemplate[],
  limit = 3,
): NeptuneRoadRepairTemplate[] {
  const picked: NeptuneRoadRepairTemplate[] = [];
  const seenMethods = new Set<string>();
  for (const t of ranked) {
    if (picked.length >= limit) break;
    if (seenMethods.has(t.generationMethod)) continue;
    seenMethods.add(t.generationMethod);
    picked.push(t);
  }
  for (const t of ranked) {
    if (picked.length >= limit) break;
    if (picked.includes(t)) continue;
    picked.push(t);
  }
  return picked;
}

export interface BuildNeptuneRoadRepairInput {
  workspaceId: string;
  problem: Rfc001DecisionProblem;
  impact: RoadCloseImpactResult;
  basePlan: RoutePlanDraft;
  budgetCapIsk?: number;
  evidenceRefs?: string[];
  /** ISO destination for pack template resolution */
  countryCode?: string;
  templateRegistry?: NeptuneRoadRepairTemplate[];
}

export function buildNeptuneRoadRepairCandidates(
  input: BuildNeptuneRoadRepairInput,
): Rfc001RepairCandidate[] {
  const pack = input.countryCode
    ? resolveRoadRepairPackBundle(input.countryCode)
    : null;
  const registry =
    input.templateRegistry ?? pack?.templates ?? IS_ROAD_REPAIR_TEMPLATE_REGISTRY;

  const context = inferRoadRepairContext({
    basePlan: input.basePlan,
    impact: input.impact,
    pack,
  });
  const filtered = filterNeptuneRepairTemplates({
    closedRoadId: input.impact.roadId,
    context,
    problem: input.problem,
    budgetCapIsk: input.budgetCapIsk,
    registry,
  });

  const diverse = pickDiverseTemplates(rankTemplates(filtered));
  const replaces = input.impact.affectedPlanItemIds;
  const primarySeg = input.impact.matchedSegmentIds[0];
  const basePlanVersionId = input.problem.planVersionId;

  const candidates: Rfc001RepairCandidate[] = [];
  for (let i = 0; i < diverse.length && i < CANDIDATE_IDS.length; i++) {
    const built = templateToCandidate(diverse[i], {
      workspaceId: input.workspaceId,
      candidateId: CANDIDATE_IDS[i],
      basePlanVersionId,
      replaces,
      primarySegmentId: primarySeg,
      evidenceRefs: input.evidenceRefs,
    });
    if (built) {
      candidates.push({
        ...built,
        generatorVersion: NEPTUNE_ROAD_REPAIR_GENERATOR_VERSION,
      });
    }
  }

  if (candidates.length < 2) {
    return buildRoadCloseStubCandidates({
      workspaceId: input.workspaceId,
      problem: input.problem,
      impact: input.impact,
      basePlan: input.basePlan,
    }).map((c) =>
      c.generatorVersion.startsWith(NEPTUNE_ROAD_REPAIR_GENERATOR_VERSION)
        ? c
        : { ...c, generatorVersion: `${NEPTUNE_ROAD_REPAIR_GENERATOR_VERSION}+stub-fallback` },
    );
  }

  return candidates;
}

export function readBudgetCapFromTripMetadata(
  metadata: Record<string, unknown>,
): number | undefined {
  const budget = metadata.rfc001BudgetCapIsk ?? metadata.budgetCapIsk;
  if (typeof budget === 'number' && Number.isFinite(budget)) return budget;
  return undefined;
}

/** @deprecated Use buildNeptuneRoadRepairCandidates */
export const buildIcelandRoadCloseRepairCandidates = buildNeptuneRoadRepairCandidates;
/** @deprecated Use inferRoadRepairContext */
export const inferIcelandRepairContext = inferRoadRepairContext;
/** @deprecated Use NEPTUNE_ROAD_REPAIR_GENERATOR_VERSION */
export const NEPTUNE_ICELAND_ROAD_GENERATOR_VERSION = NEPTUNE_ROAD_REPAIR_GENERATOR_VERSION;
/** @deprecated Use IS_ROAD_REPAIR_TEMPLATE_REGISTRY */
export const ICELAND_NEPTUNE_REPAIR_REGISTRY = IS_ROAD_REPAIR_TEMPLATE_REGISTRY;
/** @deprecated Use RoadExperienceCategory */
export type IcelandExperienceCategory = RoadExperienceCategory;
/** @deprecated Use NeptuneRoadRepairTemplate */
export type NeptuneIcelandRepairTemplate = NeptuneRoadRepairTemplate;
/** @deprecated Use BuildNeptuneRoadRepairInput */
export type BuildIcelandRoadCloseRepairInput = BuildNeptuneRoadRepairInput;
