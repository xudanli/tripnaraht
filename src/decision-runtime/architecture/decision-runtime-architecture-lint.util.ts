/**
 * Decision Runtime architecture lint — SSOT for CI + P5 readiness scripts.
 */

import * as fs from 'node:fs';
import * as nodePath from 'node:path';
import {
  CONSTRAINT_CHECK_PLAN_CALLER_ALLOWLIST,
  CONSTRAINT_CHECKER_INSTANTIATION_ALLOWLIST,
  CONSTRAINT_FORMAL_PATH_GUARD_ROOTS,
  normalizeRepoRelativePath,
} from '../constraints/constraint-formal-path.architecture.config';
import {
  APPLY_PLAN_OPERATIONS_CALLER_ALLOWLIST,
  APPLY_REPAIR_CALLER_ALLOWLIST,
  EFFECTIVE_PLAN_IMPORT_GUARD_ROOTS,
  EFFECTIVE_PLAN_WRITE_FORBIDDEN_IMPORT_PREFIXES,
  AGENT_ITINERARY_MUTATION_GUARDED_ALLOWLIST,
  AGENT_ITINERARY_MUTATION_PENDING_ALLOWLIST,
  RESOLVE_CONFLICTS_CALLER_ALLOWLIST,
  SET_EFFECTIVE_CALLER_ALLOWLIST,
  fileHasAgentItineraryMutation,
  isExemptFromImportGuard,
} from '../execution/effective-plan-write-architecture.config';

export const DECISION_RUNTIME_ARCHITECTURE_LINT_SCHEMA_ID =
  'tripnara.decision_runtime_architecture_lint@v1';

function walkTs(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = nodePath.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      walkTs(full, acc);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

function lineHasCodeCall(content: string, symbol: string): boolean {
  return content.split('\n').some((line) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (/^(\/\/|\*|\/\*)/.test(trimmed)) return false;
    return trimmed.includes(`${symbol}(`);
  });
}

/** Detect service method invocations `.applyRepair(` — exclude local method definitions. */
function lineHasApplyRepairMethodCall(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || /^(\/\/|\*|\/\*)/.test(trimmed)) return false;
  if (/export\s+function\s+applyRepair\s*\(/.test(trimmed)) return false;
  if (/^(private\s+|public\s+|protected\s+)?(async\s+)?applyRepair\s*\(/.test(trimmed)) {
    return false;
  }
  return /\.applyRepair\s*\(/.test(trimmed);
}

function collectApplyRepairCallOffenders(
  root: string,
  allowlist: Set<string>,
  scanRoot = nodePath.join(root, 'src'),
): string[] {
  const offenders: string[] = [];
  for (const file of walkTs(scanRoot)) {
    const rel = normalizeRepoRelativePath(file, root);
    const content = fs.readFileSync(file, 'utf8');
    const hasCall = content.split('\n').some((line) => lineHasApplyRepairMethodCall(line));
    if (!hasCall) continue;
    if (allowlist.has(rel)) continue;
    if (rel.includes('/e2e/')) continue;
    if (rel.includes('architecture-lint.util.ts')) continue;
    if (rel.endsWith('.architecture.config.ts')) continue;
    offenders.push(rel);
  }
  return offenders;
}

function collectCallSiteOffenders(
  root: string,
  symbol: string,
  allowlist: Set<string>,
  scanRoot = nodePath.join(root, 'src'),
): string[] {
  const offenders: string[] = [];
  for (const file of walkTs(scanRoot)) {
    const rel = normalizeRepoRelativePath(file, root);
    const content = fs.readFileSync(file, 'utf8');
    if (!lineHasCodeCall(content, symbol)) continue;
    if (allowlist.has(rel)) continue;
    if (rel.includes('/e2e/')) continue;
    if (rel.includes('architecture-lint.util.ts')) continue;
    if (rel.endsWith('.architecture.config.ts')) continue;
    offenders.push(rel);
  }
  return offenders;
}

function collectCheckPlanOffenders(root: string): string[] {
  const offenders: string[] = [];
  for (const rootRel of CONSTRAINT_FORMAL_PATH_GUARD_ROOTS) {
    for (const file of walkTs(nodePath.join(root, rootRel))) {
      const rel = normalizeRepoRelativePath(file, root);
      const content = fs.readFileSync(file, 'utf8');
      if (!content.includes('checkPlan(')) continue;
      if (CONSTRAINT_CHECK_PLAN_CALLER_ALLOWLIST.has(rel)) continue;
      if (rel.includes('/e2e/')) continue;
      offenders.push(rel);
    }
  }
  return [...new Set(offenders)];
}

function collectConstraintCheckerInstantiationOffenders(root: string): string[] {
  const offenders: string[] = [];
  for (const file of walkTs(nodePath.join(root, 'src'))) {
    const rel = normalizeRepoRelativePath(file, root);
    const content = fs.readFileSync(file, 'utf8');
    if (!lineHasCodeCall(content, 'new ConstraintChecker')) continue;
    if (CONSTRAINT_CHECKER_INSTANTIATION_ALLOWLIST.has(rel)) continue;
    if (rel.includes('/e2e/')) continue;
    if (rel.includes('architecture-lint.util.ts')) continue;
    if (rel.endsWith('.architecture.config.ts')) continue;
    offenders.push(rel);
  }
  return offenders;
}

function collectForbiddenImportOffenders(root: string): string[] {
  const offenders: string[] = [];
  for (const rootRel of EFFECTIVE_PLAN_IMPORT_GUARD_ROOTS) {
    for (const file of walkTs(nodePath.join(root, rootRel))) {
      const rel = normalizeRepoRelativePath(file, root);
      if (isExemptFromImportGuard(rel)) continue;
      if (rel.includes('/e2e/')) continue;
      const content = fs.readFileSync(file, 'utf8');
      for (const forbidden of EFFECTIVE_PLAN_WRITE_FORBIDDEN_IMPORT_PREFIXES) {
        const tail = forbidden.split('/').pop()!;
        if (
          content.includes('plan-version.store') ||
          content.includes('rfc001-itinerary-materializer.service')
        ) {
          const importLines = content
            .split('\n')
            .filter(
              (line) =>
                (line.includes('import ') || line.includes('require(')) &&
                (line.includes('plan-version.store') ||
                  line.includes('rfc001-itinerary-materializer.service')),
            );
          if (importLines.length > 0) {
            offenders.push(`${rel} → ${tail}`);
          }
        }
      }
    }
  }
  return [...new Set(offenders)];
}

function collectAgentItineraryMutationOffenders(root: string): {
  unguarded: string[];
  guardedMissingAssert: string[];
  pending: string[];
} {
  const unguarded: string[] = [];
  const guardedMissingAssert: string[] = [];
  const pending: string[] = [];
  const scanRoot = nodePath.join(root, 'src/agent');

  for (const file of walkTs(scanRoot)) {
    const rel = normalizeRepoRelativePath(file, root);
    const content = fs.readFileSync(file, 'utf8');
    if (!fileHasAgentItineraryMutation(content)) continue;

    if (AGENT_ITINERARY_MUTATION_PENDING_ALLOWLIST.has(rel)) {
      pending.push(rel);
      continue;
    }
    if (AGENT_ITINERARY_MUTATION_GUARDED_ALLOWLIST.has(rel)) {
      if (!content.includes('assertPlanMutationAllowedOrThrow')) {
        guardedMissingAssert.push(rel);
      }
      continue;
    }
    unguarded.push(rel);
  }

  return {
    unguarded: [...new Set(unguarded)],
    guardedMissingAssert: [...new Set(guardedMissingAssert)],
    pending: [...new Set(pending)],
  };
}

export function runDecisionRuntimeArchitectureLint(root = process.cwd()) {
  const agentItinerary = collectAgentItineraryMutationOffenders(root);
  const checks = [
    {
      checkId: 'legacy-boolean-checkPlan-callers',
      pass: collectCheckPlanOffenders(root).length === 0,
      offenders: collectCheckPlanOffenders(root),
      detail: 'ConstraintChecker.checkPlan only from gateway adapter + engine',
    },
    {
      checkId: 'legacy-boolean-checker-instantiation',
      pass: collectConstraintCheckerInstantiationOffenders(root).length === 0,
      offenders: collectConstraintCheckerInstantiationOffenders(root),
      detail: 'no ad-hoc new ConstraintChecker() in production paths',
    },
    {
      checkId: 'effective-plan-setEffective',
      pass:
        collectCallSiteOffenders(root, 'setEffective', SET_EFFECTIVE_CALLER_ALLOWLIST)
          .length === 0,
      offenders: collectCallSiteOffenders(
        root,
        'setEffective',
        SET_EFFECTIVE_CALLER_ALLOWLIST,
      ),
      detail: 'setEffective only from authorized store + executor',
    },
    {
      checkId: 'effective-plan-applyPlanOperations',
      pass:
        collectCallSiteOffenders(
          root,
          'applyPlanOperations',
          APPLY_PLAN_OPERATIONS_CALLER_ALLOWLIST,
        ).length === 0,
      offenders: collectCallSiteOffenders(
        root,
        'applyPlanOperations',
        APPLY_PLAN_OPERATIONS_CALLER_ALLOWLIST,
      ),
      detail: 'applyPlanOperations only from materializer + executor',
    },
    {
      checkId: 'effective-plan-forbidden-imports',
      pass: collectForbiddenImportOffenders(root).length === 0,
      offenders: collectForbiddenImportOffenders(root),
      detail: 'business modules do not import plan write repositories directly',
    },
    {
      checkId: 'write-chain-applyRepair-callers',
      pass: collectApplyRepairCallOffenders(root, APPLY_REPAIR_CALLER_ALLOWLIST).length === 0,
      offenders: collectApplyRepairCallOffenders(root, APPLY_REPAIR_CALLER_ALLOWLIST),
      detail: 'applyRepair only from feasibility / readiness / decision-repair entrypoints',
    },
    {
      checkId: 'write-chain-resolveConflicts-callers',
      pass:
        collectCallSiteOffenders(root, 'resolveConflicts', RESOLVE_CONFLICTS_CALLER_ALLOWLIST)
          .length === 0,
      offenders: collectCallSiteOffenders(root, 'resolveConflicts', RESOLVE_CONFLICTS_CALLER_ALLOWLIST),
      detail: 'resolveConflicts only from trip-conflicts service + controller',
    },
    {
      checkId: 'write-chain-agent-itinerary-unguarded',
      pass: agentItinerary.unguarded.length === 0,
      offenders: agentItinerary.unguarded,
      detail: 'agent direct itinerary writes must be gated or on pending allowlist',
    },
    {
      checkId: 'write-chain-agent-itinerary-guarded',
      pass: agentItinerary.guardedMissingAssert.length === 0,
      offenders: agentItinerary.guardedMissingAssert,
      detail: 'guarded agent itinerary writers must call assertPlanMutationAllowedOrThrow',
    },
    {
      checkId: 'write-chain-agent-itinerary-pending',
      pass: true,
      offenders: agentItinerary.pending,
      detail: 'documented pending write-chain migration paths (advisory)',
    },
  ];

  const blockers = checks.filter((c) => !c.pass).map((c) => c.checkId);
  const legacyBooleanCallerCount =
    checks.find((c) => c.checkId === 'legacy-boolean-checkPlan-callers')!.offenders
      .length +
    checks.find((c) => c.checkId === 'legacy-boolean-checker-instantiation')!.offenders
      .length;
  const executorBypassCount =
    checks.find((c) => c.checkId === 'effective-plan-setEffective')!.offenders.length +
    checks.find((c) => c.checkId === 'effective-plan-applyPlanOperations')!.offenders
      .length +
    checks.find((c) => c.checkId === 'write-chain-applyRepair-callers')!.offenders.length +
    checks.find((c) => c.checkId === 'write-chain-resolveConflicts-callers')!.offenders.length +
    checks.find((c) => c.checkId === 'write-chain-agent-itinerary-unguarded')!.offenders
      .length +
    checks.find((c) => c.checkId === 'write-chain-agent-itinerary-guarded')!.offenders.length;

  const agentItineraryPendingCount = checks.find(
    (c) => c.checkId === 'write-chain-agent-itinerary-pending',
  )!.offenders.length;

  return {
    schemaId: DECISION_RUNTIME_ARCHITECTURE_LINT_SCHEMA_ID,
    generatedAt: new Date().toISOString(),
    pass: blockers.length === 0,
    legacyBooleanCallerCount,
    executorBypassCount,
    agentItineraryPendingCount,
    checks,
    blockers,
  };
}
