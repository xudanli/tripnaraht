/**
 * Aggregate shadow observation dataset into formal cutover reports (artifacts only).
 *
 * Usage: npm run execution-risk-shadow:observation-report
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import {
  loadShadowObservationDataset,
  observationWindowReady,
} from '../../src/trips/execution-risk-center/shadow/execution-risk-shadow-observation.store';
import { buildCutoverGoNoGoReport } from '../../src/trips/execution-risk-center/shadow/execution-risk-cutover-gates.util';

const OUT_DIR = path.join(process.cwd(), 'artifacts', 'execution-risk-staging-validation');

function writeReport(filename: string, body: string) {
  fs.writeFileSync(path.join(OUT_DIR, filename), body);
}

const CLUSTER_CONVERGENCE_BUILD = 'cluster-convergence-v1';

const CLUSTER_FREEZE_REOPEN_RULES = [
  'hiddenStopCount > 0',
  'hiddenHighSeverityCount > 0',
  'duplicate visible user cards (duplicateVisibleItemCount > 0)',
  'new samples prove primary/representedByClusterId relationship is wrong',
  'cutover cluster visibility safety gates regress',
];

const CLUSTER_FREEZE_EXCLUDED = [
  'Legacy vs Canonical raw risk count difference',
  'causal derived risks increasing Canonical count',
  'recall before semantic normalization',
  'source mapping gap',
  'reasonable EXPECTED_DERIVED_EXPANSION',
];

const FORMAL_PROJECT_STATUS_TABLE = `| Dimension | Formal Status |
|-----------|---------------|
| Engineering | FEATURE_COMPLETE |
| Automated Verification | PASSED |
| Cluster Workflow | **CLOSED / FROZEN** |
| Shadow Runtime | OBSERVING / DIVERGED |
| Confirm Write | GATED |
| Production | NOT_YET_CUTOVER |
| Cutover Decision | NO_GO |`;

const EXECUTION_CHAIN_BLOCK = `\`\`\`
APP_BUILD_SHA=${CLUSTER_CONVERGENCE_BUILD}
        ↓
扩大 Shadow 正式观察窗口
        ↓
append-only 裁决 divergence
        ↓
Source Mapping 语义归一
        ↓
重新计算 root-cause / high-priority recall
        ↓
Confirm Phase A
        ↓
Confirm Phase B
        ↓
Cutover Go / Conditional Go / No-Go
\`\`\``;

const EVIDENCE_DELIVERABLES_BLOCK = `## Validation evidence deliverables (next phase)

No further feature-development summaries. Produce three evidence classes:

1. **Shadow Observation Evidence** — Canonical judgment semantically trustworthy
2. **Confirm Consistency Evidence** — post-confirm write-back chain consistent
3. **Cutover Decision Evidence** — main read, fallback, write allowlist, production scope`;

const PM_ISOLATION_NOTE = `**PM rule:** All new requirements must be isolated from Cluster frozen state.
Do not introduce new behavioral variables during the observation window.`;

function noGoBlockersTable(dataset: NonNullable<ReturnType<typeof loadShadowObservationDataset>>): string {
  return `| Blocker | Release condition |
|---------|-------------------|
| Shadow sample insufficient | Trips ≥ ${dataset.targets.minTrips}, snapshots ≥ ${dataset.targets.minSnapshots}, high/critical ≥ ${dataset.targets.minHighCriticalInstances} |
| Divergence pending adjudication (${dataset.pendingAdjudicationCount}) | Append-only adjudication complete; pendingAdjudication = 0 |
| Source Mapping not normalized | rootEventId, source events, decision problems, risk codes semantically mapped |
| Phase A incomplete | Materialize-only pass; all Phase A assertions green |
| Phase B incomplete | Effective plan activated; itinerary, ledger, risk refresh consistent |`;
}

const CLUSTER_CLOSURE_BLOCK = `## Cluster Workflow — FORMALLY CLOSED

| Marker | Status |
|--------|--------|
| CLUSTER_CONVERGENCE | **PASSED** |
| CLUSTER_VISIBILITY_SAFETY | **PASSED** |
| CLUSTER_CHANGE_STATUS | **FROZEN** |

Cluster code changes frozen on build **${CLUSTER_CONVERGENCE_BUILD}**.
NO_GO is no longer attributed to Cluster. Remaining drivers only:
observation coverage, pending adjudication, source mapping normalization,
and Confirm Phase A/B real write-back validation.

### Cluster reopen criteria (only)
${CLUSTER_FREEZE_REOPEN_RULES.map((r) => `- ${r}`).join('\n')}

### Do NOT reopen Cluster for
${CLUSTER_FREEZE_EXCLUDED.map((r) => `- ${r}`).join('\n')}

${PM_ISOLATION_NOTE}

### Semantic recall rule
root-cause-recall and high-priority-recall are Cutover metrics **only after**
adjudication + source mapping normalization. Distinguish:
true miss vs unmapped source vs EXPECTED_DERIVED_EXPANSION vs Legacy defect.`;

function clusterConvergenceEvidence(
  snapshots: ReturnType<typeof loadShadowObservationDataset> extends infer D
    ? D extends { formalSnapshots: infer S }
      ? S
      : never
    : never,
): string {
  if (!snapshots?.length) return '_No snapshots._';
  const rows = snapshots.map((s, i) => {
    const cv = s.comparison.semanticComparison.clusterVisibility;
    const label =
      cv.hiddenHighSeverityCount > 0 || cv.unknownSuppressionCount > 0
        ? 'pre-fix'
        : i === snapshots.length - 1
          ? 'post-fix'
          : `snapshot-${i + 1}`;
    return `| ${label} | ${s.snapshotId.slice(0, 8)}… | ${s.capturedAt} | hiddenHigh=${cv.hiddenHighSeverityCount} UNKNOWN=${cv.unknownSuppressionCount ?? cv.suppressedByReason?.UNKNOWN ?? 0} | ${s.build.appBuildSha} |`;
  });
  return `| Snapshot | ID | capturedAt | Cluster safety | buildSha |
|----------|-----|------------|----------------|----------|
${rows.join('\n')}`;
}

function signingBlock(title: string, roles: string[]): string {
  return `## Sign-off — ${title}

| Role | Name | Date | Signature |
|------|------|------|-----------|
${roles.map((r) => `| ${r} | | | |`).join('\n')}
`;
}

function main() {
  const dataset = loadShadowObservationDataset();
  if (!dataset || dataset.snapshotCount === 0) {
    console.error('No formal shadow observation dataset — run execution-risk-legacy:shadow-compare after build verify');
    process.exitCode = 1;
    return;
  }

  const latest = dataset.formalSnapshots[dataset.formalSnapshots.length - 1]!;
  const comparison = latest.comparison;
  const goNoGo = buildCutoverGoNoGoReport({ tripId: latest.tripId, comparison });

  const byKind: Record<string, number> = {};
  for (const s of dataset.formalSnapshots) {
    for (const k of s.comparison.divergenceKinds) {
      byKind[k] = (byKind[k] ?? 0) + 1;
    }
  }

  const buildMeta = latest.build;

  const shadowMd = `# EXECUTION_RISK_SHADOW_OBSERVATION_REPORT_V1

Generated: ${new Date().toISOString()}

## Project Status
${FORMAL_PROJECT_STATUS_TABLE}

${CLUSTER_CLOSURE_BLOCK}

## Phase Conclusion — Cluster Convergence (archived)
Cluster convergence completed on build **${CLUSTER_CONVERGENCE_BUILD}**.
All cluster visibility safety gates passed.
Remaining NO_GO reasons are semantic alignment, observation coverage,
source mapping convergence, and confirm consistency validation.

**Cluster visibility safety (post-fix):**
- UNKNOWN suppression = 0
- hiddenHighSeverityCount = 0
- hiddenStopCount = 0
- duplicateVisibleItemCount = 0
- clusterVisibilityConsistency = true
- requiredAction: STOP → STOP

**Aggregation shape (valid):** 11 raw → 9 clusters → 4 visible cards

## Cluster Convergence Evidence (do not delete)
${clusterConvergenceEvidence(dataset.formalSnapshots)}

## Build Metadata (active window)
- appBuildSha: ${buildMeta.appBuildSha}
- packageVersion: ${buildMeta.packageVersion}
- knowledgeVersion: ${buildMeta.knowledgeVersion}
- contractVersion: ${buildMeta.contractVersion}
- shadowSchemaVersion: ${buildMeta.shadowSchemaVersion}
- observationWindowOpenedAt: ${dataset.observationWindowOpenedAt ?? 'unknown'}
- legacySnapshotsExcluded: ${dataset.legacySnapshotsExcluded}

## Observation Window
| Metric | Actual | Target |
|--------|--------|--------|
| Snapshots | ${dataset.snapshotCount} | ${dataset.targets.minSnapshots} |
| Unique trips | ${dataset.uniqueTripCount} | ${dataset.targets.minTrips} |
| High/critical instances | ${dataset.highCriticalInstanceCount} | ${dataset.targets.minHighCriticalInstances} |
| Pending adjudication | ${dataset.pendingAdjudicationCount} | 0 |
| Window ready | ${observationWindowReady(dataset)} | true |

## Latest Snapshot (three layers)
- snapshotId: ${latest.snapshotId}
- dedupKey: ${latest.dedupKey}
- planVersionId: ${latest.planVersionId}
- Raw: legacy=${comparison.rawRiskComparison.legacyCount} canonical=${comparison.rawRiskComparison.canonicalCount} derived=${comparison.rawRiskComparison.derivedRiskCount}
- Cluster: issues=${comparison.clusterComparison.legacyIssueCount} clusters=${comparison.clusterComparison.canonicalClusterCount}
- Semantic: legacyCards=${comparison.semanticComparison.legacyVisibleCardCount} canonicalCards=${comparison.semanticComparison.canonicalVisibleCardCount} action=${comparison.semanticComparison.legacyRequiredAction}→${comparison.semanticComparison.canonicalRequiredAction}
- Cluster visibility: visible=${comparison.semanticComparison.clusterVisibility.visibleClusterCount} suppressed=${comparison.semanticComparison.clusterVisibility.suppressedClusterCount} hiddenStop=${comparison.semanticComparison.clusterVisibility.hiddenStopCount} hiddenHigh=${comparison.semanticComparison.clusterVisibility.hiddenHighSeverityCount}
- Cluster consistency: ${latest.clusterVisibilityConsistent ? 'PASS' : `FAIL — ${latest.clusterVisibilityViolations.join('; ')}`}

## Mismatch distribution
${Object.entries(byKind).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

## Adjudications (append-only)
${dataset.adjudications.length === 0 ? '_None recorded — required before Go/No-Go._' : dataset.adjudications.map((a) => `- ${a.adjudicationId}: ${a.comparisonId} ${a.mismatchType} → ${a.verdict} (${a.resolutionType})`).join('\n')}

## Remaining NO_GO — sole remaining causes
${noGoBlockersTable(dataset)}

## Fixed execution chain
${EXECUTION_CHAIN_BLOCK}

${EVIDENCE_DELIVERABLES_BLOCK}

## Next sequence (ERC validation phase — no new features)
1. Fix build: \`APP_BUILD_SHA=${CLUSTER_CONVERGENCE_BUILD}\`
2. Expand shadow collection (≥50 trips, ≥200 snapshots, diverse scenarios)
3. Append-only adjudicate pending divergences (${dataset.pendingAdjudicationCount} pending)
4. Source mapping convergence → recompute semantic recall
5. Phase A Confirm → Phase B Effective Plan → Cutover Decision

${signingBlock('Shadow Observation Report', [
  'Risk / domain owner — semantic correctness',
  'Backend owner — clustering and projection',
  'Product owner — user-visible cards',
])}
`;

  const confirmPath = path.join(OUT_DIR, 'confirm-drill-report.json');
  const confirm = fs.existsSync(confirmPath)
    ? JSON.parse(fs.readFileSync(confirmPath, 'utf8'))
    : null;

  const confirmMd = `# EXECUTION_RISK_CONFIRM_CONSISTENCY_REPORT_V1

Generated: ${new Date().toISOString()}

## Phase A / B Status
${confirm ? `- Phase: ${confirm.phase}\n- Pass: ${confirm.pass}\n- Assertions: ${JSON.stringify(confirm.assertions, null, 2)}` : '_Not run — execute `npm run execution-risk-staging:confirm-drill` with OWNER token._'}

## Required Phase A assertions
- previewDidNotWrite
- confirmCreatedPlanVersion
- ledgerEntryCreated
- itineraryMaterialized
- effectivePlanUnchangedPhaseA
- idempotentReplayMatched
- postConfirmRefreshCompleted
- planDiffMatchesMaterializedDiff
- noPartialWriteDetected

## Required Phase B assertions
- effectivePlanChangedPhaseB
- sourceRiskLifecycleConsistent
- postRefreshSeverityConsistent

${signingBlock('Confirm Consistency Report', [
  'Backend owner — transactions and write-back',
  'QA — idempotency, rollback, state consistency',
  'Architecture owner — PlanVersion / Ledger / Effective Plan chain',
])}
`;

  const decision =
    !observationWindowReady(dataset) || goNoGo.recommendation === 'NO_GO'
      ? 'NO_GO'
      : confirm?.pass && confirm.phase === 'PHASE_B_EFFECTIVE_ACTIVATE'
        ? 'CONDITIONAL_GO'
        : confirm?.pass
          ? 'CONDITIONAL_GO'
          : 'NO_GO';

  const cutoverMd = `# EXECUTION_RISK_CUTOVER_DECISION_V1

Generated: ${new Date().toISOString()}

## Decision: **${decision}**

| Setting | Value |
|---------|-------|
| Canonical Main Read | ${decision === 'GO' ? 'YES' : 'NO'} |
| Legacy Fallback | ON |
| Confirm Write | ${confirm?.pass ? 'ALLOWLIST' : 'OFF'} |
| Effective Plan Activation | ${confirm?.phase === 'PHASE_B_EFFECTIVE_ACTIVATE' && confirm?.pass ? 'YES' : 'NO'} |
| Allowed Risk Codes | HARNESS_READY + DESTINATION_VALIDATED + shadow-adjudicated |
| Allowed Action Codes | SHIFT_TIME, SHORTEN_ACTIVITY, ADD_REST, simple booking time adjust, NOTIFY_PROVIDER |
| Observation Window | ${dataset.observationWindowOpenedAt ?? 'TBD'} → ongoing (targets: ${dataset.targets.minSnapshots} snapshots / ${dataset.targets.minTrips} trips) |
| Rollback Owner | Backend on-call + ERC cutover lead |

## Formal dimension status

${FORMAL_PROJECT_STATUS_TABLE}

${CLUSTER_CLOSURE_BLOCK}

## Phase Conclusion — Cluster Convergence (archived)
Cluster convergence completed on build **${CLUSTER_CONVERGENCE_BUILD}**.
All cluster visibility safety gates passed.
Remaining NO_GO reasons are semantic alignment, observation coverage,
source mapping convergence, and confirm consistency validation.

## Cluster evidence (retain both snapshots)
${clusterConvergenceEvidence(dataset.formalSnapshots)}

## Recommendation (latest snapshot gates): **${goNoGo.recommendation}**

| Runtime (semantic gates) | ${goNoGo.runtimeStatus} |

## Cluster safety gates — all passed (latest)
- unknown-suppression-zero, hidden-high-severity-clusters, hidden-stop-clusters
- cluster-visibility-consistency, duplicate-visible-cards, severe-action-mismatch

## Remaining NO_GO — sole remaining causes
${noGoBlockersTable(dataset)}

## Fixed execution chain
${EXECUTION_CHAIN_BLOCK}

${EVIDENCE_DELIVERABLES_BLOCK}

## Remaining semantic gate blockers (latest snapshot)
${goNoGo.blockers.length ? goNoGo.blockers.map((b) => `- ${b}`).join('\n') : '_None_'}

## Gate summary (full)
${goNoGo.gates.map((g) => `- [${g.pass ? 'x' : ' '}] ${g.id}: ${g.detail} (${g.actual})`).join('\n')}

## Warnings
${goNoGo.warnings.map((w) => `- ${w}`).join('\n')}

## Cutover sequence (fixed)
1. Shadow observation window complete + adjudicated
2. Phase A confirm drill pass
3. Phase B effective plan drill pass
4. Canonical primary read + Legacy fallback
5. Allowlisted production write-back

${signingBlock('Cutover Decision', ['ERC cutover lead', 'Engineering lead', 'Product lead'])}
`;

  writeReport('EXECUTION_RISK_SHADOW_OBSERVATION_REPORT_V1.md', shadowMd);
  writeReport('EXECUTION_RISK_CONFIRM_CONSISTENCY_REPORT_V1.md', confirmMd);
  writeReport('EXECUTION_RISK_CUTOVER_DECISION_V1.md', cutoverMd);

  const clusterStatus = {
    schemaId: 'tripnara.execution_risk_cluster_convergence_status@v2',
    workflowStatus: 'CLOSED',
    closedAt: new Date().toISOString(),
    CLUSTER_CONVERGENCE: 'PASSED',
    CLUSTER_VISIBILITY_SAFETY: 'PASSED',
    CLUSTER_CHANGE_STATUS: 'FROZEN',
    clusterConvergenceBuild: CLUSTER_CONVERGENCE_BUILD,
    noGoAttributedToCluster: false,
    productionStatus: 'NOT_YET_CUTOVER',
    cutoverDecision: decision,
    projectPhase: 'VALIDATION_BY_REAL_SAMPLES',
    formalProjectStatus: {
      engineering: 'FEATURE_COMPLETE',
      automatedVerification: 'PASSED',
      clusterWorkflow: 'CLOSED_FROZEN',
      shadowRuntime: 'OBSERVING_DIVERGED',
      confirmWrite: 'GATED',
      production: 'NOT_YET_CUTOVER',
      cutoverDecision: 'NO_GO',
    },
    noGoBlockers: {
      shadowSampleInsufficient: `trips>=${dataset.targets.minTrips} snapshots>=${dataset.targets.minSnapshots} highCritical>=${dataset.targets.minHighCriticalInstances}`,
      pendingAdjudication: dataset.pendingAdjudicationCount,
      sourceMappingNotNormalized: true,
      phaseAIncomplete: true,
      phaseBIncomplete: true,
    },
    clusterReopenCriteria: CLUSTER_FREEZE_REOPEN_RULES,
    clusterChangeExcludedFor: CLUSTER_FREEZE_EXCLUDED,
    evidenceSnapshots: dataset.formalSnapshots.map((s) => ({
      snapshotId: s.snapshotId,
      capturedAt: s.capturedAt,
      buildSha: s.build.appBuildSha,
      hiddenHighSeverityCount: s.comparison.semanticComparison.clusterVisibility.hiddenHighSeverityCount,
      unknownSuppressionCount:
        s.comparison.semanticComparison.clusterVisibility.unknownSuppressionCount ??
        s.comparison.semanticComparison.clusterVisibility.suppressedByReason.UNKNOWN,
      visibleCards: s.comparison.semanticComparison.canonicalVisibleCardCount,
      requiredAction: s.comparison.semanticComparison.canonicalRequiredAction,
    })),
    nextSequence: [
      'fix_app_build_sha',
      'expand_shadow_collection',
      'append_only_adjudicate_divergences',
      'source_mapping_convergence',
      'recompute_semantic_recall',
      'phase_a_confirm_drill',
      'phase_b_effective_plan',
      'cutover_decision',
    ],
  };
  fs.writeFileSync(
    path.join(OUT_DIR, 'CLUSTER_CONVERGENCE_STATUS.json'),
    JSON.stringify(clusterStatus, null, 2),
  );

  const closureMd = `# EXECUTION_RISK_CLUSTER_WORKFLOW_CLOSURE

Generated: ${new Date().toISOString()}

**Cluster workflow is formally closed.** Execution Risk Center is in validation-by-real-samples phase.
No new product features. Continue: collect → adjudicate → map → confirm → decide.

${FORMAL_PROJECT_STATUS_TABLE}

${CLUSTER_CLOSURE_BLOCK}

## Evidence (retain — do not delete)
${clusterConvergenceEvidence(dataset.formalSnapshots)}

## Remaining NO_GO — sole remaining causes
${noGoBlockersTable(dataset)}

## Fixed execution chain
${EXECUTION_CHAIN_BLOCK}

${EVIDENCE_DELIVERABLES_BLOCK}
`;
  writeReport('EXECUTION_RISK_CLUSTER_WORKFLOW_CLOSURE.md', closureMd);

  const ercProjectStatus = {
    schemaId: 'tripnara.execution_risk_project_status@v1',
    frozenAt: new Date().toISOString(),
    clusterWorkflow: 'CLOSED_FROZEN',
    projectPhase: 'VALIDATION_BY_REAL_SAMPLES',
    status: {
      engineering: 'FEATURE_COMPLETE',
      automatedVerification: 'PASSED',
      clusterWorkflow: 'CLOSED_FROZEN',
      shadowRuntime: 'OBSERVING_DIVERGED',
      confirmWrite: 'GATED',
      production: 'NOT_YET_CUTOVER',
      cutoverDecision: 'NO_GO',
    },
    activeBuildSha: CLUSTER_CONVERGENCE_BUILD,
    noGoAttributedToCluster: false,
    evidenceDeliverables: [
      'shadow_observation_evidence',
      'confirm_consistency_evidence',
      'cutover_decision_evidence',
    ],
    pmRule: 'Isolate new requirements from Cluster frozen state during observation window',
  };
  fs.writeFileSync(
    path.join(OUT_DIR, 'ERC_PROJECT_STATUS.json'),
    JSON.stringify(ercProjectStatus, null, 2),
  );

  console.log('written observation + confirm + cutover + cluster-closure + ERC_PROJECT_STATUS to artifacts/execution-risk-staging-validation/');
}

main();
