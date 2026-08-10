import {
  listAgentChatBodyKeys,
  resolveAgentChatMessageText,
} from './resolve-agent-chat-message.util';

describe('resolveAgentChatMessageText', () => {
  it('reads message / text / content / body', () => {
    expect(resolveAgentChatMessageText({ message: '  hi ' })).toBe('hi');
    expect(resolveAgentChatMessageText({ text: 'a' })).toBe('a');
    expect(resolveAgentChatMessageText({ content: 'b' })).toBe('b');
    expect(resolveAgentChatMessageText({ body: 'c' })).toBe('c');
  });

  it('reads iOS-ish aliases and nested wrappers', () => {
    expect(resolveAgentChatMessageText({ userMessage: 'x' })).toBe('x');
    expect(resolveAgentChatMessageText({ user_message: 'y' })).toBe('y');
    expect(resolveAgentChatMessageText({ prompt: 'p' })).toBe('p');
    expect(resolveAgentChatMessageText({ data: { text: 'nested' } })).toBe('nested');
    expect(resolveAgentChatMessageText({ payload: { message: 'pay' } })).toBe('pay');
    expect(resolveAgentChatMessageText({ Message: 'Cap' })).toBe('Cap');
  });

  it('reads content parts array', () => {
    expect(
      resolveAgentChatMessageText({
        content: [{ type: 'text', text: 'hello' }, { text: 'world' }],
      }),
    ).toBe('hello\nworld');
  });

  it('lists keys for diagnostics', () => {
    expect(listAgentChatBodyKeys({ foo: 1, bar: 2 })).toEqual(['bar', 'foo']);
  });
});
