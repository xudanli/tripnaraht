/**
 * RFC-002 Phase 3 — destination pack road repair template bundle.
 */

export type RoadExperienceCategory =
  | 'GLACIER'
  | 'WATERFALL'
  | 'HIGHLAND'
  | 'GEOTHERMAL'
  | 'COAST';

export type RoadRepairGenerationMethod =
  | 'ONTOLOGY_EQUIVALENCE'
  | 'ROUTE_REPAIR'
  | 'LOCAL_SUBSTITUTION'
  | 'TEMPLATE'
  | 'LLM_ASSISTED';

export interface RoadRepairTemplate {
  templateId: string;
  generationMethod: RoadRepairGenerationMethod;
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
  minUrgency?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface RoadRepairTemplateBundle {
  schemaId: 'tripnara.road_repair_templates@v1';
  countryCode: string;
  roadRegions: Record<string, string[]>;
  poiIntent: Record<
    string,
    { intents: string[]; categories: RoadExperienceCategory[] }
  >;
  templates: RoadRepairTemplate[];
}
