import {
  buildAgenticLoopCheckpoint,
  buildAgenticLoopCheckpointObservability,
  isGovernanceAskHoldEnvelope,
  parseAgenticLoopCheckpointsEnabled,
  stepHasGovernanceAskHold,
  validateAgenticResumeCheckpoint,
} from './agentic-loop-checkpoint.util';

describe('agentic-loop-checkpoint.util', () => {
  it('builds checkpoint with stable task fingerprint prefix', () => {
    const cp = buildAgenticLoopCheckpoint({
      step: 2,
      taskMessage: '  Reykjavik weather  ',
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'Reykjavik weather' },
      ],
      traceSteps: [{ step: 1, latency_ms: 10 }, { step: 2, latency_ms: 20 }],
      metrics: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    });
    expect(cp.schemaId).toBe('tripnara.agentic_loop_checkpoint@v1');
    expect(cp.step).toBe(2);
    expect(cp.checkpoint_id).toMatch(/^cp-2-[0-9a-f]{16}-/);
    expect(cp.messages).toHaveLength(2);
  });

  it('validateAgenticResumeCheckpoint rejects task mismatch', () => {
    const cp = buildAgenticLoopCheckpoint({
      step: 1,
      taskMessage: 'a',
      messages: [{ role: 'system' }, { role: 'user', content: 'a' }],
      traceSteps: [{ step: 1, latency_ms: 1 }],
      metrics: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    });
    expect(validateAgenticResumeCheckpoint(cp, 'b').ok).toBe(false);
    expect(validateAgenticResumeCheckpoint(cp, 'a').ok).toBe(true);
  });

  it('detects governance ask hold envelope', () => {
    expect(
      isGovernanceAskHoldEnvelope({
        success: false,
        error: 'NEED_USER_APPROVAL',
        data: { _system_status: 'AWAITING_APPROVAL' },
      }),
    ).toBe(true);
    expect(stepHasGovernanceAskHold({
      step: 1,
      latency_ms: 1,
      tool_results: [{
        tool_call_id: 'c1',
        envelope: {
          success: false,
          error: 'NEED_USER_APPROVAL',
          data: { _system_status: 'AWAITING_APPROVAL' },
        },
      }],
    })).toBe(true);
  });

  it('buildAgenticLoopCheckpointObservability marks resumable on governance hold', () => {
    const cp = buildAgenticLoopCheckpoint({
      step: 1,
      taskMessage: 'x',
      messages: [{ role: 'system' }, { role: 'user' }],
      traceSteps: [{ step: 1, latency_ms: 1 }],
      metrics: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    });
    const obs = buildAgenticLoopCheckpointObservability({
      enabled: true,
      checkpoints: [cp],
      stoppedReason: 'governance_ask_hold',
    });
    expect(obs.resumable).toBe(true);
    expect(obs.stopped_for_governance_hold).toBe(true);
  });

  it('parseAgenticLoopCheckpointsEnabled respects env off', () => {
    expect(parseAgenticLoopCheckpointsEnabled({ AGENTIC_LOOP_CHECKPOINTS: '0' })).toBe(false);
    expect(parseAgenticLoopCheckpointsEnabled({})).toBe(true);
  });
});
