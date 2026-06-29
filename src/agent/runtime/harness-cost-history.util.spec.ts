import { parseAgenticTokenQuotaConfig } from './agentic-token-quota.util';
import {
  buildHarnessCostHistoryV1,
  evaluateHarnessCostAlerts,
  parseHarnessCostAlertGlobalQuotaPct,
} from './harness-cost-history.util';

describe('harness-cost-history.util', () => {
  it('evaluateHarnessCostAlerts warns near global quota', () => {
    const alerts = evaluateHarnessCostAlerts({
      quotaConfig: parseAgenticTokenQuotaConfig({ AGENTIC_DAILY_TOKEN_QUOTA_GLOBAL: '1000' }),
      todayGlobalTokensUsed: 920,
      dailyBuckets: [],
      warnQuotaPct: 90,
    });
    expect(alerts.some((a) => a.code === 'global_token_quota_high')).toBe(true);
  });

  it('evaluateHarnessCostAlerts critical when exceeded', () => {
    const alerts = evaluateHarnessCostAlerts({
      quotaConfig: parseAgenticTokenQuotaConfig({ AGENTIC_DAILY_TOKEN_QUOTA_GLOBAL: '1000' }),
      todayGlobalTokensUsed: 1000,
      dailyBuckets: [],
    });
    expect(alerts.some((a) => a.code === 'global_token_quota_exceeded')).toBe(true);
  });

  it('buildHarnessCostHistoryV1 includes buckets and today', () => {
    const hist = buildHarnessCostHistoryV1({
      seriesDays: 3,
      dailyBuckets: [
        { date: '2026-06-26', total_cost_usd: 0.01, total_tokens: 1000, calls: 2 },
        { date: '2026-06-27', total_cost_usd: 0.02, total_tokens: 2000, calls: 3 },
      ],
      dbAvailable: true,
      quotaConfig: parseAgenticTokenQuotaConfig({ AGENTIC_DAILY_TOKEN_QUOTA_GLOBAL: '5000' }),
      todayGlobalTokensUsed: 100,
      env: { HARNESS_COST_ALERT_GLOBAL_QUOTA_PCT: '90' },
    });
    expect(hist.schemaId).toBe('tripnara.harness_cost_history@v1');
    expect(hist.daily_buckets).toHaveLength(2);
    expect(hist.today.global_tokens_used).toBe(100);
  });
});
