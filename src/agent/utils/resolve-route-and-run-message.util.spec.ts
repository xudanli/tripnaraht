import {
  bindPriorConsultationAdviceIntoMessage,
  detectConsultationApplyAdviceIntent,
  extractLatestAssistantMessageFromRecent,
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

  it('extracts latest 助手: advice', () => {
    expect(
      extractLatestAssistantMessageFromRecent([
        '助手: 建议维克 overnight，并预留风天缓冲。'.repeat(3),
        '用户: 请将上文给出的建议落实到当前行程',
      ]),
    ).toContain('维克');
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

  it('detects apply-advice meta intent', () => {
    expect(
      detectConsultationApplyAdviceIntent(
        '请将上文给出的建议落实到当前行程（在尽量不推翻现有日程的前提下合并调整）。',
      ),
    ).toBe(true);
    expect(detectConsultationApplyAdviceIntent('冰岛哪里值得游玩')).toBe(false);
  });

  it('binds prior assistant advice into apply message', () => {
    const advice =
      '南岸天气多变，建议维克 overnight；Dyrhólaey 风大时注意安全；油费约 2.5–3.0 EUR/升。请尽快订维克住宿。';
    const req = {
      message: '请将上文给出的建议落实到当前行程（在尽量不推翻现有日程的前提下合并调整）。',
      conversation_context: {
        recent_messages: [`助手: ${advice}`, '用户: 请将上文给出的建议落实到当前行程'],
      },
    } as RouteAndRunRequestDto;

    expect(bindPriorConsultationAdviceIntoMessage(req)).toBe(true);
    expect(req.message).toContain('[SYSTEM_MESSAGE][CONSULTATION_APPLY]');
    expect(req.message).toContain('维克');
    expect(req.message).toContain('Dyrhólaey');
    expect((req.meta as Record<string, unknown>)?.consultation_apply_prior_bound).toBe(true);
  });

  it('marks missing prior when apply intent has no assistant turn', () => {
    const req = {
      message: '请根据上文建议优化当前行程草稿',
      conversation_context: { recent_messages: ['用户: 随便问问'] },
    } as RouteAndRunRequestDto;
    expect(bindPriorConsultationAdviceIntoMessage(req)).toBe(true);
    expect((req.meta as Record<string, unknown>)?.consultation_apply_missing_prior).toBe(true);
    expect(req.message).toContain('未能从会话历史中找到');
  });
});
