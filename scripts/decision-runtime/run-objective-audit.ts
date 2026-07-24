/**
 * Objective audit for TD-004 / TD-005 lex stage traces (calibration evidence).
 *
 * Usage:
 *   npx tsx scripts/decision-runtime/run-objective-audit.ts bench_eab3892f-...
 *   npx tsx scripts/decision-runtime/run-objective-audit.ts bench_<id> --scenario TD-004-iceland-multi-lex
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { buildTaskDScenarios } from '../../src/decision-lab/e2e/task-d-scenarios.fixture';
import {
  instanceArtifactDir,
  readArtifact,
} from '../../src/decision-runtime/benchmark/benchmark-artifact.util';
import { resolveGitCommit } from '../../src/decision-runtime/benchmark/benchmark-config.util';

const AUDIT_SCENARIOS = ['TD-004-iceland-multi-lex', 'TD-005-l2-drive-fork'] as const;

type CheckRow = {
  id: string;
  description: string;
  passed: boolean;
  notes?: string;
};

type ShadowEvent = {
  inputConsistent?: boolean;
  eligibleForStrategyComparison?: boolean;
  authorityResult?: { selectedCandidateId?: string };
  shadowResult?: { selectedCandidateId?: string; solverEngine?: string };
  divergence?: { sameWinner?: boolean; stageTraceComplete?: boolean; types?: string[] };
  lexicographicStageTraces?: Array<{
    stageIndex: number;
    layer: string;
    direction: string;
    objectiveId: string;
    inputCandidateIds: string[];
    remainingCandidateIds: string[];
    eliminatedCandidateIds: string[];
    objectiveValues?: Record<string, number>;
  }>;
  inputFingerprint?: Record<string, unknown>;
};

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [objective-audit] ${line}`);
}

function parseArgs(argv: string[]) {
  const positional = argv.filter((a) => !a.startsWith('--'));
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const benchmarkRunId = positional[0];
  if (!benchmarkRunId) {
    throw new Error('Usage: run-objective-audit.ts <benchmarkRunId> [--scenario id]');
  }
  const scenarioFilter = get('--scenario');
  return {
    benchmarkRunId,
    scenarios: scenarioFilter ? [scenarioFilter] : [...AUDIT_SCENARIOS],
  };
}

function chainStageTraces(
  traces: NonNullable<ShadowEvent['lexicographicStageTraces']>,
): CheckRow[] {
  const checks: CheckRow[] = [];
  let priorRemaining: string[] | undefined;

  for (const stage of traces) {
    const input = [...stage.inputCandidateIds].sort().join(',');
    if (priorRemaining) {
      const expected = [...priorRemaining].sort().join(',');
      checks.push({
        id: `stage-${stage.stageIndex}-input-chain`,
        description: `Stage ${stage.stageIndex} input equals prior remaining`,
        passed: input === expected,
        notes: input !== expected ? `expected [${expected}] got [${input}]` : undefined,
      });
    }

    checks.push({
      id: `stage-${stage.stageIndex}-layer`,
      description: `Stage ${stage.stageIndex} starts at L2 (${stage.objectiveId})`,
      passed: stage.layer === 'L2' && stage.stageIndex === 0,
    });

    checks.push({
      id: `stage-${stage.stageIndex}-direction`,
      description: `Stage ${stage.stageIndex} direction is MINIMIZE`,
      passed: stage.direction === 'MINIMIZE',
    });

    for (const eliminated of stage.eliminatedCandidateIds) {
      checks.push({
        id: `stage-${stage.stageIndex}-elim-${eliminated}`,
        description: `Eliminated ${eliminated} has objective value`,
        passed: stage.objectiveValues?.[eliminated] !== undefined,
      });
    }

    priorRemaining = stage.remainingCandidateIds;
  }

  if (traces.length > 0) {
    const last = traces[traces.length - 1]!;
    checks.push({
      id: 'final-remaining-singleton',
      description: 'Lex chain ends with exactly one remaining candidate',
      passed: last.remainingCandidateIds.length === 1,
    });
  }

  return checks;
}

async function auditScenario(
  benchmarkRunId: string,
  scenarioId: string,
): Promise<{ scenarioId: string; passed: boolean; checks: CheckRow[]; notes: string[] }> {
  const fixture = buildTaskDScenarios().find((s) => s.id === scenarioId);
  if (!fixture) throw new Error(`Unknown scenario: ${scenarioId}`);

  const instanceId = scenarioId.replace(/-/g, '_').replace(/^TD_/, 'TD-').replace(/_/g, '-');
  // Map scenario ref to benchmark instance folder (TD-004-iceland-multi-lex)
  const folderName = scenarioId;
  const shadow = await readArtifact<ShadowEvent>(
    path.join(instanceArtifactDir(benchmarkRunId, folderName), 'shadow-event.json'),
  );

  const notes: string[] = [];
  const checks: CheckRow[] = [];

  if (!shadow) {
    return {
      scenarioId,
      passed: false,
      checks: [{ id: 'artifact', description: 'shadow-event.json exists', passed: false }],
      notes: ['missing shadow-event.json'],
    };
  }

  checks.push({
    id: 'input-consistent',
    description: 'inputConsistent=true',
    passed: shadow.inputConsistent === true,
  });

  checks.push({
    id: 'eligible',
    description: 'eligibleForStrategyComparison matches fixture',
    passed:
      shadow.eligibleForStrategyComparison === (fixture.expect.eligibleForComparison ?? true),
  });

  if (fixture.expect.shadowWinnerId) {
    checks.push({
      id: 'shadow-winner',
      description: `shadow winner=${fixture.expect.shadowWinnerId}`,
      passed: shadow.shadowResult?.selectedCandidateId === fixture.expect.shadowWinnerId,
      notes:
        shadow.shadowResult?.selectedCandidateId !== fixture.expect.shadowWinnerId
          ? `got ${shadow.shadowResult?.selectedCandidateId}`
          : undefined,
    });
  }

  checks.push({
    id: 'same-winner',
    description: 'authority and shadow same winner (SAME_WINNER)',
    passed:
      shadow.divergence?.sameWinner === true &&
      shadow.authorityResult?.selectedCandidateId === shadow.shadowResult?.selectedCandidateId,
  });

  checks.push({
    id: 'stage-trace-complete',
    description: 'divergence.stageTraceComplete=true',
    passed: shadow.divergence?.stageTraceComplete === true,
  });

  checks.push({
    id: 'solver-engine',
    description: 'shadow uses cp-sat-lex-v1 candidate selector',
    passed: shadow.shadowResult?.solverEngine === 'cp-sat-lex-v1',
  });

  if (shadow.lexicographicStageTraces?.length) {
    checks.push(...chainStageTraces(shadow.lexicographicStageTraces));
  } else {
    checks.push({
      id: 'traces-present',
      description: 'lexicographicStageTraces non-empty',
      passed: false,
    });
  }

  const passed = checks.every((c) => c.passed);
  if (!passed) notes.push('one or more checks failed — review before algorithm changes');

  return { scenarioId, passed, checks, notes };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const outDir = path.join(
    process.cwd(),
    'artifacts/task-e1-benchmark',
    opts.benchmarkRunId,
    'reports',
  );
  await fs.mkdir(outDir, { recursive: true });

  const results = [];
  for (const scenarioId of opts.scenarios) {
    const result = await auditScenario(opts.benchmarkRunId, scenarioId);
    results.push(result);

    const shortId = scenarioId.replace(/^TD-(\d+).*/, 'TD-$1');
    const outPath = path.join(outDir, `objective-audit-${shortId}.json`);
    const payload = {
      schemaId: 'tripnara.objective_audit@v1',
      benchmarkRunId: opts.benchmarkRunId,
      scenarioId,
      gitCommit: resolveGitCommit(),
      auditedAt: new Date().toISOString(),
      passed: result.passed,
      checks: result.checks,
      notes: result.notes,
    };
    await fs.writeFile(outPath, JSON.stringify(payload, null, 2));
    log(`${scenarioId}: ${result.passed ? 'PASS' : 'FAIL'} → ${outPath}`);
  }

  const allPassed = results.every((r) => r.passed);
  if (!allPassed) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
