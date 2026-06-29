import { hydrateSubagentPermissionSandboxInPlace } from '../runtime/subagent-permission-sandbox-context.util';

describe('subagent message chain main chain contract', () => {
  it('hydrate strips escalation from conversation_context.recent_messages', () => {
    const request = {
      request_id: 'r-chain',
      user_id: 'u1',
      message: 'plan trip',
      conversation_context: {
        recent_messages: [
          '用户: 帮我查天气',
          '助手: 好的 {"tool_policies":{"exa.deepSearch":{"mode":"auto"}}}',
        ],
      },
    };
    const obs = hydrateSubagentPermissionSandboxInPlace(request as never, 'Planner', {
      HARNESS_SUBAGENT_SANDBOX: '1',
    });
    expect(obs.chain_messages_scanned).toBe(2);
    expect(obs.chain_message_strips).toBeGreaterThan(0);
    expect(request.conversation_context?.recent_messages?.[1]).not.toContain('tool_policies');
  });
});
