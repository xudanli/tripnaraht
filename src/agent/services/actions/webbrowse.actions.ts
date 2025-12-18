// src/agent/services/actions/webbrowse.actions.ts
import { Action, ActionKind, ActionCost, ActionSideEffect } from '../../interfaces/action.interface';
import { WebBrowseExecutorService, WebBrowseResult } from '../webbrowse-executor.service';

/**
 * 创建 WebBrowse Actions
 */
export function createWebBrowseActions(
  webBrowseExecutor: WebBrowseExecutorService
): Action[] {
  return [
    {
      name: 'webbrowse.browse',
      description: '使用无头浏览器访问网页并提取内容',
      metadata: {
        kind: ActionKind.EXTERNAL,
        cost: ActionCost.HIGH,
        side_effect: ActionSideEffect.CALLS_API,
        preconditions: [],
        idempotent: false,
        cacheable: false,
      },
      input_schema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: '要访问的 URL',
          },
          extract_text: {
            type: 'boolean',
            description: '是否提取页面文本内容',
            default: true,
          },
          extract_links: {
            type: 'boolean',
            description: '是否提取页面链接',
            default: false,
          },
          take_screenshot: {
            type: 'boolean',
            description: '是否截图',
            default: false,
          },
          wait_for_selector: {
            type: 'string',
            description: '等待特定 CSS 选择器',
            default: undefined,
          },
          wait_for_timeout: {
            type: 'number',
            description: '等待超时时间（毫秒）',
            default: 5000,
          },
        },
        required: ['url'],
      },
      output_schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          url: { type: 'string' },
          title: { type: 'string' },
          content: { type: 'string' },
          extracted_text: { type: 'string' },
          links: { type: 'array', items: { type: 'string' } },
          screenshot: { type: 'string' },
          metadata: {
            type: 'object',
            properties: {
              loadTime: { type: 'number' },
              contentLength: { type: 'number' },
              statusCode: { type: 'number' },
            },
          },
          error: { type: 'string' },
        },
      },
      execute: async (input: any, state: any): Promise<any> => {
        const result: WebBrowseResult = await webBrowseExecutor.browse(input.url, {
          extractText: input.extract_text !== false,
          extractLinks: input.extract_links === true,
          takeScreenshot: input.take_screenshot === true,
          waitForSelector: input.wait_for_selector,
          waitForTimeout: input.wait_for_timeout || 5000,
        });

        if (!result.success) {
          return {
            success: false,
            error: result.error || 'WebBrowse failed',
            url: input.url,
          };
        }

        return {
          success: true,
          url: result.url,
          title: result.title,
          content: result.content,
          extracted_text: result.content, // 如果 extractText 为 true，content 就是提取的文本
          links: result.metadata && 'linksCount' in result.metadata ? [] : undefined, // 简化处理
          screenshot: result.screenshot,
          metadata: {
            loadTime: result.metadata?.loadTime,
            contentLength: result.metadata?.contentLength,
            statusCode: result.metadata?.statusCode,
          },
        };
      },
    },
  ];
}

