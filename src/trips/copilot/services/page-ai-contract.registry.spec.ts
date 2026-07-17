import { PageAIContractRegistry, PageContractNotFoundError } from './page-ai-contract.registry';

describe('PageAIContractRegistry', () => {
  const registry = new PageAIContractRegistry();

  it('returns live page contracts including EXECUTION_HOME', () => {
    expect(registry.get('DECISION_SPACE').pageId).toBe('DECISION_SPACE');
    expect(registry.get('DECISION_SPACE').pageContractVersion).toBe('decision_space@1.4');
    expect(registry.get('ACTIVITY_EDITOR').pageContractVersion).toBe('activity_editor@1.0');
    expect(registry.get('ITINERARY_DAY_EDITOR').pageContractVersion).toBe(
      'itinerary_day_editor@1.1',
    );
    expect(registry.get('PLANNING_OVERVIEW').pageContractVersion).toBe(
      'planning_overview@1.0',
    );
    expect(registry.get('EXECUTION_HOME').pageContractVersion).toBe(
      'execution_home@1.0',
    );
    expect(
      registry.get('DECISION_SPACE').decisionContextRequirements?.VEHICLE_ROAD_FIT
        ?.hardRequired,
    ).toEqual(['ROUTE_SUMMARY', 'ROAD_EXPOSURE']);
    expect(
      registry.get('DECISION_SPACE').decisionContextRequirements?.RENTAL_INSURANCE
        ?.ragPolicy,
    ).toBe('EXPLANATORY_CLAUSES_ONLY');
  });

  it('throws PAGE_CONTRACT_NOT_FOUND for stub-only or unknown pages', () => {
    expect(() => registry.get('ITINERARY_EDITOR')).toThrow(PageContractNotFoundError);
    expect(() => registry.get('MAP_ROUTE')).toThrow(PageContractNotFoundError);
  });
});
