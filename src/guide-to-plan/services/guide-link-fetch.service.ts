import { Injectable, Logger, Optional } from '@nestjs/common';
import { ExaIntegrationService } from '../../mcp/exa-integration.service';

export type GuideLinkFetchResult = {
  content: string;
  title?: string;
  fetched: boolean;
  method?: 'exa' | 'http';
  error?: string;
};

const URL_ONLY_PATTERN = /^https?:\/\/[^\s]+$/i;

@Injectable()
export class GuideLinkFetchService {
  private readonly logger = new Logger(GuideLinkFetchService.name);

  constructor(@Optional() private readonly exaIntegration?: ExaIntegrationService) {}

  isUrlOnlyContent(text: string): boolean {
    const trimmed = text.trim();
    if (!URL_ONLY_PATTERN.test(trimmed)) return false;
    return trimmed.split('\n').filter((line) => line.trim().length > 0).length <= 1;
  }

  async fetchGuideContent(url: string): Promise<GuideLinkFetchResult> {
    const normalized = url.trim();
    if (!URL_ONLY_PATTERN.test(normalized)) {
      return { content: '', fetched: false, error: 'invalid_url' };
    }

    if (this.exaIntegration) {
      try {
        const exa = await this.exaIntegration.crawlOfficialPage(normalized, 'guide-to-plan import');
        if (exa.success && exa.content.length >= 80) {
          return { content: exa.content.slice(0, 50000), fetched: true, method: 'exa' };
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Exa crawl failed for ${normalized}: ${message}`);
      }
    }

    try {
      const response = await fetch(normalized, {
        headers: {
          'User-Agent': 'TripNARA-GuideBot/1.0 (+https://tripnara.com)',
          Accept: 'text/html,application/xhtml+xml,text/plain',
        },
        signal: AbortSignal.timeout(15_000),
        redirect: 'follow',
      });
      if (!response.ok) {
        return {
          content: '',
          fetched: false,
          error: `http_${response.status}`,
        };
      }
      const body = await response.text();
      const text = this.extractTextFromHtml(body);
      if (text.length >= 80) {
        return { content: text.slice(0, 50000), fetched: true, method: 'http' };
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`HTTP fetch failed for ${normalized}: ${message}`);
      return { content: '', fetched: false, error: message };
    }

    return {
      content: '',
      fetched: false,
      error: 'empty_content',
    };
  }

  private extractTextFromHtml(html: string): string {
    const withoutScripts = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ');
    const text = withoutScripts
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();
    return text;
  }
}
