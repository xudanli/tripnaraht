import {
  buildAgenticGlobalQuotaRedisKey,
  buildAgenticOrgQuotaRedisKey,
  buildAgenticUserQuotaRedisKey,
  evaluateAgenticTokenQuota,
  parseAgenticTokenQuotaConfig,
} from './agentic-token-quota.util';

describe('parseAgenticTokenQuotaConfig', () => {
  it('enabled when per-user quota set', () => {
    const cfg = parseAgenticTokenQuotaConfig({ AGENTIC_DAILY_TOKEN_QUOTA_PER_USER: '50000' });
    expect(cfg.enabled).toBe(true);
    expect(cfg.perUserDaily).toBe(50000);
  });

  it('disabled when unset', () => {
    expect(parseAgenticTokenQuotaConfig({}).enabled).toBe(false);
  });
});

describe('evaluateAgenticTokenQuota', () => {
  const baseCfg = parseAgenticTokenQuotaConfig({
    AGENTIC_DAILY_TOKEN_QUOTA_PER_USER: '1000',
    AGENTIC_DAILY_TOKEN_QUOTA_GLOBAL: '5000',
  });

  it('allows under limit', () => {
    const r = evaluateAgenticTokenQuota({
      config: baseCfg,
      userUsed: 100,
      globalUsed: 200,
      estimatedTokens: 400,
      hasUserId: true,
    });
    expect(r.allowed).toBe(true);
  });

  it('blocks user daily overflow', () => {
    const r = evaluateAgenticTokenQuota({
      config: baseCfg,
      userUsed: 900,
      globalUsed: 200,
      estimatedTokens: 200,
      hasUserId: true,
    });
    expect(r.allowed).toBe(false);
    expect(r.scope).toBe('user_daily');
    expect(r.userMessage).toMatch(/今日/);
  });

  it('blocks global daily overflow', () => {
    const r = evaluateAgenticTokenQuota({
      config: baseCfg,
      userUsed: 0,
      globalUsed: 4990,
      estimatedTokens: 20,
      hasUserId: true,
    });
    expect(r.allowed).toBe(false);
    expect(r.scope).toBe('global_daily');
  });

  it('blocks session cap overflow', () => {
    const cfg = parseAgenticTokenQuotaConfig({ AGENTIC_SESSION_TOKEN_CAP: '1000' });
    const r = evaluateAgenticTokenQuota({
      config: cfg,
      userUsed: 0,
      orgUsed: 0,
      globalUsed: 0,
      sessionUsed: 900,
      estimatedTokens: 200,
      hasUserId: true,
      sessionId: 'sess-1',
    });
    expect(r.allowed).toBe(false);
    expect(r.scope).toBe('session');
  });

  it('blocks org daily overflow', () => {
    const cfg = parseAgenticTokenQuotaConfig({ AGENTIC_DAILY_TOKEN_QUOTA_PER_ORG: '5000' });
    const r = evaluateAgenticTokenQuota({
      config: cfg,
      userUsed: 0,
      orgUsed: 4900,
      globalUsed: 0,
      estimatedTokens: 200,
      hasUserId: true,
      orgId: 'org-1',
    });
    expect(r.allowed).toBe(false);
    expect(r.scope).toBe('org_daily');
    expect(r.org_id).toBe('org-1');
  });
});

describe('quota redis keys', () => {
  it('includes user and date', () => {
    expect(buildAgenticUserQuotaRedisKey('u1', '2026-06-28')).toContain('u1');
    expect(buildAgenticGlobalQuotaRedisKey('2026-06-28')).toContain('global');
    expect(buildAgenticOrgQuotaRedisKey('org-1', '2026-06-28')).toContain('org-1');
  });
});
