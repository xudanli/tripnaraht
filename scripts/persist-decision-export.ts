import type { PrismaClient } from '@prisma/client';
import { auditReportToCaseRecord } from '../src/agent/cbr/case-extractor.util';
import type { CaseRecord } from '../src/agent/cbr/case-record.types';
import { upsertCbrCaseAggregateFromRecord } from '../src/agent/cbr/cbr-case-aggregate-persist.util';
import type { ConflictStateGraphJSON } from '../src/agent/cbr/conflict-state-graph.util';

type GraphEvalRow = {
  graph: ConflictStateGraphJSON;
  eval: {
    persuasion_efficiency_score: number;
    shortest_positive_path_weight?: number;
    has_conversion: boolean;
    notes: string[];
  };
  metrics: {
    persuasion_latency_event_span?: number;
    is_hard: boolean;
    oscillation_escalated: boolean;
  };
};

/** @deprecated 名称保留：与 `upsertCbrCaseAggregateFromRecord` 相同。 */
export async function persistCbrCaseFromRecord(prisma: PrismaClient, record: CaseRecord): Promise<void> {
  return upsertCbrCaseAggregateFromRecord(prisma, record);
}

export async function persistGoldCasesFromRuns(
  prisma: PrismaClient,
  runs: Array<{ request_id?: string; audit_report: any }>,
): Promise<number> {
  let n = 0;
  for (const r of runs) {
    const rec = auditReportToCaseRecord({
      audit_report: r.audit_report,
      request_id: r.request_id,
    });
    if (!rec) continue;
    await upsertCbrCaseAggregateFromRecord(prisma, rec);
    n += 1;
  }
  return n;
}

export async function persistDecisionIntelligenceRows(
  prisma: PrismaClient,
  runs: Array<{ request_id?: string }>,
  evals: GraphEvalRow[],
): Promise<number> {
  let n = 0;
  for (let i = 0; i < evals.length; i++) {
    const row = evals[i];
    const run = runs[i];
    const dominant = row.graph.nodes?.[0]?.dominant_cid ?? null;
    await prisma.decisionIntelligenceLog.create({
      data: {
        requestId: run?.request_id ?? null,
        dominantCid: dominant,
        graphJson: row.graph as object,
        efficiencyMetrics: {
          eval: row.eval,
          metrics: row.metrics,
        } as object,
        persuasionLatencyEventSpan: row.metrics.persuasion_latency_event_span ?? null,
        oscillationEscalated: row.metrics.oscillation_escalated,
        hardTruthIsHard: row.metrics.is_hard,
        hasConversion: row.eval.has_conversion,
      },
    });
    n += 1;
  }
  return n;
}
