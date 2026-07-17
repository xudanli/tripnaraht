import {
  buildReturnToResearchContextV1,
  deriveReturnToResearchScopes,
  isReturnToResearchForbidFull,
  mapFailureCodeToResearchScopes,
} from './return-to-research-context.util';

describe('return-to-research-context.util', () => {
  it('maps evidence codes to destination+common (not all six scopes)', () => {
    expect(mapFailureCodeToResearchScopes('EVIDENCE_SNAPSHOT_UNBOUND')).toEqual([
      'destination',
      'common',
    ]);
    expect(mapFailureCodeToResearchScopes('EVIDENCE_VERSION_MISMATCH')).toEqual([
      'destination',
      'common',
    ]);
  });

  it('maps REQUIRED_INPUT_MISSING to destination+transport by default', () => {
    expect(mapFailureCodeToResearchScopes('REQUIRED_INPUT_MISSING')).toEqual([
      'destination',
      'transport',
    ]);
  });

  it('derives scopes and missing evidence from harness failure events', () => {
    const derived = deriveReturnToResearchScopes([
      {
        code: 'EVIDENCE_SNAPSHOT_UNBOUND',
        message: 'research evidence snapshot unbound',
        suggestedAction: 'RETURN_TO_RESEARCH',
      },
    ]);
    expect(derived.failure_codes).toEqual(['EVIDENCE_SNAPSHOT_UNBOUND']);
    expect(derived.scopes).toEqual(['destination', 'common']);
    expect(derived.missing_evidence[0]).toContain('evidence');
    expect(derived.scopes).not.toContain('hotel');
    expect(derived.scopes).not.toContain('flight');
  });

  it('builds context_v1 with forbid_full_research', () => {
    const ctx = buildReturnToResearchContextV1({
      events: [{ code: 'REQUIRED_INPUT_MISSING', message: 'hotel inventory missing' }],
    });
    expect(ctx.schemaId).toBe('tripnara.return_to_research_context@v1');
    expect(ctx.forbid_full_research).toBe(true);
    expect(ctx.scopes).toContain('hotel');
    expect(ctx.scopes).toContain('destination');
    expect(isReturnToResearchForbidFull({ return_to_research_context_v1: ctx })).toBe(true);
  });

  it('never returns empty scopes (minimum destination+transport)', () => {
    const derived = deriveReturnToResearchScopes([]);
    expect(derived.scopes).toEqual(['destination', 'transport']);
  });
});
