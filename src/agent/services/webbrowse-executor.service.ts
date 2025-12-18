// src/agent/services/webbrowse-executor.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Browser, Page, chromium } from 'playwright';

/**
 * WebBrowse 执行结果
 */
export interface WebBrowseResult {
  success: boolean;
  url?: string;
  content?: string;
  title?: string;
  error?: string;
  screenshot?: string; // Base64 encoded screenshot
  metadata?: {
    loadTime?: number;
    contentLength?: number;
    statusCode?: number;
  };
}

/**
 * WebBrowse Executor Service
 * 
 * 使用 Playwright 实现无头浏览器执行器，用于执行需要 JavaScript 渲染的网页浏览任务
 */
@Injectable()
export class WebBrowseExecutorService {
  private readonly logger = new Logger(WebBrowseExecutorService.name);
  private readonly enabled: boolean;
  private browser: Browser | null = null;
  private readonly maxConcurrentPages = 3; // 最大并发页面数
  private activePages = new Set<Page>();

  constructor(private configService: ConfigService) {
    // 检查是否启用 WebBrowse（默认启用，但可以通过环境变量禁用）
    this.enabled = process.env.ENABLE_WEBBROWSE !== 'false';
    if (!this.enabled) {
      this.logger.log('WebBrowse is disabled');
    }
  }

  /**
   * 初始化浏览器实例（懒加载）
   */
  private async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      try {
        this.browser = await chromium.launch({
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--disable-dev-shm-usage',
            '--disable-gpu',
          ],
        });
        this.logger.debug('Browser instance created');
      } catch (error: any) {
        this.logger.error(`Failed to launch browser: ${error?.message || String(error)}`);
        throw new Error(`Browser launch failed: ${error?.message || String(error)}`);
      }
    }
    return this.browser;
  }

  /**
   * 执行 WebBrowse 操作
   * 
   * @param url 要访问的 URL
   * @param options 选项
   * @returns WebBrowse 结果
   */
  async browse(
    url: string,
    options?: {
      waitForSelector?: string;
      waitForTimeout?: number;
      takeScreenshot?: boolean;
      extractText?: boolean;
      extractLinks?: boolean;
      userAgent?: string;
      viewport?: { width: number; height: number };
    }
  ): Promise<WebBrowseResult> {
    if (!this.enabled) {
      return {
        success: false,
        error: 'WebBrowse is disabled',
      };
    }

    if (this.activePages.size >= this.maxConcurrentPages) {
      return {
        success: false,
        error: `Maximum concurrent pages limit reached (${this.maxConcurrentPages})`,
      };
    }

    let page: Page | null = null;
    const startTime = Date.now();

    try {
      const browser = await this.getBrowser();
      
      // 创建浏览器上下文
      const context = await browser.newContext({
        userAgent: options?.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: options?.viewport || { width: 1920, height: 1080 },
        locale: 'zh-CN',
      });

      page = await context.newPage();
      this.activePages.add(page);

      // 隐藏 webdriver 特征
      await page.addInitScript(() => {
        // @ts-ignore - navigator is available in browser context
        Object.defineProperty(navigator, 'webdriver', {
          get: () => false,
        });
      });

      this.logger.debug(`Browsing URL: ${url}`);

      // 访问页面
      const response = await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: 30000,
      });

      // 等待页面加载
      if (options?.waitForTimeout) {
        await page.waitForTimeout(options.waitForTimeout);
      }

      // 等待特定元素（如果有指定）
      if (options?.waitForSelector) {
        try {
          await page.waitForSelector(options.waitForSelector, { timeout: 10000 });
        } catch (error) {
          this.logger.warn(`Wait for selector "${options.waitForSelector}" timeout`);
        }
      }

      // 获取页面内容
      const content = await page.content();
      const title = await page.title();
      const loadTime = Date.now() - startTime;

      // 提取文本（如果需要）
      let extractedText: string | undefined;
      if (options?.extractText) {
        extractedText = await page.evaluate(() => {
          // 移除 script 和 style 标签
          // @ts-ignore - document and DOM types are available in browser context
          const scripts = document.querySelectorAll('script, style');
          scripts.forEach((el: any) => el.remove());
          
          // 获取页面文本
          // @ts-ignore - document is available in browser context
          return document.body.innerText || document.body.textContent || '';
        });
      }

      // 提取链接（如果需要）
      let extractedLinks: string[] | undefined;
      if (options?.extractLinks) {
        extractedLinks = await page.evaluate(() => {
          // @ts-ignore - document and DOM types are available in browser context
          const links = Array.from(document.querySelectorAll('a[href]'));
          return links
            .map((link: any) => link.href)
            .filter((href: string) => href && href.startsWith('http'));
        });
      }

      // 截图（如果需要）
      let screenshot: string | undefined;
      if (options?.takeScreenshot) {
        const screenshotBuffer = await page.screenshot({ fullPage: false });
        screenshot = screenshotBuffer.toString('base64');
      }

      const result: WebBrowseResult = {
        success: true,
        url,
        content: extractedText || content,
        title,
        screenshot,
        metadata: {
          loadTime,
          contentLength: content.length,
          statusCode: response?.status(),
        },
      };

      // 添加链接信息（如果提取了）
      if (extractedLinks) {
        result.metadata = {
          ...result.metadata,
          ...({ linksCount: extractedLinks.length } as any),
        };
      }

      this.logger.debug(`Successfully browsed ${url} (${loadTime}ms)`);
      return result;

    } catch (error: any) {
      this.logger.error(`Failed to browse ${url}: ${error?.message || String(error)}`, error?.stack);
      return {
        success: false,
        url,
        error: error?.message || String(error),
      };
    } finally {
      // 清理页面
      if (page) {
        this.activePages.delete(page);
        try {
          await page.close();
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.warn(`Failed to close page: ${errorMessage}`);
        }
      }
    }
  }

  /**
   * 执行多个 WebBrowse 操作（并行）
   */
  async browseMany(
    urls: string[],
    options?: {
      waitForSelector?: string;
      waitForTimeout?: number;
      takeScreenshot?: boolean;
      extractText?: boolean;
    }
  ): Promise<WebBrowseResult[]> {
    const promises = urls.map(url => this.browse(url, options));
    return Promise.all(promises);
  }

  /**
   * 清理资源（关闭浏览器）
   */
  async cleanup(): Promise<void> {
    // 关闭所有活动页面
    const closePromises = Array.from(this.activePages).map(async (page) => {
      try {
        await page.close();
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Failed to close page during cleanup: ${errorMessage}`);
      }
    });
    await Promise.all(closePromises);
    this.activePages.clear();

    // 关闭浏览器
    if (this.browser) {
      try {
        await this.browser.close();
        this.browser = null;
        this.logger.debug('Browser instance closed');
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Failed to close browser: ${errorMessage}`);
      }
    }
  }

  /**
   * 检查浏览器是否可用
   */
  async isAvailable(): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }

    try {
      const browser = await this.getBrowser();
      return browser.isConnected();
    } catch (error) {
      return false;
    }
  }
}

