/**
 * TD engine-dso 测试固件的 CGUS 重放工具。
 * 生成包含 `runFingerprint`、`observability` 和每个用例的 `rankReplaySnapshot` 的 JSON 报告（与 `replay-cgus-suite` 并轨）。
 * 对比运行：`npm run cgus:replay:compare -- <baseline.json> <current.json> [--out diff.json]`
 *
 * 环境变量（节选）：
 * - `CGUS_TD_FIXTURE_VERSION`：无 `metadata.cgusDsoFixtureVersion` 的 case 的统一版本标签（P2 收紧；不设则 `inline-no-engine-metadata-v1`）
 * - `CGUS_FIXTURE_REPLAY_SEED` / `CGUS_SUITE_SEED`：写入 `runFingerprint.seed`
 * - `CGUS_FP_STRICT=1`：`fingerprintCompleteness` 含 error 时非零退出
 */
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { CGUSSearchService } from '../src/trips/decision/optimization/cgus-search.service';
import { PlanFeaturesService } from '../src/trips/decision/optimization/plan-features/plan-features.service';
import { DecisionOSConfigService } from '../src/trips/decision/optimization/config';
import { dsoToMinimalWorldModelContext } from '../src/decision/kernel/dso-to-world-model-converter';
import { getTdReplayFixturesForRun } from '../src/trips/decision/evaluation/e2e-cases/registry';
import { buildLiteCandidates } from '../src/trips/decision/evaluation/cgus-replay-suite.util';
import { CgusReplayModule } from '../src/trips/decision/evaluation/cgus-replay.module';
import type { E2ECase, E2ECaseMetadata } from '../src/trips/decision/evaluation/e2e-case.types';
import {
  buildObservabilityV1,
  buildRankReplaySnapshotV1,
  CGUS_REPLAY_OBSERVABILITY_SCHEMA_VERSION,
  collectFixtureVersionsFromCases,
} from './lib/cgus-replay-observability';
import { buildRunFingerprint, resolveMappingVersionFromEnv, validateRunFingerprintCompleteness } from './lib/harness-run-fingerprint';
import { buildTdFixtureReplayConfigForHash, pickAppDecisionCgusSubset } from './lib/cgus-replay-config-hash';
import { buildCgusReplayTraceRefsV1 } from './lib/evaluation-harness-report-refs';

type McRankAuthorityConfig = {
  rerankEnabled: boolean;
  minSamplesPerCandidate: number;
  maxTopCiWidth?: number;
  minTopMargin?: number;
  compareTopN?: number;
};

function computeRankAuthorityDiagnostics(
  result: Awaited<ReturnType<CGUSSearchService['search']>>,
  cfg: McRankAuthorityConfig,
) {
  const ranked = result.rankedCandidates ?? [];
  const detSorted = [...ranked].sort((a, b) => {
    const du = (b.utility ?? -Infinity) - (a.utility ?? -Infinity);
    if (du !== 0) return du;
    return String(a.candidate?.id ?? '').localeCompare(String(b.candidate?.id ?? ''));
  });
  const mcSorted = [...ranked].sort((a, b) => {
    const ub = b.expectedUtility ?? b.utility ?? -Infinity;
    const ua = a.expectedUtility ?? a.utility ?? -Infinity;
    const du = ub - ua;
    if (du !== 0) return du;
    return String(a.candidate?.id ?? '').localeCompare(String(b.candidate?.id ?? ''));
  });

  const deterministicTopId = detSorted[0]?.candidate?.id;
  const mcTopId = mcSorted[0]?.candidate?.id;
  const sameWinner = !!deterministicTopId && !!mcTopId && deterministicTopId === mcTopId;

  const sampleOk =
    !!result.usedMonteCarlo &&
    ranked.length > 0 &&
    ranked.every((r) => (r.samplingDetails?.totalSamples ?? 0) >= cfg.minSamplesPerCandidate);

  const topCi = mcSorted[0]?.confidenceInterval;
  const topCiWidth =
    topCi && Number.isFinite(topCi.lower) && Number.isFinite(topCi.upper) ? topCi.upper - topCi.lower : undefined;
  const confidenceOk = cfg.maxTopCiWidth === undefined ? true : topCiWidth !== undefined && topCiWidth <= cfg.maxTopCiWidth;

  const top1 = mcSorted[0];
  const top2 = mcSorted[1];
  const u1 = top1 ? (top1.expectedUtility ?? top1.utility ?? -Infinity) : -Infinity;
  const u2 = top2 ? (top2.expectedUtility ?? top2.utility ?? -Infinity) : -Infinity;
  const topMargin = Number.isFinite(u1) && Number.isFinite(u2) ? u1 - u2 : undefined;
  const marginOk = cfg.minTopMargin === undefined ? true : (topMargin ?? 0) >= cfg.minTopMargin;

  const mcEligibleForRerank = !!result.usedMonteCarlo && sampleOk && confidenceOk;
  const winnerSource =
    cfg.rerankEnabled && mcEligibleForRerank ? (marginOk ? 'mc' : 'deterministic') : result.usedMonteCarlo ? 'deterministic' : 'fallback';
  const winnerChanged = cfg.rerankEnabled && mcEligibleForRerank && marginOk && !sameWinner;
  const eligibleButUnchanged = cfg.rerankEnabled && mcEligibleForRerank && (!marginOk || sameWinner);

  const k = Math.max(2, Math.min(10, cfg.compareTopN ?? 5));
  const detTopN = detSorted.slice(0, Math.min(k, detSorted.length)).map((r) => r.candidate?.id).filter(Boolean) as string[];
  const finalTopN = ranked.slice(0, Math.min(k, ranked.length)).map((r) => r.candidate?.id).filter(Boolean) as string[];
  const topNChangedExcludingWinner =
    detTopN.length > 1 &&
    finalTopN.length > 1 &&
    detTopN[0] === finalTopN[0] &&
    detTopN.slice(1).join('|') !== finalTopN.slice(1).join('|');
  const winnerLockedButTopNChanged =
    cfg.rerankEnabled && mcEligibleForRerank && !!deterministicTopId && ranked[0]?.candidate?.id === deterministicTopId && topNChangedExcludingWinner;
  const marginBlockedFlip =
    cfg.rerankEnabled && mcEligibleForRerank && !marginOk && !sameWinner && String(deterministicTopId ?? '') !== String(mcTopId ?? '');

  return {
    deterministicTopId,
    mcTopId,
    sameWinner,
    sampleOk,
    confidenceOk,
    marginOk,
    mcEligibleForRerank,
    rerankEnabled: cfg.rerankEnabled,
    winnerSource,
    winnerChanged,
    eligibleButUnchanged,
    winnerLockedButTopNChanged,
    marginBlockedFlip,
    ...(topMargin !== undefined ? { topMargin } : {}),
    ...(topCiWidth !== undefined ? { topCiWidth } : {}),
  };
}

async function main() {
  const outPath = process.env.CGUS_FIXTURE_OUT ?? 'artifacts/cgus-replay-fixtures-report.json';
  const fixturesRaw = getTdReplayFixturesForRun();
  const versionFallback =
    process.env.CGUS_TD_FIXTURE_VERSION?.trim() && process.env.CGUS_TD_FIXTURE_VERSION.trim().length > 0
      ? process.env.CGUS_TD_FIXTURE_VERSION.trim()
      : 'inline-no-engine-metadata-v1';
  const fixtures: E2ECase[] = fixturesRaw.map((f) => ({
    ...f,
    metadata: {
      ...f.metadata,
      cgusDsoFixtureVersion: (f.metadata?.cgusDsoFixtureVersion ??
        versionFallback) as E2ECaseMetadata['cgusDsoFixtureVersion'],
    } as E2ECaseMetadata,
  }));

  const cfg: McRankAuthorityConfig = {
    rerankEnabled: String(process.env.KERNEL_CGUS_MC_RERANK_ENABLED ?? 'true').toLowerCase() === 'true',
    minSamplesPerCandidate: Number(process.env.KERNEL_CGUS_MC_RERANK_MIN_SAMPLES ?? 20),
    maxTopCiWidth:
      process.env.KERNEL_CGUS_MC_RERANK_MAX_TOP_CI_WIDTH !== undefined
        ? Number(process.env.KERNEL_CGUS_MC_RERANK_MAX_TOP_CI_WIDTH)
        : undefined,
    minTopMargin: Number(process.env.KERNEL_CGUS_MC_RERANK_MIN_TOP_MARGIN ?? 0.05),
    compareTopN: Number(process.env.KERNEL_CGUS_MC_RERANK_COMPARE_TOPN ?? 5),
  };

  const app = await NestFactory.createApplicationContext(CgusReplayModule, { logger: ['error', 'warn'] });
  const startedAt = Date.now();
  try {
    const cgus = app.get(CGUSSearchService);
    const planFeatures = app.get(PlanFeaturesService);
    const decisionCfg = (() => {
      try {
        return app.get(DecisionOSConfigService).get('decision');
      } catch {
        return undefined;
      }
    })();

    const buildDsoFromFixture = (f: E2ECase): any => {
      const days = Math.max(1, f.expected?.finalState?.planDays ?? 3);
      const itemsPerDay = 2;
      const mkTime = (h: number, m: number) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const itinerary = {
        days: Array.from({ length: days }).map((_, dayIdx) => ({
          items: Array.from({ length: itemsPerDay }).map((__, itemIdx) => {
            const startH = 9 + itemIdx * 2;
            return {
              id: `fixture-item-${dayIdx}-${itemIdx}`,
              type: 'poi',
              start_window: { start: mkTime(startH, 0), end: mkTime(startH, 30) },
              end_window: { start: mkTime(startH + 1, 0), end: mkTime(startH + 1, 30) },
              location_ref: {
                place_id: `fixture-poi-${dayIdx}-${itemIdx}`,
                name: `POI ${dayIdx}-${itemIdx}`,
                coordinates: { lat: 64.0 + dayIdx * 0.01, lng: -21.0 - itemIdx * 0.01 },
              },
              metadata: {
                distance_meters: 5000 + dayIdx * 1000 + itemIdx * 500,
                travel_duration_min_from_prev: 25 + itemIdx * 10,
              },
            };
          }),
        })),
      };

      const hardViolations =
        f.expected?.abuExpected?.action === 'REJECT'
          ? [{ type: 'DEM_VIOLATION', severity: 'HARD', degree: 1, detail: 'fixture:abu_reject' }]
          : [];

      return {
        requestId: `e2e-${f.id}`,
        systemState: { requestId: `e2e-${f.id}` },
        environmentState: {
          month: f.input?.season,
          countryCode: f.input?.countryCode,
          routeDirectionId: f.expected?.routeDirectionId ?? `fixture-rd-${f.id}`,
        },
        tripState: { planDraft: itinerary },
        constraints: { violations: hardViolations },
      };
    };

    const results: any[] = [];
    const maxCandidates = 10;
    const sampleSize = Number(process.env.MONTE_CARLO_SAMPLES ?? 200);
    for (const f of fixtures) {
      const t0 = Date.now();
      const dso = (f as any).dso ?? (f as any).metadata?.cgusDsoSnapshot ?? buildDsoFromFixture(f as any);
      const worldContext = dsoToMinimalWorldModelContext(dso as any) as any;
      const candidates = buildLiteCandidates({ dso: dso as any, maxCandidates, planFeatures });

      const result = await cgus.search(candidates as any, worldContext as any, {
        useMonteCarlo: true,
        sampleSize,
        useUtilityPrior: true,
        useUtilityWeightedSampling: true,
        useWorldModelRollout: true,
        rolloutTopK: 3,
        rolloutHorizonSteps: 3,
        explorationBeta: 0,
        mcRankAuthority: {
          enabled: cfg.rerankEnabled,
          minSamplesPerCandidate: cfg.minSamplesPerCandidate,
          maxTopCiWidth: cfg.maxTopCiWidth,
          minTopMargin: cfg.minTopMargin,
          compareTopN: cfg.compareTopN,
        },
      });

      const dt = Date.now() - t0;
      results.push({
        id: f.id,
        title: (f as any).name ?? f.id,
        elapsedMs: dt,
        rankAuthority: computeRankAuthorityDiagnostics(result, cfg),
        rankReplaySnapshot: buildRankReplaySnapshotV1(result.rankedCandidates as any, cfg.compareTopN ?? 5),
      });
    }

    const rows = results.map((r) => r.rankAuthority).filter(Boolean) as Array<any>;
    const total = rows.length || 1;
    const disagreements = rows.filter((x) => String(x.deterministicTopId ?? '') !== String(x.mcTopId ?? '')).length;
    const eligible = rows.filter((x) => x.mcEligibleForRerank === true).length;
    const winnerChanged = rows.filter((x) => x.winnerChanged === true).length;
    const eligibleButUnchanged = rows.filter((x) => x.eligibleButUnchanged === true).length;
    const winnerLockedButTopNChanged = rows.filter((x) => x.winnerLockedButTopNChanged === true).length;
    const marginBlockedFlip = rows.filter((x) => x.marginBlockedFlip === true).length;
    const mcEligibleRate = eligible / total;
    const winnerChangedRate = winnerChanged / total;
    const winnerLockedButTopNChangedRate = winnerLockedButTopNChanged / total;

    const { primary: fixtureVersionPrimary, distinct: fixtureVersionsDistinct } = collectFixtureVersionsFromCases(
      fixtures as any[],
    );
    const corpusParts = ['td-replay-fixtures'];
    if (process.env.TD_REPLAY_MATRIX_ID) corpusParts.push(String(process.env.TD_REPLAY_MATRIX_ID));
    const corpus = corpusParts.join(':');

    const configForHash = buildTdFixtureReplayConfigForHash({
      fixtureCount: fixtures.length,
      monteCarloSamplesUsed: sampleSize,
      maxCandidates,
      mcRankAuthority: {
        rerankEnabled: cfg.rerankEnabled,
        minSamplesPerCandidate: cfg.minSamplesPerCandidate,
        maxTopCiWidth: cfg.maxTopCiWidth,
        minTopMargin: cfg.minTopMargin ?? 0.05,
        compareTopN: cfg.compareTopN ?? 5,
      },
      decisionCgusSubset: pickAppDecisionCgusSubset(decisionCfg),
    });

    const seedRaw = process.env.CGUS_FIXTURE_REPLAY_SEED ?? process.env.CGUS_SUITE_SEED;
    const seedForFingerprint =
      seedRaw !== undefined && String(seedRaw).trim() !== '' ? String(seedRaw).trim() : null;

    const evaluationRunId = randomUUID();
    const runFingerprint = buildRunFingerprint({
      caseId: fixtures.length === 1 ? fixtures[0]!.id : null,
      fixtureVersion: fixtureVersionPrimary,
      fixtureVersionsDistinct: fixtureVersionsDistinct.length ? fixtureVersionsDistinct : null,
      corpus,
      caseCount: results.length,
      configForHash,
      mappingVersion: resolveMappingVersionFromEnv(),
      seed: seedForFingerprint,
      runId: evaluationRunId,
      schemaVersions: {
        replayObservability: CGUS_REPLAY_OBSERVABILITY_SCHEMA_VERSION,
        cgusReplayObservability: CGUS_REPLAY_OBSERVABILITY_SCHEMA_VERSION,
        evaluationHarnessTraceLink: 'v1',
      },
    });

    const fingerprintCompleteness = validateRunFingerprintCompleteness({
      reportKind: 'td-replay-fixtures',
      caseCount: results.length,
      fp: runFingerprint,
    });
    if (fingerprintCompleteness.warnings.length) {
      process.stderr.write(
        `[replay-cgus-real-fixtures] fingerprint warnings: ${fingerprintCompleteness.warnings.join('; ')}\n`,
      );
    }
    if (!fingerprintCompleteness.ok) {
      process.stderr.write(
        `[replay-cgus-real-fixtures] fingerprint errors: ${fingerprintCompleteness.errors.join(' | ')}\n`,
      );
      if (process.env.CGUS_FP_STRICT === '1') {
        process.exit(1);
      }
    }

    const observability = buildObservabilityV1({
      generatedAt: runFingerprint.generatedAt,
      corpus,
      caseCount: fixtures.length,
      fixtureVersion: fixtureVersionPrimary,
      fixtureVersionsDistinct,
      rankAuthorityRows: rows,
    });

    const traceRefs = buildCgusReplayTraceRefsV1(
      results.map((r) => String(r.id)),
      evaluationRunId,
    );

    const report = {
      runFingerprint,
      traceRefs,
      fingerprintCompleteness,
      generatedAt: runFingerprint.generatedAt,
      mode: 'fixtures',
      n: fixtures.length,
      totalMs: Date.now() - startedAt,
      observability,
      mcRankAuthority: cfg,
      aggregates: {
        rankAuthority: {
          deterministicVsMcDisagreementRate: disagreements / total,
          mcEligibleRate,
          winnerChangedRate,
          eligibleButUnchangedRate: eligibleButUnchanged / total,
          winnerLockedButTopNChangedRate,
          marginBlockedFlipRate: marginBlockedFlip / total,
          mcAddsRankingValueWithoutWinnerInstability:
            mcEligibleRate > 0 && winnerChangedRate <= 0.02 && winnerLockedButTopNChangedRate >= 0.1,
          counts: {
            total: rows.length,
            disagreements,
            eligible,
            winnerChanged,
            eligibleButUnchanged,
            winnerLockedButTopNChanged,
            marginBlockedFlip,
          },
        },
      },
      env: {
        MONTE_CARLO_SAMPLES: process.env.MONTE_CARLO_SAMPLES,
        KERNEL_CGUS_MC_RERANK_ENABLED: process.env.KERNEL_CGUS_MC_RERANK_ENABLED,
        KERNEL_CGUS_MC_RERANK_MIN_SAMPLES: process.env.KERNEL_CGUS_MC_RERANK_MIN_SAMPLES,
        KERNEL_CGUS_MC_RERANK_MAX_TOP_CI_WIDTH: process.env.KERNEL_CGUS_MC_RERANK_MAX_TOP_CI_WIDTH,
        KERNEL_CGUS_MC_RERANK_MIN_TOP_MARGIN: process.env.KERNEL_CGUS_MC_RERANK_MIN_TOP_MARGIN,
        KERNEL_CGUS_MC_RERANK_COMPARE_TOPN: process.env.KERNEL_CGUS_MC_RERANK_COMPARE_TOPN,
        TD_REPLAY_MATRIX_ID: process.env.TD_REPLAY_MATRIX_ID,
      },
      results,
    };

    const abs = path.isAbsolute(outPath) ? outPath : path.join(process.cwd(), outPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, JSON.stringify(report, null, 2), 'utf-8');
    process.stdout.write(`Done. Wrote fixture report: ${abs}\n`);
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  process.stderr.write(`${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
  process.exit(1);
});

