/**
 * HTTP view of resolveDecisionRuntimeCapabilities + live shadow metrics + P1 registries.
 */

import type { DecisionRuntimeCapabilities } from '../execution/decision-runtime-capabilities.util';
import type { ConstraintShadowMetricsSnapshot } from '../constraints/constraint-shadow-metrics.service';
import type { ProviderRegistrySnapshot } from '../candidates/decision-provider-registry.service';
import { resolveDecisionRuntimeCapabilities } from '../execution/decision-runtime-capabilities.util';
import { summarizeTriggerWiring } from '../trigger/decision-trigger-wiring.catalog';
import { summarizeMonitoringDetectorWiring } from '../trigger/monitoring-detector-wiring.catalog';
import { ObjectiveSemanticsRegistry, OBJECTIVE_REGISTRY_VERSION } from '../objectives/objective-semantics.registry';
import { PROVIDER_REGISTRY_VERSION } from '../candidates/decision-provider-registry.service';
import {
  CONSTRAINT_REGISTRY_VERSION,
  snapshotConstraintRegistry,
} from '../constraints/constraint-registry.catalog';
import { resolveProductionTransitionPhase } from '../production-transition/production-transition-phase.catalog';

export interface DecisionRuntimeCapabilitiesView extends DecisionRuntimeCapabilities {
  schemaId: 'tripnara.decision_runtime_capabilities@v1';
  generatedAt: string;
  productionTransition: ReturnType<typeof resolveProductionTransitionPhase>;
  constraintShadowMetrics?: ConstraintShadowMetricsSnapshot;
  objectiveRegistryVersion: typeof OBJECTIVE_REGISTRY_VERSION;
  providerRegistryVersion: typeof PROVIDER_REGISTRY_VERSION;
  constraintRegistryVersion: typeof CONSTRAINT_REGISTRY_VERSION;
  objectiveRegistry: ReturnType<ObjectiveSemanticsRegistry['snapshot']>;
  constraintRegistry: ReturnType<typeof snapshotConstraintRegistry>;
  triggerWiring: ReturnType<typeof summarizeTriggerWiring>;
  detectorWiring: ReturnType<typeof summarizeMonitoringDetectorWiring>;
  providerRegistry?: ProviderRegistrySnapshot;
}

export function buildDecisionRuntimeCapabilitiesView(
  shadowMetrics?: ConstraintShadowMetricsSnapshot,
  providerRegistry?: ProviderRegistrySnapshot,
): DecisionRuntimeCapabilitiesView {
  return {
    schemaId: 'tripnara.decision_runtime_capabilities@v1',
    generatedAt: new Date().toISOString(),
    productionTransition: resolveProductionTransitionPhase(),
    ...resolveDecisionRuntimeCapabilities(),
    objectiveRegistryVersion: OBJECTIVE_REGISTRY_VERSION,
    providerRegistryVersion: PROVIDER_REGISTRY_VERSION,
    constraintRegistryVersion: CONSTRAINT_REGISTRY_VERSION,
    objectiveRegistry: new ObjectiveSemanticsRegistry().snapshot(),
    constraintRegistry: snapshotConstraintRegistry(),
    triggerWiring: summarizeTriggerWiring(),
    detectorWiring: summarizeMonitoringDetectorWiring(),
    ...(shadowMetrics ? { constraintShadowMetrics: shadowMetrics } : {}),
    ...(providerRegistry ? { providerRegistry } : {}),
  };
}
