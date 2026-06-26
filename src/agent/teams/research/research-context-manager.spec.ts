import {
  ResearchContextManager,
  ResearchPatchScopeViolationError,
  computeResearchPatchFromIsolation,
  createSuturePatchFromPrior,
  partitionResearchPatchByScope,
} from './research-context-manager';

describe('ResearchContextManager', () => {
  it('runIsolated merges only changed top-level keys', async () => {
    const master: Record<string, unknown> = { a: 1, b: { x: 1 } };
    const refs: string[] = ['e0'];
    const mgr = new ResearchContextManager(master, refs);

    await mgr.runIsolated('M1', 'sequential', async (rd, er) => {
      rd.c = 3;
      er.push('e1');
    });

    expect(master).toEqual({ a: 1, b: { x: 1 }, c: 3 });
    expect(refs).toEqual(['e0', 'e1']);
    expect(mgr.getMergeLog()).toEqual([
      expect.objectContaining({
        source: 'M1',
        phase: 'sequential',
        keysTouched: ['c'],
        evidenceRefsAppended: 1,
        attribution: 'MEMBER_PATCH',
      }),
    ]);
  });

  it('runParallelSlotsMerged uses same baseline and merges in slot order', async () => {
    const master: Record<string, unknown> = { base: 1 };
    const mgr = new ResearchContextManager(master, []);

    await mgr.runParallelSlotsMerged([
      {
        source: 'S0',
        run: async (rd, _er) => {
          await new Promise((r) => setTimeout(r, 5));
          rd.s0 = true;
        },
      },
      {
        source: 'S1',
        run: async (rd, _er) => {
          rd.s1 = true;
        },
      },
    ]);

    expect(master.s0).toBe(true);
    expect(master.s1).toBe(true);
    expect(mgr.getMergeLog().map((m) => m.source)).toEqual(['S0', 'S1']);
  });

  it('computeResearchPatchFromIsolation wraps diff with scope discriminator', () => {
    const baseline = { live_hotel_refresh: { v: 1 } };
    const isolated = { live_hotel_refresh: { v: 2 } };
    const patch = computeResearchPatchFromIsolation({
      baselineResearchData: baseline,
      isolatedResearchData: isolated,
      baselineEvidenceRefs: ['e0'],
      isolatedEvidenceRefs: ['e0', 'e1'],
      scope: 'hotel',
    });
    expect(patch.scope).toBe('hotel');
    expect(patch.researchDataPartial).toEqual({ live_hotel_refresh: { v: 2 } });
    expect(patch.evidenceRefsAppended).toEqual(['e1']);
  });

  it('partitionResearchPatchByScope splits destination patch with cost_estimate', () => {
    const { scopedPartial, outOfScopePartial } = partitionResearchPatchByScope({
      scope: 'destination',
      researchDataPartial: {
        poi_evidence: [{ id: '1' }],
        cost_estimate: { total_estimate: { expected: 900 } },
      },
      evidenceRefsAppended: [],
    });
    expect(scopedPartial).toEqual({ poi_evidence: [{ id: '1' }] });
    expect(outOfScopePartial).toEqual({
      cost_estimate: { total_estimate: { expected: 900 } },
    });
  });

  it('applyResearchPatch writes keys and evidence with scope gate', () => {
    const master: Record<string, unknown> = { prior_hotel: 1 };
    const refs: string[] = ['e0'];
    const mgr = new ResearchContextManager(master, refs);
    mgr.applyResearchPatch({
      patch: {
        scope: 'hotel',
        researchDataPartial: { live_hotel_refresh: { ok: true } },
        evidenceRefsAppended: ['e1'],
      },
      source: 'PatchMember',
      phase: 'parallel',
    });
    expect(master).toEqual({ prior_hotel: 1, live_hotel_refresh: { ok: true } });
    expect(refs).toEqual(['e0', 'e1']);
    expect(mgr.getMergeLog()).toEqual([
      expect.objectContaining({
        source: 'PatchMember',
        phase: 'parallel',
        keysTouched: ['live_hotel_refresh'],
        evidenceRefsAppended: 1,
        attribution: 'MEMBER_PATCH',
      }),
    ]);
  });

  it('applyResearchPatch auto-merges common keys on destination patch (e.g. cost_estimate)', () => {
    const mgr = new ResearchContextManager({}, []);
    mgr.applyResearchPatch({
      patch: {
        scope: 'destination',
        researchDataPartial: {
          poi_evidence: [{ id: 'geysir' }],
          cost_estimate: { total_estimate: { expected: 800 } },
        },
        evidenceRefsAppended: [],
      },
      source: 'DestinationResearchMember',
      phase: 'parallel',
    });
    const snap = mgr.getSnapshot().researchData;
    expect(snap.poi_evidence).toEqual([{ id: 'geysir' }]);
    expect(snap.cost_estimate).toEqual({ total_estimate: { expected: 800 } });
  });

  it('applyResearchPatch rejects keys whose inferred scope mismatches patch.scope', () => {
    const mgr = new ResearchContextManager({}, []);
    expect(() =>
      mgr.applyResearchPatch({
        patch: {
          scope: 'hotel',
          researchDataPartial: { live_flight_refresh: { x: 1 } },
          evidenceRefsAppended: [],
        },
        source: 'Bad',
        phase: 'parallel',
      }),
    ).toThrow(ResearchPatchScopeViolationError);
  });

  it('applyResearchPatch allows __ metadata keys regardless of scope', () => {
    const mgr = new ResearchContextManager({}, []);
    mgr.applyResearchPatch({
      patch: {
        scope: 'hotel',
        researchDataPartial: { __research_asset_manifest: { version: 1, scopes: {} } },
        evidenceRefsAppended: [],
      },
      source: 'M',
      phase: 'parallel',
    });
    expect(mgr.getMergeLog()[0]?.keysTouched).toEqual(['__research_asset_manifest']);
  });

  it('createSuturePatchFromPrior copies prior keys for a single scope', () => {
    const prior = {
      transport_evidence: { ok: true },
      live_hotel_refresh: { x: 1 },
      poi_evidence: [],
    };
    const p = createSuturePatchFromPrior({ scope: 'transport', priorResearchData: prior });
    expect(p.scope).toBe('transport');
    expect(p.researchDataPartial).toEqual({ transport_evidence: { ok: true } });
  });

  it('applyResearchPatch accepts transport-scoped keys', () => {
    const mgr = new ResearchContextManager({}, []);
    mgr.applyResearchPatch({
      patch: {
        scope: 'transport',
        researchDataPartial: { transport_evidence: { d: 1 } },
        evidenceRefsAppended: [],
      },
      source: 'TransportResearchMember',
      phase: 'sequential',
    });
    expect(mgr.getMergeLog()[0]?.source).toBe('TransportResearchMember');
    expect(mgr.getMergeLog()[0]?.attribution).toBe('MEMBER_PATCH');
  });

  it('applyResearchPatch with FALLBACK_SUTURE stamps STALE_RECOVERED on hotel manifest', () => {
    const master: Record<string, unknown> = {};
    const mgr = new ResearchContextManager(master, []);
    mgr.applyResearchPatch({
      patch: {
        scope: 'hotel',
        researchDataPartial: { live_hotel_refresh: { stitched: true } },
        evidenceRefsAppended: [],
      },
      source: 'FALLBACK_SUTURE',
      phase: 'parallel',
      attribution: 'FALLBACK_SUTURE',
    });
    const manifest = master.__research_asset_manifest as { scopes?: { hotel?: { freshness?: string } } };
    expect(manifest?.scopes?.hotel?.freshness).toBe('STALE_RECOVERED');
    expect(mgr.getMergeLog()[0]?.attribution).toBe('FALLBACK_SUTURE');
  });

  it('mergeResearchDataKeys writes common-scope keys without scope gate', () => {
    const mgr = new ResearchContextManager({}, []);
    mgr.mergeResearchDataKeys({
      keys: { cost_estimate: { total_estimate: { expected: 500 } } },
      source: 'DestinationResearchMember',
      phase: 'parallel',
    });
    expect(mgr.getSnapshot().researchData.cost_estimate).toEqual({
      total_estimate: { expected: 500 },
    });
  });

  it('getSnapshot is decoupled from later merges', async () => {
    const mgr = new ResearchContextManager({ k: 1 }, []);
    const snap = mgr.getSnapshot();
    await mgr.runIsolated('x', 'sequential', async (rd) => {
      rd.k = 2;
    });
    expect(snap.researchData.k).toBe(1);
    expect(mgr.getSnapshot().researchData.k).toBe(2);
  });
});
