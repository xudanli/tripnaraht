// src/skills/web/web-browse.skill.ts
/// <reference lib="dom" />
/**
 * web.browse Skill
 *
 * 浏览网页并提取结构化内容
 * 用于 RAG Level 4 降级策略（RULES 类别数据）
 * 支持缓存机制以减少重复请求
 */

import { Injectable, Logger } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { Skill as SkillDecorator } from '../decorators/skill.decorator';
import puppeteer, { Browser, Page } from 'puppeteer';

export interface WebBrowseInput extends SkillInput {
  /** 目标 URL（必需） */
  url: string;

  /** 查询内容（可选，用于筛选相关信息） */
  query?: string;

  /** 等待选择器（可选，用于确保内容加载） */
  waitForSelector?: string;

  /** 等待超时（毫秒，默认 15000） */
  timeout?: number;

  /** 是否提取所有文本（默认 false，仅提取主要内容） */
  extractAllText?: boolean;

  /** 是否禁用缓存（默认 false） */
  disableCache?: boolean;

  /** 用户代理（可选） */
  userAgent?: string;

  /** 证据ID（可选，用于关联到 evidence_registry） */
  evidence_id?: string;
}

export interface WebBrowseOutput extends SkillOutput {
  /** URL */
  url: string;

  /** 网页标题 */
  title: string;

  /** 主要内容 */
  content: string;

  /** 元数据 */
  metadata?: {
    description?: string;
    keywords?: string[];
    author?: string;
    lastModified?: string;
  };

  /** 提取的链接（可选） */
  links?: Array<{
    href: string;
    text: string;
  }>;

  /** 证据ID */
  evidence_id: string;

  /** 数据源标识 */
  source: string;

  /** 是否从缓存获取 */
  cached: boolean;

  /** 执行时间（毫秒） */
  duration_ms: number;

  /** 查询相关性评分（0-1，如果提供了 query） */
  relevance_score?: number;
}

/**
 * 简单的内存缓存
 * 生产环境应替换为 Redis
 */
interface CacheEntry {
  data: WebBrowseOutput;
  timestamp: number;
  ttl_ms: number;
}

@SkillDecorator({
  name: 'web.browse',
  description: '浏览网页并提取结构化内容（用于 RAG Level 4 降级）',
  version: '1.0.0',
  category: 'rag',
  toolGroup: 'DOMAIN',
})
@Injectable()
export class WebBrowseSkill implements Skill<WebBrowseInput, WebBrowseOutput> {
  private readonly logger = new Logger(WebBrowseSkill.name);
  private browser: Browser | null = null;
  private cache: Map<string, CacheEntry> = new Map();
  private readonly DEFAULT_CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour
  private readonly DEFAULT_TIMEOUT_MS = 15000; // 15 seconds

  metadata = {
    name: 'web.browse',
    description: '浏览网页并提取结构化内容（用于 RAG Level 4 降级）',
    version: '1.0.0',
    category: 'rag' as const,
    toolGroup: 'DOMAIN' as const,
    inputSchema: {
      required: ['url'],
      typeChecks: {
        url: { type: 'string' as const, format: 'url' as const },
        query: { type: 'string' as const },
        timeout: { type: 'number' as const, min: 1000, max: 60000 },
        waitForSelector: { type: 'string' as const },
      },
    },
  };

  constructor() {
    this.logger.log(`[WebBrowseSkill] 已初始化`);
  }

  /**
   * 执行网页浏览
   */
  async execute(input: WebBrowseInput): Promise<WebBrowseOutput> {
    const startTime = Date.now();

    // 输入验证
    if (!input.url) {
      throw new Error('url 参数是必需的');
    }

    // 验证 URL 格式
    try {
      new URL(input.url);
    } catch (error) {
      throw new Error(`无效的 URL: ${input.url}`);
    }

    // 检查缓存
    if (!input.disableCache) {
      const cached = this.getCache(input.url);
      if (cached) {
        this.logger.log(`[WebBrowseSkill] 从缓存返回: ${input.url}`);
        return {
          ...cached,
          cached: true,
          duration_ms: Date.now() - startTime,
        };
      }
    }

    // 确保浏览器已启动
    await this.ensureBrowser();

    let page: Page | null = null;
    try {
      // 创建新页面
      page = await this.browser!.newPage();

      // 设置用户代理
      if (input.userAgent) {
        await page.setUserAgent(input.userAgent);
      } else {
        await page.setUserAgent(
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );
      }

      // 设置超时
      const timeout = input.timeout || this.DEFAULT_TIMEOUT_MS;
      page.setDefaultTimeout(timeout);

      // 导航到 URL
      this.logger.log(`[WebBrowseSkill] 正在加载: ${input.url}`);
      await page.goto(input.url, {
        waitUntil: 'networkidle2',
        timeout,
      });

      // 等待特定选择器（如果指定）
      if (input.waitForSelector) {
        await page.waitForSelector(input.waitForSelector, { timeout });
      }

      // 提取页面内容
      const content = await this.extractContent(page, input);

      // 提取元数据
      const metadata = await this.extractMetadata(page);

      // 提取链接（可选）
      const links = await this.extractLinks(page);

      // 计算相关性评分（如果提供了 query）
      let relevanceScore: number | undefined;
      if (input.query) {
        relevanceScore = this.calculateRelevance(content, input.query);
      }

      // 生成证据ID
      const evidenceId = input.evidence_id || `web_browse_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // 构建输出
      const output: WebBrowseOutput = {
        url: input.url,
        title: await page.title(),
        content,
        metadata,
        links,
        evidence_id: evidenceId,
        source: 'web.browse',
        cached: false,
        duration_ms: Date.now() - startTime,
        relevance_score: relevanceScore,
      };

      // 缓存结果
      if (!input.disableCache) {
        this.setCache(input.url, output);
      }

      this.logger.log(
        `[WebBrowseSkill] ✓ 成功浏览 ${input.url} (${output.duration_ms}ms, 内容长度: ${content.length} 字符)`
      );

      return output;
    } catch (error: any) {
      this.logger.error(`[WebBrowseSkill] ✗ 浏览失败: ${input.url}`, error.stack);
      throw new Error(`网页浏览失败: ${error.message}`);
    } finally {
      // 关闭页面
      if (page) {
        await page.close();
      }
    }
  }

  /**
   * 提取页面内容
   */
  private async extractContent(page: Page, input: WebBrowseInput): Promise<string> {
    if (input.extractAllText) {
      // 提取所有文本
      return await page.evaluate(() => {
        return document.body.innerText || '';
      });
    } else {
      // 提取主要内容（尝试智能选择）
      return await page.evaluate(() => {
        // 优先选择 article、main 或 .content 元素
        const selectors = [
          'article',
          'main',
          '[role="main"]',
          '.content',
          '.main-content',
          '#content',
          '#main-content',
        ];

        for (const selector of selectors) {
          const element = document.querySelector(selector);
          if (element && element.textContent) {
            return element.textContent.trim();
          }
        }

        // 降级：返回 body 的文本
        return document.body.innerText || '';
      });
    }
  }

  /**
   * 提取元数据
   */
  private async extractMetadata(page: Page): Promise<WebBrowseOutput['metadata']> {
    try {
      const description = await page.$eval('meta[name="description"], meta[property="og:description"]', el => el.getAttribute('content')).catch(() => undefined);
      const keywordsStr = await page.$eval('meta[name="keywords"]', el => el.getAttribute('content')).catch(() => undefined);
      const author = await page.$eval('meta[name="author"]', el => el.getAttribute('content')).catch(() => undefined);
      const lastModified = await page.$eval('meta[property="article:modified_time"], meta[name="last-modified"]', el => el.getAttribute('content')).catch(() => undefined);

      return {
        description: description || undefined,
        keywords: keywordsStr?.split(',').map(k => k.trim()),
        author: author || undefined,
        lastModified: lastModified || undefined,
      };
    } catch (error) {
      // If metadata extraction fails, return empty metadata
      return {};
    }
  }

  /**
   * 提取链接
   */
  private async extractLinks(page: Page): Promise<WebBrowseOutput['links']> {
    return await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'));
      return links
        .map((link: HTMLAnchorElement) => ({
          href: link.href,
          text: link.textContent?.trim() || '',
        }))
        .filter(link => link.href && link.text)
        .slice(0, 50); // 限制返回前 50 个链接
    });
  }

  /**
   * 计算内容与查询的相关性（简单实现）
   */
  private calculateRelevance(content: string, query: string): number {
    const lowerContent = content.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const queryWords = lowerQuery.split(/\s+/);

    let matchCount = 0;
    for (const word of queryWords) {
      if (lowerContent.includes(word)) {
        matchCount++;
      }
    }

    return queryWords.length > 0 ? matchCount / queryWords.length : 0;
  }

  /**
   * 确保浏览器已启动
   */
  private async ensureBrowser(): Promise<void> {
    if (!this.browser || !this.browser.isConnected()) {
      this.logger.log('[WebBrowseSkill] 启动 Puppeteer 浏览器...');
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      });
      this.logger.log('[WebBrowseSkill] ✓ Puppeteer 浏览器已启动');
    }
  }

  /**
   * 获取缓存
   */
  private getCache(url: string): WebBrowseOutput | null {
    const entry = this.cache.get(url);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl_ms) {
      // 缓存已过期
      this.cache.delete(url);
      return null;
    }

    return entry.data;
  }

  /**
   * 设置缓存
   */
  private setCache(url: string, data: WebBrowseOutput, ttl_ms?: number): void {
    this.cache.set(url, {
      data,
      timestamp: Date.now(),
      ttl_ms: ttl_ms || this.DEFAULT_CACHE_TTL_MS,
    });
  }

  /**
   * 清理缓存
   */
  clearCache(): void {
    this.cache.clear();
    this.logger.log('[WebBrowseSkill] 缓存已清空');
  }

  /**
   * 清理资源（在应用关闭时调用）
   */
  async onModuleDestroy(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.logger.log('[WebBrowseSkill] 浏览器已关闭');
    }
    this.clearCache();
  }
}
