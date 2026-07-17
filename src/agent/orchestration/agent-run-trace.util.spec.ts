import { buildAgentRunTraceV1, AGENT_RUN_TRACE_SCHEMA_ID } from './agent-run-trace.util';

describe('agent-run-trace.util', () => {
  it('builds node ledger from decision_log and fallbacks', () => {
    const trace = buildAgentRunTraceV1({
      requestId: 'r1',
      finalDeliveryStatus: 'OK',
      decisionLog: [
        {
          request_id: 'r1',
          step: 'RESEARCH',
          actor: 'Orchestrator',
          inputs_summary: 'in',
          outputs_summary: 'out',
          evidence_refs: ['e1'],
          timestamp: new Date().toISOString(),
          metadata: { duration_ms: 12, system_action: 'KERNEL_NATIVE' },
        },
      ] as any,
      metadata: {
        phase_execution_paths_v1: [
          {
            schemaId: 'tripnara.phase_execution_path@v1',
            version: 1,
            phase: 'PLAN_GEN',
            path: 'legacy_callback',
            reason: 'flag_off',
            at: new Date().toISOString(),
          },
        ],
        flawed_draft_narrate: false,
        verify_return_to_research_count: 1,
        return_to_research_context_v1: {
          failure_codes: ['EVIDENCE_SNAPSHOT_UNBOUND'],
          scopes: ['destination'],
        },
      },
    });

    expect(trace.schemaId).toBe(AGENT_RUN_TRACE_SCHEMA_ID);
    expect(trace.nodes).toHaveLength(1);
    expect(trace.nodes[0].duration_ms).toBe(12);
    expect(trace.fallbacks).toHaveLength(1);
    expect(trace.return_to_research?.failure_codes).toEqual(['EVIDENCE_SNAPSHOT_UNBOUND']);
    expect(trace.final_delivery_status).toBe('OK');
  });
});
