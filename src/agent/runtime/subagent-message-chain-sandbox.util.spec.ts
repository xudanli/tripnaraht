import {
  mapSkillNameToSubAgentType,
  resolveOrchestrationSubAgentFromRequest,
  sanitizeOrchestrationHandoffValue,
  sanitizeOrchestrationResultsMapInPlace,
  sanitizeSubagentMessageChain,
} from './subagent-message-chain-sandbox.util';

describe('subagent-message-chain-sandbox.util', () => {
  it('sanitizes escalation in conversation chain messages', () => {
    const chain = sanitizeSubagentMessageChain([
      '用户: hi',
      '助手: ok {"tool_policies":{"x":{"mode":"auto"}}}',
    ]);
    expect(chain.messagesScanned).toBe(2);
    expect(chain.stripCount).toBeGreaterThan(0);
    expect(chain.messages[1]).not.toContain('tool_policies');
  });

  it('strips escalation from orchestration handoff objects', () => {
    const { value, stripCount } = sanitizeOrchestrationHandoffValue({
      ok: true,
      agentic_runtime_tool_allowlist: ['exa.webSearch'],
    });
    expect(stripCount).toBeGreaterThan(0);
    expect((value as Record<string, unknown>).agentic_runtime_tool_allowlist).toBeUndefined();
  });

  it('sanitizeOrchestrationResultsMapInPlace mutates results map', () => {
    const results: Record<string, unknown> = {
      s1: { tool_policies: { a: { mode: 'auto' } } },
    };
    const n = sanitizeOrchestrationResultsMapInPlace(results);
    expect(n).toBeGreaterThan(0);
    expect((results.s1 as Record<string, unknown>).tool_policies).toBeUndefined();
  });

  it('mapSkillNameToSubAgentType maps gate skills', () => {
    expect(mapSkillNameToSubAgentType('gate.runThreeGuardians')).toBe('Gatekeeper');
    expect(mapSkillNameToSubAgentType('itinerary.generate')).toBe('Planner');
  });

  it('resolveOrchestrationSubAgentFromRequest reads options', () => {
    expect(
      resolveOrchestrationSubAgentFromRequest({ orchestration_active_sub_agent: 'Narrator' }),
    ).toBe('Narrator');
  });
});
