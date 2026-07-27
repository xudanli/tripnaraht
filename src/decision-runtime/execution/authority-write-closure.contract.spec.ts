import {
  EFFECTIVE_PLAN_WRITE_CHAIN_AUTHORIZED_PATHS,
  assertDirectEffectivePlanWriteBlocked,
} from './effective-plan-write-chain-blocked.util';
import {
  assertAgenticMutationRequiresDecisionId,
  assertLegacyRuntimeMustNotSilentWrite,
  LEGACY_SILENT_WRITE_BLOCKED_CODE,
} from './legacy-runtime-write-guard.util';
import { BadRequestException } from '@nestjs/common';

describe('Authority write-chain closure (P2)', () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
  });

  it('authorized paths include UWC and RFC-001 execute', () => {
    expect(EFFECTIVE_PLAN_WRITE_CHAIN_AUTHORIZED_PATHS).toEqual(
      expect.arrayContaining([
        'POST /api/uwc/v1/write/apply',
        'POST /api/rfc001/decisions/:id/execute',
        'POST /trips/:tripId/decision-problems/:problemId/apply',
      ]),
    );
  });

  it('blocks direct legacy-style callers when write chain ON', () => {
    delete process.env.EFFECTIVE_PLAN_WRITE_CHAIN;
    delete process.env.ALLOW_WRITE_CHAIN_OFF;
    expect(() =>
      assertDirectEffectivePlanWriteBlocked('travel-timing-repair.applyMinuteTimingShift'),
    ).toThrow(BadRequestException);
  });

  it('LEGACY mode forbids silent write', () => {
    process.env.DECISION_RUNTIME_MODE = 'LEGACY';
    expect(() => assertLegacyRuntimeMustNotSilentWrite('routeAndRunLegacy')).toThrow(
      BadRequestException,
    );
    try {
      assertLegacyRuntimeMustNotSilentWrite('routeAndRunLegacy');
    } catch (e) {
      const body = (e as BadRequestException).getResponse() as { code?: string };
      expect(body.code).toBe(LEGACY_SILENT_WRITE_BLOCKED_CODE);
    }
  });

  it('forceLegacyPath blocks silent write even outside LEGACY mode', () => {
    process.env.DECISION_RUNTIME_MODE = 'SHADOW';
    expect(() =>
      assertLegacyRuntimeMustNotSilentWrite('routeAndRunLegacy', { forceLegacyPath: true }),
    ).toThrow(BadRequestException);
  });

  it('agentic mutation without decisionId is rejected', () => {
    expect(() =>
      assertAgenticMutationRequiresDecisionId({
        caller: 'agentic-tool-loop',
        mutatesPlan: true,
        decisionId: null,
      }),
    ).toThrow(BadRequestException);
  });

  it('agentic mutation with decisionId is allowed by this gate', () => {
    expect(() =>
      assertAgenticMutationRequiresDecisionId({
        caller: 'agentic-tool-loop',
        mutatesPlan: true,
        decisionId: 'dec_wind_1',
      }),
    ).not.toThrow();
  });
});
