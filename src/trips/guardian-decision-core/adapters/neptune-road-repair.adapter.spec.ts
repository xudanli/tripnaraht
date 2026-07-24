import {
  buildNeptuneRoadRepairCandidates,
  filterNeptuneRepairTemplates,
  inferRoadRepairContext,
  NEPTUNE_ROAD_REPAIR_GENERATOR_VERSION,
} from './neptune-road-repair.adapter';
import type { RoutePlanDraft } from '../../decision/shared/world-model.types';
import type { Rfc001DecisionProblem } from '../contracts/decision-problem.types';
import type { RoadCloseImpactResult } from '../detection/road-close-impact.types';

const basePlan: RoutePlanDraft = {
  tripId: 'trip-1',
  segments: [
    {
      segmentId: 'seg-1',
      distanceKm: 120,
      metadata: {
        itineraryItemId: 'item-1',
        roadIds: ['F208'],
        intentRef: 'intent_glacier',
      },
    },
  ],
};

const problem: Rfc001DecisionProblem = {
  problemId: 'problem_1',
  tripId: 'trip-1',
  planVersionId: 'plan_v1',
  type: 'FEASIBILITY_FAILURE',
  triggerEventId: 'evt_1',
  affectedEntityRefs: [],
  affectedPlanItemIds: ['item-1'],
  worldStateSnapshotId: 'wss_1',
  detectedAt: '2026-06-30T10:00:00Z',
  urgency: 'HIGH',
  status: 'OPEN',
};

const impact: RoadCloseImpactResult = {
  roadId: 'F208',
  affectedPlanItemIds: ['item-1'],
  matchedSegmentIds: ['seg-1'],
  affectedEntityRefs: [],
  downstreamItemIds: [],
  matchedSegments: [],
};

describe('neptune-road-repair.adapter', () => {
  it('NEP-001: F208 CLOSED yields ≥2 structurally diverse deterministic candidates', () => {
    const candidates = buildNeptuneRoadRepairCandidates({
      workspaceId: 'ws_1',
      problem,
      impact,
      basePlan,
    });
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    const methods = new Set(candidates.map((c) => c.generationMethod));
    expect(methods.size).toBeGreaterThanOrEqual(2);
    expect(candidates[0].generatorVersion).toContain(NEPTUNE_ROAD_REPAIR_GENERATOR_VERSION);
    expect(candidates.map((c) => c.candidateId)).toEqual(['cand_a', 'cand_b', 'cand_c']);
  });

  it('NEP-002: excludes templates that still require the closed road', () => {
    const context = inferRoadRepairContext({ basePlan, impact });
    const filtered = filterNeptuneRepairTemplates({
      closedRoadId: 'F208',
      context,
      problem,
    });
    expect(filtered.some((t) => t.templateId === 'eq_highland_bus_landmannalaugar')).toBe(
      false,
    );
    expect(filtered.some((t) => t.templateId === 'route_bypass_ring_road')).toBe(true);
  });

  it('NEP-003: budget cap filters high-cost templates', () => {
    const context = inferRoadRepairContext({ basePlan, impact });
    const filtered = filterNeptuneRepairTemplates({
      closedRoadId: 'F208',
      context: {
        ...context,
        experienceCategories: ['HIGHLAND'],
        intentRefs: ['intent_highland'],
      },
      problem,
      budgetCapIsk: 1000,
    });
    expect(filtered.every((t) => (t.estimatedAddedCostIsk ?? 0) <= 1000)).toBe(true);
  });

  it('NEP-004: registry filter returns empty when region/intent do not match', () => {
    const filtered = filterNeptuneRepairTemplates({
      closedRoadId: 'F208',
      context: {
        regionCodes: ['IS_REMOTE_NO_MATCH'],
        experienceCategories: ['GEOTHERMAL'],
        intentRefs: ['intent_unused'],
      },
      problem,
    });
    expect(filtered).toHaveLength(0);
  });

  it('NEP-005: ontology candidate preserves glacier intent ref', () => {
    const candidates = buildNeptuneRoadRepairCandidates({
      workspaceId: 'ws_1',
      problem,
      impact,
      basePlan,
    });
    const eq = candidates.find((c) => c.generationMethod === 'ONTOLOGY_EQUIVALENCE');
    expect(eq?.preservedIntentRefs).toContain('intent_glacier');
    expect(eq?.proposedOperations[0]?.parameters.substitutePoiId).toBe('is.svinafellsjokull');
  });
});
