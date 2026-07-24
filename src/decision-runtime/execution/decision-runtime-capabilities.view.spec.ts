import { buildDecisionRuntimeCapabilitiesView } from './decision-runtime-capabilities.view';

describe('buildDecisionRuntimeCapabilitiesView', () => {
  it('includes schemaId and optional shadow metrics', () => {
    const view = buildDecisionRuntimeCapabilitiesView({
      comparedTotal: 2,
      divergedTotal: 1,
      byDivergenceKind: { LEGACY_PASS_CANONICAL_BLOCK: 1 },
    });
    expect(view.schemaId).toBe('tripnara.decision_runtime_capabilities@v1');
    expect(view.constraintShadowMetrics?.comparedTotal).toBe(2);
    expect(view.objectiveRegistryVersion).toBe('objectives@v1');
    expect(view.triggerWiring.dispatchWired).toBeGreaterThanOrEqual(5);
    expect(view.generatedAt).toBeDefined();
  });
});
