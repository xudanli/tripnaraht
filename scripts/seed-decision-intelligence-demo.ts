/**
 * 向 public.decision_intelligence_logs / public.cbr_case_aggregates 灌入演示数据，
 * 便于 Grafana「Decision OS - Intelligence」看板立刻有数。
 *
 * 用法：
 *   npx tsx scripts/seed-decision-intelligence-demo.ts
 * 依赖：DATABASE_URL（可来自 .env）、已执行包含上述两表的 migration。
 */
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const PREFIX = 'seed-demo';

function sigHash(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Add it to .env or export before running.');
  }
  const prisma = new PrismaClient();
  try {
    const delLogs = await prisma.decisionIntelligenceLog.deleteMany({
      where: { requestId: { startsWith: PREFIX } },
    });
    const delCbr = await prisma.cbrCaseAggregate.deleteMany({
      where: { lastRequestId: { startsWith: PREFIX } },
    });
    // eslint-disable-next-line no-console
    console.log(`Cleared previous seed: decision_logs=${delLogs.count}, cbr_aggregates=${delCbr.count}`);

    const now = Date.now();
    const graphStub = { session_id: `${PREFIX}-session`, nodes: [{ id: 'ew1', kind: 'EARLY_WARNING' }], edges: [] };
    const metricsStub = (m: Record<string, unknown>) => ({ metrics: m, eval: { persuasion_efficiency_score: 8 } });

    const cids = ['REACHABILITY_HARD', 'TIME_PRESSURE', 'BUDGET_OVERRUN', 'SCOPE_OVERFLOW', null];
    for (let i = 0; i < 40; i++) {
      const daysAgo = i % 14;
      const cid = cids[i % cids.length];
      const hasConversion = i % 3 !== 0;
      const oscillationEscalated = i % 7 === 0;
      const hardTruthIsHard = i % 4 !== 1;
      const span = i % 5 === 0 ? null : 1 + (i % 6);
      const createdAt = new Date(now - daysAgo * 24 * 60 * 60 * 1000 - (i % 5) * 3600_000);
      await prisma.decisionIntelligenceLog.create({
        data: {
          requestId: `${PREFIX}-req-${String(i).padStart(3, '0')}`,
          dominantCid: cid,
          graphJson: graphStub,
          efficiencyMetrics: metricsStub({
            persuasion_latency_event_span: span,
            oscillation_escalated: oscillationEscalated,
            is_hard: hardTruthIsHard,
          }) as object,
          persuasionLatencyEventSpan: span,
          oscillationEscalated,
          hardTruthIsHard,
          hasConversion,
          createdAt,
        },
      });
    }

    const matureKeys = [
      { key: 'REACHABILITY|is|4', conflictType: 'REACHABILITY', vio: 'REACHABILITY_HARD', region: 'is', month: 4 },
      { key: 'TIME|is|4', conflictType: 'SCOPE', vio: 'TIME_PRESSURE', region: 'is', month: 4 },
      { key: 'BUDGET|no|6', conflictType: 'SCOPE', vio: 'BUDGET_OVERRUN', region: 'no', month: 6 },
    ];
    for (const m of matureKeys) {
      const hash = sigHash(`${PREFIX}|${m.key}`);
      await prisma.cbrCaseAggregate.upsert({
        where: { signatureHash: hash },
        create: {
          signatureHash: hash,
          conflictType: m.conflictType,
          primaryViolationType: m.vio,
          regionId: m.region,
          month: m.month,
          relaxationTypesJson: ['upgrade_vehicle_to_4wd'],
          totalCount: 14,
          lateAcceptCount: 11,
          lateAcceptRate: 11 / 14,
          avgWallHitLatencyMs: 220_000,
          avgWallHitEventSpan: 4.2,
          evidenceAnchors: [{ source: 'seed', note: 'demo anchor' }],
          precedentSummaryLatest: `${PREFIX}: ${m.vio} mature aggregate`,
          lastCaseId: `${PREFIX}-case`,
          lastRequestId: `${PREFIX}-cbr-req`,
        },
        update: {
          totalCount: 14,
          lateAcceptCount: 11,
          lateAcceptRate: 11 / 14,
          avgWallHitLatencyMs: 220_000,
          avgWallHitEventSpan: 4.2,
          precedentSummaryLatest: `${PREFIX}: ${m.vio} refreshed`,
          lastRequestId: `${PREFIX}-cbr-req`,
        },
      });
    }

    const logCount = await prisma.decisionIntelligenceLog.count();
    const cbrCount = await prisma.cbrCaseAggregate.count();
    const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database()::text AS db`;
    // eslint-disable-next-line no-console
    console.log(`Seed done. Table totals: decision_intelligence_logs=${logCount}, cbr_case_aggregates=${cbrCount}`);
    // eslint-disable-next-line no-console
    console.log(
      `Grafana: PostgreSQL datasource must use this same database (current_database() = "${db}"). ` +
        `Open the dashboard panel "Sanity: Grafana 实际连到的库" — grafana_sees_this_db must match "${db}".`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
