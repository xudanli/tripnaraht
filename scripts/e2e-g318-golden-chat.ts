#!/usr/bin/env npx tsx
/**
 * G318 golden 端到端：打 POST /api/agent/route_and_run，核对路由与卡片。
 * 夹具 SSOT：`src/agent/routing/cn-g318-golden-fixtures.ts`
 *
 *   npx tsx scripts/e2e-g318-golden-chat.ts              # 默认 core（排期/门票/租车）
 *   npx tsx scripts/e2e-g318-golden-chat.ts --all
 *   npx tsx scripts/e2e-g318-golden-chat.ts --booking
 *   npx tsx scripts/e2e-g318-golden-chat.ts --trip <id>
 */
import { config as loadEnv } from 'dotenv';
import axios from 'axios';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { classifyRouteAndRunRouteClass } from '../src/agent/routing/route-and-run-route-class.util';
import { CN_G318_E2E_GOLDENS } from '../src/agent/routing/cn-g318-golden-fixtures';

loadEnv();

const BASE = (process.env.BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const tripArg = (() => {
  const i = process.argv.indexOf('--trip');
  return i >= 0 ? process.argv[i + 1] : undefined;
})();

const CORE_IDS = new Set([
  'golden-cn-g318-how-to-plan',
  'golden-cn-mugecuo-ticket',
  'golden-cn-kangding-car-rental',
]);

function selectGoldens() {
  if (process.argv.includes('--all')) return [...CN_G318_E2E_GOLDENS];
  if (process.argv.includes('--booking')) {
    return CN_G318_E2E_GOLDENS.filter((g) => g.expectCards?.length);
  }
  return CN_G318_E2E_GOLDENS.filter((g) => CORE_IDS.has(g.id));
}

const GOLDENS = selectGoldens();

function dig(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let cur: any = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function collectCardHints(payload: any): Record<string, number> {
  const body = payload?.result?.payload || payload?.payload || payload?.result || payload;
  const ui = body?.ui_display || {};
  const turn = body?.conversation_turn_result || {};
  const sources = [body, ui, turn, payload];
  const keys = [
    'activity_booking_cards',
    'car_rental_cards',
    'hotel_cards',
    'hotels',
    'flight_cards',
    'flights',
    'activities',
  ];
  const out: Record<string, number> = {};
  for (const k of keys) {
    let n = 0;
    for (const s of sources) {
      const v = s?.[k];
      if (Array.isArray(v)) n = Math.max(n, v.length);
    }
    if (n) out[k] = n;
  }
  // 统一别名：hotels → hotel_cards
  if ((out.hotels ?? 0) > 0 && !out.hotel_cards) out.hotel_cards = out.hotels!;
  if ((out.flights ?? 0) > 0 && !out.flight_cards) out.flight_cards = out.flights!;
  return out;
}

function findHotspotMeta(payload: any): unknown {
  const candidates = [
    dig(payload, 'result.payload.activity_search_meta.cn_hotspot_booking'),
    dig(
      payload,
      'result.payload.conversation_turn_result.activity_search_meta.cn_hotspot_booking',
    ),
    dig(payload, 'result.activity_search_meta.cn_hotspot_booking'),
    dig(payload, 'activity_search_meta.cn_hotspot_booking'),
  ];
  return candidates.find((x) => x && typeof x === 'object') ?? null;
}

async function main() {
  const tripId =
    tripArg ||
    process.env.G318_E2E_TRIP_ID ||
    '85b93b63-a012-4f68-95d0-4eca7107c45d';

  const rows: Record<string, unknown>[] = [];
  let failed = 0;

  for (const g of GOLDENS) {
    const protocol = classifyRouteAndRunRouteClass({
      request_id: g.id,
      user_id: 'e2e-g318',
      trip_id: tripId,
      message: g.message,
    });
    const protocolOk = protocol.routeClass === g.expectRouteClass;
    console.log(`\n→ ${g.id}`);
    console.log(`  protocol=${protocol.routeClass} (expect ${g.expectRouteClass})`);

    const started = Date.now();
    let httpOk = false;
    let status = 0;
    let err: string | undefined;
    let cards: Record<string, number> = {};
    let hotspot: unknown = null;
    let answerPreview = '';
    let routeClassLive: string | undefined;

    try {
      const res = await axios.post(
        `${BASE}/api/agent/route_and_run`,
        {
          request_id: `e2e-${g.id}-${Date.now()}`,
          user_id: 'e2e-g318',
          trip_id: tripId,
          message: g.message,
          options: { max_seconds: 45, locale: 'zh-CN' },
        },
        {
          timeout: 90_000,
          proxy: false,
          validateStatus: () => true,
          headers: { 'Content-Type': 'application/json' },
        },
      );
      status = res.status;
      httpOk = status >= 200 && status < 300;
      const body = res.data;
      cards = collectCardHints(body);
      hotspot = findHotspotMeta(body);
      routeClassLive =
        dig(body, 'routing.routeClass') ||
        dig(body, 'route_class') ||
        dig(body, 'result.route_class') ||
        dig(body, 'orchestration.routeClass') ||
        undefined;
      const answer =
        dig(body, 'result.payload.conversation_turn_result.answer_text') ||
        dig(body, 'result.payload.answer_text') ||
        dig(body, 'answer') ||
        dig(body, 'result.answer') ||
        dig(body, 'message');
      answerPreview = String(answer ?? '').slice(0, 180);

      if (!httpOk) {
        err = `HTTP ${status}: ${JSON.stringify(body).slice(0, 300)}`;
      }
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    }

    const latency_ms = Date.now() - started;
    let cardOk = true;
    if (g.expectCards?.length) {
      cardOk = g.expectCards.some((k) => (cards[k] ?? 0) > 0);
    }
    let metaOk = true;
    if (g.expectMeta) {
      metaOk = Boolean(hotspot);
    }
    let answerOk = true;
    if (g.expectAnswer) {
      answerOk = answerPreview.trim().length >= 8;
    }

    const ok = protocolOk && httpOk && cardOk && metaOk && answerOk;
    if (!ok) failed++;

    const row = {
      id: g.id,
      ok,
      protocolOk,
      protocolRouteClass: protocol.routeClass,
      httpOk,
      status,
      latency_ms,
      routeClassLive,
      cards,
      cardOk,
      answerOk,
      hotspotMeta: hotspot,
      metaOk,
      answerPreview,
      error: err,
    };
    rows.push(row);
    console.log(
      `  http=${status} ${latency_ms}ms cards=${JSON.stringify(cards)}` +
        ` meta=${hotspot ? 'yes' : 'no'} => ${ok ? 'PASS' : 'FAIL'}`,
    );
    if (err) console.log(`  err: ${err}`);
    if (answerPreview) console.log(`  answer: ${answerPreview.replace(/\n/g, ' ')}`);
  }

  const out = join(
    process.cwd(),
    'data/country-packs/CN/audits',
    `g318-e2e-golden.${new Date().toISOString().slice(0, 10)}.json`,
  );
  mkdirSync(dirname(out), { recursive: true });
  const doc = {
    metadata: {
      sampledAt: new Date().toISOString(),
      baseUrl: BASE,
      tripId,
    },
    summary: {
      total: GOLDENS.length,
      passed: GOLDENS.length - failed,
      failed,
    },
    rows,
  };
  writeFileSync(out, JSON.stringify(doc, null, 2), 'utf8');
  console.log(`\nWrote ${out}`);
  console.log(JSON.stringify(doc.summary, null, 2));
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
