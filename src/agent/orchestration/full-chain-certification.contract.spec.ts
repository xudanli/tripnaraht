import {
  FULL_CHAIN_CERT_STAGE_ORDER,
  FULL_CHAIN_CERT_VERSION,
  assertFullChainStagesSubsetOfMainChain,
} from './full-chain-certification.constants';
import { FULL_CHAIN_CERT_FIXTURES } from './full-chain-certification.fixtures';
import { evaluateHallucinationDeliveryGate } from './post-plan/hallucination-delivery-gate.util';
import { isFlawedDraftForbidden } from './flawed-draft-allow-matrix.constants';
import { buildAgentRunTraceV1 } from './agent-run-trace.util';
import { PLAN_GEN_ERROR_TERMINAL } from './plan-gen-node-protocol.constants';
import { buildReturnToResearchContextV1 } from './return-to-research-context.util';

describe('Full chain certification contract', () => {
  it('freezes cert version and stage subset of main chain', () => {
    expect(FULL_CHAIN_CERT_VERSION).toBe('1.0.0');
    expect(assertFullChainStagesSubsetOfMainChain()).toBe(true);
    expect(FULL_CHAIN_CERT_STAGE_ORDER[0]).toBe('research');
    expect(FULL_CHAIN_CERT_STAGE_ORDER[FULL_CHAIN_CERT_STAGE_ORDER.length - 1]).toBe(
      'hallucination',
    );
  });

  it('happy_path fixture stages match cert order', () => {
    const happy = FULL_CHAIN_CERT_FIXTURES.find((f) => f.id === 'happy_path_ok')!;
    expect(happy.stages).toEqual([...FULL_CHAIN_CERT_STAGE_ORDER]);
    expect(happy.expectedStatus).toBe('OK');
  });

  it('hallucination hard fact probe maps to FAILED', () => {
    const fx = FULL_CHAIN_CERT_FIXTURES.find((f) => f.id === 'hallucination_hard_fact_failed')!;
    expect(fx.expectedStatus).toBe('FAILED');
    const gate = evaluateHallucinationDeliveryGate({
      verifiedClaims: [],
      hallucinationRisks: [
        {
          text: '假海拔 9000m',
          type: 'FACT',
          verified: false,
          source: null,
          confidence: 0,
          confidenceLevel: 'NONE',
          isHallucinationRisk: true,
          action: 'REMOVE',
        },
      ],
      userNotification: { hasRisks: true, message: 'x' },
      cleanedOutput: null,
      statistics: {
        totalClaims: 1,
        verifiedClaims: 0,
        hallucinationRisks: 1,
        removedClaims: 1,
      },
    });
    expect(gate.verdict).toBe('hard_fact_conflict');
  });

  it('flawed forbid probe blocks SAFETY HARD', () => {
    const fx = FULL_CHAIN_CERT_FIXTURES.find((f) => f.id === 'flawed_forbid_need_confirmation')!;
    expect(fx.expectedStatus).toBe('NEED_CONFIRMATION');
    expect(
      isFlawedDraftForbidden({
        gateResult: {
          gate_result: 'ADJUST_REQUIRED',
          violations: [{ type: 'SAFETY', severity: 'HARD', detail: 'storm' }],
          required_adjustments: [],
          confidence: 0.1,
          evidence_refs: [],
        },
      }).forbidden,
    ).toBe(true);
  });

  it('r2r fixture carries forbid_full and destination scopes', () => {
    const fx = FULL_CHAIN_CERT_FIXTURES.find((f) => f.id === 'r2r_scoped_partial')!;
    const ctx = buildReturnToResearchContextV1({
      events: [{ code: 'EVIDENCE_SNAPSHOT_UNBOUND', message: 'unbound' }],
    });
    expect(ctx.forbid_full_research).toBe(true);
    expect(fx.probes.r2rScopes).toEqual(['destination', 'common']);
    expect(ctx.scopes).toEqual(expect.arrayContaining(['destination']));
  });

  it('plan_gen empty maps to NEED_MORE_INFO', () => {
    const fx = FULL_CHAIN_CERT_FIXTURES.find((f) => f.id === 'plan_gen_empty_need_more_info')!;
    expect(fx.expectedStatus).toBe('NEED_MORE_INFO');
    expect(PLAN_GEN_ERROR_TERMINAL.PLAN_GEN_EMPTY_DRAFT).toBe('NEED_MORE_INFO');
  });

  it('agent_run_trace can be built from stubbed decision_log for happy path', () => {
    const trace = buildAgentRunTraceV1({
      requestId: 'cert-1',
      finalDeliveryStatus: 'OK',
      decisionLog: FULL_CHAIN_CERT_STAGE_ORDER.map((s) => ({
        request_id: 'cert-1',
        step: s.toUpperCase(),
        actor: 'Orchestrator',
        inputs_summary: s,
        outputs_summary: 'ok',
        evidence_refs: [],
        timestamp: new Date().toISOString(),
        metadata: { duration_ms: 1 },
      })) as any,
      metadata: {},
    });
    expect(trace.nodes.length).toBe(FULL_CHAIN_CERT_STAGE_ORDER.length);
    expect(trace.final_delivery_status).toBe('OK');
  });
});
