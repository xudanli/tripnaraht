#!/usr/bin/env npx ts-node
/**
 * Analyze CGUS replay report for MC rank authority metrics.
 *
 * Usage:
 *   npx ts-node --transpile-only scripts/analyze-cgus-mc-rerank-replay.ts artifacts/cgus-replay.off.json artifacts/cgus-replay.on.json
 */
import fs from 'fs';

type RankAuthority = {
  deterministicTopId?: string;
  mcTopId?: string;
  sameWinner: boolean;
  sampleOk: boolean;
  confidenceOk: boolean;
  marginOk: boolean;
  mcEligibleForRerank: boolean;
  rerankEnabled: boolean;
  winnerSource: 'deterministic' | 'mc' | 'fallback';
  winnerChanged: boolean;
  eligibleButUnchanged?: boolean;
  winnerLockedButTopNChanged?: boolean;
  marginBlockedFlip?: boolean;
  topMargin?: number;
  topCiWidth?: number;
};

type Report = {
  generatedAt: string;
  n: number;
  env?: Record<string, any>;
  results: Array<{
    id: string;
    title: string;
    rankAuthority?: RankAuthority;
  }>;
};

function readReport(p: string): Report {
  const raw = fs.readFileSync(p, 'utf-8');
  return JSON.parse(raw) as Report;
}

function pct(n: number, d: number): number {
  return d === 0 ? 0 : n / d;
}

function summarize(report: Report) {
  const rows = report.results.map((r) => r.rankAuthority).filter(Boolean) as RankAuthority[];
  const total = rows.length;
  const disagreements = rows.filter((r) => (r.deterministicTopId ?? '') !== (r.mcTopId ?? '')).length;
  const eligible = rows.filter((r) => r.mcEligibleForRerank).length;
  const winnerChanged = rows.filter((r) => r.winnerChanged).length;
  const changedSmallMargin = rows.filter((r) => r.winnerChanged && (r.topMargin ?? 0) < 0.05).length;
  // Backward compat: older reports may have eligibleButUnchanged precomputed.
  // New semantics: margin gate is a winner-flip stabilizer, not an eligibility gate.
  // So "eligible but unchanged" includes both "sameWinner" and "margin blocked" cases.
  const eligibleButUnchanged = rows.filter((r) => {
    if ((r as any).eligibleButUnchanged === true) return true;
    return r.rerankEnabled && r.mcEligibleForRerank && (!r.marginOk || r.sameWinner) && r.winnerSource !== 'fallback';
  }).length;
  const changedWideCi = rows.filter((r) => r.winnerChanged && (r.topCiWidth ?? 0) > 0.1).length;
  const winnerLockedButTopNChanged = rows.filter((r) => r.winnerLockedButTopNChanged === true).length;
  const marginBlockedFlip = rows.filter((r) => r.marginBlockedFlip === true).length;

  const winnerSourceCounts = rows.reduce(
    (acc, r) => {
      acc[r.winnerSource] = (acc[r.winnerSource] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return {
    generatedAt: report.generatedAt,
    n: report.n,
    totalCasesWithRankAuthority: total,
    metrics: {
      deterministicTopNotEqualMcTop: { count: disagreements, ratio: pct(disagreements, total) },
      mcEligibleForRerank: { count: eligible, ratio: pct(eligible, total) },
      winnerChanged: { count: winnerChanged, ratio: pct(winnerChanged, total) },
      winnerChangedWithSmallMarginLt005: { count: changedSmallMargin, ratio: pct(changedSmallMargin, total) },
      winnerChangedWithWideCiGt01: { count: changedWideCi, ratio: pct(changedWideCi, total) },
      eligibleButUnchanged: { count: eligibleButUnchanged, ratio: pct(eligibleButUnchanged, total) },
      winnerLockedButTopNChanged: { count: winnerLockedButTopNChanged, ratio: pct(winnerLockedButTopNChanged, total) },
      marginBlockedFlip: { count: marginBlockedFlip, ratio: pct(marginBlockedFlip, total) },
    },
    winnerSourceCounts,
    env: report.env ?? {},
  };
}

function main() {
  const paths = process.argv.slice(2).filter(Boolean);
  if (paths.length === 0) {
    // eslint-disable-next-line no-console
    console.error('Usage: analyze-cgus-mc-rerank-replay.ts <report.json> [report2.json]');
    process.exit(1);
  }

  const summaries = paths.map((p) => ({ path: p, summary: summarize(readReport(p)) }));
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ summaries }, null, 2));
}

main();

