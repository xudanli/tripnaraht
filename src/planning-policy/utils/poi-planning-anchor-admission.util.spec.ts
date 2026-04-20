import {
  pickRequiredAnchorPoisInOrder,
  poiPlanningRowIdentityKey,
  buildPoiPlanningAdmissionDiagnostics,
  enforceRequiredAnchorsTopN,
} from './poi-planning-anchor-admission.util';
import type { PoiPlanningDecisionSlice } from '../../decision/kernel/decision-state.types';

describe('pickRequiredAnchorPoisInOrder', () => {
  it('按 required 顺序各取一条锚点行，其余进 rest', () => {
    const t = { poi_planning_anchor_slug: 'thingvellir', name: 'T1' };
    const g = { poi_planning_anchor_slug: 'geysir', name: 'G1' };
    const o = { name: 'Other' };
    const candidates = [o, t, g];
    const { protectedPois, rest } = pickRequiredAnchorPoisInOrder(candidates, [
      'thingvellir',
      'geysir',
      'gullfoss',
    ]);
    expect(protectedPois.map((p: any) => p.poi_planning_anchor_slug)).toEqual([
      'thingvellir',
      'geysir',
    ]);
    expect(rest).toHaveLength(1);
    expect((rest[0] as any).name).toBe('Other');
  });

  it('同 slug 重复行只取第一条', () => {
    const a = { poi_planning_anchor_slug: 'thingvellir', id: 1 };
    const b = { poi_planning_anchor_slug: 'thingvellir', id: 2 };
    const { protectedPois, rest } = pickRequiredAnchorPoisInOrder([a, b], ['thingvellir']);
    expect(protectedPois).toEqual([a]);
    expect(rest).toEqual([b]);
  });
});

describe('poiPlanningRowIdentityKey', () => {
  it('优先 place_id / id', () => {
    expect(poiPlanningRowIdentityKey({ id: 42, name: 'x' })).toBe('id:42');
  });
});

describe('enforceRequiredAnchorsTopN', () => {
  it('把锚点从全量候选前置拼进 TopN（关键词命中，无需 anchor_slug 字段）', () => {
    const geysir = { name: 'Great Geysir area', nameCN: '盖歇尔' };
    const other = { name: 'Reykjavik Museum' };
    const topN = [other];
    const pool = [other, geysir];
    const out = enforceRequiredAnchorsTopN(topN, pool, ['geysir'], 8, {});
    expect(out[0]).toBe(geysir);
    expect(out).toContain(other);
  });

  it('候选缺失时用 fallback 工厂补位', () => {
    const topN: unknown[] = [{ name: 'X' }];
    const out = enforceRequiredAnchorsTopN(topN, [], ['thingvellir'], 8, {
      createFallbackForSlug: (s) => ({ poi_planning_anchor_slug: s, name: 'fb' }),
    });
    expect((out[0] as any).poi_planning_anchor_slug).toBe('thingvellir');
  });
});

describe('buildPoiPlanningAdmissionDiagnostics', () => {
  const slice: PoiPlanningDecisionSlice = {
    routeIntent: { regionId: 'golden_circle', confidence: 1 },
    poiPlan: {
      requiredAnchorPoiIds: ['thingvellir'],
      optionalCandidatePoiIds: [],
      excludedPoiIds: [],
      selectedOptionalPoiIds: [],
    },
    schedulePlan: {
      totalBudgetMinutes: 600,
      requiredCostMinutes: 400,
      optionalCapacityMinutes: 120,
      bufferMinutes: 60,
      feasibility: 'ok',
    },
    resolution: { source: 'region_intent_resolver', matchedBy: 'message_text' },
    budgetGateApplied: false,
  };

  it('无必选锚点时返回 undefined', () => {
    expect(
      buildPoiPlanningAdmissionDiagnostics(undefined, [], [], []),
    ).toBeUndefined();
  });

  it('标记 fallback 与 in_topn', () => {
    const merge = [
      {
        poi_planning_anchor_slug: 'thingvellir',
        source: 'poi_planning_fallback',
      },
    ];
    const pool = merge;
    const final = merge;
    const d = buildPoiPlanningAdmissionDiagnostics(slice, merge, pool, final);
    expect(d?.requiredAnchorCandidatePresence['thingvellir']).toBe('fallback_placeholder');
    expect(d?.requiredAnchorAdmissionStage['thingvellir']).toBe('in_topn');
  });
});
