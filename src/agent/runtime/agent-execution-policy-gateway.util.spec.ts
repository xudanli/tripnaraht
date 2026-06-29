import {
  evaluateAgenticAdmission,
  evaluateMcpToolDispatch,
  mergeExecutionToolPolicies,
  resolveAgenticTokenQuotaConfigFromEnv,
  type AgenticAdmissionDecision,
  type McpToolDispatchDecision,
} from './agent-execution-policy-gateway.util';
import {
  buildAgenticGlobalQuotaRedisKey,
  buildAgenticUserQuotaRedisKey,
} from './agentic-token-quota.util';

describe('mergeExecutionToolPolicies', () => {
  it('includes destructive baseline without HITL', () => {
    const p = mergeExecutionToolPolicies(false, undefined);
    expect(p['delete_event']?.mode).toBe('ask');
  });
});

describe('evaluateMcpToolDispatch', () => {
  it('holds deny policy', () => {
    const d = evaluateMcpToolDispatch({
      mcpToolName: 'google-calendar.deleteCalendar',
      policies: mergeExecutionToolPolicies(false, undefined),
    });
    expect(d.action).toBe('hold');
    expect(d.mode).toBe('deny');
    expect(d.governanceAuditId).toMatch(/^gov_/);
  });

  it('executes when pre-approved ask', () => {
    const d = evaluateMcpToolDispatch({
      mcpToolName: 'exa.deepSearch',
      policies: mergeExecutionToolPolicies(true, undefined),
      toolCallId: 'call_1',
      approvedInvocations: [{ toolCallId: 'call_1', mcpToolName: 'exa.deepSearch' }],
    });
    expect(d.action).toBe('execute');
  });
});

describe('evaluateAgenticAdmission', () => {
  it('blocks when over user quota', () => {
    const cfg = resolveAgenticTokenQuotaConfigFromEnv({
      AGENTIC_DAILY_TOKEN_QUOTA_PER_USER: '100',
    });
    const d = evaluateAgenticAdmission({
      config: cfg,
      userUsed: 90,
      globalUsed: 0,
      estimatedTokens: 20,
      userId: 'u1',
    });
    expect(d.allowed).toBe(false);
    expect(d.quota.scope).toBe('user_daily');
  });
});

describe('quota key helpers', () => {
  it('builds stable keys', () => {
    expect(buildAgenticUserQuotaRedisKey('u1', '2026-06-28')).toContain('u1');
    expect(buildAgenticGlobalQuotaRedisKey('2026-06-28')).toContain('global');
  });
});
