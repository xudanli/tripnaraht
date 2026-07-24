import {
  buildCostGovernanceAdminSnapshot,
  buildCostGovernanceObservability,
  estimateUsdFromTokens,
  mountAgenticTokenQuotaCheckOnRequest,
} from './cost-governance-observability.util';
import { evaluateAgenticTokenQuota, parseAgenticTokenQuotaConfig } from './agentic-token-quota.util';

describe('cost-governance-observability.util', () => {
  it('estimateUsdFromTokens', () => {
    expect(estimateUsdFromTokens(5000)).toBe(0.01);
  });

  it('buildCostGovernanceObservability reads mounted quota check', () => {
    const request = { request_id: 'r1', options: { client_session_id: 's1' } };
    mountAgenticTokenQuotaCheckOnRequest(request as never, {
      allowed: true,
      scope: 'session',
      used: 100,
      limit: 5000,
      remaining: 4900,
      session_id: 's1',
    });
    const obs = buildCostGovernanceObservability(request as never, {
      AGENTIC_SESSION_TOKEN_CAP: '5000',
    });
    expect(obs.schemaId).toBe('tripnara.cost_governance@v1');
    expect(obs.session_id).toBe('s1');
    expect(obs.admission_scope).toBe('session');
  });

  it('buildCostGovernanceAdminSnapshot exposes limits', () => {
    const snap = buildCostGovernanceAdminSnapshot({
      AGENTIC_DAILY_TOKEN_QUOTA_PER_USER: '100000',
      AGENTIC_DAILY_TOKEN_QUOTA_PER_ORG: '2000000',
      AGENTIC_SESSION_TOKEN_CAP: '8000',
    });
    expect(snap.session_token_cap).toBe(8000);
    expect(snap.org_daily_limit).toBe(2000000);
  });

  it('buildCostGovernanceObservability echoes org scope', () => {
    const request = {
      request_id: 'r1',
      user_id: 'u1',
      message: 'hi',
      options: { organization_id: 'org-1' },
    };
    mountAgenticTokenQuotaCheckOnRequest(request as never, {
      allowed: true,
      scope: 'org_daily',
      used: 100,
      limit: 50000,
      remaining: 49900,
      org_id: 'org-1',
    });
    const obs = buildCostGovernanceObservability(request as never, {
      AGENTIC_DAILY_TOKEN_QUOTA_PER_ORG: '50000',
    });
    expect(obs.org_id).toBe('org-1');
    expect(obs.org_daily_limit).toBe(50000);
    expect(obs.admission_scope).toBe('org_daily');
  });

  it('session cap blocks in evaluateAgenticTokenQuota', () => {
    const cfg = parseAgenticTokenQuotaConfig({ AGENTIC_SESSION_TOKEN_CAP: '1000' });
    const r = evaluateAgenticTokenQuota({
      config: cfg,
      userUsed: 0,
      globalUsed: 0,
      sessionUsed: 900,
      estimatedTokens: 200,
      hasUserId: true,
      sessionId: 'sess-1',
    });
    expect(r.allowed).toBe(false);
    expect(r.scope).toBe('session');
  });
});
