/**
 * Airbnb Direct Search — 本机抓取 Airbnb 搜索页 JSON（#data-deferred-state-0）。
 * 用于替代远端 Smithery/geobio 刮页 MCP（常被拦返回 “Could not find data script element”）。
 */

import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';

const UNAVAILABLE_RE =
  /those dates are not available|dates not available|not available for these dates|sold out|no availability|unavailable for your dates|选择的日期不可订|这些日期不可用|该日期不可订|所选日期无空房/i;

function htmlSuggestsStayUnavailable(html: string): boolean {
  return UNAVAILABLE_RE.test(String(html || ''));
}

function htmlSuggestsStayBookable(html: string): boolean {
  const t = String(html || '');
  if (!t || UNAVAILABLE_RE.test(t)) return false;
  return (
    /bookItButton|Reserve|立即预订|Reserve\s*this\s*place|structuredDisplayPrice|availabilityCalendar/i.test(
      t,
    ) || /\"bookability\"\s*:\s*\"BOOKABLE\"/i.test(t)
  );
}

export type AirbnbDirectSearchParams = {
  location: string;
  adults?: number;
  children?: number;
  infants?: number;
  pets?: number;
  checkin?: string;
  checkout?: string;
  page?: number;
  ignoreRobotsText?: boolean;
};

@Injectable()
export class AirbnbDirectService {
  private readonly logger = new Logger(AirbnbDirectService.name);
  private readonly baseUrl = 'https://www.airbnb.com';

  isServiceAvailable(): boolean {
    return true;
  }

  /**
   * 返回与 MCP `airbnb_search` 相近的 content 包装，便于 Dispatcher 复用解析。
   */
  async searchListings(params: AirbnbDirectSearchParams): Promise<{
    content: Array<{ type: 'text'; text: string }>;
    isError?: boolean;
  }> {
    const location = String(params.location || '').trim();
    if (!location) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: 'location required', searchResults: [] }) }],
        isError: true,
      };
    }

    const searchUrl = this.buildSearchUrl(params);
    this.logger.debug(`Airbnb Direct 搜索: ${searchUrl}`);

    try {
      const html = await this.fetchHtml(searchUrl);
      const searchResults = this.parseSearchResults(html)
        .map((row) => this.normalizeListing(row))
        .slice(0, 12);
      this.logger.log(
        `Airbnb Direct 命中 ${searchResults.length} 条 location=${location}` +
          (params.checkin ? ` ${params.checkin}→${params.checkout || '?'}` : ''),
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ searchResults, searchUrl, source: 'airbnb_direct' }),
          },
        ],
      };
    } catch (e: any) {
      const msg = e?.message ? String(e.message) : String(e);
      this.logger.warn(`Airbnb Direct 失败: ${msg}`);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: msg, searchUrl, searchResults: [] }),
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * 用带日期的房源页粗探可订性（超时失败返回 unknown，不阻塞主链）。
   */
  async probeListingStayAvailability(params: {
    listingId: string;
    checkin?: string;
    checkout?: string;
    adults?: number;
    timeoutMs?: number;
  }): Promise<{
    available: boolean | 'unknown';
    reason?: string;
  }> {
    const id = String(params.listingId || '').trim();
    if (!id) return { available: 'unknown', reason: 'missing_listing_id' };
    const q = new URLSearchParams();
    if (params.checkin) q.set('check_in', params.checkin.slice(0, 10));
    if (params.checkout) q.set('check_out', params.checkout.slice(0, 10));
    q.set('adults', String(params.adults ?? 1));
    const url = `${this.baseUrl}/rooms/${encodeURIComponent(id)}?${q.toString()}`;
    const timeoutMs = Math.min(Math.max(params.timeoutMs ?? 6_000, 2_000), 12_000);
    try {
      const html = await this.fetchHtml(url, timeoutMs);
      if (htmlSuggestsStayUnavailable(html)) {
        return { available: false, reason: 'unavailable_copy' };
      }
      if (htmlSuggestsStayBookable(html)) {
        return { available: true, reason: 'bookable_signal' };
      }
      return { available: 'unknown', reason: 'inconclusive' };
    } catch (e: any) {
      return { available: 'unknown', reason: e?.message ? String(e.message).slice(0, 120) : 'probe_error' };
    }
  }

  private buildSearchUrl(params: AirbnbDirectSearchParams): string {
    const q = new URLSearchParams();
    if (params.checkin) q.set('checkin', params.checkin.slice(0, 10));
    if (params.checkout) q.set('checkout', params.checkout.slice(0, 10));
    q.set('adults', String(params.adults ?? 1));
    q.set('children', String(params.children ?? 0));
    q.set('infants', String(params.infants ?? 0));
    q.set('pets', String(params.pets ?? 0));
    if (params.page && params.page > 1) q.set('items_offset', String((params.page - 1) * 18));
    const pathLoc = params.location
      .trim()
      .replace(/\s*,\s*/g, '--')
      .replace(/\s+/g, '-');
    return `${this.baseUrl}/s/${encodeURIComponent(pathLoc)}/homes?${q.toString()}`;
  }

  private async fetchHtml(url: string, timeoutMs?: number): Promise<string> {
    const defaultSearchMs = (() => {
      const raw = parseInt(process.env.AIRBNB_DIRECT_SEARCH_MS ?? '', 10);
      return Number.isFinite(raw) && raw >= 8_000 ? Math.min(raw, 35_000) : 28_000;
    })();
    const response = await axios.get(url, {
      /** 须低于 LIVE_TOOL_HOTEL_MS；默认 28s，可用 AIRBNB_DIRECT_SEARCH_MS 覆盖 */
      timeout: timeoutMs ?? defaultSearchMs,
      proxy: false,
      maxRedirects: 5,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
      },
      validateStatus: (s) => s >= 200 && s < 400,
    });
    return String(response.data ?? '');
  }

  private parseSearchResults(html: string): any[] {
    const $ = cheerio.load(html);
    const scriptEl = $('#data-deferred-state-0').first();
    if (!scriptEl.length) {
      // 兜底：任意含 niobeClientData 的 script
      let found = '';
      $('script').each((_, el) => {
        const t = $(el).html() || $(el).text() || '';
        if (t.includes('niobeClientData') && t.includes('staysSearch')) {
          found = t;
          return false;
        }
        return undefined;
      });
      if (!found) {
        throw new Error('Could not find data script element');
      }
      return this.extractResultsFromScript(found);
    }
    return this.extractResultsFromScript(scriptEl.text());
  }

  private extractResultsFromScript(scriptContent: string): any[] {
    if (!scriptContent?.trim()) {
      throw new Error('Data script element is empty');
    }
    const clientData = JSON.parse(scriptContent);
    const results =
      clientData?.niobeClientData?.[0]?.[1]?.data?.presentation?.staysSearch?.results ??
      clientData?.niobeClientData?.[0]?.[1]?.data?.presentation?.staysSearch?.results?.searchResults;
    const list = Array.isArray(results?.searchResults)
      ? results.searchResults
      : Array.isArray(results)
        ? results
        : [];
    if (!list.length) {
      throw new Error('staysSearch results empty');
    }
    return list;
  }

  private normalizeListing(row: any): any {
    const demandId = row?.demandStayListing?.id;
    let id = String(row?.propertyId ?? '');
    if (demandId) {
      try {
        const decoded = Buffer.from(String(demandId), 'base64').toString('utf8');
        const m = decoded.match(/DemandStayListing:(\d+)/);
        if (m) id = m[1];
      } catch {
        /* keep propertyId */
      }
    }
    const name =
      row?.demandStayListing?.description?.name?.localizedStringWithTranslationPreference ||
      row?.nameLocalized ||
      row?.title ||
      'Airbnb listing';
    return {
      ...row,
      id,
      url: id ? `${this.baseUrl}/rooms/${id}` : undefined,
      demandStayListing: row?.demandStayListing,
    };
  }
}
