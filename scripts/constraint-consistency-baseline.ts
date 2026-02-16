#!/usr/bin/env tsx
/**
 * P0 约束一致性 baseline 测试
 *
 * 用途: 5 固定用例 × N 轮，产出 Gate/Constraint 结果一致性定量报告
 * 参考: docs/DECISION_KERNEL_EVALUATION_BASELINE.md, docs/DECISION_KERNEL_DEV_TEAM_PLAN.md
 *
 * 使用:
 *   npx tsx scripts/constraint-consistency-baseline.ts           # 5 用例 × 5 轮（完整）
 *   npx tsx scripts/constraint-consistency-baseline.ts --quick   # 5 用例 × 2 轮（快速）
 *   npx tsx scripts/constraint-consistency-baseline.ts --rounds=3 # 自定义轮数
 */

import * as fs from 'fs';
import * as path from 'path';
import { ClaudeGatekeeperAgentService } from '../src/agent/services/sub-agents/gatekeeper-agent.service';
import { FRoadCheckSkill } from '../src/skills/world/f-road-check.skill';
import { WeatherAlertSkill } from '../src/skills/world/weather-alert.skill';
import { IcelandWeatherRealtimeService } from '../src/skills/world/services/iceland-weather-realtime.service';
import { RoadStatusRealtimeService } from '../src/skills/world/services/road-status-realtime.service';
import { PrismaClient } from '@prisma/client';
import type { GateResult, GateViolation, TripPlanRequest } from '../src/agent/interfaces/trip-plan.interface';

const prisma = new PrismaClient();

/** 违规签名：用于 Jaccard 集合比较 */
function violationSignature(v: GateViolation): string {
  return `${v.type}:${v.severity}:${v.detail}`;
}

/** Jaccard 相似度：|A ∩ B| / |A ∪ B| */
function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 1;
  const intersection = [...setA].filter((x) => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 1 : intersection / union;
}

/** 单用例多轮结果 */
interface CaseRoundResult {
  case_id: string;
  round: number;
  gate_result: string;
  violation_count: number;
  violation_signatures: string[];
  duration_ms: number;
}

/** 单用例汇总 */
interface CaseSummary {
  case_id: string;
  name: string;
  rounds: number;
  gate_status_counts: Record<string, number>;
  gate_majority: string;
  gate_agreement_rate: number;
  violation_jaccard_mean: number;
  violation_jaccard_min: number;
  round_results: CaseRoundResult[];
}

const FIXTURES: Array<{ id: string; name: string; request: Partial<TripPlanRequest>; researchData: Record<string, any> }> = [
  {
    id: 'case-1',
    name: '冰岛市内低风险 (Reykjavík)',
    request: {
      request_id: 'baseline-case-1',
      origin: { lat: 64.1466, lng: -21.9426 },
      destination: { lat: 64.1355, lng: -21.8954 },
      date_range: { start_date: '2026-07-15', end_date: '2026-07-18' },
    },
    researchData: {},
  },
  {
    id: 'case-2',
    name: '冰岛高地 F208 (Landmannalaugar)',
    request: {
      request_id: 'baseline-case-2',
      origin: 'Vík, Iceland',
      destination: 'Landmannalaugar, F208, Iceland',
      date_range: { start_date: '2026-07-15', end_date: '2026-07-18' },
    },
    researchData: {},
  },
  {
    id: 'case-3',
    name: '非冰岛行程 (巴黎→伦敦)',
    request: {
      request_id: 'baseline-case-3',
      origin: 'Paris, France',
      destination: 'London, UK',
      date_range: { start_date: '2026-08-01', end_date: '2026-08-07' },
    },
    researchData: {},
  },
  {
    id: 'case-4',
    name: '冰岛冬季 (12月)',
    request: {
      request_id: 'baseline-case-4',
      origin: { lat: 64.1466, lng: -21.9426 },
      destination: { lat: 64.8577, lng: -19.0059 },
      date_range: { start_date: '2026-12-15', end_date: '2026-12-18' },
    },
    researchData: {},
  },
  {
    id: 'case-5',
    name: '日本东京行程',
    request: {
      request_id: 'baseline-case-5',
      origin: 'Tokyo, Japan',
      destination: 'Kyoto, Japan',
      date_range: { start_date: '2026-04-01', end_date: '2026-04-05' },
    },
    researchData: {},
  },
];

async function runBaseline(rounds: number): Promise<{ summaries: CaseSummary[]; meta: Record<string, any> }> {
  const roadStatusService = new RoadStatusRealtimeService(prisma);
  const weatherService = new IcelandWeatherRealtimeService(prisma);
  const fRoadSkill = new FRoadCheckSkill(roadStatusService);
  const weatherSkill = new WeatherAlertSkill(weatherService);

  const gatekeeper = new ClaudeGatekeeperAgentService(
    undefined,
    undefined,
    fRoadSkill,
    weatherSkill,
    undefined, // avalancheRisk
  );

  const summaries: CaseSummary[] = [];

  for (const fixture of FIXTURES) {
    const roundResults: CaseRoundResult[] = [];
    const gateCounts: Record<string, number> = {};
    const violationSets: Set<string>[] = [];

    for (let r = 0; r < rounds; r++) {
      const start = Date.now();
      const result: GateResult = await gatekeeper.evaluateGate(
        fixture.request as TripPlanRequest,
        { ...fixture.researchData },
        { request_id: fixture.request.request_id!, current_step: 'GATE_EVAL' } as any,
      );
      const duration = Date.now() - start;

      const sigs = (result.violations || []).map(violationSignature);
      roundResults.push({
        case_id: fixture.id,
        round: r + 1,
        gate_result: result.gate_result,
        violation_count: result.violations?.length || 0,
        violation_signatures: sigs,
        duration_ms: duration,
      });

      gateCounts[result.gate_result] = (gateCounts[result.gate_result] || 0) + 1;
      violationSets.push(new Set(sigs));
    }

    const majorityGate = Object.entries(gateCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
    const majorityCount = gateCounts[majorityGate] || 0;
    const gateAgreementRate = rounds > 0 ? majorityCount / rounds : 0;

    let jaccardMean = 1;
    let jaccardMin = 1;
    if (violationSets.length >= 2) {
      const pairs: number[] = [];
      for (let i = 0; i < violationSets.length; i++) {
        for (let j = i + 1; j < violationSets.length; j++) {
          const jacc = jaccardSimilarity(violationSets[i], violationSets[j]);
          pairs.push(jacc);
        }
      }
      jaccardMean = pairs.reduce((a, b) => a + b, 0) / pairs.length;
      jaccardMin = Math.min(...pairs);
    }

    summaries.push({
      case_id: fixture.id,
      name: fixture.name,
      rounds,
      gate_status_counts: gateCounts,
      gate_majority: majorityGate,
      gate_agreement_rate: gateAgreementRate,
      violation_jaccard_mean: jaccardMean,
      violation_jaccard_min: jaccardMin,
      round_results: roundResults,
    });
  }

  return {
    summaries,
    meta: {
      collected_at: new Date().toISOString(),
      rounds_per_case: rounds,
      total_cases: FIXTURES.length,
      total_runs: FIXTURES.length * rounds,
    },
  };
}

function buildReport(data: { summaries: CaseSummary[]; meta: Record<string, any> }): object {
  const overallGateAgreement =
    data.summaries.reduce((s, c) => s + c.gate_agreement_rate, 0) / (data.summaries.length || 1);
  const overallJaccardMean =
    data.summaries.reduce((s, c) => s + c.violation_jaccard_mean, 0) / (data.summaries.length || 1);
  const overallJaccardMin = Math.min(...data.summaries.map((c) => c.violation_jaccard_min), 1);

  return {
    meta: {
      ...data.meta,
      description: 'Decision Kernel 约束一致性 baseline - 5 固定用例 × N 轮',
    },
    constraint_consistency: {
      gate_status_agreement_rate: overallGateAgreement,
      violation_jaccard_mean: overallJaccardMean,
      violation_jaccard_min: overallJaccardMin,
      interpretation: 'gate_status_agreement 越接近 1 越好；violation_jaccard 越接近 1 表示多轮输出越一致',
    },
    by_case: data.summaries.map((s) => ({
      case_id: s.case_id,
      name: s.name,
      rounds: s.rounds,
      gate_majority: s.gate_majority,
      gate_agreement_rate: s.gate_agreement_rate,
      gate_status_distribution: s.gate_status_counts,
      violation_jaccard_mean: s.violation_jaccard_mean,
      violation_jaccard_min: s.violation_jaccard_min,
      round_results: s.round_results.map((r) => ({
        round: r.round,
        gate_result: r.gate_result,
        violation_count: r.violation_count,
        duration_ms: r.duration_ms,
      })),
    })),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const quick = args.includes('--quick');
  const roundsArg = args.find((a) => a.startsWith('--rounds='));
  const rounds = roundsArg ? parseInt(roundsArg.split('=')[1], 10) : quick ? 2 : 5;

  if (rounds < 2) {
    console.error('rounds 至少为 2');
    process.exit(1);
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('P0 约束一致性 baseline 测试');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`配置: ${FIXTURES.length} 用例 × ${rounds} 轮 = ${FIXTURES.length * rounds} 次 Gate 调用\n`);

  try {
    const data = await runBaseline(rounds);
    const report = buildReport(data);

    const outDir = path.join(process.cwd(), 'docs');
    const outFile = path.join(outDir, `DECISION_KERNEL_BASELINE_CONSTRAINT_CONSISTENCY_${new Date().toISOString().slice(0, 10)}.yaml`);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const yamlContent = toYaml(report);
    fs.writeFileSync(outFile, yamlContent, 'utf8');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('结果摘要');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log(`约束一致性 (Constraint Consistency):`);
    console.log(`  gate_status_agreement_rate: ${((report as any).constraint_consistency.gate_status_agreement_rate * 100).toFixed(1)}%`);
    console.log(`  violation_jaccard_mean:    ${((report as any).constraint_consistency.violation_jaccard_mean * 100).toFixed(1)}%`);
    console.log(`  violation_jaccard_min:      ${((report as any).constraint_consistency.violation_jaccard_min * 100).toFixed(1)}%\n`);

    console.log('按用例:');
    for (const c of (report as any).by_case) {
      console.log(`  ${c.case_id} (${c.name}): gate=${c.gate_majority} agreement=${(c.gate_agreement_rate * 100).toFixed(0)}% jaccard_mean=${(c.violation_jaccard_mean * 100).toFixed(0)}%`);
    }

    console.log(`\n✅ 完整报告已保存: ${outFile}\n`);
  } catch (error: any) {
    console.error('❌ 测试失败:', error?.message || error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

function toYaml(obj: any, indent = 0): string {
  const pad = '  '.repeat(indent);
  if (obj === null || typeof obj !== 'object') {
    return `${pad}${obj}`;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => `${pad}- ${toYaml(item, indent + 1).trimStart()}`).join('\n');
  }
  const lines: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || (typeof v !== 'object' && typeof v !== 'boolean' && v !== '')) {
      lines.push(`${pad}${k}: ${v}`);
    } else if (Array.isArray(v) || (typeof v === 'object' && v !== null && Object.keys(v).length > 0)) {
      lines.push(`${pad}${k}:`);
      lines.push(toYaml(v, indent + 1));
    } else {
      lines.push(`${pad}${k}: ${v}`);
    }
  }
  return lines.join('\n');
}

main()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
