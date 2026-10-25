import {
  assertGateReadsEffectiveTravelerContext,
  readEtcDecisionFields,
  TravelerContextSsotViolationError,
} from './etc-ssot.guard.util';
import {
  buildEtcLayerDiff,
  buildSourceBreakdown,
  buildTravelerContextInspectorView,
} from './build-etc-inspector-view.util';
import type { EffectiveTravelerContextV1 } from '../../travel-memory/effective-context/effective-traveler-context.types';
import { KnowledgeTravelerContextService } from './knowledge-traveler-context.service';

function sampleItem(
  partial: Partial<EffectiveTravelerContextV1['items'][number]> &
    Pick<EffectiveTravelerContextV1['items'][number], 'key' | 'value' | 'layer' | 'sourceScope'>,
): EffectiveTravelerContextV1['items'][number] {
  return {
    domain: 'PACE',
    semanticType: 'PREFERENCE',
    authority: 'ADVISORY',
    confidence: 0.8,
    status: 'SHADOW_PROJECTED',
    sourceRefs: [],
    overridePolicy: partial.layer === 'L2_TRIP_OVERRIDE' ? 'L2_WINS' : 'L1_ONLY',
    sensitivity: 'NORMAL',
    ...partial,
  };
}

function sampleEtc(overrides?: Partial<EffectiveTravelerContextV1>): EffectiveTravelerContextV1 {
  const paceL1 = sampleItem({
    key: 'pace',
    value: 'SLOW',
    layer: 'L1_PERSISTENT',
    sourceScope: 'L1_PERSISTENT',
    sourceRefs: ['os:pace'],
    overriddenByKey: 'pace@L2',
  });
  const paceL2 = sampleItem({
    key: 'pace',
    value: 'RELAXED',
    layer: 'L2_TRIP_OVERRIDE',
    sourceScope: 'L2_TRIP_OVERRIDE',
    confidence: 0.95,
    sourceRefs: ['override:pace'],
  });
  return {
    schemaId: 'tripnara.effective_traveler_context@v1',
    version: 1,
    subjectId: 'u1',
    tripId: 't1',
    resolvedAt: new Date().toISOString(),
    designPrinciple: 'Memory stores; EffectiveTravelerContext decides',
    consumptionMode: 'SHADOW',
    items: [paceL1, paceL2],
    byDomain: { PACE: [paceL1, paceL2] },
    effective: { pace: paceL2 },
    tripOverridesApplied: ['pace'],
    advisoryHints: [],
    provenance: {
      osProfilePresent: true,
      osBasicsPresent: false,
      osTravelPreferenceKeys: [],
      tmrStructuredKeys: [],
      tmrTripKeys: [],
      itemCount: 2,
      domainCount: 1,
    },
    ...overrides,
  };
}

describe('etc-ssot.guard', () => {
  it('throws when Memory OS used without ETC', () => {
    expect(() =>
      assertGateReadsEffectiveTravelerContext('Gate', {
        memoryOsDirect: { foo: 1 },
      }),
    ).toThrow(TravelerContextSsotViolationError);
  });

  it('throws when trip.metadata used without ETC', () => {
    expect(() =>
      assertGateReadsEffectiveTravelerContext('Constraint', {
        tripMetadataDirect: { pace: 'FAST' },
      }),
    ).toThrow(TravelerContextSsotViolationError);
  });

  it('accepts ETC and exposes decision fields', () => {
    const etc = sampleEtc();
    const r = assertGateReadsEffectiveTravelerContext('Gate', {
      effectiveTravelerContext: etc,
    });
    expect(r.etc.tripId).toBe('t1');
    expect(readEtcDecisionFields(r.etc).pace).toBe('RELAXED');
    expect(readEtcDecisionFields(r.etc).tripOverridesApplied).toEqual(['pace']);
  });
});

describe('build-etc-inspector-view', () => {
  it('builds sourceBreakdown from effective winners', () => {
    const etc = sampleEtc();
    const bd = buildSourceBreakdown(etc);
    expect(bd.pace.source).toBe('TRIP_OVERRIDE');
    expect(bd.pace.value).toBe('RELAXED');
  });

  it('diffs L1 vs L2 layers', () => {
    const diff = buildEtcLayerDiff(sampleEtc());
    expect(diff.longTermMemory.some((x) => x.key === 'pace')).toBe(true);
    expect(diff.tripOverrides.some((x) => x.value === 'RELAXED')).toBe(true);
    expect(diff.overridden.some((x) => x.key === 'pace')).toBe(true);
    expect(diff.effectiveKeys).toContain('pace');
  });

  it('assembles inspector view', () => {
    const view = buildTravelerContextInspectorView({
      tripId: 't1',
      userId: 'u1',
      etc: sampleEtc(),
    });
    expect(view.designPrinciple).toContain('EffectiveTravelerContext');
    expect(view.effectiveTravelerContext.tripOverridesApplied).toEqual(['pace']);
  });
});

describe('KnowledgeTravelerContextService demo', () => {
  it('demo-ks-phase4 shows L2 pace override', async () => {
    const svc = new KnowledgeTravelerContextService(
      {} as never,
      { listTripOverrides: () => [] } as never,
      {
        listTravelerMemories: () => [],
        getTripMemory: () => null,
      } as never,
    );
    const view = await svc.inspect('demo-ks-phase4');
    expect(view.sourceBreakdown.pace?.source).toBe('TRIP_OVERRIDE');
    expect(view.sourceBreakdown.pace?.value).toBe('RELAXED');
    expect(view.layerDiff.tripOverrides.length).toBeGreaterThan(0);
    expect(svc.coverageStats().etcConsumeCoverage).toBeGreaterThanOrEqual(0);
  });
});
