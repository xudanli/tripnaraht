import {
  CONTEXT_PROFILES,
  type ContextConsumerProfile,
} from '../interfaces/context-window-profile.interface';
import {
  normalizeRouteAndRunConversationContextInPlace,
  resolveContextWindowLimit,
  sliceRecentMessagesForProfile,
  sliceRecentMessagesSafeForProfile,
} from './conversation-context-window.util';

describe('conversation-context-window.util', () => {
  const prevEnv: Partial<Record<string, string | undefined>> = {};

  beforeEach(() => {
    for (const key of Object.values({
      intent_compiler: 'CONTEXT_WINDOW_INTENT_COMPILER_LIMIT',
      default: 'CONTEXT_WINDOW_DEFAULT_LIMIT',
    })) {
      prevEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const [key, val] of Object.entries(prevEnv)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  });

  it('keeps CONTEXT_PROFILES limits as contract snapshot', () => {
    expect(CONTEXT_PROFILES).toMatchInlineSnapshot(`
{
  "agent_telemetry": {
    "limit": 6,
  },
  "default": {
    "limit": 10,
  },
  "intent_compiler": {
    "limit": 3,
  },
  "orchestrator_claude": {
    "limit": 16,
  },
  "repair_executor": {
    "limit": 5,
  },
  "request_dedup": {
    "limit": 3,
  },
}
`);
  });

  it('sliceRecentMessagesForProfile respects profile limit', () => {
    const raw = Array.from({ length: 20 }, (_, i) => `m${i + 1}`);
    expect(sliceRecentMessagesForProfile('intent_compiler', raw)).toEqual(['m18', 'm19', 'm20']);
    expect(sliceRecentMessagesForProfile('orchestrator_claude', raw)).toHaveLength(16);
  });

  it('sliceRecentMessagesSafeForProfile filters invalid entries', () => {
    expect(
      sliceRecentMessagesSafeForProfile('intent_compiler', ['  ok ', '', '  ', 42, null, 'last']),
    ).toEqual(['ok', 'last']);
  });

  it('resolveContextWindowLimit honors env override', () => {
    process.env.CONTEXT_WINDOW_INTENT_COMPILER_LIMIT = '5';
    expect(resolveContextWindowLimit('intent_compiler')).toBe(5);
  });

  it('normalizeRouteAndRunConversationContextInPlace caps ingress window', () => {
    const request = {
      request_id: 'r1',
      user_id: 'u1',
      message: 'hi',
      conversation_context: {
        recent_messages: Array.from({ length: 15 }, (_, i) => `Message ${i + 1}`),
      },
    };
    const stats = normalizeRouteAndRunConversationContextInPlace(request as never);
    expect(stats).toEqual({ originalSize: 15, normalizedSize: 10 });
    expect(request.conversation_context?.recent_messages).toHaveLength(10);
    expect(request.conversation_context?.recent_messages?.[0]).toBe('Message 6');
  });

  it('all profiles resolve to positive limits', () => {
    for (const profile of Object.keys(CONTEXT_PROFILES) as ContextConsumerProfile[]) {
      expect(resolveContextWindowLimit(profile)).toBeGreaterThan(0);
    }
  });
});
