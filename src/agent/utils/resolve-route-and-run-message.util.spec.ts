import {
  extractLatestUserMessageFromRecent,
  normalizeRouteAndRunRequestMessage,
  resolveRouteAndRunUserMessage,
} from './resolve-route-and-run-message.util';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';

describe('resolve-route-and-run-message.util', () => {
  it('extracts latest 用户: prefixed message', () => {
    expect(
      extractLatestUserMessageFromRecent([
        '[系统注入·当前行程摘要]\n名称: 冰岛',
        '用户: 住宿选公寓还是木屋？帮团队结构化讨论一下',
      ]),
    ).toBe('住宿选公寓还是木屋？帮团队结构化讨论一下');
  });

  it('resolve prefers top-level message', () => {
    const req = {
      message: '顶层消息',
      conversation_context: { recent_messages: ['用户: 历史'] },
    } as RouteAndRunRequestDto;
    expect(resolveRouteAndRunUserMessage(req)).toBe('顶层消息');
  });

  it('normalize fills message from recent_messages', () => {
    const req = {
      conversation_context: {
        recent_messages: ['用户: 住宿选公寓还是木屋？帮团队结构化讨论一下'],
      },
    } as RouteAndRunRequestDto;
    normalizeRouteAndRunRequestMessage(req);
    expect(req.message).toBe('住宿选公寓还是木屋？帮团队结构化讨论一下');
  });

  it('normalize sets empty string when no user message available', () => {
    const req = {
      conversation_context: { recent_messages: [] },
    } as RouteAndRunRequestDto;
    normalizeRouteAndRunRequestMessage(req);
    expect(req.message).toBe('');
  });
});
