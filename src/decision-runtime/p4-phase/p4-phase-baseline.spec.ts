import { resolveDecisionRuntimeCapabilities } from '../execution/decision-runtime-capabilities.util';
import {
  evaluateLegacyConvergence,
  inferLegacyConvergenceStage,
  resolveLegacyConvergenceTargetStage,
} from './legacy-convergence.evaluator';
import { snapshotLegacyConvergenceLadder } from './legacy-convergence-ladder.catalog';
import { DecisionProviderRegistryService } from '../candidates/decision-provider-registry.service';
import { ConstraintCriticProvider } from '../candidates/providers/constraint-critic.provider';
import { AgenticResearchProvider } from '../candidates/providers/agentic-research.provider';
import { AgenticNarrationProvider } from '../candidates/providers/agentic-narration.provider';
import { evaluateCanonicalDefaultPromotion, buildCanonicalDefaultPreviewCapabilities, isCanonicalDefaultStagingReady } from './canonical-default-promotion.evaluator';
import { evaluateLegacyFallbackDrill } from './legacy-fallback-drill.evaluator';
import { evaluateConstraintRolloutPromotion } from './constraint-rollout-promotion.evaluator';

describe('legacy-convergence-ladder.catalog', () => {
  it('defines five ordered stages', () => {
    const ladder = snapshotLegacyConvergenceLadder();
    expect(ladder.stageCount).toBe(5);
    expect(ladder.stages[0].stage).toBe('LEGACY_DEFAULT');
    expect(ladder.stages[1].stage).toBe('CANONICAL_SELECTIVE');
  });
});

describe('legacy-convergence.evaluator', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.DECISION_RUNTIME_MODE = 'LEGACY';
    delete process.env.DECISION_GATEWAY_UNIFIED;
    delete process.env.CANONICAL_EXECUTION_ENABLED;
    delete process.env.CANONICAL_FULL_PLAN_SELECTION;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('infers LEGACY_DEFAULT with default env', () => {
    delete process.env.DECISION_TRIGGER_GATEWAY_ENABLED;
    delete process.env.REPLANNING_TRIGGER_POLICY_ENABLED;
    delete process.env.CONSTRAINT_GATEWAY_MODE;

    const caps = resolveDecisionRuntimeCapabilities();
    expect(inferLegacyConvergenceStage(caps)).toBe('LEGACY_DEFAULT');
  });

  it('infers CANONICAL_SELECTIVE when gateway + policy enabled', () => {
    process.env.DECISION_RUNTIME_MODE = 'SHADOW';
    process.env.DECISION_TRIGGER_GATEWAY_ENABLED = '1';
    process.env.REPLANNING_TRIGGER_POLICY_ENABLED = '1';
    process.env.CONSTRAINT_GATEWAY_MODE = 'ON_FOR_SELECTED';
    process.env.CONSTRAINT_GATEWAY_ON_SCENARIOS = 'iceland-road-closed';

    const caps = resolveDecisionRuntimeCapabilities();
    expect(inferLegacyConvergenceStage(caps)).toBe('CANONICAL_SELECTIVE');
  });

  it('evaluates promotion blockers for CANONICAL_SELECTIVE target', () => {
    delete process.env.DECISION_TRIGGER_GATEWAY_ENABLED;
    delete process.env.REPLANNING_TRIGGER_POLICY_ENABLED;
    delete process.env.CONSTRAINT_GATEWAY_MODE;
    process.env.LEGACY_CONVERGENCE_TARGET = 'CANONICAL_SELECTIVE';

    const eval_ = evaluateLegacyConvergence(resolveDecisionRuntimeCapabilities());
    expect(eval_.currentStage).toBe('LEGACY_DEFAULT');
    expect(eval_.targetStage).toBe('CANONICAL_SELECTIVE');
    expect(eval_.canPromote).toBe(false);
    expect(eval_.blockers.some((b) => b.includes('TRIGGER'))).toBe(true);
  });

  it('defaults target to CANONICAL_SELECTIVE', () => {
    delete process.env.LEGACY_CONVERGENCE_TARGET;
    expect(resolveLegacyConvergenceTargetStage()).toBe('CANONICAL_SELECTIVE');
  });
});

describe('DecisionProviderRegistryService P4 providers', () => {
  it('binds research, narration, and critic providers', () => {
    const registry = new DecisionProviderRegistryService(
      { providerId: 'legacy-trip-planning' } as never,
      { providerId: 'neptune-repair' } as never,
      new ConstraintCriticProvider(),
      new AgenticResearchProvider(),
      new AgenticNarrationProvider(),
    );
    const snap = registry.snapshot();
    expect(snap.providers.filter((p) => p.runtimeBound && p.status === 'ACTIVE').length).toBeGreaterThanOrEqual(
      5,
    );
  });
});

describe('agentic providers structured output', () => {
  it('returns schema-compliant research result', async () => {
    const result = await new AgenticResearchProvider().gatherResearch({
      tripId: 't1',
      query: 'iceland roads',
    });
    expect(result.schemaId).toBe('tripnara.research_provider_result@v1');
    expect(result.artifacts.length).toBeGreaterThan(0);
  });
});

describe('constraint-rollout-promotion.evaluator', () => {
  it('marks full-plan-selection and guide-plan-selection ON_FOR_SELECTED', () => {
    const promo = evaluateConstraintRolloutPromotion();
    const fps = promo.scenarios.find((s) => s.scenarioId === 'full-plan-selection');
    const gps = promo.scenarios.find((s) => s.scenarioId === 'guide-plan-selection');
    expect(fps?.currentPhase).toBe('ON_FOR_SELECTED');
    expect(gps?.currentPhase).toBe('ON_FOR_SELECTED');
    expect(promo.onForSelectedCount).toBeGreaterThanOrEqual(7);
    const opening = promo.scenarios.find((s) => s.scenarioId === 'opening-hours-conflict');
    expect(opening?.currentPhase).toBe('ON_FOR_SELECTED');
  });
});

describe('canonical-default-promotion.evaluator', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, DECISION_RUNTIME_MODE: 'SHADOW' };
    delete process.env.DECISION_GATEWAY_UNIFIED;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('is not ready without CANONICAL runtime', () => {
    const caps = resolveDecisionRuntimeCapabilities();
    const eval_ = evaluateCanonicalDefaultPromotion(caps);
    expect(eval_.ready).toBe(false);
    expect(eval_.blockers).toContain('runtime-canonical-mode');
  });
});

describe('canonical-default preview caps', () => {
  it('simulates CANONICAL_DEFAULT env', () => {
    process.env.DECISION_RUNTIME_MODE = 'SHADOW';
    delete process.env.DECISION_GATEWAY_UNIFIED;
    const base = resolveDecisionRuntimeCapabilities();
    const preview = buildCanonicalDefaultPreviewCapabilities(base);
    expect(preview.mode).toBe('CANONICAL');
    expect(preview.constraintGatewayMode).toBe('ON');
    expect(preview.fullPlanSelection).toBe(true);
  });

  it('staging ready with preview caps and observation bypass', () => {
    const base = resolveDecisionRuntimeCapabilities();
    const preview = buildCanonicalDefaultPreviewCapabilities(base);
    expect(isCanonicalDefaultStagingReady(preview, { observationBypass: true })).toBe(true);
  });
});

describe('legacy-fallback-drill.evaluator', () => {
  it('validates three rollback tiers', () => {
    const base = resolveDecisionRuntimeCapabilities();
    const drill = evaluateLegacyFallbackDrill(base);
    expect(drill.drillPass).toBe(true);
    expect(drill.tiers.map((t) => t.stage)).toEqual([
      'LEGACY_FALLBACK',
      'CANONICAL_SELECTIVE',
      'LEGACY_DEFAULT',
    ]);
  });
});
