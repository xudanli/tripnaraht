/**
 * Shadow Trip Decision Impact — near-production chain (no live network).
 *
 * Road:
 *   Look OCR → EvidenceResolverLookRoadAuthorityPort (Gagnaveita-shaped realtime)
 *   → tick binding → WMC overlay → Gate → CGUS inject → Impact YES/NO
 *
 * POI:
 *   PoiAccessCapacityOverrideLookup (capacity service stub)
 *   → PoiAccessOverrideAuthorityPort → tick → WMC/Gate → Impact YES/NO
 *
 * Scientist question: if bridge deleted, does decision differ?
 *
 * Run:
 *   npx jest src/harness/evals/decision-world-consistency/shadow-trip-decision-impact.harness.spec.ts
 */

import { HeuristicExtractionProvider } from '../../../trips/travel-observation/extraction/heuristic-extraction.provider';
import { ObservationExtractionService } from '../../../trips/travel-observation/extraction/observation-extraction.service';
import { ObservationGroundingService } from '../../../trips/travel-observation/grounding/observation-grounding.service';
import { LookDecisionProblemStore } from '../../../trips/travel-observation/assessment/look-decision-problem.store';
import { ObservationAssessmentBridgeService } from '../../../trips/travel-observation/assessment/observation-assessment.bridge.service';
import { ObservationRepository } from '../../../trips/travel-observation/observation.repository';
import { ObservationService } from '../../../trips/travel-observation/observation.service';
import { DecisionTickRoadBindingStore } from '../../../trips/decision/world-consistency/decision-tick-road-binding.store';
import { LookRoadAuthorityDecisionTickService } from '../../../trips/decision/world-consistency/look-road-authority-decision-tick.service';
import { EvidenceResolverLookRoadAuthorityPort } from '../../../trips/decision/world-consistency/evidence-resolver-look-road-authority.port';
import { DecisionTickRoadGateProvider } from '../../../trips/decision/world-consistency/decision-tick-road-gate.provider';
import { bindLookRoadAuthorityIntoWorldModelContext } from '../../../trips/decision/world-consistency/bind-look-road-into-world-model-context.util';
import { DecisionTickPoiBindingStore } from '../../../trips/decision/world-consistency/decision-tick-poi-binding.store';
import { PoiAuthorityDecisionTickService } from '../../../trips/decision/world-consistency/poi-authority-decision-tick.service';
import { PoiAccessOverrideAuthorityPort } from '../../../trips/decision/world-consistency/poi-access-override-authority.port';
import { PoiAccessCapacityOverrideLookup } from '../../../trips/decision/world-consistency/poi-access-capacity-override.lookup';
import { DecisionTickPoiGateProvider } from '../../../trips/decision/world-consistency/decision-tick-poi-gate.provider';
import { RFC001_EVIDENCE_RESOLVER_VERSION } from '../../../trips/guardian-decision-core/config/rfc001-iceland.config';
import type { RoadStatus } from '../../../skills/world/services/road-status-realtime.service';
import type { WorldModelContext } from '../../../trips/decision/shared/world-model.types';
import type { PoiAccessStatusOverride } from '../../../poi-access-capacity/interfaces/poi-access-capacity.interface';
import {
  formatDecisionImpactReport,
  measurePoiClosedDecisionImpact,
  measureRoadClosedDecisionImpact,
} from './measure-decision-impact.util';

const TRIP = 'trip_is_south_coast_shadow';
const ROAD = 'F208';
const POI = 'is.skaftafell';

function stubWorldOpen(): WorldModelContext {
  return {
    physical: {
      demEvidence: [
        {
          segmentId: 'seg_south',
          elevationProfile: [0],
          cumulativeAscent: 0,
          maxSlopePct: 0,
          rollingAscent3Days: 0,
          fatigueIndex: 0,
          violation: 'NONE',
          explanation: 'stub',
        },
      ],
      roadStates: [{ roadId: ROAD, status: 'OPEN' }],
      hazardZones: [],
      ferryStates: [],
      countryCode: 'IS',
      month: 7,
      poiOperationalStates: [{ poiId: POI, open: true, status: 'OPEN' }],
    },
    human: {
      maxDailyAscentM: 800,
      rollingAscent3DaysM: 2000,
      maxSlopePct: 20,
      riskTolerance: 'MEDIUM',
      preferredPace: 'MEDIUM',
    } as WorldModelContext['human'],
    routeDirection: {
      id: 'rd_south',
      name: 'South Coast',
    } as WorldModelContext['routeDirection'],
  };
}

function gagnaveitaClosed(): RoadStatus {
  return {
    roadId: ROAD,
    roadName: 'Fjallabaksleið nyrðri',
    currentStatus: 'closed',
    lastVerifiedAt: new Date(),
    dataSource: 'vegagerdin_gagnaveita',
    hazards: [],
    confidence: 0.95,
    seasonalFallback: false,
  };
}

describe('Shadow Trip Decision Impact (near-production)', () => {
  it('Road: Look OCR → Gagnaveita port → Impact YES (Gate BLOCK + CGUS infeasible)', async () => {
    const bindingStore = new DecisionTickRoadBindingStore();
    const evidenceResolver = {
      resolveFromRoadStatusSnapshot: jest.fn(
        async (_tripId: string, rs: RoadStatus) => ({
          assertion: {
            assertionId: `as_shadow_${rs.roadId}`,
            observedAt: rs.lastVerifiedAt.toISOString(),
            source: {
              evidenceRefs: [`ev_shadow_gagna_${rs.roadId}`],
            },
          },
          resolverVersion: RFC001_EVIDENCE_RESOLVER_VERSION,
        }),
      ),
    };
    const roadRealtime = {
      getRoadStatus: jest.fn(async () => gagnaveitaClosed()),
    };
    const authorityPort = new EvidenceResolverLookRoadAuthorityPort(
      evidenceResolver as never,
      roadRealtime as never,
    );
    const tickSvc = new LookRoadAuthorityDecisionTickService(
      bindingStore,
      authorityPort,
    );
    const gate = new DecisionTickRoadGateProvider(bindingStore);

    const observation = new ObservationService(
      new ObservationRepository(),
      new ObservationExtractionService(new HeuristicExtractionProvider()),
      new ObservationGroundingService(),
      new ObservationAssessmentBridgeService(new LookDecisionProblemStore()),
      undefined,
      undefined,
      undefined,
      undefined,
      tickSvc,
    );

    const event = await observation.create(TRIP, {
      intent: 'CHECK_ROAD',
      capturedAt: new Date().toISOString(),
      mediaRefs: ['media_shadow_1'],
      location: { latitude: 64.01, longitude: -19.1, accuracyMeters: 8 },
      ocrTextSeed: 'F208 ROAD CLOSED LOKAÐ',
    });
    expect(event.status).toBe('COMPLETED');
    expect(roadRealtime.getRoadStatus).toHaveBeenCalled();

    const binding = bindingStore.getLatestBinding(TRIP);
    expect(binding).toBeDefined();
    expect(binding!.materialization.sourceVersion.source).toContain(
      'gagnaveita',
    );

    const world = bindLookRoadAuthorityIntoWorldModelContext(
      stubWorldOpen(),
      binding!.materialization,
    );
    expect(world.physical.roadStates[0]?.status).toBe('CLOSED');

    const assertions = gate.evaluate({ tripId: TRIP });
    expect(assertions[0]?.status).toBe('BLOCK');

    const report = measureRoadClosedDecisionImpact({
      binding: binding!,
      baselineWorld: stubWorldOpen(),
    });
    // eslint-disable-next-line no-console
    console.log(
      [
        '=== SHADOW TRIP ROAD IMPACT ===',
        ...formatDecisionImpactReport(report),
        `sourceVersion=${JSON.stringify(binding!.materialization.sourceVersion)}`,
      ].join('\n'),
    );

    expect(report.decisionWouldDifferIfBridgeDeleted).toBe(true);
    expect(report.withBridge.gateBlocks).toBe(true);
    expect(report.withBridge.cgusFeasible).toBe(false);
  });

  it('POI: Capacity lookup → override CLOSED → Impact YES (Gate BLOCK)', async () => {
    const override: PoiAccessStatusOverride = {
      id: 'ov_shadow_skaftafell',
      poiId: POI,
      ruleType: 'CLOSED',
      targetResource: 'POI',
      effectiveFrom: '2026-07-01T00:00:00.000Z',
      status: 'ACTIVE',
      sourceAuthority: 'vatnajokull_trail_status',
      lastVerifiedAt: new Date().toISOString(),
      confidence: 'OFFICIAL',
    };

    const capacity = {
      getStatusOverridesForPoiSlugs: jest.fn(async () => [override]),
    };
    const lookup = new PoiAccessCapacityOverrideLookup(capacity as never);
    const port = new PoiAccessOverrideAuthorityPort(lookup);
    const store = new DecisionTickPoiBindingStore();
    const svc = new PoiAuthorityDecisionTickService(store, port);
    const gate = new DecisionTickPoiGateProvider(store);

    const m = await svc.maybeTriggerForPoi({
      tripId: TRIP,
      poiId: POI,
      tickId: 'shadow_poi_tick',
    });

    expect(capacity.getStatusOverridesForPoiSlugs).toHaveBeenCalledWith(
      [POI],
      expect.any(String),
    );
    expect(m!.poiStatus).toBe('CLOSED');
    expect(gate.evaluate({ tripId: TRIP })[0]?.status).toBe('BLOCK');

    const report = measurePoiClosedDecisionImpact({
      materialization: m!,
      baselineWorld: stubWorldOpen(),
    });
    // eslint-disable-next-line no-console
    console.log(
      [
        '=== SHADOW TRIP POI IMPACT ===',
        ...formatDecisionImpactReport(report),
        `sourceVersion=${JSON.stringify(m!.sourceVersion)}`,
      ].join('\n'),
    );

    expect(report.decisionWouldDifferIfBridgeDeleted).toBe(true);
    expect(report.withBridge.worldSees).toBe('CLOSED');
  });
});
