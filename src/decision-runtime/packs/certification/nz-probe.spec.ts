/**
 * RFC-002 Phase 6 probe — NZ destination pack without core code changes.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  countryHasActiveDestinationPack,
  normalizeDestinationCountryCode,
} from '../loader/country-pack-registry.util';
import { DestinationPackLoaderService } from '../loader/destination-pack-loader.service';
import { DestinationPackOverlayResolverService } from '../loader/destination-pack-overlay-resolver.service';
import { loadCountryPackRules } from '../rules/pack-rule-bundle.loader';
import { loadRoadRepairTemplatesForCountry } from '../repair/road-repair-template.loader';
import { resolveDrivingEnvironmentForCountry } from '../modifiers/pack-modifier-bundle.loader';
import {
  runPackCertification,
  validateCountryPackRules,
  validateCountryPackModifiers,
  type PackCertificationScenario,
} from './pack-certification.harness';
import { evaluateAbuRoadConstraintForCandidate } from '../../../trips/guardian-decision-core/adapters/abu-road-constraint.adapter';
import { roadStatusChangedToAssertion } from '../../../trips/guardian-decision-core/adapters/road-status-to-assertion.adapter';
import { buildNeptuneRoadRepairCandidates } from '../../../trips/guardian-decision-core/adapters/neptune-road-repair.adapter';
import { ORIGINAL_CANDIDATE_ID } from '../../../trips/guardian-decision-core/adapters/repair-candidate.adapter';
import type { RoutePlanDraft } from '../../../trips/decision/shared/world-model.types';
import type { Rfc001DecisionProblem } from '../../../trips/guardian-decision-core/contracts/decision-problem.types';
import type { RoadCloseImpactResult } from '../../../trips/guardian-decision-core/detection/road-close-impact.types';

function loadNzRoadScenarios(): PackCertificationScenario[] {
  const path = join(
    process.cwd(),
    'data/destination-packs/nz/certification/road-close.scenarios.json',
  );
  return JSON.parse(readFileSync(path, 'utf8')) as PackCertificationScenario[];
}

const nzPlan: RoutePlanDraft = {
  tripId: 'trip_nz_probe',
  segments: [
    {
      segmentId: 'seg_sh6',
      metadata: {
        itineraryItemId: 'item_milford',
        roadIds: ['SH6'],
        intentRef: 'intent_fjord',
        poiId: 'nz.milford-sound',
      },
    },
  ],
};

const nzImpact: RoadCloseImpactResult = {
  roadId: 'SH6',
  matchedSegmentIds: ['seg_sh6'],
  affectedPlanItemIds: ['item_milford'],
  affectedEntityRefs: [],
  downstreamItemIds: [],
  matchedSegments: [],
};

const nzProblem = {
  problemId: 'problem_sh6',
  tripId: 'trip_nz_probe',
  planVersionId: 'plan_v1',
  type: 'FEASIBILITY_FAILURE',
  triggerEventId: 'evt_sh6',
  affectedEntityRefs: [],
  affectedPlanItemIds: ['item_milford'],
  worldStateSnapshotId: 'wss_1',
  detectedAt: '2026-06-30T10:00:00Z',
  urgency: 'HIGH',
  status: 'OPEN',
} as Rfc001DecisionProblem;

describe('NZ destination pack probe (RFC-002 Phase 6)', () => {
  const prevPackRules = process.env.DECISION_PACK_RULES;

  afterEach(() => {
    if (prevPackRules === undefined) delete process.env.DECISION_PACK_RULES;
    else process.env.DECISION_PACK_RULES = prevPackRules;
  });

  it('NZ-PROBE-001: NZ pack is ACTIVE on disk', () => {
    expect(countryHasActiveDestinationPack('NZ')).toBe(true);
    expect(normalizeDestinationCountryCode('NEW ZEALAND')).toBe('NZ');
  });

  it('NZ-PROBE-002: overlay resolves global + NZ country layers', () => {
    const loader = new DestinationPackLoaderService();
    loader.loadAll();
    const resolver = new DestinationPackOverlayResolverService(loader);
    const active = resolver.resolve({ country: 'NZ' });
    expect(active.layers.map((l) => l.packId)).toEqual([
      'destination.global',
      'destination.nz',
    ]);
    expect(active.supportedSemanticKeys).toContain('ROAD_SEGMENT_UNAVAILABLE');
    const road = active.evidenceProviders.find((e) => e.domain === 'road');
    expect(road?.primary).toBe('ROAD_NZ');
  });

  it('NZ-PROBE-003: NZ road rules load independently of IS', () => {
    const summary = validateCountryPackRules('NZ');
    expect(summary.ruleIds).toContain('NZ_ROAD_CLOSED_BLOCK');
    expect(summary.ruleIds).not.toContain('IS_ROAD_CLOSED_BLOCK');
    const isRules = loadCountryPackRules('IS');
    const nzRules = loadCountryPackRules('NZ');
    expect(nzRules.some((r) => r.ruleId === 'NZ_ROAD_CLOSED_BLOCK')).toBe(true);
    expect(isRules.some((r) => r.ruleId === 'IS_ROAD_CLOSED_BLOCK')).toBe(true);
  });

  it('NZ-PROBE-004: golden NZ certification scenarios pass', () => {
    const report = runPackCertification(loadNzRoadScenarios(), {
      forcePackRules: true,
    });
    expect(report.failed).toBe(0);
    expect(report.passed).toBe(report.total);
  });

  it('NZ-PROBE-005: Abu constraint uses NZ pack rule (no IS hardcode)', () => {
    process.env.DECISION_PACK_RULES = '1';
    const assertion = roadStatusChangedToAssertion({
      tripId: 'trip_nz_probe',
      roadId: 'SH6',
      status: 'CLOSED',
      evidenceRef: 'ev_nz',
      sourceProvider: 'admin_injection',
      observedAt: '2026-06-30T10:00:00Z',
      confidence: 0.95,
    });
    const result = evaluateAbuRoadConstraintForCandidate({
      tripId: 'trip_nz_probe',
      workspaceId: 'ws_nz',
      targetCandidateId: ORIGINAL_CANDIDATE_ID,
      roadAssertion: assertion,
      affectedPlanItemIds: nzImpact.affectedPlanItemIds,
      candidatePlan: nzPlan,
      bindings: { byItemId: { item_milford: ['SH6'] } },
      destinationCountry: 'NZ',
      now: new Date('2026-06-30T10:05:00Z'),
    });
    expect(result.verdict).toBe('BLOCK');
    expect(result.ruleVersion).toContain('NZ_ROAD_CLOSED_BLOCK');
  });

  it('NZ-PROBE-006: Neptune repair templates load from NZ pack', () => {
    const bundle = loadRoadRepairTemplatesForCountry('NZ');
    expect(bundle?.countryCode).toBe('NZ');
    expect(bundle?.templates.length).toBeGreaterThanOrEqual(2);

    const candidates = buildNeptuneRoadRepairCandidates({
      workspaceId: 'ws_nz',
      problem: nzProblem,
      impact: nzImpact,
      basePlan: nzPlan,
      countryCode: 'NZ',
    });
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    const methods = new Set(candidates.map((c) => c.generationMethod));
    expect(methods.size).toBeGreaterThanOrEqual(2);
    expect(candidates[0].generatorVersion).toContain('neptune-road-repair');
  });

  it('NZ-PROBE-007: NZ driving modifier distinct from IS', () => {
    process.env.DECISION_PACK_RUNTIME = '1';
    const nzMods = validateCountryPackModifiers('NZ');
    expect(nzMods.modifierIds).toContain('NZ_DRIVING_ENVIRONMENT');
    const nzDriving = resolveDrivingEnvironmentForCountry('NZ');
    const isDriving = resolveDrivingEnvironmentForCountry('IS');
    expect(nzDriving.defaultSpeedKmH).toBe(70);
    expect(isDriving.defaultSpeedKmH).toBe(65);
  });
});
