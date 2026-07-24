/**
 * Task E1 — Manual evidence review artifact generator.
 *
 * Reads smoke run artifacts and produces structured review conclusions.
 * Operator must confirm notes before freeze/tag.
 *
 * Usage:
 *   npm run task-e1:manual-evidence-review -- bench_86c96cb1-9ed6-4f92-be13-ebe3944481bf
 *   npm run task-e1:manual-evidence-review -- bench_<id> --reviewer "name"
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  artifactExists,
  hashJson,
  instanceArtifactDir,
  readArtifact,
} from '../../src/decision-runtime/benchmark/benchmark-artifact.util';
import { resolveGitCommit } from '../../src/decision-runtime/benchmark/benchmark-config.util';

type ReviewVerdict = 'PASS' | 'PASS_WITH_NOTES' | 'FAIL';

interface CheckRow {
  id: string;
  description: string;
  passed: boolean;
  notes?: string;
}

interface InstanceReview {
  instanceId: string;
  verdict: ReviewVerdict;
  checks: CheckRow[];
  notes: string[];
  artifactPaths: Record<string, string>;
}

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [e1-manual-review] ${line}`);
}

function parseArgs(argv: string[]) {
  const positional = argv.filter((a) => !a.startsWith('--'));
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const benchmarkRunId = positional[0];
  if (!benchmarkRunId) {
    throw new Error('Usage: run-manual-evidence-review.ts <benchmarkRunId> [--reviewer name]');
  }
  return {
    benchmarkRunId,
    reviewer: get('--reviewer') ?? process.env.USER ?? 'unknown',
  };
}

function deriveVerdict(checks: CheckRow[], notes: string[]): ReviewVerdict {
  if (checks.some((c) => !c.passed)) return 'FAIL';
  if (notes.length > 0) return 'PASS_WITH_NOTES';
  return 'PASS';
}

function chainStageTraces(
  traces: Array<{
    stageIndex: number;
    direction: string;
    inputCandidateIds: string[];
    remainingCandidateIds: string[];
    eliminatedCandidateIds: string[];
    objectiveId: string;
    objectiveValues?: Record<string, number>;
  }>,
): CheckRow[] {
  const checks: CheckRow[] = [];
  let priorRemaining: string[] | undefined;

  for (const stage of traces) {
    const input = [...stage.inputCandidateIds].sort().join(',');
    if (priorRemaining) {
      const expected = [...priorRemaining].sort().join(',');
      checks.push({
        id: `stage-${stage.stageIndex}-input-chain`,
        description: `Stage ${stage.stageIndex} inputCandidates equals prior remainingCandidates`,
        passed: input === expected,
        notes: input !== expected ? `expected [${expected}] got [${input}]` : undefined,
      });
    }

    checks.push({
      id: `stage-${stage.stageIndex}-direction`,
      description: `Stage ${stage.stageIndex} (${stage.objectiveId}) direction is MINIMIZE`,
      passed: stage.direction === 'MINIMIZE',
    });

    for (const eliminated of stage.eliminatedCandidateIds) {
      checks.push({
        id: `stage-${stage.stageIndex}-elim-${eliminated}-objective`,
        description: `Eliminated candidate ${eliminated} has objective value at ${stage.objectiveId}`,
        passed: stage.objectiveValues?.[eliminated] !== undefined,
      });
    }

    priorRemaining = stage.remainingCandidateIds;
  }

  return checks;
}

async function reviewDiffWinner(benchmarkRunId: string): Promise<InstanceReview> {
  const dir = instanceArtifactDir(benchmarkRunId, 'E1-CAL-02-DIFF-WINNER');
  const shadow = await readArtifact<{
    inputFingerprint?: Record<string, unknown>;
    inputConsistent?: boolean;
    authorityResult?: { selectedCandidateId?: string };
    shadowResult?: { selectedCandidateId?: string };
    lexicographicStageTraces?: Array<{
      stageIndex: number;
      direction: string;
      inputCandidateIds: string[];
      remainingCandidateIds: string[];
      eliminatedCandidateIds: string[];
      objectiveId: string;
      objectiveValues?: Record<string, number>;
    }>;
    divergence?: { sameWinner?: boolean; stageTraceComplete?: boolean };
  }>(path.join(dir, 'shadow-event.json'));

  const notes: string[] = [];
  const checks: CheckRow[] = [];

  checks.push({
    id: 'input-consistent',
    description: 'Authority and Shadow share inputFingerprint (candidate set, snapshot, constraint report, objective version)',
    passed: shadow?.inputConsistent === true,
  });

  if (shadow?.inputFingerprint) {
    const fp = shadow.inputFingerprint;
    for (const key of [
      'snapshotHash',
      'candidateSetHash',
      'constraintReportHash',
      'objectiveRegistryVersion',
    ]) {
      checks.push({
        id: `fingerprint-${key}`,
        description: `inputFingerprint.${key} present`,
        passed: Boolean(fp[key]),
      });
    }
  }

  const traces = shadow?.lexicographicStageTraces ?? [];
  checks.push(...chainStageTraces(traces));

  const finalRemaining = traces.at(-1)?.remainingCandidateIds ?? [];
  const shadowWinner = shadow?.shadowResult?.selectedCandidateId;
  checks.push({
    id: 'winner-in-final-remaining',
    description: 'Shadow winner is in final remainingCandidates set',
    passed: Boolean(shadowWinner && finalRemaining.includes(shadowWinner)),
  });

  checks.push({
    id: 'different-winner',
    description: 'Authority and Shadow winners differ (L2/L3/L4 priority fork)',
    passed:
      Boolean(shadow?.authorityResult?.selectedCandidateId) &&
      Boolean(shadowWinner) &&
      shadow?.authorityResult?.selectedCandidateId !== shadowWinner,
  });

  checks.push({
    id: 'stage-trace-complete',
    description: 'stageTraceComplete flag set',
    passed: shadow?.divergence?.stageTraceComplete === true,
  });

  if (shadow?.divergence?.sameWinner) {
    checks.push({
      id: 'not-same-winner',
      description: 'Not SAME_WINNER divergence',
      passed: false,
    });
  }

  notes.push(
    'Authority=mid (utility-ranked incumbent) vs Shadow=light (lex L2/daily_driving_load). Fork explainable as utility vs lex objective ordering — confirm L2 fixedBound semantics with objective registry before Calibration.',
  );

  return {
    instanceId: 'E1-CAL-02-DIFF-WINNER',
    verdict: deriveVerdict(checks, notes),
    checks,
    notes,
    artifactPaths: {
      shadowEvent: path.join(dir, 'shadow-event.json'),
      authorityResponse: path.join(dir, 'authority-response.json'),
      materializeResult: path.join(dir, 'materialize-result.json'),
    },
  };
}

async function reviewRealMulti(benchmarkRunId: string): Promise<InstanceReview> {
  const dir = instanceArtifactDir(benchmarkRunId, 'E1-CAL-03-REAL-MULTI');
  const input = await readArtifact<{
    prebuiltCandidates?: Array<{ candidateId: string; plan?: { days?: unknown[] } }>;
    constraintReportsByCandidateId?: Record<string, unknown>;
  }>(path.join(dir, 'input.json'));

  const materialize = await readArtifact<{
    materialized?: Array<{
      blindedOptionA?: Record<string, unknown>;
      blindedOptionB?: Record<string, unknown>;
      status?: string;
    }>;
  }>(path.join(dir, 'materialize-result.json'));

  const notes: string[] = [];
  const checks: CheckRow[] = [];
  const candidates = input?.prebuiltCandidates ?? [];

  checks.push({
    id: 'prebuilt-not-empty',
    description: 'prebuiltCandidates not stripped by ValidationPipe',
    passed: candidates.length >= 2,
  });

  for (const c of candidates) {
    const plan = c.plan;
    checks.push({
      id: `full-plan-${c.candidateId}`,
      description: `Candidate ${c.candidateId} carries full Plan (days/timeSlots), not ID-only stub`,
      passed: Array.isArray(plan?.days) && plan!.days!.length > 0,
    });
  }

  const reportKeys = Object.keys(input?.constraintReportsByCandidateId ?? {});
  checks.push({
    id: 'constraint-report-1-1',
    description: 'constraintReportsByCandidateId keys match prebuilt candidate IDs',
    passed:
      candidates.length > 0 &&
      candidates.every((c) => reportKeys.includes(c.candidateId)) &&
      reportKeys.length === candidates.length,
  });

  const blinded = materialize?.materialized?.[0];
  checks.push({
    id: 'review-materialized',
    description: 'Review case materialized (not SAME_WINNER excluded)',
    passed: (materialize?.materialized?.length ?? 0) > 0,
  });

  const leakPattern = /strategy|cp-sat|decision-core|lexicographic/i;
  for (const label of ['A', 'B'] as const) {
    const option = label === 'A' ? blinded?.blindedOptionA : blinded?.blindedOptionB;
    const serialized = JSON.stringify(option ?? {});
    checks.push({
      id: `blinding-no-strategy-${label}`,
      description: `Blinded option ${label} does not leak strategy names`,
      passed: !leakPattern.test(serialized),
    });
  }

  checks.push({
    id: 'blinded-has-schedule',
    description: 'Blinded snapshots include date/time/slot structure',
    passed: Boolean(
      blinded?.blindedOptionA &&
        Array.isArray((blinded.blindedOptionA as { days?: unknown[] }).days) &&
        blinded?.blindedOptionB &&
        Array.isArray((blinded.blindedOptionB as { days?: unknown[] }).days),
    ),
  });

  notes.push(
    'REAL-MULTI smoke uses TD-006 three-way prebuilt TripPlans (synthetic A/B slots) to guarantee lex divergence in staging without ROAD_DATA_NOT_LOADED. Iceland POI-named plans are not used in this run — track as follow-up for Holdout if Iceland fidelity is required.',
  );
  notes.push(
    'Review artifact frozen at materialize time; re-read blindedOption hashes after server restart in blind review session before sign-off.',
  );

  return {
    instanceId: 'E1-CAL-03-REAL-MULTI',
    verdict: deriveVerdict(checks, notes),
    checks,
    notes,
    artifactPaths: {
      input: path.join(dir, 'input.json'),
      authorityResponse: path.join(dir, 'authority-response.json'),
      materializeResult: path.join(dir, 'materialize-result.json'),
    },
  };
}

async function reviewSameWinner(benchmarkRunId: string): Promise<InstanceReview> {
  const dir = instanceArtifactDir(benchmarkRunId, 'E1-CAL-01-SAME-WINNER');
  const materialize = await readArtifact<{
    excluded?: number;
    materialized?: unknown[];
    skipped?: Array<{ reason?: string }>;
  }>(path.join(dir, 'materialize-result.json'));

  const shadowPath = path.join(dir, 'shadow-event.json');
  const hasShadow = await artifactExists(shadowPath);

  const checks: CheckRow[] = [
    {
      id: 'shadow-persisted',
      description: 'Comparison shadow event artifact persisted',
      passed: hasShadow,
    },
    {
      id: 'materialize-excluded',
      description: 'Materialize skipped with SAME_WINNER (not queued for blind review)',
      passed:
        (materialize?.excluded ?? 0) >= 1 &&
        materialize?.skipped?.some((s) => s.reason === 'SAME_WINNER') === true,
    },
    {
      id: 'not-materialized',
      description: 'No review case created (materialized list empty)',
      passed: (materialize?.materialized?.length ?? 0) === 0,
    },
  ];

  return {
    instanceId: 'E1-CAL-01-SAME-WINNER',
    verdict: deriveVerdict(checks, []),
    checks,
    notes: [
      'Benchmark execution COMPLETED with reviewDisposition=EXCLUDED and exclusionReason=SAME_WINNER — does not count toward failure rate.',
    ],
    artifactPaths: {
      shadowEvent: shadowPath,
      materializeResult: path.join(dir, 'materialize-result.json'),
    },
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const reportsDir = path.join(
    process.cwd(),
    'artifacts/task-e1-benchmark',
    opts.benchmarkRunId,
    'reports',
  );

  const smokeSummaryPath = path.join(reportsDir, 'calibration-smoke-summary.json');
  let smokePassed = false;
  try {
    const summary = JSON.parse(await fs.readFile(smokeSummaryPath, 'utf8')) as { passed?: boolean };
    smokePassed = summary.passed === true;
  } catch {
    log('Warning: calibration-smoke-summary.json missing or unreadable');
  }

  const instances = await Promise.all([
    reviewDiffWinner(opts.benchmarkRunId),
    reviewRealMulti(opts.benchmarkRunId),
    reviewSameWinner(opts.benchmarkRunId),
  ]);

  const overallVerdict: ReviewVerdict = instances.some((i) => i.verdict === 'FAIL')
    ? 'FAIL'
    : instances.some((i) => i.verdict === 'PASS_WITH_NOTES')
      ? 'PASS_WITH_NOTES'
      : 'PASS';

  const payloadWithoutHash = {
    schemaId: 'tripnara.e1_manual_evidence_review@v1',
    benchmarkRunId: opts.benchmarkRunId,
    reviewedAt: new Date().toISOString(),
    reviewer: opts.reviewer,
    gitCommit: resolveGitCommit(),
    smokeAutomatedPass: smokePassed,
    overallVerdict,
    readyForFreeze: overallVerdict !== 'FAIL' && smokePassed,
    instances,
    formalChain: {
      order: [
        'manual_evidence_review',
        'post_migration_rds_baseline_snapshot',
        'freeze_manifest',
        'git_tag_decision-benchmark-calibration-v1',
        'new_15_instance_calibration_run_from_tag',
      ],
      note: 'If code changes after this review, re-run fault injection 29/29, 3-instance smoke, and this review before tag.',
    },
  };

  const payload = {
    ...payloadWithoutHash,
    reviewHash: hashJson(payloadWithoutHash),
  };

  const outPath = path.join(reportsDir, 'manual-evidence-review.json');
  await fs.mkdir(reportsDir, { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(payload, null, 2));

  log(`Review → ${outPath}`);
  log(`Overall: ${overallVerdict} (readyForFreeze=${payload.readyForFreeze})`);
  for (const inst of instances) {
    log(`  ${inst.instanceId}: ${inst.verdict}`);
  }

  if (overallVerdict === 'FAIL') process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
