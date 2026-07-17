import { planResearchScopes, RESEARCH_SCOPE_PLANNER_VERSION } from './research-scope-planner.util';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';

describe('research-scope-planner.util', () => {
  it('freezes planner version', () => {
    expect(RESEARCH_SCOPE_PLANNER_VERSION).toBe('1.0.0');
  });

  it('prioritizes return_to_research_context_v1 over options', () => {
    const plan = planResearchScopes({
      request: {
        request_id: 'r1',
        user_id: 'u',
        message: 'x',
        options: { research_invalidate_scopes: ['hotel'] },
      } as RouteAndRunRequestDto,
      metadata: {
        return_to_research_context_v1: {
          schemaId: 'tripnara.return_to_research_context@v1',
          version: 1,
          reason: 'RETURN_TO_RESEARCH',
          failure_codes: ['EVIDENCE_SNAPSHOT_UNBOUND'],
          missing_evidence: ['snap'],
          scopes: ['destination', 'common'],
          forbid_full_research: true,
          at: new Date().toISOString(),
        },
      },
    });
    expect(plan.source).toBe('r2r');
    expect(plan.assetScopes).toEqual(['destination', 'common']);
    expect(plan.forbid_full_research).toBe(true);
  });

  it('uses option scopes when no r2r/dos', () => {
    const plan = planResearchScopes({
      request: {
        request_id: 'r2',
        user_id: 'u',
        message: 'x',
        options: { research_invalidate_scopes: ['transport'] },
      } as RouteAndRunRequestDto,
    });
    expect(plan.source).toBe('options');
    expect(plan.assetScopes).toContain('transport');
  });
});
