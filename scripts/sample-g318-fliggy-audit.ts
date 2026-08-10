#!/usr/bin/env npx tsx
/**
 * G318 飞猪抽样校对：木格措门票 + 康定/理塘住宿。
 *
 *   npx tsx scripts/sample-g318-fliggy-audit.ts
 *   npx tsx scripts/sample-g318-fliggy-audit.ts --out data/country-packs/CN/audits/g318-fliggy-sample.json
 *
 * 需要：@fly-ai/flyai-cli + FLYAI_API_KEY（见 .env）
 */
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { config as loadEnv } from 'dotenv';
import { FliggyDirectService } from '../src/mcp/fliggy-direct.service';

loadEnv();

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i < 0) return undefined;
  return process.argv[i + 1];
}

function parsePrice(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  const m = String(v ?? '').replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function pickHotel(h: Record<string, unknown>) {
  const priceLabel = h.priceLabel ?? h.price ?? h.priceFrom ?? h.lowestPrice;
  return {
    title: h.name ?? h.title ?? h.hotelName ?? h.nameZh,
    priceLabel: priceLabel ?? undefined,
    price: parsePrice(priceLabel),
    currency: h.currency ?? 'CNY',
    score: h.score ?? h.rating,
    url: h.url ?? h.webUrl,
    reasonZh: h.reasonZh,
  };
}

function pickActivity(a: Record<string, unknown>) {
  const priceLabel = a.priceLabel ?? a.price ?? a.ticketPrice ?? a.priceFrom;
  return {
    title: a.nameZh ?? a.name ?? a.title,
    priceLabel: priceLabel ?? undefined,
    price: parsePrice(priceLabel),
    currency: a.currency ?? 'CNY',
    url: a.url ?? a.webUrl,
    reasonZh: a.reasonZh,
  };
}

async function main() {
  const out =
    argValue('--out') ||
    join(
      process.cwd(),
      'data/country-packs/CN/audits',
      `g318-fliggy-sample.${new Date().toISOString().slice(0, 10)}.json`,
    );
  const checkIn = argValue('--check-in') || '2026-08-21';
  const checkOut = argValue('--check-out') || '2026-08-22';

  const fliggy = new FliggyDirectService();
  if (!fliggy.isServiceAvailable()) {
    throw new Error('Fliggy CLI 不可用：检查 @fly-ai/flyai-cli / FLYAI_ENABLED');
  }

  const queries = [
    {
      id: 'mugecuo_ticket_keyword',
      kind: 'keyword' as const,
      query: '康定木格措门票',
    },
    {
      id: 'mugecuo_poi',
      kind: 'poi' as const,
      cityName: '康定',
      keyword: '木格措',
    },
    {
      id: 'kangding_hotel',
      kind: 'hotel' as const,
      destName: '康定',
      keyWords: '市区',
      checkInDate: checkIn,
      checkOutDate: checkOut,
    },
    {
      id: 'litang_hotel',
      kind: 'hotel' as const,
      destName: '理塘',
      checkInDate: checkIn,
      checkOutDate: checkOut,
    },
  ];

  const samples: Record<string, unknown>[] = [];
  for (const q of queries) {
    const started = Date.now();
    console.log(`→ ${q.id} ...`);
    try {
      if (q.kind === 'keyword') {
        const r = await fliggy.keywordSearch(q.query, 6);
        samples.push({
          id: q.id,
          query: q.query,
          ok: r.success,
          latency_ms: r.latency_ms ?? Date.now() - started,
          error: r.error,
          activities: (r.activities as any[]).slice(0, 5).map(pickActivity),
          hotels: (r.hotels as any[]).slice(0, 3).map(pickHotel),
          counts: {
            activities: r.activities.length,
            hotels: r.hotels.length,
            carRentals: r.carRentals.length,
          },
        });
      } else if (q.kind === 'poi') {
        const r = await fliggy.searchPois({
          cityName: q.cityName,
          keyword: q.keyword,
          limit: 6,
        });
        samples.push({
          id: q.id,
          cityName: q.cityName,
          keyword: q.keyword,
          ok: r.success,
          latency_ms: r.latency_ms ?? Date.now() - started,
          error: r.error,
          activities: (r.activities as any[]).slice(0, 5).map(pickActivity),
        });
      } else {
        const r = await fliggy.searchHotels({
          destName: q.destName,
          keyWords: q.keyWords,
          checkInDate: q.checkInDate,
          checkOutDate: q.checkOutDate,
          limit: 6,
        });
        samples.push({
          id: q.id,
          destName: q.destName,
          checkInDate: q.checkInDate,
          checkOutDate: q.checkOutDate,
          ok: r.success,
          latency_ms: r.latency_ms ?? Date.now() - started,
          error: r.error,
          rateLimited: r.rateLimited,
          hotels: (r.results as any[]).slice(0, 5).map(pickHotel),
        });
      }
    } catch (e) {
      samples.push({
        id: q.id,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        latency_ms: Date.now() - started,
      });
    }
  }

  const prices = samples
    .flatMap((s) => [
      ...(((s.activities as any[]) || []).map((a) => Number(a.price)).filter((n) => n > 0)),
      ...(((s.hotels as any[]) || []).map((h) => Number(h.price)).filter((n) => n > 0)),
    ]);

  const doc = {
    metadata: {
      version: '1.0.0',
      sampledAt: new Date().toISOString(),
      corridor: 'cn.route.g318',
      disclaimer:
        '飞猪实时抽样快照，仅供校对与票价区间校准；非门市官方价、非承诺库存。',
      checkIn,
      checkOut,
    },
    summary: {
      queries: samples.length,
      okCount: samples.filter((s) => s.ok).length,
      priceSamples: prices.length,
      priceMin: prices.length ? Math.min(...prices) : null,
      priceMax: prices.length ? Math.max(...prices) : null,
    },
    samples,
  };

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(doc, null, 2), 'utf8');
  console.log(`\nWrote ${out}`);
  console.log(JSON.stringify(doc.summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
