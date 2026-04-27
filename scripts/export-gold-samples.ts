import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { extractNarratorDatasetFromRun, toJsonlV1 } from '../src/agent/cbr/narrator-dataset-extractor.util';
import { buildConflictStateGraph, evaluateGraphEfficiency } from '../src/agent/cbr/conflict-state-graph.util';
import { persistDecisionIntelligenceRows, persistGoldCasesFromRuns } from './persist-decision-export';

type RawRun = {
  request_id?: string;
  audit_report: any;
  decision_log: any[];
  /** Optional: `route_and_run` payload.decision_metadata (evidence_cards, …) */
  decision_metadata?: Record<string, unknown>;
};

function findPersuasionLatencyEventSpan(decision_log: any[]): number | undefined {
  const log = Array.isArray(decision_log) ? decision_log : [];
  const ewIdx = log.findIndex((e) =>
    ['EARLY_WARNING', 'EARLY_WARNING_INTERCEPT'].includes(String(e?.metadata?.system_action ?? '')),
  );
  if (ewIdx < 0) return undefined;
  const posIdx = log.findIndex(
    (e, i) =>
      i > ewIdx &&
      String(e?.metadata?.system_action ?? '') === 'CLARIFICATION_FEEDBACK' &&
      Number((e?.metadata as any)?.reward ?? 0) > 0,
  );
  if (posIdx < 0) return undefined;
  return posIdx - ewIdx;
}

function isHardNodeFromAuditReport(ar: any): boolean {
  if (typeof ar?.physical_bottleneck?.is_hard === 'boolean') return ar.physical_bottleneck.is_hard;
  const cid = String(ar?.physical_bottleneck?.primary_violation_type ?? '');
  return /HARD|ADMISS|REACHABILITY/i.test(cid);
}

function parseArgs(argv: string[]): {
  input: string;
  outDir: string;
  minShown: number;
  emitGraph: boolean;
  persist: boolean;
  groupBy?: 'cid';
} {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : 'true';
    args.set(key, val);
  }
  return {
    input: args.get('input') ?? 'raw_logs.json',
    outDir: args.get('outDir') ?? 'artifacts/narrator-dataset',
    minShown: parseInt(args.get('minShown') ?? '3', 10),
    emitGraph: args.get('emitGraph') === 'true' || args.get('emitGraph') === '1',
    persist: args.get('persist') === 'true' || args.get('persist') === '1',
    groupBy: args.get('groupBy') === 'cid' ? 'cid' : undefined,
  };
}

function toDpoJsonl(rows: ReturnType<typeof extractNarratorDatasetFromRun>): string {
  const dpo = rows.map((r) => ({
    prompt: r.prompt,
    chosen: r.chosen,
    rejected: r.rejected,
    metadata: {
      label: r.metadata.label,
      ...(typeof r.metadata.reward === 'number' ? { reward: r.metadata.reward } : {}),
      ...(r.metadata.early_warning_id ? { early_warning_id: r.metadata.early_warning_id } : {}),
      ...(r.metadata.dominant_cid ? { dominant_cid: r.metadata.dominant_cid } : {}),
      ...(typeof r.metadata.precedent_n === 'number' ? { precedent_n: r.metadata.precedent_n } : {}),
      ...(typeof r.metadata.wall_hit_distance_ms === 'number'
        ? { wall_hit_distance: `${Math.round(r.metadata.wall_hit_distance_ms / 1000)}s` }
        : {}),
      ...(r.metadata.persuasion_tier != null ? { persuasion_tier: r.metadata.persuasion_tier } : {}),
      ...(r.metadata.decision_metadata != null ? { decision_metadata: r.metadata.decision_metadata } : {}),
    },
  }));
  return dpo.map((x) => JSON.stringify(x)).join('\n') + (dpo.length ? '\n' : '');
}

async function main() {
  const { input, outDir, minShown, emitGraph, persist, groupBy } = parseArgs(process.argv.slice(2));
  const inPath = resolve(process.cwd(), input);
  const outBase = resolve(process.cwd(), outDir);

  let rawText: string;
  try {
    rawText = await readFile(inPath, 'utf8');
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException;
    if (err?.code === 'ENOENT') {
      throw new Error(
        `Input file not found: ${inPath}\n` +
          `  Expected a JSON array of { request_id?, audit_report, decision_log }.\n` +
          `  Example: cp scripts/raw_logs.example.json data/raw_runs.json`,
      );
    }
    throw e;
  }
  const runs = JSON.parse(rawText) as RawRun[];
  if (!Array.isArray(runs)) throw new Error('Input JSON must be an array');

  const allRows = runs.flatMap((r) =>
    extractNarratorDatasetFromRun({
      request_id: r.request_id,
      audit_report: r.audit_report,
      decision_log: r.decision_log,
      decision_metadata: r.decision_metadata,
      min_shown_count: minShown,
    }),
  );

  const sftRows = allRows.filter((r) => r.metadata.label === 'POSITIVE_CHOSEN_TOP');

  const sftOut = toJsonlV1(sftRows);
  const dpoOut = toDpoJsonl(allRows);

  await mkdir(outBase, { recursive: true });
  const sftPath = resolve(outBase, 'gold_samples_v1_sft.jsonl');
  const dpoPath = resolve(outBase, 'gold_samples_v1_dpo.jsonl');
  await writeFile(sftPath, sftOut, 'utf8');
  await writeFile(dpoPath, dpoOut, 'utf8');

  let graphPath: string | undefined;
  let efficiencyReportPath: string | undefined;
  const shouldBuildGraph = emitGraph || persist;

  type GraphEvalRow = {
    graph: ReturnType<typeof buildConflictStateGraph>;
    eval: ReturnType<typeof evaluateGraphEfficiency>;
    metrics: {
      persuasion_latency_event_span?: number;
      is_hard: boolean;
      oscillation_escalated: boolean;
    };
  };
  let evals: GraphEvalRow[] | undefined;

  if (shouldBuildGraph) {
    const graphs = runs.map((r) =>
      buildConflictStateGraph({
        session_id: r.request_id,
        decision_log: r.decision_log as any,
        audit_report: r.audit_report as any,
        decision_metadata: r.decision_metadata,
      }),
    );
    evals = graphs.map((g, i) => {
      const run = runs[i];
      const ar = run?.audit_report;
      const log = run?.decision_log;
      const latencySpan = findPersuasionLatencyEventSpan(log);
      const hard = isHardNodeFromAuditReport(ar);
      return {
        graph: g,
        eval: evaluateGraphEfficiency(g),
        metrics: {
          persuasion_latency_event_span: latencySpan,
          is_hard: hard,
          oscillation_escalated: g.edges.some((e) => (e.tags ?? []).includes('OSCILLATION_ESCALATED')),
        },
      };
    });

    if (emitGraph) {
      graphPath = resolve(outBase, 'state_graph.jsonl');
      await writeFile(graphPath, graphs.map((g) => JSON.stringify(g)).join('\n') + (graphs.length ? '\n' : ''), 'utf8');

    const overall = {
      runs: evals.length,
      avg_persuasion_efficiency_score:
        evals.length > 0
          ? evals.reduce((s, x) => s + x.eval.persuasion_efficiency_score, 0) / evals.length
          : 0,
      avg_persuasion_latency_event_span:
        evals.filter((x) => typeof x.metrics.persuasion_latency_event_span === 'number').length > 0
          ? evals
              .filter((x) => typeof x.metrics.persuasion_latency_event_span === 'number')
              .reduce((s, x) => s + (x.metrics.persuasion_latency_event_span as number), 0) /
            evals.filter((x) => typeof x.metrics.persuasion_latency_event_span === 'number').length
          : null,
      avg_shortest_positive_path_weight:
        evals.filter((x) => typeof x.eval.shortest_positive_path_weight === 'number').length > 0
          ? evals
              .filter((x) => typeof x.eval.shortest_positive_path_weight === 'number')
              .reduce((s, x) => s + (x.eval.shortest_positive_path_weight as number), 0) /
            evals.filter((x) => typeof x.eval.shortest_positive_path_weight === 'number').length
          : null,
      hard_truth_conversion_rate: (() => {
        const hard = evals.filter((x) => x.metrics.is_hard);
        if (hard.length === 0) return null;
        const converted = hard.filter((x) => x.eval.has_conversion).length;
        return converted / hard.length;
      })(),
      oscillation_density: (() => {
        if (evals.length === 0) return 0;
        const escalated = evals.filter((x) => x.metrics.oscillation_escalated).length;
        return escalated / evals.length;
      })(),
    };

    const by_cid =
      groupBy === 'cid'
        ? Object.fromEntries(
            Object.entries(
              evals.reduce((acc: Record<string, GraphEvalRow[]>, x) => {
                const cid = String(x.graph.nodes?.[0]?.dominant_cid ?? 'UNKNOWN');
                (acc[cid] ??= []).push(x);
                return acc;
              }, {}),
            ).map(([cid, xs]) => {
              const avgScore = xs.reduce((s, a) => s + a.eval.persuasion_efficiency_score, 0) / xs.length;
              const conv = xs.filter((a) => a.eval.has_conversion).length / xs.length;
              const osc = xs.filter((a) => a.metrics.oscillation_escalated).length / xs.length;
              const hard = xs.filter((a) => a.metrics.is_hard);
              const hardConv =
                hard.length > 0 ? hard.filter((a) => a.eval.has_conversion).length / hard.length : null;
              const latXs = xs
                .map((a) => a.metrics.persuasion_latency_event_span)
                .filter((v) => typeof v === 'number') as number[];
              const lat = latXs.length > 0 ? latXs.reduce((s, v) => s + v, 0) / latXs.length : null;
              return [
                cid,
                {
                  runs: xs.length,
                  avg_persuasion_efficiency_score: avgScore,
                  avg_persuasion_latency_event_span: lat,
                  conversion_rate: conv,
                  oscillation_density: osc,
                  hard_truth_conversion_rate: hardConv,
                },
              ];
            }),
          )
        : undefined;

    const insights = (() => {
      if (!by_cid) return undefined;
      const rows = Object.entries(by_cid).map(([cid, v]) => ({ cid, ...v }));

      const bottomHard = rows
        .filter((r) => typeof (r as any).hard_truth_conversion_rate === 'number')
        .sort((a, b) => (a as any).hard_truth_conversion_rate - (b as any).hard_truth_conversion_rate)
        .slice(0, 3)
        .map((r) => ({
          cid: r.cid,
          runs: (r as any).runs,
          hard_truth_conversion_rate: (r as any).hard_truth_conversion_rate,
          avg_persuasion_latency_event_span: (r as any).avg_persuasion_latency_event_span,
          oscillation_density: (r as any).oscillation_density,
        }));

      const highLatencyHighOsc = rows
        .filter((r) => typeof (r as any).avg_persuasion_latency_event_span === 'number')
        .sort((a, b) => {
          const la = (a as any).avg_persuasion_latency_event_span as number;
          const lb = (b as any).avg_persuasion_latency_event_span as number;
          const oa = (a as any).oscillation_density as number;
          const ob = (b as any).oscillation_density as number;
          // prioritize latency, then oscillation
          return lb - la || ob - oa;
        })
        .slice(0, 3)
        .map((r) => ({
          cid: r.cid,
          runs: (r as any).runs,
          avg_persuasion_latency_event_span: (r as any).avg_persuasion_latency_event_span,
          oscillation_density: (r as any).oscillation_density,
          conversion_rate: (r as any).conversion_rate,
          hard_truth_conversion_rate: (r as any).hard_truth_conversion_rate,
        }));

      const lowConvLowOsc = rows
        .filter((r) => typeof (r as any).conversion_rate === 'number')
        .sort((a, b) => {
          const ca = (a as any).conversion_rate as number;
          const cb = (b as any).conversion_rate as number;
          const oa = (a as any).oscillation_density as number;
          const ob = (b as any).oscillation_density as number;
          // prioritize low conversion, then low oscillation
          return ca - cb || oa - ob;
        })
        .slice(0, 3)
        .map((r) => ({
          cid: r.cid,
          runs: (r as any).runs,
          conversion_rate: (r as any).conversion_rate,
          oscillation_density: (r as any).oscillation_density,
          avg_persuasion_latency_event_span: (r as any).avg_persuasion_latency_event_span,
          hard_truth_conversion_rate: (r as any).hard_truth_conversion_rate,
        }));

      return {
        bottom_hard_truth_conversion_rate_top3: bottomHard,
        high_latency_high_oscillation_top3: highLatencyHighOsc,
        low_conversion_low_oscillation_top3: lowConvLowOsc,
      };
    })();

    const efficiencyReport = {
      input: inPath,
      outDir: outBase,
      overall,
      ...(by_cid ? { by_cid } : {}),
      ...(insights ? { insights } : {}),
    };
      efficiencyReportPath = resolve(outBase, 'graph_efficiency_report.json');
      await writeFile(efficiencyReportPath, JSON.stringify(efficiencyReport, null, 2) + '\n', 'utf8');
    }
  }

  let persistStats: { cbr_gold_rows: number; intel_rows: number } | undefined;
  if (persist) {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        'DATABASE_URL is not set; cannot --persist. Apply migration and export Prisma client, then retry.',
      );
    }
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    try {
      const cbrGoldRows = await persistGoldCasesFromRuns(prisma, runs);
      const intelRows =
        evals && evals.length > 0 ? await persistDecisionIntelligenceRows(prisma, runs, evals) : 0;
      persistStats = { cbr_gold_rows: cbrGoldRows, intel_rows: intelRows };
    } finally {
      await prisma.$disconnect();
    }
  }

  const report = {
    input: inPath,
    outDir: outBase,
    minShown,
    emitGraph,
    persist,
    ...(persistStats ? { persist_stats: persistStats } : {}),
    groupBy,
    rows_total: allRows.length,
    rows_sft: sftRows.length,
    rows_dpo: allRows.length,
    files: {
      sft: sftPath,
      dpo: dpoPath,
      ...(graphPath ? { state_graph: graphPath } : {}),
      ...(efficiencyReportPath ? { efficiency_report: efficiencyReportPath } : {}),
    },
  };
  const reportPath = resolve(outBase, 'export-report.json');
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

  // === Semantic Consistency Linter (Clean Room gate) ===
  // Fail fast if exported DPO rows drift from the evidence dictionary (decision_metadata / UI props).
  {
    const cmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const lint = spawnSync(
      cmd,
      ['run', '-s', 'lint:semantic-consistency', '--', '--input', dpoPath],
      { stdio: 'inherit' },
    );
    if (lint.status !== 0) {
      // eslint-disable-next-line no-console
      console.error(
        `\n[export-gold-samples] semantic consistency lint failed for ${dpoPath}\n` +
          `  Fix inconsistencies before using these artifacts for training.`,
      );
      process.exit(1);
    }
  }

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

