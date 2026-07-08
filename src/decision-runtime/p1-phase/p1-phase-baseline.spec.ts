import { summarizeTriggerWiring } from '../trigger/decision-trigger-wiring.catalog';
import { DecisionProviderRegistryService } from '../candidates/decision-provider-registry.service';
import { LegacyCandidateGenerationProvider } from '../candidates/providers/legacy-candidate-generation.provider';
import { NeptuneRepairProvider } from '../candidates/providers/neptune-repair.provider';
import { resolveDecisionRuntimeCapabilities } from '../execution/decision-runtime-capabilities.util';
import { ObjectiveSemanticsRegistry } from '../objectives/objective-semantics.registry';
import { snapshotConstraintRegistry } from '../constraints/constraint-registry.catalog';

describe('summarizeTriggerWiring', () => {
  it('reports dispatch and lineage coverage', () => {
    const summary = summarizeTriggerWiring();
    expect(summary.total).toBeGreaterThanOrEqual(11);
    expect(summary.dispatchWired).toBeGreaterThanOrEqual(5);
    expect(summary.notWired).toBe(0);
    expect(summary.dispatchCoveragePct).toBe(100);
  });
});

describe('DecisionProviderRegistryService', () => {
  it('lists bound and static providers', () => {
    const legacy = { providerId: 'legacy-trip-planning' } as LegacyCandidateGenerationProvider;
    const neptune = { providerId: 'neptune-repair' } as NeptuneRepairProvider;
    const registry = new DecisionProviderRegistryService(legacy, neptune);
    const snap = registry.snapshot();
    expect(snap.providers.some((p) => p.providerId === 'legacy-trip-planning' && p.runtimeBound)).toBe(
      true,
    );
    expect(snap.providers.some((p) => p.providerId === 'neptune-repair' && p.runtimeBound)).toBe(true);
    expect(snap.providers.some((p) => p.providerId === 'guide-plan-variants')).toBe(true);
  });
});

describe('ObjectiveSemanticsRegistry snapshot', () => {
  it('exports objectives@v1 SSOT', () => {
    const snap = new ObjectiveSemanticsRegistry().snapshot();
    expect(snap.version).toBe('objectives@v1');
    expect(snap.objectiveCount).toBeGreaterThanOrEqual(8);
  });
});

describe('ConstraintRegistry snapshot', () => {
  it('exports constraints@v1 SSOT with P1 baseline codes', () => {
    const snap = snapshotConstraintRegistry();
    expect(snap.version).toBe('constraints@v1');
    expect(snap.entryCount).toBeGreaterThanOrEqual(6);
    expect(snap.entries.some((e) => e.constraintCode === 'ROAD_CLOSED')).toBe(true);
  });
});

describe('P1 capabilities baseline', () => {
  const savedTrigger = process.env.DECISION_TRIGGER_GATEWAY_ENABLED;
  const savedConstraintMode = process.env.CONSTRAINT_GATEWAY_MODE;

  afterEach(() => {
    if (savedTrigger === undefined) delete process.env.DECISION_TRIGGER_GATEWAY_ENABLED;
    else process.env.DECISION_TRIGGER_GATEWAY_ENABLED = savedTrigger;
    if (savedConstraintMode === undefined) delete process.env.CONSTRAINT_GATEWAY_MODE;
    else process.env.CONSTRAINT_GATEWAY_MODE = savedConstraintMode;
  });

  it('defaults gateways off', () => {
    delete process.env.DECISION_TRIGGER_GATEWAY_ENABLED;
    delete process.env.CONSTRAINT_GATEWAY_MODE;
    const caps = resolveDecisionRuntimeCapabilities();
    expect(caps.decisionTriggerGateway).toBe(false);
    expect(caps.constraintGatewayShadowCompare).toBe(false);
  });
});
