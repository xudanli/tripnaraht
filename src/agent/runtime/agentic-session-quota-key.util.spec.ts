import { resolveAgenticQuotaSessionId } from './agentic-session-quota-key.util';

describe('agentic-session-quota-key.util', () => {
  it('prefers client_session_id', () => {
    expect(
      resolveAgenticQuotaSessionId({
        request_id: 'r1',
        options: { client_session_id: 'sess-a' },
        conversation_context: { recent_messages: [] },
      } as never),
    ).toBe('sess-a');
  });

  it('falls back to conversation_id', () => {
    expect(
      resolveAgenticQuotaSessionId({
        request_id: 'r1',
        meta: { conversation_id: 'conv-b' },
      } as never),
    ).toBe('conv-b');
  });
});
