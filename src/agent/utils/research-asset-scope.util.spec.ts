import {
  dedupeResearchScopes,
  inferResearchKeyScope,
  invalidateResearchScopesInPlace,
  cloneResearchRecord,
  markResearchScopeFreshness,
} from './research-asset-scope.util';

describe('research-asset-scope.util', () => {
  it('inferResearchKeyScope maps known families', () => {
    expect(inferResearchKeyScope('poi_evidence')).toBe('destination');
    expect(inferResearchKeyScope('transport_evidence')).toBe('transport');
    expect(inferResearchKeyScope('hotel_search_meta')).toBe('hotel');
    expect(inferResearchKeyScope('flight_quotes_v1')).toBe('flight');
    expect(inferResearchKeyScope('safetravel_alerts')).toBe('compliance');
    expect(inferResearchKeyScope('cost_estimate')).toBe('destination');
    expect(inferResearchKeyScope('__research_asset_manifest')).toBe('common');
  });

  it('invalidateResearchScopesInPlace clears only targeted scopes', () => {
    const rd: Record<string, unknown> = {
      poi_evidence: [{ id: '1' }],
      transport_evidence: { ok: true },
      hotel_search_meta: { q: 'tokyo' },
      safetravel_alerts: [],
      misc_client_hint: 'keep',
    };
    const { clearedKeys } = invalidateResearchScopesInPlace(rd, ['hotel'], 'test');
    expect(clearedKeys).toEqual(['hotel_search_meta']);
    expect(rd.poi_evidence).toBeDefined();
    expect(rd.transport_evidence).toBeDefined();
    expect(rd.safetravel_alerts).toBeDefined();
    expect(rd.misc_client_hint).toBe('keep');
    const m = rd.__research_asset_manifest as { scopes?: { hotel?: { valid: boolean } } };
    expect(m?.scopes?.hotel?.valid).toBe(false);
  });

  it('dedupeResearchScopes preserves order', () => {
    expect(dedupeResearchScopes(['hotel', 'hotel', 'flight'])).toEqual(['hotel', 'flight']);
  });

  it('cloneResearchRecord deep clones', () => {
    const a: Record<string, unknown> = { x: { y: 1 } };
    const b = cloneResearchRecord(a);
    expect(b).not.toBe(a);
    (b as any).x.y = 2;
    expect((a.x as any).y).toBe(1);
  });

  it('markResearchScopeFreshness writes manifest', () => {
    const rd: Record<string, unknown> = { a: 1 };
    markResearchScopeFreshness(rd, 'hotel', 'STALE_RECOVERED', {
      attribution: 'TEST:stitch',
      trace_id: 'tr-1',
    });
    const m = rd.__research_asset_manifest as {
      scopes?: { hotel?: { freshness?: string; attribution?: string; trace_id?: string } };
    };
    expect(m?.scopes?.hotel?.freshness).toBe('STALE_RECOVERED');
    expect(m?.scopes?.hotel?.attribution).toBe('TEST:stitch');
    expect(m?.scopes?.hotel?.trace_id).toBe('tr-1');
  });
});
