import { formatPaHistoryForRouteAndRun } from './pa-bridge.util';
import type { ConversationMessage } from '../interfaces/planning-assistant.interface';

describe('formatPaHistoryForRouteAndRun', () => {
  it('formats history within the sliding window limit', () => {
    const mockHistory: ConversationMessage[] = [
      { id: '1', role: 'user', content: '我想去冰岛', timestamp: '' },
      { id: '2', role: 'assistant', content: '冰岛是个好地方，什么时候去？', timestamp: '' },
      { id: '3', role: 'user', content: '明年一月', timestamp: '' },
      { id: '4', role: 'assistant', content: '一月推荐追极光，计划玩几天？', timestamp: '' },
    ];

    const result = formatPaHistoryForRouteAndRun(mockHistory, 2);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe('用户: 明年一月');
    expect(result[1]).toBe('助手: 一月推荐追极光，计划玩几天？');
  });

  it('ignores system messages and handles empty history', () => {
    const mockHistory: ConversationMessage[] = [
      { id: '1', role: 'system', content: 'Prompt Context', timestamp: '' },
      { id: '2', role: 'user', content: '你好', timestamp: '' },
    ];
    expect(formatPaHistoryForRouteAndRun(mockHistory, 10)).toEqual(['用户: 你好']);
    expect(formatPaHistoryForRouteAndRun([])).toEqual([]);
    expect(formatPaHistoryForRouteAndRun(null)).toEqual([]);
  });

  it('excludes trailing user message when it matches excludeTrailingUserContent', () => {
    const mockHistory: ConversationMessage[] = [
      { id: '1', role: 'user', content: '冰岛', timestamp: '' },
      { id: '2', role: 'assistant', content: '好的', timestamp: '' },
      { id: '3', role: 'user', content: '生成方案', timestamp: '' },
    ];
    const result = formatPaHistoryForRouteAndRun(mockHistory, {
      limit: 10,
      excludeTrailingUserContent: '生成方案',
    });
    expect(result).toEqual(['用户: 冰岛', '助手: 好的']);
  });
});
