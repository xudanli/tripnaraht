/**
 * 租车 Direct：Browserbase 探本地车行/比价官网 + 静态目录回落。
 * 无 Booking.com RapidAPI Key 时由 MCP dispatcher 回落至此（只读探页，不自动下单）。
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { BrowserbaseMcpService } from './browserbase-mcp.service';
import {
  ICELAND_CAR_RENTAL_CATALOG,
  matchCarRentalCatalogEntries,
  type IcelandCarRentalCatalogEntry,
} from './iceland-car-rental-catalog';

export type CarRentalDirectItem = {
  id: string;
  name: string;
  nameZh: string;
  nameEn: string;
  company: string;
  url: string;
  priceLabel?: string;
  reasonZh: string;
  cta_zh: string;
  source: 'browserbase' | 'catalog_fallback';
  availabilityDisclaimerZh: string;
  actions: Array<{
    action: string;
    label: string;
    labelCN: string;
    params?: Record<string, unknown>;
  }>;
  fields_zh: Array<{ key: string; label: string; value: string }>;
  field_labels_zh: Record<string, string>;
};

export type CarRentalDirectSearchResult = {
  data: CarRentalDirectItem[];
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
  entry: IcelandCarRentalCatalogEntry,
  source: CarRentalDirectItem['source'],
  extras?: Partial<Pick<CarRentalDirectItem, 'url' | 'priceLabel' | 'reasonZh'>>,
): CarRentalDirectItem {
  const cta = entry.kind === 'aggregation' ? '去比价' : '打开官网';
  const url = extras?.url ?? entry.url;
  const reasonZh = extras?.reasonZh ?? entry.reasonZh;
  const fields_zh: CarRentalDirectItem['fields_zh'] = [
    {
      key: 'kind',
      label: '类型',
      value: entry.kind === 'aggregation' ? '比价入口' : '本地车行',
    },
    { key: 'reason', label: '推荐原因', value: reasonZh },
  ];
  if (extras?.priceLabel) {
    fields_zh.push({ key: 'price', label: '参考价', value: extras.priceLabel });
  }
  if (entry.tagsZh?.length) {
    fields_zh.push({ key: 'tags', label: '标签', value: entry.tagsZh.join('、') });
  }
  fields_zh.push({ key: 'link', label: '官网', value: '点击打开' });

  return {
    id: entry.id,
    name: entry.nameZh,
    nameZh: entry.nameZh,
    nameEn: entry.nameEn,
    company: entry.nameEn,
    url,
    reasonZh,
    cta_zh: cta,
    source,
    availabilityDisclaimerZh:
      source === 'browserbase'
        ? '页面粗探提示，非确认可订；价格与条款以官网实时为准。'
        : '目录/官网入口参考（Browserbase 未探页或失败）；实时报价以官网为准。',
    ...(extras?.priceLabel ? { priceLabel: extras.priceLabel } : {}),
    actions: [
      {
        action: 'open_car_rental_url',
        label: 'Open',
        labelCN: cta,
        params: { url },
      },
    ],
    fields_zh,
    field_labels_zh: {
      kind: '类型',
      reason: '推荐原因',
      price: '参考价',
      tags: '标签',
      link: '官网',
    },
  };
}

@Injectable()
export class CarRentalDirectService {
  private readonly logger = new Logger(CarRentalDirectService.name);

  constructor(@Optional() private readonly browserbase?: BrowserbaseMcpService) {}

  isAvailable(): boolean {
    return true;
  }

  browserbaseReady(): boolean {
    if (process.env.CAR_RENTAL_BROWSERBASE === '0') return false;
    return Boolean(this.browserbase?.isAvailable?.());
  }

  async searchCarRentals(params: {
    query?: string;
    pickupQuery?: string;
    limit?: number;
  }): Promise<CarRentalDirectSearchResult> {
    const started = Date.now();
    const query =
      String(params.query ?? params.pickupQuery ?? '').trim() || '冰岛租车公司推荐';
    const limit = Math.max(1, Math.min(params.limit ?? 4, 6));
    const entries = matchCarRentalCatalogEntries(limit);

    if (!this.browserbaseReady() || !this.browserbase) {
      const data = entries.map((e) => catalogToItem(e, 'catalog_fallback'));
      return {
        data,
        meta: {
          query,
          browserbase_available: false,
          probed: 0,
          fallback: data.length,
          latency_ms: Date.now() - started,
          mode: 'catalog_only',
        },
      };
    }

    const budgetMs = Math.max(
      8000,
      Number(process.env.CAR_RENTAL_BROWSERBASE_MS ?? 28000) || 28000,
    );
    const perPageMs = Math.max(5000, Math.floor(budgetMs / Math.min(entries.length, 2)));
    const toProbe = entries.slice(0, 2);
    const rest = entries.slice(2);

    let probed = 0;
    let fallback = 0;
    const data: CarRentalDirectItem[] = [];
    let lastErr: string | undefined;
    let browserbaseFatal = false;

    for (const entry of toProbe) {
      if (browserbaseFatal) {
        data.push(catalogToItem(entry, 'catalog_fallback'));
        fallback++;
        continue;
      }
      const left = budgetMs - (Date.now() - started);
      if (left < 4000) {
        data.push(catalogToItem(entry, 'catalog_fallback'));
        fallback++;
        continue;
      }
      try {
        const item = await this.probeCatalogEntry(entry, {
          timeoutMs: Math.min(perPageMs, left),
        });
        data.push(item);
        if (item.source === 'browserbase') probed++;
        else fallback++;
      } catch (e: unknown) {
        lastErr = e instanceof Error ? e.message : String(e);
        this.logger.warn(`[car_rental] probe failed id=${entry.id}: ${lastErr}`);
        data.push(catalogToItem(entry, 'catalog_fallback'));
        fallback++;
        if (
          /Initialization failed|status 404|Server not found|OAuth authorization required|not available/i.test(
            lastErr,
          )
        ) {
          browserbaseFatal = true;
          this.logger.warn(
            `[car_rental] Browserbase fatal (${lastErr.slice(0, 120)}) → remaining catalog_only`,
          );
        }
      }
    }

    for (const entry of rest) {
      data.push(catalogToItem(entry, 'catalog_fallback'));
      fallback++;
    }

    const mode =
      probed > 0 && fallback > 0 ? 'mixed' : probed > 0 ? 'browserbase' : 'catalog_only';

    return {
      data,
      meta: {
        query,
        browserbase_available: this.browserbaseReady() && !browserbaseFatal,
        probed,
        fallback,
        latency_ms: Date.now() - started,
        mode,
        ...(lastErr ? { error: lastErr.slice(0, 200) } : {}),
      },
    };
  }

  private async probeCatalogEntry(
    entry: IcelandCarRentalCatalogEntry,
    opts: { timeoutMs: number },
  ): Promise<CarRentalDirectItem> {
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
          `[car_rental] navigate soft-fail id=${entry.id}: ${e instanceof Error ? e.message : e}`,
        );
      }

      const instruction = [
        `Extract car rental booking facts from this page as JSON keys:`,
        `title, priceLabel, bookingUrl.`,
        `This is an Iceland car rental company or comparison site (${entry.nameEn}).`,
        `priceLabel is a short daily/total price string if visible; else omit.`,
        `bookingUrl must be an absolute https URL if present; else omit.`,
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
        reasonZh:
          title && title !== entry.nameEn
            ? `${entry.reasonZh}（页标题：${title.slice(0, 80)}）`
            : entry.reasonZh,
      });
    })();

    return await Promise.race([
      work,
      new Promise<CarRentalDirectItem>((_, reject) => {
        setTimeout(
          () => reject(new Error(`car_rental probe timeout ${opts.timeoutMs}ms`)),
          opts.timeoutMs,
        );
      }),
    ]);
  }

  listCatalog() {
    return ICELAND_CAR_RENTAL_CATALOG.map((e) => ({
      id: e.id,
      nameZh: e.nameZh,
      nameEn: e.nameEn,
      url: e.url,
      kind: e.kind,
    }));
  }
}
