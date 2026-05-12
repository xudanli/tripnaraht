import { classifyOrchestratorFailure } from '../../agent/utils/orchestrator-failure-taxonomy.util';
import {
  computeBackoffDelayMs,
  resolveExecutionRecoveryPlan,
} from './execution-recovery-policy.util';

describe('execution-recovery-policy.util', () => {
  it('maps BUSINESS_RULE to clarification', () => {
    const meta = classifyOrchestratorFailure(new Error('VERIFICATION_FATAL'), { orchestrator_step: 'VERIFY' });
    const plan = resolveExecutionRecoveryPlan(meta);
    expect(plan?.kind).toBe('REQUEST_CLARIFICATION');
    expect(plan?.logging.level).toBe('warn');
    expect(plan?.clarification?.suggested_prompt_zh).toContain('VERIFICATION_FATAL');
  });

  it('maps TIMEOUT to backoff', () => {
    const meta = classifyOrchestratorFailure(new Error('TIMEOUT:CLAUDE_SM'), { orchestrator_step: 'RESEARCH' });
    const plan = resolveExecutionRecoveryPlan(meta);
    expect(plan?.kind).toBe('RETRY_WITH_EXPONENTIAL_BACKOFF');
    expect(plan?.backoff?.maxAttempts).toBe(4);
  });

  it('maps TOOL+LIVE_TOOL_TIMEOUT to backoff', () => {
    const meta = classifyOrchestratorFailure(new Error('LIVE_TOOL_TIMEOUT'), {
      tool_id: 'live_tool.mcp.weather',
      orchestrator_step: 'INTAKE',
    });
    const plan = resolveExecutionRecoveryPlan(meta);
    expect(plan?.kind).toBe('RETRY_WITH_EXPONENTIAL_BACKOFF');
  });

  it('maps LLM rate limit to safe mode', () => {
    const meta = classifyOrchestratorFailure(new Error('429 rate limit'), { orchestrator_step: 'INTAKE' });
    const plan = resolveExecutionRecoveryPlan(meta);
    expect(plan?.kind).toBe('SAFE_MODE_DEGRADED');
    expect(plan?.logging.level).toBe('error');
  });

  it('computeBackoffDelayMs stays within maxDelayMs', () => {
    const b = { maxAttempts: 4, baseDelayMs: 100, maxDelayMs: 300, jitterRatio: 0 };
    expect(computeBackoffDelayMs(0, b)).toBeLessThanOrEqual(300);
    expect(computeBackoffDelayMs(10, b)).toBeLessThanOrEqual(300);
  });

  it('merges EXECUTION_RECOVERY_* env into backoff params', () => {
    const meta = classifyOrchestratorFailure(new Error('TIMEOUT:CLAUDE_SM'), {});
    const plan = resolveExecutionRecoveryPlan(meta, {
      EXECUTION_RECOVERY_MAX_ATTEMPTS: '7',
      EXECUTION_RECOVERY_BASE_DELAY_MS: '120',
      EXECUTION_RECOVERY_MAX_DELAY_MS: '4000',
      EXECUTION_RECOVERY_JITTER_RATIO: '0.05',
    });
    expect(plan?.kind).toBe('RETRY_WITH_EXPONENTIAL_BACKOFF');
    expect(plan?.backoff?.maxAttempts).toBe(7);
    expect(plan?.backoff?.baseDelayMs).toBe(120);
    expect(plan?.backoff?.maxDelayMs).toBe(4000);
    expect(plan?.backoff?.jitterRatio).toBe(0.05);
  });
});
