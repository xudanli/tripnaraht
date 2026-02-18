#!/usr/bin/env tsx
/**
 * P0 基线采集：从运行中服务的 /api/llm/usage 导出 Token baseline YAML
 *
 * 用途: 采集 Token 按阶段统计，产出 DECISION_KERNEL_BASELINE_TOKEN_*.yaml
 * 参考: docs/DECISION_KERNEL_EVALUATION_BASELINE.md
 *
 * 使用:
 *   npx tsx scripts/export-token-baseline.ts                    # 默认 http://localhost:3000
 *   npx tsx scripts/export-token-baseline.ts --url http://...   # 指定服务地址
 *   npx tsx scripts/export-token-baseline.ts --start 2026-02-01 --end 2026-02-16  # 时间范围
 *
 * 前置条件: 服务需已启动，且已有 Token 打点数据（内存存储，重启后清空）
 */

import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

function parseArgs(): { baseUrl: string; startTime?: string; endTime?: string } {
  const args = process.argv.slice(2);
  let baseUrl = DEFAULT_BASE_URL;
  let startTime: string | undefined;
  let endTime: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url' && args[i + 1]) {
      baseUrl = args[++i];
    } else if (args[i] === '--start' && args[i + 1]) {
      startTime = args[++i];
    } else if (args[i] === '--end' && args[i + 1]) {
      endTime = args[++i];
    }
  }
  return { baseUrl, startTime, endTime };
}

async function fetchUsage(baseUrl: string, startTime?: string, endTime?: string): Promise<any> {
  const params = new URLSearchParams();
  if (startTime) params.set('startTime', startTime);
  if (endTime) params.set('endTime', endTime);
  const qs = params.toString();
  const url = `${baseUrl.replace(/\/$/, '')}/api/llm/usage${qs ? `?${qs}` : ''}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`GET ${url} failed: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  if (!json.success || !json.data) {
    throw new Error(`API returned error: ${JSON.stringify(json)}`);
  }
  return json.data;
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
    if (v === null || (typeof v === 'object' && v !== null && Object.keys(v).length === 0)) {
      lines.push(`${pad}${k}: null`);
    } else if (typeof v !== 'object' || Array.isArray(v)) {
      lines.push(`${pad}${k}: ${v}`);
    } else {
      lines.push(`${pad}${k}:`);
      lines.push(toYaml(v, indent + 1));
    }
  }
  return lines.join('\n');
}

function buildBaselineYaml(data: any): string {
  const byStep = data.byStep || {};
  const byPhase: Record<string, number | null> = {};
  for (const step of ['INTAKE', 'RESEARCH', 'GATE_EVAL', 'PLAN_GEN', 'VERIFY', 'REPAIR', 'NARRATE']) {
    byPhase[step] = byStep[step]?.total_tokens ?? null;
  }

  const totalCalls = data.totalCalls ?? 0;
  const totalTokens = data.totalTokens ?? 0;
  const tokenPerRequest = totalCalls > 0 ? Math.round(totalTokens / totalCalls) : null;

  const baseline = {
    meta: {
      collected_at: new Date().toISOString().slice(0, 19) + 'Z',
      window_days: null,
      valid_requests: totalCalls,
      source: 'GET /api/llm/usage',
      note: 'TokenStatsService 为内存存储，重启后清空。7 天基线需定期采集或接入持久化。',
    },
    metrics: {
      token_per_request: {
        mean: tokenPerRequest,
        p50: null,
        p95: null,
        by_phase: byPhase,
      },
      latency_ms: {
        p50: null,
        p95: null,
        p99: null,
      },
      adoption_rate: null,
      constraint_consistency: null,
      guardian_attribution: null,
    },
    raw: {
      totalTokens,
      totalCalls,
      avgTokensPerCall: data.avgTokensPerCall ?? null,
      successRate: data.successRate ?? null,
      byStep,
    },
  };

  return toYaml(baseline);
}

async function main() {
  const { baseUrl, startTime, endTime } = parseArgs();

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('P0 基线采集: Token 按阶段导出');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`服务地址: ${baseUrl}/api/llm/usage`);
  if (startTime || endTime) {
    console.log(`时间范围: ${startTime || '无'} ~ ${endTime || '无'}`);
  }
  console.log('');

  try {
    const data = await fetchUsage(baseUrl, startTime, endTime);
    const yamlContent = buildBaselineYaml(data);

    const outDir = path.join(process.cwd(), 'docs');
    const dateStr = new Date().toISOString().slice(0, 10);
    const outFile = path.join(outDir, `DECISION_KERNEL_BASELINE_TOKEN_${dateStr}.yaml`);

    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outFile, yamlContent, 'utf8');

    console.log('✅ 导出成功');
    console.log(`   总 Token: ${data.totalTokens ?? 0}`);
    console.log(`   总调用: ${data.totalCalls ?? 0}`);
    console.log(`   byStep: ${Object.keys(data.byStep || {}).join(', ') || '(无)'}`);
    console.log(`\n✅ 已保存: ${outFile}\n`);
  } catch (error: any) {
    console.error('❌ 导出失败:', error?.message || error);
    if (error?.message?.includes('fetch')) {
      console.error('\n提示: 请确保服务已启动 (npm run start) 且 /api/llm/usage 可访问');
    }
    process.exit(1);
  }
}

main();
