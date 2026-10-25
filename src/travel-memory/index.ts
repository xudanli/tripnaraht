/**
 * Travel Memory Runtime 导出桶。
 * @see internal-docs/architecture/ADR-TRAVEL-MEMORY-RUNTIME.md
 */

export * from './types/memory-scope.types';
export * from './types/memory-layers.types';
// TMR_LAYER_READINESS / TMR_RUNTIME_READINESS 见 memory-layers.types
export * from './types/memory-event.types';
export * from './types/authority-hierarchy.types';
export * from './types/memory-need.types';
export * from './types/memory-contract.types';
export * from './types/memory-context-package.types';
export * from './types/memory-lifecycle.types';
export * from './types/memory-explainability.types';
export * from './types/memory-evidence-ref.types';

export * from './ledger/memory-ledger.store';
export * from './ledger/durable-ledger.contract';
export * from './ledger/prisma-travel-memory-ledger.service';
export * from './context-assembly/context-assembly.types';
export * from './context-assembly/assembled-context.types';
export * from './context-assembly/assemble-travel-context.util';
export * from './context-assembly/travel-context-assembler.service';
export * from './context-assembly/selective-consume.util';
export * from './context-assembly/apply-travel-memory-hints-to-cgus.util';
export * from './validation/memory-validation-loop.types';
export * from './runtime/memory-decision-trace.types';
export * from './validation/memory-quality-metrics.util';
export * from './validation/memory-assisted-episode.types';
export * from './validation/build-trip-shadow-pair.util';
export * from './validation/backfill-trip-shadow-from-cgus.util';
export * from './policy/memory-write-policy';
export * from './policy/memory-authority';
export * from './planner/memory-need-planner';
export * from './resolver/memory-authority-resolver';
export * from './views/memory-view-builder';
export * from './effective-context/effective-traveler-context.types';
export * from './effective-context/effective-memory-authority.util';
export * from './effective-context/make-effective-memory-item.util';
export * from './effective-context/resolve-effective-traveler-context.util';
export * from './effective-context/resolve-etc-consume-mode.util';
export * from './effective-context/project-profile-from-etc.util';
export * from './effective-context/project-advisory-hints-from-etc.util';
export * from './effective-context/etc-decision-params-audit.types';
export * from './traveler-memory/traveler-memory-contract.types';
export * from './traveler-memory/traveler-memory-predicate.util';
export * from './traveler-memory/validate-traveler-memory-object.util';
export * from './traveler-memory/write-traveler-memory.util';
export * from './traveler-memory/traveler-memory-to-effective.util';
export * from './traveler-memory/trip-override.types';
export * from './traveler-memory/trip-override.util';
export * from './traveler-memory/registration-seed.types';
export * from './traveler-memory/registration-seed.util';
export * from './traveler-memory/trip-override.service';
export * from './traveler-memory/resolve-write-gate-mode.util';
export * from './traveler-memory/dirty-write-to-traveler-memory.util';
export * from './traveler-memory/bridge-dirty-writes.util';

export * from './episode/decision-episode.types';
export * from './episode/decision-episode-from-cgus.util';
export * from './episode/outcome-attribution.util';
export * from './episode/decision-attribution-confidence.types';
export * from './episode/attribution-promotion.util';
export * from './episode/causal-attribution.types';
export * from './episode/cgus-outcome-memory-ingest.util';

export * from './runtime/memory-api.types';
export * from './runtime/memory-context-builder';
export * from './runtime/decision-context-guard.util';
export * from './runtime/decision-memory-explanation.types';
export * from './runtime/memory-decision-trace.types';
export * from './runtime/memory-accountability.service';
export * from './runtime/travel-memory-runtime.service';
export * from './travel-memory.module';
