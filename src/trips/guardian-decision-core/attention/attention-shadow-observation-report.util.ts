/**
 * Markdown observation report for Shadow Exit review.
 */

import type { AttentionShadowObservationSummary } from '../contracts/attention-orchestration.types';

export function renderAttentionShadowObservationReport(
  summary: AttentionShadowObservationSummary,
): string {
  const failures = summary.adjudicationResults.filter((r) => !r.pass);
  const priorityFailures = summary.adjudicationResults.filter((r) => r.priorityFailure);

  const lines: string[] = [
    '# Slice 4 — Attention Shadow Observation Report',
    '',
    `**Generated:** ${summary.generatedAt}`,
    `**Commit SHA:** ${summary.commitSha ?? '_pending_'}`,
    `**Feature flag:** \`${summary.featureFlag}\``,
    '',
    '## Status',
    '',
    '| Gate | Value |',
    '|------|-------|',
    '| Slice 4 Shadow Engineering Closure | **PASS** |',
    '| Slice 4 Observation Closure | **PENDING** |',
    '| Slice 4 Visible Projection Cutover | **NOT ELIGIBLE** |',
    '',
    '## Sample Coverage',
    '',
    `| Metric | Count |`,
    `|--------|-------|`,
    `| Total samples | ${summary.sampleCount} |`,
    `| Deterministic | ${summary.deterministicCount} |`,
    `| Staging replay | ${summary.stagingReplayCount} |`,
    '',
    '## Verdict Counts',
    '',
    '| Verdict | Count |',
    '|---------|-------|',
  ];

  for (const [verdict, count] of Object.entries(summary.verdictCounts)) {
    lines.push(`| ${verdict} | ${count} |`);
  }

  lines.push('', '## Rates', '', '| Metric | Rate |', '|--------|------|');
  const r = summary.rates;
  lines.push(`| falseMergeRate | ${pct(r.falseMergeRate)} |`);
  lines.push(`| missedMergeRate | ${pct(r.missedMergeRate)} |`);
  lines.push(`| wrongPrimaryRate | ${pct(r.wrongPrimaryRate)} |`);
  lines.push(`| wrongAttentionRate | ${pct(r.wrongAttentionRate)} |`);
  lines.push(`| wrongResolutionRate | ${pct(r.wrongResolutionRate)} |`);
  lines.push(`| duplicateReductionRate | ${pct(r.duplicateReductionRate)} |`);
  lines.push(`| resolutionAccuracyRate | ${pct(r.resolutionAccuracyRate)} |`);
  lines.push(`| passRate | ${pct(r.passRate)} |`);
  lines.push(`| underlyingProblemsPreservedRate | ${pct(r.underlyingProblemsPreservedRate)} |`);

  lines.push('', '## Exit Criteria', '', '| Criterion | Target | Actual | Pass |', '|-----------|--------|--------|------|');
  for (const [key, val] of Object.entries(summary.exitCriteria)) {
    lines.push(`| ${key} | ${val.target} | ${formatActual(val.actual)} | ${val.pass ? '✅' : '❌'} |`);
  }

  lines.push('', `## GO / NO-GO Recommendation: **${summary.goNoGo}**`, '');

  if (priorityFailures.length > 0) {
    lines.push('## Priority Failures (FALSE_MERGE / WRONG_PRIMARY / WRONG_ATTENTION / WRONG_RESOLUTION)', '');
    for (const f of priorityFailures) {
      lines.push(`- **${f.sampleId}**: ${f.reason}`);
    }
    lines.push('');
  }

  if (failures.length > 0) {
    lines.push('## Failed Samples', '');
    for (const f of failures) {
      lines.push(`- **${f.sampleId}** (${f.expected.group}): ${f.reason}`);
    }
    lines.push('');
  }

  lines.push(
    '## Dependencies',
    '',
    '- `ATTENTION_ROOT_CAUSE_PRIMARY_SSO=1` **BLOCKED** until Slice 3 CLOSED',
    '- Visible queue / notifications remain **unchanged**',
    '',
    '## Recommended Cutover Sequence (post-exit)',
    '',
    '1. Shadow only',
    '2. Internal dual-read',
    '3. Internal primary projection',
    '4. Allowlist canary',
    '5. Visible queue cutover',
    '',
  );

  return lines.join('\n');
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function formatActual(n: number): string {
  if (n <= 1 && n >= 0) return pct(n);
  return String(n);
}
