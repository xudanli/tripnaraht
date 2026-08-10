/**
 * 小红书 MCP Direct（只读 Phase-1）。
 * 上游: http://localhost:18060/mcp
 *
 * 环境变量：
 * - XHS_MCP_ENABLED=false 可关闭
 * - XHS_MCP_URL 默认 http://localhost:18060/mcp
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { XiaohongshuMcpClient } from './xiaohongshu-mcp.client';
import {
  mapXhsFeedsToExperienceBundle,
  type XhsExperienceBundle,
} from './xiaohongshu-evidence.mapper';

/** Phase-1 允许调用的上游 tool 名 */
export const XHS_READONLY_TOOLS = new Set([
  'search_feeds',
  'get_feed_detail',
  'user_profile',
  'list_feeds',
  'check_login_status',
]);

/** 明确禁止（写操作 / 破坏性） */
export const XHS_FORBIDDEN_TOOLS = new Set([
  'publish_content',
  'publish_with_video',
  'post_comment_to_feed',
  'reply_comment_in_feed',
  'like_feed',
  'favorite_feed',
  'delete_cookies',
]);

export type XhsSearchFeedsParams = {
  keyword: string;
  limit?: number;
  filters?: {
    sort_by?: string;
    note_type?: string;
    publish_time?: string;
    search_scope?: string;
    location?: string;
  };
};

export type XhsFeedDetailParams = {
  feed_id: string;
  xsec_token: string;
  load_all_comments?: boolean;
  limit?: number;
};

export type XhsUserProfileParams = {
  user_id: string;
  xsec_token: string;
};

@Injectable()
export class XiaohongshuDirectService {
  private readonly logger = new Logger(XiaohongshuDirectService.name);
  private readonly forceDisabled: boolean;
  private readonly serverUrl: string;
  private client: XiaohongshuMcpClient | null = null;
  /** 进程内串行，降低浏览器自动化风控 */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(@Optional() private readonly configService?: ConfigService) {
    const en =
      this.configService?.get<string>('XHS_MCP_ENABLED') ??
      process.env.XHS_MCP_ENABLED;
    this.forceDisabled = String(en ?? 'true').toLowerCase() === 'false';
    this.serverUrl =
      this.configService?.get<string>('XHS_MCP_URL')?.trim() ||
      process.env.XHS_MCP_URL?.trim() ||
      'http://localhost:18060/mcp';
    if (!this.forceDisabled) {
      this.logger.log(
        `小红书 MCP Direct 已注册（只读），URL=${this.serverUrl}；sidecar 未启动时调用会失败并降级`,
      );
    }
  }

  isServiceAvailable(): boolean {
    return !this.forceDisabled;
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async getClient(): Promise<XiaohongshuMcpClient> {
    if (this.client?.getIsConnected()) return this.client;
    this.client = new XiaohongshuMcpClient(this.serverUrl);
    await this.client.connect();
    return this.client;
  }

  /** 统一入口：硬拒绝写 Tool */
  async callReadonlyTool(
    toolName: string,
    args: Record<string, unknown> = {},
  ): Promise<unknown> {
    const name = String(toolName ?? '').trim();
    if (XHS_FORBIDDEN_TOOLS.has(name)) {
      throw new Error(`Xiaohongshu MCP 写操作已禁用: ${name}`);
    }
    if (!XHS_READONLY_TOOLS.has(name)) {
      throw new Error(`Xiaohongshu MCP 未开放工具: ${name}`);
    }
    if (!this.isServiceAvailable()) {
      throw new Error('Xiaohongshu MCP 已关闭（XHS_MCP_ENABLED=false）');
    }
    return this.enqueue(async () => {
      const client = await this.getClient();
      return client.callTool(name, args);
    });
  }

  async searchFeeds(params: XhsSearchFeedsParams): Promise<{
    success: boolean;
    source: 'xiaohongshu';
    keyword: string;
    raw: unknown;
    error?: string;
  }> {
    const keyword = String(params.keyword ?? '').trim();
    if (!keyword) {
      return {
        success: false,
        source: 'xiaohongshu',
        keyword: '',
        raw: null,
        error: 'keyword 必填',
      };
    }
    try {
      const args: Record<string, unknown> = { keyword };
      if (params.filters) args.filters = params.filters;
      const raw = await this.callReadonlyTool('search_feeds', args);
      return { success: true, source: 'xiaohongshu', keyword, raw };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`search_feeds 失败: ${msg}`);
      return {
        success: false,
        source: 'xiaohongshu',
        keyword,
        raw: null,
        error: msg,
      };
    }
  }

  async getFeedDetail(params: XhsFeedDetailParams): Promise<{
    success: boolean;
    source: 'xiaohongshu';
    raw: unknown;
    error?: string;
  }> {
    const feed_id = String(params.feed_id ?? '').trim();
    const xsec_token = String(params.xsec_token ?? '').trim();
    if (!feed_id || !xsec_token) {
      return {
        success: false,
        source: 'xiaohongshu',
        raw: null,
        error: 'feed_id 与 xsec_token 必填',
      };
    }
    try {
      const raw = await this.callReadonlyTool('get_feed_detail', {
        feed_id,
        xsec_token,
        load_all_comments: params.load_all_comments === true,
        ...(params.limit != null ? { limit: params.limit } : {}),
      });
      return { success: true, source: 'xiaohongshu', raw };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`get_feed_detail 失败: ${msg}`);
      return { success: false, source: 'xiaohongshu', raw: null, error: msg };
    }
  }

  async userProfile(params: XhsUserProfileParams): Promise<{
    success: boolean;
    source: 'xiaohongshu';
    raw: unknown;
    error?: string;
  }> {
    const user_id = String(params.user_id ?? '').trim();
    const xsec_token = String(params.xsec_token ?? '').trim();
    if (!user_id || !xsec_token) {
      return {
        success: false,
        source: 'xiaohongshu',
        raw: null,
        error: 'user_id 与 xsec_token 必填',
      };
    }
    try {
      const raw = await this.callReadonlyTool('user_profile', {
        user_id,
        xsec_token,
      });
      return { success: true, source: 'xiaohongshu', raw };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { success: false, source: 'xiaohongshu', raw: null, error: msg };
    }
  }

  async listFeeds(): Promise<{
    success: boolean;
    source: 'xiaohongshu';
    raw: unknown;
    error?: string;
  }> {
    try {
      const raw = await this.callReadonlyTool('list_feeds', {});
      return { success: true, source: 'xiaohongshu', raw };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { success: false, source: 'xiaohongshu', raw: null, error: msg };
    }
  }

  /** 搜索并映射为社区体验证据包（不自动拉全量详情，避免打爆登录态） */
  async searchAsExperienceBundle(params: {
    keyword: string;
    limit?: number;
    destinationHint?: string | null;
  }): Promise<{
    success: boolean;
    bundle: XhsExperienceBundle | null;
    error?: string;
  }> {
    const searched = await this.searchFeeds({
      keyword: params.keyword,
      limit: params.limit,
    });
    if (!searched.success) {
      return { success: false, bundle: null, error: searched.error };
    }
    const bundle = mapXhsFeedsToExperienceBundle({
      query: params.keyword,
      destinationHint: params.destinationHint,
      raw: searched.raw,
      limit: params.limit ?? 20,
    });
    return { success: bundle.sampleSize > 0, bundle };
  }
}
