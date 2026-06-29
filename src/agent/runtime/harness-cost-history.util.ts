/**
 * Harness Cost 历史曲线 + 告警（Observability 横切）。
 */

import type { AgenticTokenQuotaConfig } from './agentic-token-quota.util';
import { utcDateKey } from './agentic-token-quota.util';

export interface HarnessCostDailyBucketV1 {
  date: string;
  total_cost_usd: number;
  total_tokens: number;
  calls: number;
}

export type HarnessCostAlertCode =
  | 'global_token_quota_high'
  | 'global_token_quota_exceeded'
  | 'daily_cost_spike';

export interface HarnessCostAlertV1 {
  code: HarnessCostAlertCode;
  severity: 'warn' | 'critical';
  message: string;
  value?: number;
  threshold?: number;
}

export interface HarnessCostHistoryV1 {
  schemaId: 'tripnara.harness_cost_history@v1';
  version: 1;
  source: 'db' | 'partial' | 'unavailable';
  series_days: number;
  daily_buckets: HarnessCostDailyBucketV1[];
  today: {
    utc_date: string;
    global_tokens_used: number | null;
    global_tokens_limit: number;
    llm_cost_usd: number | null;
  };
  alerts: HarnessCostAlertV1[];
}

export function parseHarnessCostAlertGlobalQuotaPct(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.HARNESS_COST_ALERT_GLOBAL_QUOTA_PCT?.trim();
  if (!raw) return 90;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : 90;
}

export function parseHarnessCostAlertDailyUsdSpike(
  env: NodeJS.ProcessEnv = process.env,
): number {
  return parsePositiveUsdEnv(env.HARNESS_COST_ALERT_DAILY_USD);
}

function parsePositiveUsdEnv(raw: string | undefined): number {
  if (!raw?.trim()) return 0;
  const n = parseFloat(raw.trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function evaluateHarnessCostAlerts(params: {
  quotaConfig: AgenticTokenQuotaConfig;
  todayGlobalTokensUsed: number | null;
  dailyBuckets: HarnessCostDailyBucketV1[];
  warnQuotaPct?: number;
  dailyUsdSpikeThreshold?: number;
}): HarnessCostAlertV1[] {
  const alerts: HarnessCostAlertV1[] = [];
  const warnPct = params.warnQuotaPct ?? 90;
  const used = params.todayGlobalTokensUsed;
  const limit = params.quotaConfig.globalDaily;

  if (limit > 0 && used != null) {
    const pct = (used / limit) * 100;
    if (used >= limit) {
      alerts.push({
        code: 'global_token_quota_exceeded',
        severity: 'critical',
        message: '平台今日 Agent token 配额已用尽或超限',
        value: used,
        threshold: limit,
      });
    } else if (pct >= warnPct) {
      alerts.push({
        code: 'global_token_quota_high',
        severity: 'warn',
        message: `平台今日 Agent token 用量已达配额 ${pct.toFixed(1)}%`,
        value: used,
        threshold: limit,
      });
    }
  }

  const spikeUsd = params.dailyUsdSpikeThreshold ?? 0;
  if (spikeUsd > 0 && params.dailyBuckets.length >= 2) {
    const todayKey = utcDateKey();
    const todayBucket = params.dailyBuckets.find((b) => b.date === todayKey);
    const prior = params.dailyBuckets.filter((b) => b.date < todayKey);
    const priorAvg =
      prior.length > 0
        ? prior.reduce((s, b) => s + b.total_cost_usd, 0) / prior.length
        : 0;
    const todayCost = todayBucket?.total_cost_usd ?? 0;
    if (todayCost >= spikeUsd && todayCost > priorAvg * 1.5) {
      alerts.push({
        code: 'daily_cost_spike',
        severity: 'warn',
        message: `今日 LLM 成本 $${todayCost.toFixed(4)} 高于近期均值且超过告警阈值`,
        value: todayCost,
        threshold: spikeUsd,
      });
    }
  }

  return alerts;
}

export function buildHarnessCostHistoryV1(params: {
  seriesDays: number;
  dailyBuckets: HarnessCostDailyBucketV1[];
  dbAvailable: boolean;
  quotaConfig: AgenticTokenQuotaConfig;
  todayGlobalTokensUsed: number | null;
  env?: NodeJS.ProcessEnv;
}): HarnessCostHistoryV1 {
  const env = params.env ?? process.env;
  const todayKey = utcDateKey();
  const todayBucket = params.dailyBuckets.find((b) => b.date === todayKey);
  const alerts = evaluateHarnessCostAlerts({
    quotaConfig: params.quotaConfig,
    todayGlobalTokensUsed: params.todayGlobalTokensUsed,
    dailyBuckets: params.dailyBuckets,
    warnQuotaPct: parseHarnessCostAlertGlobalQuotaPct(env),
    dailyUsdSpikeThreshold: parseHarnessCostAlertDailyUsdSpike(env),
  });

  let source: HarnessCostHistoryV1['source'] = 'unavailable';
  if (params.dbAvailable && params.dailyBuckets.length > 0) {
    source = params.todayGlobalTokensUsed != null ? 'db' : 'partial';
  } else if (params.todayGlobalTokensUsed != null) {
    source = 'partial';
  }

  return {
    schemaId: 'tripnara.harness_cost_history@v1',
    version: 1,
    source,
    series_days: params.seriesDays,
    daily_buckets: params.dailyBuckets,
    today: {
      utc_date: todayKey,
      global_tokens_used: params.todayGlobalTokensUsed,
      global_tokens_limit: params.quotaConfig.globalDaily,
      llm_cost_usd: todayBucket?.total_cost_usd ?? null,
    },
    alerts,
  };
}
