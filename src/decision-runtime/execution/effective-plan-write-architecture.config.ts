/**
 * Effective Plan write path whitelist — SSOT for architecture lint + CI contract tests.
 */

/** Production files allowed to call setEffective( */
export const SET_EFFECTIVE_CALLER_ALLOWLIST = new Set([
  'src/trips/guardian-decision-core/plan-version/plan-version.store.ts',
  'src/trips/guardian-decision-core/execution/plan-version-apply.executor.ts',
]);

/** Production files allowed to call applyPlanOperations( */
export const APPLY_PLAN_OPERATIONS_CALLER_ALLOWLIST = new Set([
  'src/trips/guardian-decision-core/execution/rfc001-itinerary-materializer.service.ts',
  'src/trips/guardian-decision-core/execution/plan-version-apply.executor.ts',
]);

/** Production files allowed to call applyRepair( — must run inside write authority when chain on */
export const APPLY_REPAIR_CALLER_ALLOWLIST = new Set([
  'src/trips/trip-constraint-solver/services/feasibility-report.service.ts',
  'src/trips/trip-constraint-solver/controllers/feasibility-report.controller.ts',
  'src/trips/decision-semantics/services/decision-repair-executor.service.ts',
  'src/trips/readiness/services/readiness-repair.service.ts',
  'src/loops/adapters/feasibility-report.adapter.ts',
  'src/loops/services/loop-orchestrator.service.ts',
  'src/trips/readiness/readiness.controller.ts',
  'src/agent/services/actions/readiness.actions.ts',
  'src/skills/readiness/readiness-apply-repair.skill.ts',
]);

/** Production files allowed to call resolveConflicts( with itinerary writes */
export const RESOLVE_CONFLICTS_CALLER_ALLOWLIST = new Set([
  'src/trips/services/trip-conflicts.service.ts',
  'src/trips/trips.controller.ts',
]);

/** Agent paths with direct itinerary writes — must call assertPlanMutationAllowedOrThrow */
export const AGENT_ITINERARY_MUTATION_GUARDED_ALLOWLIST = new Set([
  'src/agent/services/execution-agent.service.ts',
  'src/agent/assistants/trip-planner/services/trip-planner.service.ts',
  'src/agent/assistants/planning-assistant/services/planning-assistant-v2.service.ts',
  'src/agent/services/system1-executor.service.ts',
  'src/agent/services/actions/trip.actions.ts',
  'src/agent/utils/plan-gate-timeline-materializer.util.ts',
]);

/** Reserved for future agent itinerary writers — must migrate before adding mutations */
export const AGENT_ITINERARY_MUTATION_PENDING_ALLOWLIST = new Set<string>([]);

const AGENT_ITINERARY_MUTATION_PATTERN =
  /itineraryItem\.(create|update|deleteMany|delete)|itineraryItemsService\.(create|update|remove)/;

export function fileHasAgentItineraryMutation(content: string): boolean {
  return content.split('\n').some((line) => {
    const trimmed = line.trim();
    if (!trimmed || /^(\/\/|\*|\/\*)/.test(trimmed)) return false;
    return AGENT_ITINERARY_MUTATION_PATTERN.test(trimmed);
  });
}

/**
 * Modules that must NOT import plan write internals directly.
 * They must go through DecisionCore.finalize → authorize → EffectivePlanExecutor.
 */
export const EFFECTIVE_PLAN_WRITE_FORBIDDEN_IMPORT_PREFIXES = [
  'src/trips/guardian-decision-core/plan-version/plan-version.store',
  'src/trips/guardian-decision-core/execution/rfc001-itinerary-materializer.service',
] as const;

/** Scan roots for forbidden import lint */
export const EFFECTIVE_PLAN_IMPORT_GUARD_ROOTS = [
  'src/agent',
  'src/guide-to-plan',
  'src/trips/decision',
  'src/trips/guardian-decision-core/adapters',
  'src/trips/guardian-decision-core/services',
  'src/trips/guardian-decision-core/shadow',
  'src/trips/guardian-decision-core/execution',
] as const;

/** Execution subtree exempt from import guard (authorized write chain) */
export const EFFECTIVE_PLAN_IMPORT_GUARD_EXEMPT_SUFFIXES = [
  '/execution/plan-version-apply.executor.ts',
  '/execution/rfc001-itinerary-materializer.service.ts',
  '/plan-version/plan-version.store.ts',
  '/execution/effective-plan-write-guard.service.ts',
  '/execution/effective-plan-execution.module.ts',
  '/execution/effective-plan-write-guard.config.ts',
  '/execution/effective-plan-write-architecture.config.ts',
] as const;

export function isExemptFromImportGuard(relativePath: string): boolean {
  return EFFECTIVE_PLAN_IMPORT_GUARD_EXEMPT_SUFFIXES.some((s) =>
    relativePath.endsWith(s.replace(/^\//, '')),
  );
}

export function normalizeRepoRelativePath(filePath: string, root: string): string {
  return filePath.replace(`${root}/`, '').replace(/\\/g, '/');
}
