#!/usr/bin/env npx ts-node
/**
 * CGUS 重放测试套件
 *
 * 在一组合成测试用例上批量运行 DecisionKernel 的 OPTIMIZE(CGUS) 模式，并生成 JSON 报告。
 *
 * 运行方式:
 *   ENABLE_READINESS_MODULE=true SKIP_GEO_MONITORING=1 npx ts-node --transpile-only scripts/replay-cgus-suite.ts
 *
 * 可选环境变量:
 *   CGUS_SUITE_OUT=artifacts/cgus-replay-report.json
 *   CGUS_SUITE_N=25
 *   CGUS_SUITE_PROFILE=lite|stress|bridge
 *     - lite: 默认合成混合（包含 HARD 注入用例）
 *     - bridge: Planning Workbench compare + Feasibility MC 物理对齐回放（session_consistency_score gate）
 *     - stress: SOFT-only 约束 + 更宽的结构差异，用于压测 deterministic vs MC 排序权
 *
 * Bridge 回放:
 *   CGUS_SUITE_PROFILE=bridge CGUS_SUITE_OUT=artifacts/bridge-replay-report.json npx ts-node --transpile-only scripts/replay-cgus-suite.ts
 *
 * 或在标准 CGUS suite 上附带 bridge 轨道:
 *   CGUS_SUITE_INCLUDE_BRIDGE=1 npx ts-node --transpile-only scripts/replay-cgus-suite.ts
 *
 * 报告含 `observability`（corpus / caseCount / 关键 rankAuthority 比率）与每 case `rankReplaySnapshot`。
 * 与基线 JSON 对比: `npm run cgus:replay:compare -- <baseline.json> <current.json> [--out diff.json]`
 */
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { DecisionOSConfigService } from '../src/trips/decision/optimization/config';
import { dsoToMinimalWorldModelContext } from '../src/decision/kernel/dso-to-world-model-converter';
import { PlanFeaturesService } from '../src/trips/decision/optimization/plan-features/plan-features.service';
import { ExposureMapService } from '../src/trips/decision/optimization/plan-features/exposure-map.service';
import { ObjectiveFunctionService } from '../src/trips/decision/optimization/objective-function.service';
import { ExpectedUtilityService } from '../src/trips/decision/optimization/probabilistic/expected-utility.service';
import { FatigueCalculatorService } from '../src/trips/decision/services/fatigue-calculator.service';
import { ProbabilisticWorldModelService } from '../src/trips/decision/optimization/probabilistic/probabilistic-world-model.service';
import { UnifiedDecisionFormulaService } from '../src/trips/decision/optimization/unified-decision-formula.service';
import { CGUSSearchService, type CGUSCandidate } from '../src/trips/decision/optimization/cgus-search.service';
import { OptimizationEngineAdapterService } from '../src/decision/kernel/optimization-engine-adapter.service';
import { CgusReplayModule } from '../src/trips/decision/evaluation/cgus-replay.module';
import { buildLiteCandidates } from '../src/trips/decision/evaluation/cgus-replay-suite.util';
import type { DecisionState, OptimizationHints } from '../src/decision/kernel/decision-state.types';
import {
  buildObservabilityV1,
  buildRankReplaySnapshotV1,
  CGUS_REPLAY_OBSERVABILITY_SCHEMA_VERSION,
  collectFixtureVersionsFromCases,
} from './lib/cgus-replay-observability';
import { buildRunFingerprint, resolveMappingVersionFromEnv, validateRunFingerprintCompleteness } from './lib/harness-run-fingerprint';
import {
  mergeReplayConfigForHash,
  pickAppDecisionCgusSubset,
  pickLiteCgusSnapshotForHash,
  pickReplayConfigForHash,
} from './lib/cgus-replay-config-hash';
import { buildCgusReplayTraceRefsV1 } from './lib/evaluation-harness-report-refs';
import {
  runBridgeKernelReplaySuite,
  BRIDGE_REPLAY_SCHEMA_VERSION,
} from '../src/trips/decision/evaluation/bridge-kernel-replay.util';

const logger = new Logger('CGUS-ReplaySuite');

type SuiteCase = {
  id: string;
  title: string;
  dso: DecisionState;
};

function datePlus(startDate: string, addDays: number): string {
  const d = new Date(startDate);
  d.setDate(d.getDate() + addDays);
  return d.toISOString().split('T')[0];
}

function buildMockPlanDraft(params: {
  requestId: string;
  startDate: string;
  days: number;
  itemsPerDay: number;
  dayStart: string;
  itemDurationMin: number;
  gapMin: number;
}): unknown {
  const { requestId, startDate, days, itemsPerDay, dayStart, itemDurationMin, gapMin } = params;
  const toHM = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };
  const startMin =
    parseInt(dayStart.split(':')[0] ?? '9', 10) * 60 + parseInt(dayStart.split(':')[1] ?? '0', 10);

  const daysArr = Array.from({ length: days }, (_, i) => {
    const date = datePlus(startDate, i);
    const items = Array.from({ length: itemsPerDay }, (_, j) => {
      const s = startMin + j * (itemDurationMin + gapMin);
      const e = s + itemDurationMin;
      return {
        location_ref: { id: `poi-${i}-${j}`, name: `POI ${i + 1}-${j + 1}` },
        start_time: toHM(s),
        end_time: toHM(e),
      };
    });
    return { date, items };
  });

  return { request_id: requestId, days: daysArr };
}

function buildSuiteCasesLite(n: number): SuiteCase[] {
  const startDate = '2026-06-01';
  const out: SuiteCase[] = [];
  for (let i = 0; i < n; i++) {
    const days = 2 + (i % 5); // 2..6
    const itemsPerDay = 1 + (i % 4); // 1..4
    const dayStart = i % 3 === 0 ? '08:30' : i % 3 === 1 ? '09:00' : '10:00';
    const itemDurationMin = i % 4 === 0 ? 120 : i % 4 === 1 ? 90 : i % 4 === 2 ? 60 : 45;
    const gapMin = i % 2 === 0 ? 30 : 15;
    const requestId = `cgus-suite-${i + 1}`;
    const planDraft = buildMockPlanDraft({
      requestId,
      startDate,
      days,
      itemsPerDay,
      dayStart,
      itemDurationMin,
      gapMin,
    });

    const weatherRisk = Math.min(0.95, 0.05 + (i % 10) * 0.1);
    const fatigue = Math.min(0.95, 0.1 + (i % 7) * 0.12);

    const violations: Array<any> = [];
    const vMode = i % 4;
    if (vMode === 0) {
      violations.push({
        type: 'TIME_WINDOW_VIOLATION',
        severity: 'HARD',
        degree: 1,
        detail: 'Injected time window violation for replay',
        details: {
          openingWindows: ['10:00-12:00', '13:30-16:00'],
          target: { dayIndex: 0, slotIndex: 0 },
        },
      });
    } else if (vMode === 1) {
      violations.push({
        type: 'CONNECTIVITY_INSUFFICIENT_TIME',
        severity: 'HARD',
        degree: 1,
        detail: 'Injected connectivity buffer violation for replay',
        details: { requiredExtraMin: 30 },
      });
    } else if (vMode === 2) {
      violations.push({
        type: 'MAX_DAILY_DRIVE_EXCEEDED',
        severity: 'HARD',
        degree: 1,
        detail: 'Injected daily drive cap violation for replay',
        details: { maxMin: 240 },
      });
    } else {
      violations.push({
        type: 'WEATHER_UNSAFE',
        severity: 'HARD',
        degree: 1,
        detail: 'Injected weather unsafe violation for replay',
        details: { risk: weatherRisk },
      });
    }

    const dso: DecisionState = {
      requestId,
      userIntent: {
        destination: 'Iceland',
        dateRange: { startDate, endDate: datePlus(startDate, days - 1) },
        days,
        mode: 'drive',
        party: { count: 2 },
      },
      tripState: { planDraft, fatigue },
      environmentState: {
        countryCode: 'IS',
        weatherRisk,
        failureRiskLevel: weatherRisk > 0.7 ? 'HIGH' : weatherRisk > 0.3 ? 'MEDIUM' : 'LOW',
      },
      constraints: {
        feasible: false,
        violations,
      },
      systemState: { requestId, currentPhase: 'OPTIMIZE' },
    };

    out.push({
      id: requestId,
      title: `days=${days} itemsPerDay=${itemsPerDay} start=${dayStart} dur=${itemDurationMin} gap=${gapMin} wr=${weatherRisk.toFixed(
        2,
      )} fat=${fatigue.toFixed(2)}`,
      dso,
    });
  }
  return out;
}

function buildSuiteCasesStress(n: number): SuiteCase[] {
  const startDate = '2026-06-01';
  const out: SuiteCase[] = [];
  for (let i = 0; i < n; i++) {
    // Wider structural diversity to create multiple feasible neighborhood candidates.
    const days = 2 + (i % 6); // 2..7
    const itemsPerDay = 2 + (i % 5); // 2..6
    const dayStart = i % 3 === 0 ? '07:30' : i % 3 === 1 ? '09:15' : '10:45';
    const itemDurationMin = i % 5 === 0 ? 150 : i % 5 === 1 ? 120 : i % 5 === 2 ? 90 : i % 5 === 3 ? 60 : 45;
    const gapMin = i % 2 === 0 ? 20 : 35;
    const requestId = `cgus-stress-${i + 1}`;
    const planDraft = buildMockPlanDraft({
      requestId,
      startDate,
      days,
      itemsPerDay,
      dayStart,
      itemDurationMin,
      gapMin,
    });

    const weatherRisk = Math.min(0.95, 0.05 + (i % 11) * 0.09);
    const fatigue = Math.min(0.95, 0.05 + (i % 9) * 0.11);

    //仅软注入违规（无硬违规）→ 基础 + 邻域变体仍然可行。
    const softDegree = Math.min(1, 0.05 + (i % 10) * 0.1);
    const softType = i % 3 === 0 ? 'TIME_EFFICIENCY_LOW' : i % 3 === 1 ? 'PHILOSOPHY_WEAK' : 'EXPERIENCE_DENSITY_LOW';
    const violations: Array<any> = [
      {
        type: softType,
        severity: 'SOFT',
        degree: softDegree,
        detail: 'Injected SOFT-only violation for CGUS rank authority stress suite',
      },
    ];

    const dso: DecisionState = {
      requestId,
      userIntent: {
        destination: 'Iceland',
        dateRange: { startDate, endDate: datePlus(startDate, days - 1) },
        days,
        mode: 'drive',
        party: { count: 2 },
      },
      tripState: { planDraft, fatigue },
      environmentState: {
        countryCode: 'IS',
        weatherRisk,
        failureRiskLevel: weatherRisk > 0.7 ? 'HIGH' : weatherRisk > 0.3 ? 'MEDIUM' : 'LOW',
      },
      constraints: {
        feasible: true,
        violations,
      },
      systemState: { requestId, currentPhase: 'OPTIMIZE' },
    };

    out.push({
      id: requestId,
      title: `stress profile=${softType} deg=${softDegree.toFixed(2)} days=${days} ipd=${itemsPerDay} start=${dayStart} dur=${itemDurationMin} gap=${gapMin} wr=${weatherRisk.toFixed(
        2,
      )} fat=${fatigue.toFixed(2)}`,
      dso,
    });
  }
  return out;
}

function buildSuiteCases(n: number): SuiteCase[] {
  const profile = (process.env.CGUS_SUITE_PROFILE ?? 'lite').trim().toLowerCase() as SuiteProfile;
  if (profile === 'bridge') {
    return [];
  }
  if (
    profile === 'stress' ||
    profile === 'stress_weather' ||
    profile === 'stress_fatigue' ||
    profile === 'stress_cascade' ||
    profile === 'stress_rollout_amplifier'
  ) {
    // 这些配置档案共享同一个 DSO 生成器；它们在候选修补策略和 rollout 设置上有所不同。
    return buildSuiteCasesStress(n);
  }
  return buildSuiteCasesLite(n);
}

function patchCandidatesForProfile(input: {
  candidates: CGUSCandidate[];
  planFeatures: PlanFeaturesService;
  profile: SuiteProfile;
}): CGUSCandidate[] {
  const { candidates, planFeatures, profile } = input;
  if (!profile.startsWith('stress')) return candidates;

  return candidates.map((c) => {
    const f = planFeatures.extract(c.plan as any);
    const slack = f.slackTightness01 ?? 0;
    const effort = f.effort01 ?? 0;
    const density = (f as any).experienceDensity01 ?? 0;

    let type = 'EXPERIENCE_DENSITY_LOW';
    let degree = 0.1 + 0.6 * slack + 0.2 * effort;
    if (profile === 'stress_weather') {
      type = 'WEATHER_SENSITIVITY_HIGH';
      degree = 0.1 + 0.7 * effort + 0.2 * slack;
    } else if (profile === 'stress_fatigue') {
      type = 'FATIGUE_HIGH';
      degree = 0.1 + 0.8 * effort + 0.1 * density;
    } else if (profile === 'stress_cascade') {
      type = 'TIME_WINDOW_RISK_HIGH';
      degree = 0.1 + 0.85 * slack + 0.05 * effort;
    } else if (profile === 'stress_rollout_amplifier') {
      type = 'ROBUSTNESS_UNCERTAIN';
      degree = 0.1 + 0.4 * slack + 0.4 * effort;
    }
    degree = Math.max(0, Math.min(1, degree));

    return {
      ...c,
      feasible: true,
      constraintViolations: [{ type, severity: 'SOFT' as const, degree }],
    };
  });
}

function computeTopGap(scores: number[]): number | null {
  const v = scores.filter((x) => Number.isFinite(x)).slice().sort((a, b) => b - a);
  if (v.length < 2) return null;
  return v[0]! - v[1]!;
}

function summarizeHints(hints: OptimizationHints | undefined) {
  const alts = hints?.alternatives ?? [];
  const top = alts[0];
  return {
    method: hints?.method,
    expectedUtility: hints?.expectedUtility,
    feasibilityProbability: hints?.feasibilityProbability,
    recommendedAlternativeId: hints?.recommendedAlternativeId,
    alternativesCount: alts.length,
    top: top
      ? {
          id: top.id,
          score: top.score,
          finalScore: top.finalScore,
          feasibilityProbability: top.feasibilityProbability,
          diversitySignature: top.diversitySignature,
        }
      : undefined,
  };
}

function quantiles(values: number[], qs: number[]): Record<string, number | null> {
  const v = values.filter((x) => Number.isFinite(x)).slice().sort((a, b) => a - b);
  if (v.length === 0) return Object.fromEntries(qs.map((q) => [String(q), null]));
  const pick = (q: number) => {
    const idx = Math.min(v.length - 1, Math.max(0, Math.floor(q * (v.length - 1))));
    return v[idx]!;
  };
  return Object.fromEntries(qs.map((q) => [String(q), pick(q)]));
}

function countBy<T extends string>(items: T[]): Record<T, number> {
  const out = {} as Record<T, number>;
  for (const x of items) out[x] = (out[x] ?? 0) + 1;
  return out;
}

function topKCounts(counts: Record<string, number>, k: number): Array<{ key: string; count: number }> {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([key, count]) => ({ key, count }));
}

type SuiteMode = 'lite' | 'app';

type SuiteProfile =
  | 'lite'
  | 'bridge'
  | 'stress'
  | 'stress_weather'
  | 'stress_fatigue'
  | 'stress_cascade'
  | 'stress_rollout_amplifier';

type ConstraintStatus = 'feasible' | 'relaxed';

function computeConstraintStatus(input: {
  relaxations?: Array<{ code?: string; notes?: string }>;
  violations?: Array<{ type: string; severity: string; degree: number; detail?: string }>;
}): { constraintStatus: ConstraintStatus; relaxationNotes?: string[] } {
  const notes: string[] = [];
  const relax = input.relaxations ?? [];
  for (const r of relax) {
    const c = String(r.code ?? '').trim();
    const n = String(r.notes ?? '').trim();
    if (c || n) notes.push([c, n].filter(Boolean).join(': '));
  }

  const hasHard =
    (input.violations ?? []).some((v) => String(v.severity).toUpperCase() === 'HARD' && (v.degree ?? 0) > 0) ?? false;

  const constraintStatus: ConstraintStatus = notes.length > 0 || hasHard ? 'relaxed' : 'feasible';
  return { constraintStatus, ...(notes.length ? { relaxationNotes: notes } : {}) };
}

function uniqueDiversityCount(alternatives: Array<{ diversitySignature?: string }>): number {
  const s = new Set<string>();
  for (const a of alternatives) {
    const sig = String(a.diversitySignature ?? '').trim();
    if (sig) s.add(sig);
  }
  return s.size;
}

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
): {
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
  eligibleButUnchanged: boolean;
  winnerLockedButTopNChanged: boolean;
  marginBlockedFlip: boolean;
  topMargin?: number;
  topCiWidth?: number;
} {
  const ranked = result.rankedCandidates ?? [];
  // Use deterministic tie-breakers so we can detect "topN re-ordered" even when utilities are tied.
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

  // Mirror CGUS semantics: margin gate is a winner-flip stabilizer, not an eligibility gate.
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

  // winnerLockedButTopNChanged：top1 保持确定性胜出者不变，但 top2..topN 被重新排序。
  // 这同时捕捉了两种情况：
  // - 边际阈值阻止了翻转的情况（软门控）
  // - MC 同意 top1 但仍然对其余候选项重新排序的情况
  const winnerLockedButTopNChanged =
    cfg.rerankEnabled && mcEligibleForRerank && !!deterministicTopId && ranked[0]?.candidate?.id === deterministicTopId && topNChangedExcludingWinner;

  // marginBlockedFlip：确定性胜出者与 MC 胜出者不同，但因边际软门控阻止了翻转。
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

async function main(): Promise<void> {
  const n = Math.max(1, parseInt(process.env.CGUS_SUITE_N ?? '25', 10));
  const outPath = process.env.CGUS_SUITE_OUT ?? 'artifacts/cgus-replay-report.json';
  const mode: SuiteMode = (process.env.CGUS_SUITE_MODE as SuiteMode) ?? 'lite';
  const suiteProfile = (process.env.CGUS_SUITE_PROFILE ?? 'lite').trim() as SuiteProfile;

  if (suiteProfile === 'bridge') {
    const startedAt = Date.now();
    logger.log(`Running bridge kernel replay suite → ${outPath}`);
    const bridgeReplay = await runBridgeKernelReplaySuite(logger);
    const report = {
      mode: 'bridge',
      suiteProfile: 'bridge',
      schemaVersion: BRIDGE_REPLAY_SCHEMA_VERSION,
      generatedAt: bridgeReplay.generatedAt,
      totalMs: Date.now() - startedAt,
      bridgeReplay,
      gate: bridgeReplay.gate,
      env: {
        BRIDGE_REPLAY_MIN_SESSION_SCORE: process.env.BRIDGE_REPLAY_MIN_SESSION_SCORE,
        PLANNING_WORKBENCH_KERNEL_MODE: process.env.PLANNING_WORKBENCH_KERNEL_MODE,
        FEASIBILITY_MONTE_CARLO: process.env.FEASIBILITY_MONTE_CARLO,
      },
    };
    const abs = path.isAbsolute(outPath) ? outPath : path.join(process.cwd(), outPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, JSON.stringify(report, null, 2), 'utf-8');
    logger.log(`Done. Wrote bridge replay report: ${abs}`);
    if (!bridgeReplay.gate.passed) {
      logger.error(`Bridge gate failed: ${bridgeReplay.gate.failures.join(' | ')}`);
      process.exitCode = 1;
    }
    return;
  }

  const seedRaw = process.env.CGUS_SUITE_SEED;
  const seed = seedRaw !== undefined && seedRaw !== '' ? Number.parseInt(seedRaw, 10) : undefined;
  logger.log(`Running CGUS suite (${mode}, profile=${suiteProfile}): N=${n} → ${outPath}`);

  const cases = buildSuiteCases(n);
  const startedAt = Date.now();
  const suiteCompareTopN = Number(process.env.KERNEL_CGUS_MC_RERANK_COMPARE_TOPN ?? 5);

  // Optional bridge replay piggyback on standard CGUS suite
  const includeBridge = String(process.env.CGUS_SUITE_INCLUDE_BRIDGE ?? '').trim() === '1';
  let bridgeReplay: Awaited<ReturnType<typeof runBridgeKernelReplaySuite>> | undefined;
  if (includeBridge) {
    logger.log('CGUS_SUITE_INCLUDE_BRIDGE=1 — running bridge kernel replay in parallel track');
    bridgeReplay = await runBridgeKernelReplaySuite(logger);
    if (!bridgeReplay.gate.passed) {
      logger.error(`Bridge replay gate failed: ${bridgeReplay.gate.failures.join(' | ')}`);
      process.exitCode = 1;
    }
  }

    const results: Array<{
      id: string;
      title: string;
      elapsedMs: number;
      summary: ReturnType<typeof summarizeHints>;
      rankAuthority?: ReturnType<typeof computeRankAuthorityDiagnostics>;
      rankAuthorityNoMargin?: ReturnType<typeof computeRankAuthorityDiagnostics>;
      rankReplaySnapshot?: ReturnType<typeof buildRankReplaySnapshotV1>;
      violationsTop3?: Array<{ type: string; severity: string; degree: number }>;
    }> = [];
    let cgusCount = 0;
    let emptyCount = 0;
    const top1Scores: number[] = [];
    const top1FinalScores: number[] = [];
    const altCounts: number[] = [];
    const altUniqueDivCounts: number[] = [];
    const violationTypes: string[] = [];
    const detTopGaps: number[] = [];
    const mcTopGaps: number[] = [];
    const postRolloutTopGaps: number[] = [];
    const rolloutDeltaTop1s: number[] = [];
    const rolloutDeltaTop2s: number[] = [];
    let configSnapshot: any = undefined;

    if (mode === 'app') {
      const app = await NestFactory.createApplicationContext(CgusReplayModule, { logger: ['error', 'warn'] });
      try {
        const cfg = (() => {
          try {
            return app.get(DecisionOSConfigService).get('decision');
          } catch {
            return undefined;
          }
        })();
        const planFeatures = app.get(PlanFeaturesService);
        const cgus = app.get(CGUSSearchService);
        configSnapshot = (() => {
          try {
            const cfg = app.get(DecisionOSConfigService).get('decision');
            return { ...(cfg as any), suiteProfile };
          } catch {
            return { suiteProfile };
          }
        })();

        for (const c of cases) {
          const t0 = Date.now();
          const worldContext = dsoToMinimalWorldModelContext(c.dso);
          const maxCandidates = Math.max(2, cfg?.cgusMaxCandidates ?? 8);
          const rolloutTopK = Math.max(1, cfg?.cgusRolloutTopK ?? 3);
          const sampleSize = Math.max(50, cfg?.monteCarloSamples ?? 200);
          const pilot = cfg?.cgusPilotSamples;
          const baseCandidates = buildLiteCandidates({ dso: c.dso, maxCandidates, planFeatures });
          const candidates = patchCandidatesForProfile({ candidates: baseCandidates as any, planFeatures, profile: suiteProfile });

          // 运行两次以衡量 rollout 放大效应（rollout 前 vs rollout 后）。
          const resultPre = await cgus.search(candidates as any, worldContext as any, {
            useMonteCarlo: true,
            sampleSize,
            seed,
            useUtilityPrior: true,
            useUtilityWeightedSampling: true,
            useWorldModelRollout: false,
            rolloutTopK,
            pilotSamplesPerCandidate: pilot,
            mcRankAuthority: {
              enabled: String(process.env.KERNEL_CGUS_MC_RERANK_ENABLED ?? '').toLowerCase() === 'true',
              minSamplesPerCandidate: Number(process.env.KERNEL_CGUS_MC_RERANK_MIN_SAMPLES ?? 20),
              maxTopCiWidth:
                process.env.KERNEL_CGUS_MC_RERANK_MAX_TOP_CI_WIDTH !== undefined
                  ? Number(process.env.KERNEL_CGUS_MC_RERANK_MAX_TOP_CI_WIDTH)
                  : undefined,
              minTopMargin: Number(process.env.KERNEL_CGUS_MC_RERANK_MIN_TOP_MARGIN ?? 0.05),
              compareTopN: Number(process.env.KERNEL_CGUS_MC_RERANK_COMPARE_TOPN ?? 5),
            },
          });
          const result = await cgus.search(candidates as any, worldContext as any, {
            useMonteCarlo: true,
            sampleSize,
            seed,
            useUtilityPrior: true,
            useUtilityWeightedSampling: true,
            useWorldModelRollout: suiteProfile === 'stress_rollout_amplifier' || suiteProfile === 'stress_weather' || suiteProfile === 'stress_fatigue' || suiteProfile === 'stress_cascade',
            rolloutTopK,
            rolloutHorizonSteps: suiteProfile === 'stress_rollout_amplifier' ? 5 : 3,
            pilotSamplesPerCandidate: pilot,
            mcRankAuthority: {
              enabled: String(process.env.KERNEL_CGUS_MC_RERANK_ENABLED ?? '').toLowerCase() === 'true',
              minSamplesPerCandidate: Number(process.env.KERNEL_CGUS_MC_RERANK_MIN_SAMPLES ?? 20),
              maxTopCiWidth:
                process.env.KERNEL_CGUS_MC_RERANK_MAX_TOP_CI_WIDTH !== undefined
                  ? Number(process.env.KERNEL_CGUS_MC_RERANK_MAX_TOP_CI_WIDTH)
                  : undefined,
              minTopMargin: Number(process.env.KERNEL_CGUS_MC_RERANK_MIN_TOP_MARGIN ?? 0.05),
              compareTopN: Number(process.env.KERNEL_CGUS_MC_RERANK_COMPARE_TOPN ?? 5),
            },
          });

          const hints: OptimizationHints = {
            method: 'CGUS',
            expectedUtility: result.rankedCandidates[0]?.expectedUtility ?? result.rankedCandidates[0]?.utility,
            feasibilityProbability: result.rankedCandidates[0]?.feasibilityProbability,
            recommendedAlternativeId: result.recommended?.id ?? result.rankedCandidates[0]?.candidate.id,
            alternatives: result.rankedCandidates.slice(0, 3).map((r) => ({
              id: r.candidate.id,
              score: r.expectedUtility ?? r.utility,
              finalScore: (r as any).finalScore,
              scoreBreakdown: (r as any).scoreBreakdown,
              expectedUtility: r.expectedUtility,
              feasibilityProbability: r.feasibilityProbability,
              confidenceInterval: r.confidenceInterval
                ? { lower: r.confidenceInterval.lower, upper: r.confidenceInterval.upper, level: 0.95 }
                : undefined,
              summary: (r.candidate as any).summary,
              relaxations: (r.candidate as any).relaxations,
              violations: ((r.candidate as any).violationDetails ?? (r.candidate as any).constraintViolations ?? []).map(
                (v: any) => ({
                  type: v.type,
                  severity: v.severity,
                  degree: v.degree,
                  detail: v.detail ?? '',
                }),
              ),
              diversitySignature: (r.candidate as any).diversitySignature,
              ...computeConstraintStatus({
                relaxations: (r.candidate as any).relaxations,
                violations: (r.candidate as any).violationDetails ?? (r.candidate as any).constraintViolations,
              }),
            })),
          };
          const dt = Date.now() - t0;
          const summary = summarizeHints(hints);
          if (summary.method === 'CGUS') cgusCount++;
          if (!hints || Object.keys(hints).length === 0) emptyCount++;

          altCounts.push(summary.alternativesCount ?? 0);
          altUniqueDivCounts.push(uniqueDiversityCount(hints?.alternatives ?? []));
          if (summary.top?.score !== undefined) top1Scores.push(summary.top.score);
          if (summary.top?.finalScore !== undefined) top1FinalScores.push(summary.top.finalScore);

          // 排序翻转敏感性指标（rollout 前 vs rollout 后）
          const detScoresPre = [...(resultPre.rankedCandidates ?? [])]
            .sort((a, b) => (b.utility ?? -Infinity) - (a.utility ?? -Infinity))
            .map((r) => r.utility ?? -Infinity);
          const mcScoresPre = [...(resultPre.rankedCandidates ?? [])]
            .sort((a, b) => (b.expectedUtility ?? b.utility ?? -Infinity) - (a.expectedUtility ?? a.utility ?? -Infinity))
            .map((r) => r.expectedUtility ?? r.utility ?? -Infinity);
          const postScores = [...(result.rankedCandidates ?? [])].map((r) => (r as any).finalScore ?? r.expectedUtility ?? r.utility ?? -Infinity);
          const detGap = computeTopGap(detScoresPre);
          const mcGap = computeTopGap(mcScoresPre);
          const postGap = computeTopGap(postScores);
          if (detGap !== null) detTopGaps.push(detGap);
          if (mcGap !== null) mcTopGaps.push(mcGap);
          if (postGap !== null) postRolloutTopGaps.push(postGap);

          const preTop1 = mcScoresPre.length > 0 ? mcScoresPre.slice().sort((a, b) => b - a)[0]! : null;
          const preTop2 = mcScoresPre.length > 1 ? mcScoresPre.slice().sort((a, b) => b - a)[1]! : null;
          const postTopSorted = postScores.slice().sort((a, b) => b - a);
          const postTop1 = postTopSorted[0] ?? null;
          const postTop2 = postTopSorted[1] ?? null;
          if (preTop1 !== null && postTop1 !== null) rolloutDeltaTop1s.push(postTop1 - preTop1);
          if (preTop2 !== null && postTop2 !== null) rolloutDeltaTop2s.push(postTop2 - preTop2);

          const topAlt = (hints?.alternatives ?? [])[0];
          const vTop3 =
            topAlt?.violations?.slice(0, 3).map((v) => ({
              type: v.type,
              severity: String(v.severity),
              degree: Number(v.degree ?? 1),
            })) ?? [];
          for (const v of vTop3) violationTypes.push(v.type);

          results.push({
            id: c.id,
            title: c.title,
            elapsedMs: dt,
            summary,
            rankAuthority: computeRankAuthorityDiagnostics(result, {
              rerankEnabled: String(process.env.KERNEL_CGUS_MC_RERANK_ENABLED ?? '').toLowerCase() === 'true',
              minSamplesPerCandidate: Number(process.env.KERNEL_CGUS_MC_RERANK_MIN_SAMPLES ?? 20),
              maxTopCiWidth:
                process.env.KERNEL_CGUS_MC_RERANK_MAX_TOP_CI_WIDTH !== undefined
                  ? Number(process.env.KERNEL_CGUS_MC_RERANK_MAX_TOP_CI_WIDTH)
                  : undefined,
              minTopMargin: Number(process.env.KERNEL_CGUS_MC_RERANK_MIN_TOP_MARGIN ?? 0.05),
              compareTopN: Number(process.env.KERNEL_CGUS_MC_RERANK_COMPARE_TOPN ?? 5),
            }),
            rankAuthorityNoMargin: computeRankAuthorityDiagnostics(result, {
              rerankEnabled: String(process.env.KERNEL_CGUS_MC_RERANK_ENABLED ?? '').toLowerCase() === 'true',
              minSamplesPerCandidate: Number(process.env.KERNEL_CGUS_MC_RERANK_MIN_SAMPLES ?? 20),
              maxTopCiWidth:
                process.env.KERNEL_CGUS_MC_RERANK_MAX_TOP_CI_WIDTH !== undefined
                  ? Number(process.env.KERNEL_CGUS_MC_RERANK_MAX_TOP_CI_WIDTH)
                  : undefined,
              minTopMargin: 0,
              compareTopN: Number(process.env.KERNEL_CGUS_MC_RERANK_COMPARE_TOPN ?? 5),
            }),
            rankReplaySnapshot: buildRankReplaySnapshotV1(result.rankedCandidates as any, suiteCompareTopN),
            ...(vTop3.length ? { violationsTop3: vTop3 } : {}),
          });
        }
      } finally {
        await app.close();
      }
    } else {
      const planFeatures = new PlanFeaturesService();
      const exposureMap = new ExposureMapService();
      const objectiveFunction = new ObjectiveFunctionService(new FatigueCalculatorService());
      const expectedUtility = new ExpectedUtilityService(planFeatures, exposureMap, objectiveFunction);
      const probabilisticWorldModel = new ProbabilisticWorldModelService(exposureMap);
      const unifiedFormula = new UnifiedDecisionFormulaService();
      const cgus = new CGUSSearchService(
        unifiedFormula,
        objectiveFunction,
        expectedUtility,
        probabilisticWorldModel,
        undefined,
        undefined,
        undefined,
        planFeatures,
        exposureMap,
        undefined,
      );

      const maxCandidates = Math.max(2, parseInt(process.env.CGUS_MAX_CANDIDATES ?? '8', 10));
      const rolloutTopK = Math.max(1, parseInt(process.env.CGUS_ROLLOUT_TOPK ?? '3', 10));
      const sampleSize = Math.max(50, parseInt(process.env.MONTE_CARLO_SAMPLES ?? '200', 10));
      const pilot = parseInt(process.env.CGUS_PILOT_SAMPLES ?? '20', 10);
      configSnapshot = {
        mode: 'lite',
        suiteProfile,
        cgusMaxCandidates: maxCandidates,
        cgusRolloutTopK: rolloutTopK,
        monteCarloSamples: sampleSize,
        cgusPilotSamples: pilot,
      };

      for (const c of cases) {
        const t0 = Date.now();
        const worldContext = dsoToMinimalWorldModelContext(c.dso);
        const baseCandidates = buildLiteCandidates({ dso: c.dso, maxCandidates, planFeatures });
        const candidates = patchCandidatesForProfile({ candidates: baseCandidates as any, planFeatures, profile: suiteProfile });

        const resultPre = await cgus.search(candidates as any, worldContext as any, {
          useMonteCarlo: true,
          sampleSize,
          seed,
          useUtilityPrior: true,
          useUtilityWeightedSampling: true,
          useWorldModelRollout: false,
          rolloutTopK,
          pilotSamplesPerCandidate: pilot,
          mcRankAuthority: {
            enabled: String(process.env.KERNEL_CGUS_MC_RERANK_ENABLED ?? '').toLowerCase() === 'true',
            minSamplesPerCandidate: Number(process.env.KERNEL_CGUS_MC_RERANK_MIN_SAMPLES ?? 20),
            maxTopCiWidth:
              process.env.KERNEL_CGUS_MC_RERANK_MAX_TOP_CI_WIDTH !== undefined
                ? Number(process.env.KERNEL_CGUS_MC_RERANK_MAX_TOP_CI_WIDTH)
                : undefined,
            minTopMargin: Number(process.env.KERNEL_CGUS_MC_RERANK_MIN_TOP_MARGIN ?? 0.05),
            compareTopN: Number(process.env.KERNEL_CGUS_MC_RERANK_COMPARE_TOPN ?? 5),
          },
        });
        const result = await cgus.search(candidates as any, worldContext as any, {
          useMonteCarlo: true,
          sampleSize,
          seed,
          useUtilityPrior: true,
          useUtilityWeightedSampling: true,
          useWorldModelRollout: suiteProfile === 'stress_rollout_amplifier' || suiteProfile === 'stress_weather' || suiteProfile === 'stress_fatigue' || suiteProfile === 'stress_cascade',
          rolloutTopK,
          rolloutHorizonSteps: suiteProfile === 'stress_rollout_amplifier' ? 5 : 3,
          pilotSamplesPerCandidate: pilot,
          mcRankAuthority: {
            enabled: String(process.env.KERNEL_CGUS_MC_RERANK_ENABLED ?? '').toLowerCase() === 'true',
            minSamplesPerCandidate: Number(process.env.KERNEL_CGUS_MC_RERANK_MIN_SAMPLES ?? 20),
            maxTopCiWidth:
              process.env.KERNEL_CGUS_MC_RERANK_MAX_TOP_CI_WIDTH !== undefined
                ? Number(process.env.KERNEL_CGUS_MC_RERANK_MAX_TOP_CI_WIDTH)
                : undefined,
            minTopMargin: Number(process.env.KERNEL_CGUS_MC_RERANK_MIN_TOP_MARGIN ?? 0.05),
            compareTopN: Number(process.env.KERNEL_CGUS_MC_RERANK_COMPARE_TOPN ?? 5),
          },
        });

        const hints: OptimizationHints = {
          method: 'CGUS',
          expectedUtility: result.rankedCandidates[0]?.expectedUtility ?? result.rankedCandidates[0]?.utility,
          feasibilityProbability: result.rankedCandidates[0]?.feasibilityProbability,
          recommendedAlternativeId: result.recommended?.id ?? result.rankedCandidates[0]?.candidate.id,
          alternatives: result.rankedCandidates.slice(0, 3).map((r) => ({
            id: r.candidate.id,
            score: r.expectedUtility ?? r.utility,
            finalScore: (r as any).finalScore,
            scoreBreakdown: (r as any).scoreBreakdown,
            expectedUtility: r.expectedUtility,
            feasibilityProbability: r.feasibilityProbability,
            confidenceInterval: r.confidenceInterval
              ? { lower: r.confidenceInterval.lower, upper: r.confidenceInterval.upper, level: 0.95 }
              : undefined,
            summary: (r.candidate as any).summary,
            relaxations: (r.candidate as any).relaxations,
            violations: ((r.candidate as any).violationDetails ?? (r.candidate as any).constraintViolations ?? []).map(
              (v: any) => ({
                type: v.type,
                severity: v.severity,
                degree: v.degree,
                detail: v.detail ?? '',
              }),
            ),
            diversitySignature: (r.candidate as any).diversitySignature,
          })),
        };

        const dt = Date.now() - t0;
        const summary = summarizeHints(hints);
        if (summary.method === 'CGUS') cgusCount++;
        if (!hints || Object.keys(hints).length === 0) emptyCount++;

        altCounts.push(summary.alternativesCount ?? 0);
        altUniqueDivCounts.push(uniqueDiversityCount(hints?.alternatives ?? []));
        if (summary.top?.score !== undefined) top1Scores.push(summary.top.score);
        if (summary.top?.finalScore !== undefined) top1FinalScores.push(summary.top.finalScore);

        const detScoresPre = [...(resultPre.rankedCandidates ?? [])]
          .sort((a, b) => (b.utility ?? -Infinity) - (a.utility ?? -Infinity))
          .map((r) => r.utility ?? -Infinity);
        const mcScoresPre = [...(resultPre.rankedCandidates ?? [])]
          .sort((a, b) => (b.expectedUtility ?? b.utility ?? -Infinity) - (a.expectedUtility ?? a.utility ?? -Infinity))
          .map((r) => r.expectedUtility ?? r.utility ?? -Infinity);
        const postScores = [...(result.rankedCandidates ?? [])].map((r) => (r as any).finalScore ?? r.expectedUtility ?? r.utility ?? -Infinity);
        const detGap = computeTopGap(detScoresPre);
        const mcGap = computeTopGap(mcScoresPre);
        const postGap = computeTopGap(postScores);
        if (detGap !== null) detTopGaps.push(detGap);
        if (mcGap !== null) mcTopGaps.push(mcGap);
        if (postGap !== null) postRolloutTopGaps.push(postGap);

        const preTopSorted = mcScoresPre.slice().sort((a, b) => b - a);
        const preTop1 = preTopSorted[0] ?? null;
        const preTop2 = preTopSorted[1] ?? null;
        const postTopSorted = postScores.slice().sort((a, b) => b - a);
        const postTop1 = postTopSorted[0] ?? null;
        const postTop2 = postTopSorted[1] ?? null;
        if (preTop1 !== null && postTop1 !== null) rolloutDeltaTop1s.push(postTop1 - preTop1);
        if (preTop2 !== null && postTop2 !== null) rolloutDeltaTop2s.push(postTop2 - preTop2);

        const topAlt = (hints?.alternatives ?? [])[0];
        const vTop3 =
          topAlt?.violations?.slice(0, 3).map((v) => ({
            type: v.type,
            severity: String(v.severity),
            degree: Number(v.degree ?? 1),
          })) ?? [];
        for (const v of vTop3) violationTypes.push(v.type);

        results.push({
          id: c.id,
          title: c.title,
          elapsedMs: dt,
          summary,
          rankAuthority: computeRankAuthorityDiagnostics(result, {
            rerankEnabled: String(process.env.KERNEL_CGUS_MC_RERANK_ENABLED ?? '').toLowerCase() === 'true',
            minSamplesPerCandidate: Number(process.env.KERNEL_CGUS_MC_RERANK_MIN_SAMPLES ?? 20),
            maxTopCiWidth:
              process.env.KERNEL_CGUS_MC_RERANK_MAX_TOP_CI_WIDTH !== undefined
                ? Number(process.env.KERNEL_CGUS_MC_RERANK_MAX_TOP_CI_WIDTH)
                : undefined,
            minTopMargin: Number(process.env.KERNEL_CGUS_MC_RERANK_MIN_TOP_MARGIN ?? 0.05),
            compareTopN: Number(process.env.KERNEL_CGUS_MC_RERANK_COMPARE_TOPN ?? 5),
          }),
          rankAuthorityNoMargin: computeRankAuthorityDiagnostics(result, {
            rerankEnabled: String(process.env.KERNEL_CGUS_MC_RERANK_ENABLED ?? '').toLowerCase() === 'true',
            minSamplesPerCandidate: Number(process.env.KERNEL_CGUS_MC_RERANK_MIN_SAMPLES ?? 20),
            maxTopCiWidth:
              process.env.KERNEL_CGUS_MC_RERANK_MAX_TOP_CI_WIDTH !== undefined
                ? Number(process.env.KERNEL_CGUS_MC_RERANK_MAX_TOP_CI_WIDTH)
                : undefined,
            minTopMargin: 0,
            compareTopN: Number(process.env.KERNEL_CGUS_MC_RERANK_COMPARE_TOPN ?? 5),
          }),
          rankReplaySnapshot: buildRankReplaySnapshotV1(result.rankedCandidates as any, suiteCompareTopN),
          ...(vTop3.length ? { violationsTop3: vTop3 } : {}),
        });
      }
    }

    const totalMs = Date.now() - startedAt;
    const altCountHist = countBy(altCounts.map((x) => String(x)) as Array<string>);
    const altUniqueDivHist = countBy(altUniqueDivCounts.map((x) => String(x)) as Array<string>);
    const violationTypeCounts = countBy(violationTypes as Array<string>);

    const gate = {
      cgusRateMin: parseFloat(process.env.CGUS_GATE_CGUS_RATE_MIN ?? '0.95'),
      emptyRateMax: parseFloat(process.env.CGUS_GATE_EMPTY_RATE_MAX ?? '0.05'),
      altP50Min: parseFloat(process.env.CGUS_GATE_ALT_P50_MIN ?? '3'),
      uniqueDivP50Min: parseFloat(process.env.CGUS_GATE_UNIQUE_DIV_P50_MIN ?? '2'),
    };
    const altP50 = quantiles(altCounts, [0.5])['0.5'];
    const uniqueDivP50 = quantiles(altUniqueDivCounts, [0.5])['0.5'];
    const cgusRate = results.length ? cgusCount / results.length : 0;
    const emptyRate = results.length ? emptyCount / results.length : 0;
    const failures: string[] = [];
    if (cgusRate < gate.cgusRateMin) failures.push(`cgusRate ${cgusRate.toFixed(3)} < ${gate.cgusRateMin}`);
    if (emptyRate > gate.emptyRateMax) failures.push(`emptyRate ${emptyRate.toFixed(3)} > ${gate.emptyRateMax}`);
    if (altP50 !== null && altP50 < gate.altP50Min) failures.push(`alternativesCount.p50 ${altP50} < ${gate.altP50Min}`);
    if (uniqueDivP50 !== null && uniqueDivP50 < gate.uniqueDivP50Min) {
      failures.push(`uniqueDiversityCount.p50 ${uniqueDivP50} < ${gate.uniqueDivP50Min}`);
    }
    const gateResult = { passed: failures.length === 0, failures, thresholds: gate };

    const fv = collectFixtureVersionsFromCases(cases as Array<{ metadata?: { cgusDsoFixtureVersion?: string } }>);
    const baseHash = pickReplayConfigForHash({ suiteMode: mode, suiteProfile, suiteN: n });
    const resolvedCgusSubset =
      mode === 'app' ? pickAppDecisionCgusSubset(configSnapshot) : pickLiteCgusSnapshotForHash(configSnapshot);
    const configForHash = mergeReplayConfigForHash(baseHash, resolvedCgusSubset);
    const seedForFingerprint =
      seedRaw !== undefined && String(seedRaw).trim() !== '' ? String(seedRaw).trim() : null;

    const evaluationRunId = randomUUID();
    const runFingerprint = buildRunFingerprint({
      caseId: cases.length === 1 ? cases[0]!.id : null,
      fixtureVersion: fv.primary,
      fixtureVersionsDistinct: fv.distinct.length ? fv.distinct : null,
      corpus: `cgus-suite:${mode}:${suiteProfile}`,
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
      reportKind: 'cgus-suite',
      caseCount: results.length,
      fp: runFingerprint,
    });
    if (fingerprintCompleteness.warnings.length) {
      logger.warn(`Fingerprint completeness: ${fingerprintCompleteness.warnings.join('; ')}`);
    }
    if (process.env.CGUS_FP_STRICT === '1' && !fingerprintCompleteness.ok) {
      logger.error(`Fingerprint STRICT failed: ${fingerprintCompleteness.errors.join(' | ')}`);
      process.exitCode = 1;
    }

    const observabilitySuite = buildObservabilityV1({
      generatedAt: runFingerprint.generatedAt,
      corpus: `cgus-suite:${mode}:${suiteProfile}`,
      caseCount: results.length,
      fixtureVersion: fv.primary,
      fixtureVersionsDistinct: fv.distinct.length > 1 ? fv.distinct : undefined,
      rankAuthorityRows: results.map((r) => r.rankAuthority).filter(Boolean) as any[],
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
      mode,
      n,
      totalMs,
      avgMs: results.length ? totalMs / results.length : 0,
      cgusCount,
      emptyCount,
      configSnapshot,
      gate: gateResult,
      observability: observabilitySuite,
      aggregates: {
        cgusRate: results.length ? cgusCount / results.length : 0,
        emptyRate: results.length ? emptyCount / results.length : 0,
        top1Score: {
          n: top1Scores.length,
          min: top1Scores.length ? Math.min(...top1Scores) : null,
          max: top1Scores.length ? Math.max(...top1Scores) : null,
          quantiles: quantiles(top1Scores, [0.1, 0.5, 0.9]),
        },
        top1FinalScore: {
          n: top1FinalScores.length,
          min: top1FinalScores.length ? Math.min(...top1FinalScores) : null,
          max: top1FinalScores.length ? Math.max(...top1FinalScores) : null,
          quantiles: quantiles(top1FinalScores, [0.1, 0.5, 0.9]),
        },
        alternativesCount: {
          quantiles: quantiles(altCounts, [0.1, 0.5, 0.9]),
          histogram: altCountHist,
        },
        uniqueDiversityCount: {
          quantiles: quantiles(altUniqueDivCounts, [0.1, 0.5, 0.9]),
          histogram: altUniqueDivHist,
        },
        topViolationTypes: topKCounts(violationTypeCounts, 15),
        rankFlipSensitivity: {
          detTopGap: { quantiles: quantiles(detTopGaps, [0.1, 0.5, 0.9]) },
          mcTopGap: { quantiles: quantiles(mcTopGaps, [0.1, 0.5, 0.9]) },
          postRolloutTopGap: { quantiles: quantiles(postRolloutTopGaps, [0.1, 0.5, 0.9]) },
          rolloutDeltaTop1: { quantiles: quantiles(rolloutDeltaTop1s, [0.1, 0.5, 0.9]) },
          rolloutDeltaTop2: { quantiles: quantiles(rolloutDeltaTop2s, [0.1, 0.5, 0.9]) },
        },
        wouldFlipWithoutMarginGate: (() => {
          const rows = results.map((r) => r.rankAuthorityNoMargin).filter(Boolean) as Array<any>;
          const total = rows.length || 1;
          const winnerChanged = rows.filter((x) => x.winnerChanged === true).length;
          const eligible = rows.filter((x) => x.mcEligibleForRerank === true).length;
          return {
            eligibleRate: eligible / total,
            winnerChangedRate: winnerChanged / total,
            counts: { total: rows.length, eligible, winnerChanged },
          };
        })(),
        rankAuthority: (() => {
          const rows = results.map((r) => r.rankAuthority).filter(Boolean) as Array<any>;
          const total = rows.length || 1;
          const disagreements = rows.filter((x) => String(x.deterministicTopId ?? '') !== String(x.mcTopId ?? '')).length;
          const eligible = rows.filter((x) => x.mcEligibleForRerank === true).length;
          const winnerChanged = rows.filter((x) => x.winnerChanged === true).length;
          const eligibleButUnchanged = rows.filter((x) => x.eligibleButUnchanged === true).length;
          const winnerLockedButTopNChanged = rows.filter((x) => x.winnerLockedButTopNChanged === true).length;
          const marginBlockedFlip = rows.filter((x) => x.marginBlockedFlip === true).length;
          const changedLowMargin = rows.filter((x) => x.winnerChanged === true && (x.topMargin ?? 0) < 0.05).length;
          const changedWideCi = rows.filter(
            (x) => x.winnerChanged === true && typeof x.topCiWidth === 'number' && x.topCiWidth > 0.1,
          ).length;
          const mcEligibleRate = eligible / total;
          const winnerChangedRate = winnerChanged / total;
          const winnerLockedButTopNChangedRate = winnerLockedButTopNChanged / total;
          return {
            deterministicVsMcDisagreementRate: disagreements / total,
            mcEligibleRate,
            winnerChangedRate,
            eligibleButUnchangedRate: eligibleButUnchanged / total,
            winnerLockedButTopNChangedRate,
            marginBlockedFlipRate: marginBlockedFlip / total,
            winnerChangedAndLowMarginRate: changedLowMargin / total,
            winnerChangedAndWideCiRate: changedWideCi / total,
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
              winnerChangedAndLowMargin: changedLowMargin,
              winnerChangedAndWideCi: changedWideCi,
            },
          };
        })(),
      },
      env: {
        ALLOW_NO_DATABASE: process.env.ALLOW_NO_DATABASE,
        NODE_ENV: process.env.NODE_ENV,
        MONTE_CARLO_SAMPLES: process.env.MONTE_CARLO_SAMPLES,
        CGUS_MAX_CANDIDATES: process.env.CGUS_MAX_CANDIDATES,
        CGUS_ROLLOUT_TOPK: process.env.CGUS_ROLLOUT_TOPK,
        CGUS_PILOT_SAMPLES: process.env.CGUS_PILOT_SAMPLES,
        CGUS_SUITE_MODE: process.env.CGUS_SUITE_MODE,
        CGUS_SUITE_PROFILE: process.env.CGUS_SUITE_PROFILE,
        CGUS_GATE_CGUS_RATE_MIN: process.env.CGUS_GATE_CGUS_RATE_MIN,
        CGUS_GATE_EMPTY_RATE_MAX: process.env.CGUS_GATE_EMPTY_RATE_MAX,
        CGUS_GATE_ALT_P50_MIN: process.env.CGUS_GATE_ALT_P50_MIN,
        CGUS_GATE_UNIQUE_DIV_P50_MIN: process.env.CGUS_GATE_UNIQUE_DIV_P50_MIN,
        KERNEL_CGUS_MC_RERANK_ENABLED: process.env.KERNEL_CGUS_MC_RERANK_ENABLED,
        KERNEL_CGUS_MC_RERANK_MIN_SAMPLES: process.env.KERNEL_CGUS_MC_RERANK_MIN_SAMPLES,
        KERNEL_CGUS_MC_RERANK_MAX_TOP_CI_WIDTH: process.env.KERNEL_CGUS_MC_RERANK_MAX_TOP_CI_WIDTH,
        KERNEL_CGUS_MC_RERANK_MIN_TOP_MARGIN: process.env.KERNEL_CGUS_MC_RERANK_MIN_TOP_MARGIN,
        KERNEL_CGUS_MC_RERANK_COMPARE_TOPN: process.env.KERNEL_CGUS_MC_RERANK_COMPARE_TOPN,
      },
      results,
      ...(bridgeReplay ? { bridgeReplay } : {}),
    };

    const abs = path.isAbsolute(outPath) ? outPath : path.join(process.cwd(), outPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, JSON.stringify(report, null, 2), 'utf-8');
    logger.log(`Done. Wrote report: ${abs}`);
    if (!gateResult.passed) {
      logger.error(`Gate failed: ${gateResult.failures.join(' | ')}`);
      process.exitCode = 1;
    }
}

main().catch((e) => {
  logger.error(`Fatal: ${(e as Error)?.message}`);
  process.exit(1);
});

