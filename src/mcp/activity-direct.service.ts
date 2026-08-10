/**
 * 活动预订 Direct：Browserbase 探运营商订票页 + 静态目录回落。
 * 只读抽取（标题/价签/订票 URL），不自动提交表单。
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { BrowserbaseMcpService } from './browserbase-mcp.service';
import {
  ICELAND_ACTIVITY_BOOKING_CATALOG,
  matchActivityCatalogEntries,
  type IcelandActivityBookingCatalogEntry,
  type ActivityBookingCategory,
} from './activity-booking-catalog';

export type ActivitySearchItem = {
  id: string;
  nameZh: string;
  nameEn?: string;
  category: ActivityBookingCategory;
  url: string;
  priceLabel?: string;
  urgencyZh?: string;
  reasonZh?: string;
  cta_zh: string;
  source: 'browserbase' | 'catalog_fallback';
  inventoryMode: 'page_probe' | 'catalog_link';
  availabilityDisclaimerZh: string;
};

export type ActivitySearchResult = {
  activities: ActivitySearchItem[];
  meta: {
    query: string;
    browserbase_available: boolean;
    probed: number;
    fallback: number;
    latency_ms: number;
    mode: 'browserbase' | 'catalog_only' | 'mixed';
    error?: string;
  };
};

function pickSessionId(raw: unknown): string | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const direct = o.sessionId ?? o.session_id ?? o.id;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const data = o.data;
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    const nested = d.sessionId ?? d.session_id ?? d.id;
    if (typeof nested === 'string' && nested.trim()) return nested.trim();
  }
  return undefined;
}

function unwrapEvaluatePayload(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    } catch {
      return { title: raw.slice(0, 200) };
    }
    return { raw: raw.slice(0, 400) };
  }
  if (typeof raw !== 'object') return {};
  const o = raw as Record<string, unknown>;
  if (o.result != null) return unwrapEvaluatePayload(o.result);
  if (o.data != null) return unwrapEvaluatePayload(o.data);
  if (typeof o.extraction === 'string' || typeof o.text === 'string') {
    return unwrapEvaluatePayload(o.extraction ?? o.text);
  }
  return o;
}

function pickStr(o: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return undefined;
}

function catalogToItem(
  entry: IcelandActivityBookingCatalogEntry,
  source: ActivitySearchItem['source'],
  extras?: Partial<ActivitySearchItem>,
): ActivitySearchItem {
  return {
    id: entry.id,
    nameZh: extras?.nameZh ?? entry.nameZh,
    nameEn: entry.nameEn,
    category: entry.category,
    url: extras?.url ?? entry.url,
    urgencyZh: entry.urgencyZh,
    reasonZh: extras?.reasonZh ?? entry.reasonZh,
    cta_zh: '去预订',
    source,
    inventoryMode: source === 'browserbase' ? 'page_probe' : 'catalog_link',
    availabilityDisclaimerZh:
      extras?.availabilityDisclaimerZh ??
      (source === 'browserbase'
        ? '页面粗探提示，非确认有余位；下单前以官网实时为准。'
        : '静态订票入口（Browserbase 未探页或失败）；下单前以官网实时为准。'),
    ...(extras?.priceLabel ? { priceLabel: extras.priceLabel } : {}),
  };
}

@Injectable()
export class ActivityDirectService {
  private readonly logger = new Logger(ActivityDirectService.name);

  constructor(
    @Optional() private readonly browserbase?: BrowserbaseMcpService,
  ) {}

  isAvailable(): boolean {
    return true; // 目录回落始终可用
  }

  browserbaseReady(): boolean {
    if (process.env.ACTIVITY_BOOKING_BROWSERBASE === '0') return false;
    return Boolean(this.browserbase?.isAvailable?.());
  }

  async searchActivities(params: {
    query?: string;
    limit?: number;
    /** 可选活动日 YYYY-MM-DD，仅写入 extract 提示 */
    date?: string;
  }): Promise<ActivitySearchResult> {
    const started = Date.now();
    const query = String(params.query ?? '').trim() || '冰岛活动预订';
    const limit = Math.max(1, Math.min(params.limit ?? 4, 6));
    const entries = matchActivityCatalogEntries(query, limit);
    if (!entries.length) {
      return {
        activities: [],
        meta: {
          query,
          browserbase_available: this.browserbaseReady(),
          probed: 0,
          fallback: 0,
          latency_ms: Date.now() - started,
          mode: 'catalog_only',
        },
      };
    }

    if (!this.browserbaseReady() || !this.browserbase) {
      const activities = entries.map((e) => catalogToItem(e, 'catalog_fallback'));
      return {
        activities,
        meta: {
          query,
          browserbase_available: false,
          probed: 0,
          fallback: activities.length,
          latency_ms: Date.now() - started,
          mode: 'catalog_only',
        },
      };
    }

    const budgetMs = Math.max(
      8000,
      Number(process.env.ACTIVITY_BROWSERBASE_MS ?? 28000) || 28000,
    );
    const perPageMs = Math.max(5000, Math.floor(budgetMs / Math.min(entries.length, 2)));
    const toProbe = entries.slice(0, 2);
    const rest = entries.slice(2);

    let probed = 0;
    let fallback = 0;
    const activities: ActivitySearchItem[] = [];
    let lastErr: string | undefined;
    /** MCP 初始化/404 等致命错误：后续条目直接目录回落，避免重复打挂掉的 endpoint */
    let browserbaseFatal = false;

    for (const entry of toProbe) {
      if (browserbaseFatal) {
        activities.push(catalogToItem(entry, 'catalog_fallback'));
        fallback++;
        continue;
      }
      const left = budgetMs - (Date.now() - started);
      if (left < 4000) {
        activities.push(catalogToItem(entry, 'catalog_fallback'));
        fallback++;
        continue;
      }
      try {
        const item = await this.probeCatalogEntry(entry, {
          timeoutMs: Math.min(perPageMs, left),
          date: params.date,
        });
        activities.push(item);
        if (item.source === 'browserbase') probed++;
        else fallback++;
      } catch (e: unknown) {
        lastErr = e instanceof Error ? e.message : String(e);
        this.logger.warn(`[activity] probe failed id=${entry.id}: ${lastErr}`);
        activities.push(catalogToItem(entry, 'catalog_fallback'));
        fallback++;
        if (
          /Initialization failed|status 404|Server not found|OAuth authorization required|not available/i.test(
            lastErr,
          )
        ) {
          browserbaseFatal = true;
          this.logger.warn(
            `[activity] Browserbase fatal (${lastErr.slice(0, 120)}) → remaining catalog_only`,
          );
        }
      }
    }

    for (const entry of rest) {
      activities.push(catalogToItem(entry, 'catalog_fallback'));
      fallback++;
    }

    const mode =
      probed > 0 && fallback > 0 ? 'mixed' : probed > 0 ? 'browserbase' : 'catalog_only';

    return {
      activities,
      meta: {
        query,
        // Honest availability: client wired and no fatal 404/OAuth/init failure.
        browserbase_available: this.browserbaseReady() && !browserbaseFatal,
        probed,
        fallback,
        latency_ms: Date.now() - started,
        mode,
        ...(lastErr ? { error: lastErr.slice(0, 240) } : {}),
      },
    };
  }

  private async probeCatalogEntry(
    entry: IcelandActivityBookingCatalogEntry,
    opts: { timeoutMs: number; date?: string },
  ): Promise<ActivitySearchItem> {
    const bb = this.browserbase!;
    const work = (async () => {
      const sessionRaw = await bb.createSession({
        url: entry.url,
        viewport: { width: 1280, height: 720 },
      });
      const sessionId = pickSessionId(sessionRaw);
      if (!sessionId) {
        throw new Error('Browserbase createSession 未返回 sessionId');
      }

      try {
        await bb.navigate({
          sessionId,
          url: entry.url,
          waitUntil: 'domcontentloaded',
        });
      } catch (e: unknown) {
        this.logger.debug(
          `[activity] navigate soft-fail id=${entry.id}: ${e instanceof Error ? e.message : e}`,
        );
      }

      const dateHint = opts.date ? ` Preferred date: ${opts.date}.` : '';
      const instruction = [
        `Extract activity booking facts from this page as JSON keys:`,
        `title, priceLabel, bookingUrl.`,
        entry.extractHint + '.',
        dateHint,
        `bookingUrl must be an absolute https URL if present; else omit.`,
        `priceLabel is a short price string if visible; else omit.`,
        `Do not fill forms or click pay.`,
      ].join(' ');

      const evalRaw = await bb.evaluate({ sessionId, script: instruction });
      const extracted = unwrapEvaluatePayload(evalRaw);
      const title =
        pickStr(extracted, ['title', 'name', 'productName', 'heading']) ?? entry.nameEn;
      const priceLabel = pickStr(extracted, [
        'priceLabel',
        'price',
        'fromPrice',
        'price_text',
        'amount',
      ]);
      let bookingUrl = pickStr(extracted, [
        'bookingUrl',
        'bookUrl',
        'url',
        'ticketUrl',
        'canonicalUrl',
        'href',
      ]);
      if (bookingUrl && !/^https?:\/\//i.test(bookingUrl)) {
        try {
          bookingUrl = new URL(bookingUrl, entry.url).toString();
        } catch {
          bookingUrl = entry.url;
        }
      }
      if (!bookingUrl || !/^https?:\/\//i.test(bookingUrl)) {
        bookingUrl = entry.url;
      }

      return catalogToItem(entry, 'browserbase', {
        url: bookingUrl,
        priceLabel,
        nameZh: entry.nameZh,
        reasonZh: title && title !== entry.nameEn ? `${entry.reasonZh}（页标题：${title.slice(0, 80)}）` : entry.reasonZh,
      });
    })();

    return await Promise.race([
      work,
      new Promise<ActivitySearchItem>((_, reject) => {
        setTimeout(
          () => reject(new Error(`activity probe timeout ${opts.timeoutMs}ms`)),
          opts.timeoutMs,
        );
      }),
    ]);
  }

  /** 测试 / 调试：暴露目录 */
  listCatalog() {
    return ICELAND_ACTIVITY_BOOKING_CATALOG.map((e) => ({
      id: e.id,
      nameZh: e.nameZh,
      nameEn: e.nameEn,
      url: e.url,
      category: e.category,
    }));
  }
}
