import {
  detectExecutionRiskStagingPhase,
  evaluateExecutionRiskStagingRollout,
} from './execution-risk-staging-rollout.util';

describe('execution-risk-staging-rollout.util', () => {
  const envKeys = [
    'EXECUTION_RISK_CONFIRM_WRITE_ENABLED',
    'EXECUTION_RISK_RFC001_WRITE_ADAPTER',
    'EXECUTION_RISK_APPLY_EFFECTIVE_PLAN',
    'EXECUTION_RISK_ITINERARY_MATERIALIZE',
    'RFC001_ITINERARY_MATERIALIZE',
    'EXECUTION_RISK_WRITE_ALLOWLIST_TRIPS',
    'EXECUTION_RISK_WRITE_ALLOWLIST_USERS',
    'EXECUTION_RISK_WRITE_ALLOWLIST_CODES',
  ] as const;

  const saved: Partial<Record<(typeof envKeys)[number], string | undefined>> = {};

  beforeEach(() => {
    for (const key of envKeys) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('defaults to OFF when confirm write is disabled', () => {
    expect(detectExecutionRiskStagingPhase()).toBe('OFF');
  });

  it('detects phase 1 — materialize without effective activate', () => {
    process.env.EXECUTION_RISK_CONFIRM_WRITE_ENABLED = '1';
    process.env.EXECUTION_RISK_RFC001_WRITE_ADAPTER = '1';
    process.env.EXECUTION_RISK_ITINERARY_MATERIALIZE = '1';
    expect(detectExecutionRiskStagingPhase()).toBe('PHASE_1_MATERIALIZE_ONLY');
  });

  it('detects phase 2 when effective activate is enabled', () => {
    process.env.EXECUTION_RISK_CONFIRM_WRITE_ENABLED = '1';
    process.env.EXECUTION_RISK_RFC001_WRITE_ADAPTER = '1';
    process.env.EXECUTION_RISK_ITINERARY_MATERIALIZE = '1';
    process.env.EXECUTION_RISK_APPLY_EFFECTIVE_PLAN = '1';
    expect(detectExecutionRiskStagingPhase()).toBe('PHASE_2_EFFECTIVE_ACTIVATE');
  });

  it('detects phase 3 when allowlist is configured', () => {
    process.env.EXECUTION_RISK_CONFIRM_WRITE_ENABLED = '1';
    process.env.EXECUTION_RISK_RFC001_WRITE_ADAPTER = '1';
    process.env.EXECUTION_RISK_ITINERARY_MATERIALIZE = '1';
    process.env.EXECUTION_RISK_APPLY_EFFECTIVE_PLAN = '1';
    process.env.EXECUTION_RISK_WRITE_ALLOWLIST_TRIPS = 'trip-staging-1';
    expect(detectExecutionRiskStagingPhase()).toBe('PHASE_3_ALLOWLISTED_PRODUCTION');
  });

  it('blocks phase 1 readiness without RFC001_ITINERARY_MATERIALIZE', () => {
    process.env.EXECUTION_RISK_CONFIRM_WRITE_ENABLED = '1';
    process.env.EXECUTION_RISK_RFC001_WRITE_ADAPTER = '1';
    process.env.EXECUTION_RISK_ITINERARY_MATERIALIZE = '1';

    const evalResult = evaluateExecutionRiskStagingRollout({
      targetPhase: 'PHASE_1_MATERIALIZE_ONLY',
    });
    expect(evalResult.phaseReady).toBe(false);
    expect(evalResult.blockers.some((b) => b.includes('RFC001_ITINERARY_MATERIALIZE'))).toBe(
      true,
    );
  });
});
