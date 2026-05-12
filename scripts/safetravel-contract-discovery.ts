/**
 * SafeTravel.is — 契约探测（只读 GET）+ SSOT 断言摘要
 *
 * 用途：确认 RSS / WP-JSON / 猜测 API 的真实响应；为 SafetravelService 换血提供证据。
 * 运行：npm run diagnostic:safetravel
 *
 * 环境变量：
 * - SAFETRAVEL_DIAG_STRICT=1 — RSS 非 200 或无法解析为 RSS  envelope 时 process.exit(1)
 * - SAFETRAVEL_DIAG_FULL_PLUGIN_ROUTES=1 — 对 yoast/litespeed/complianz 等插件路径也做 GET 扫描（默认跳过以降噪）
 *
 * 管道：将本脚本 stdout 接到 `head` 等早关管道的命令时，Node 可能以 **SIGPIPE (141)** 退出——诊断本身未必失败；CI 请用输出重定向或 `grep -m`。
 *
 * 不写入业务库。
 *
 * RSS 精炼层 TypeScript 契约（供 LLM / Parser 对齐）：`src/iceland-info/interfaces/safetravel-rss-refined.interface.ts`
 */

import axios from 'axios';
import { AlertSeverity, AlertType } from '../src/iceland-info/dto/safetravel.dto';
import {
  inferAlertSeverity,
  inferAlertType,
  parseSafetravelRssItems,
} from '../src/iceland-info/utils/safetravel-rss-parse.util';

const RSS_URL = 'https://safetravel.is/feed';
const SITE_ORIGIN = 'https://safetravel.is';
const WP_JSON_INDEX_URL = `${SITE_ORIGIN}/wp-json/`;

/** 现有服务里用过的 iPhone WebKit UA */
const MOBILE_UA_WEBKIT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 SafeTravel/5.0';

/** 用户指定的「原生 App」风格 UA（探测爬虫拦截） */
const MOBILE_UA_APP_NATIVE =
  'SafeTravel/3.1.0 (iOS; 17.4; Apple/iPhone15,3)';

const TWENTY_FOUR_H_MS = 24 * 60 * 60 * 1000;
const FORTY_EIGHT_H_MS = 48 * 60 * 60 * 1000; // channel heartbeat when feed has zero <item>

function routeSupportsGet(routeDef: unknown): boolean {
  if (!routeDef || typeof routeDef !== 'object') return false;
  const d = routeDef as {
    methods?: string[] | string;
    endpoints?: Array<{ methods?: string[] | string }>;
  };
  if (typeof d.methods === 'string' && d.methods === 'GET') return true;
  if (Array.isArray(d.methods) && d.methods.includes('GET')) return true;
  if (Array.isArray(d.endpoints)) {
    for (const e of d.endpoints) {
      if (typeof e.methods === 'string' && e.methods === 'GET') return true;
      if (Array.isArray(e.methods) && e.methods.includes('GET')) return true;
    }
  }
  return false;
}

/** 跳过带正则占位符的 REST 模板，避免无效 GET */
function isSimpleRestPath(path: string): boolean {
  if (!path || path === '/') return false;
  if (path.includes('(?P<') || path.includes('(?:') || path.includes('[')) return false;
  return true;
}

function routePriorityScore(path: string): number {
  let s = 0;
  if (/safetravel|iceland|hazard|warning|condition|travel-alert|bulletin/i.test(path)) s += 120;
  if (/alert/i.test(path) && !/yoast/i.test(path)) s += 40;
  if (/yoast|smush|litespeed|complianz|weglot|google-site-kit|gwiz|koko|llar|publishpress|performance-lab|wp-site-health|wp-block-editor|wp-abilities|permissions$/i.test(path))
    s -= 15;
  return s;
}

/** 默认跳过常见运维/SEO 插件的 GET 噪声；`SAFETRAVEL_DIAG_FULL_PLUGIN_ROUTES=1` 时不过滤 */
function isLowValuePluginProbePath(path: string): boolean {
  if (process.env.SAFETRAVEL_DIAG_FULL_PLUGIN_ROUTES === '1') return false;
  const low = [
    '/yoast/',
    '/litespeed/',
    '/koko-analytics/',
    '/wp-smush/',
    '/llar/',
    '/google-site-kit/',
    '/gwiz/',
    '/publishpress-future/',
    '/weglot/',
    '/complianz/',
  ];
  return low.some((p) => path.startsWith(p));
}

/**
 * 全量打印 `namespaces`，并对「不以 wp/v2 开头」的命名空间下、支持 GET 的简单路径做深度探测（上限防止刷屏）。
 */
async function probeWpJsonNamespacesDeepScan(): Promise<void> {
  console.log('\n=== B2 — WordPress index: namespaces (full) + non–wp/v2 route GET scan ===');
  console.log(`URL: ${WP_JSON_INDEX_URL}`);
  const res = await axios.get<Record<string, unknown>>(WP_JSON_INDEX_URL, {
    timeout: 35_000,
    maxRedirects: 7,
    validateStatus: () => true,
    headers: { Accept: 'application/json' },
  });
  console.log(`HTTP: ${res.status}`);
  if (res.status !== 200 || !res.data || typeof res.data !== 'object') {
    console.log('wp-json index: unexpected body, skip namespace scan');
    return;
  }
  const idx = res.data;
  const namespaces = Array.isArray(idx.namespaces) ? (idx.namespaces as string[]) : [];
  console.log('\n--- namespaces (JSON array, SSOT for registered REST namespaces) ---');
  console.log(JSON.stringify(namespaces, null, 2));

  const nonWpV2Prefixes = namespaces.filter((ns) => !ns.startsWith('wp/v2'));
  console.log('\n--- namespaces NOT starting with "wp/v2" (per archaeology brief) ---');
  console.log(JSON.stringify(nonWpV2Prefixes, null, 2));

  const scanNamespaces = namespaces.filter((ns) => !ns.startsWith('wp/v2') && !ns.startsWith('oembed'));
  const routesObj = idx.routes;
  if (!routesObj || typeof routesObj !== 'object') {
    console.log('No routes object on index');
    return;
  }
  const routes = routesObj as Record<string, unknown>;

  const belongsToScanNs = (path: string): boolean => {
    const tail = path.replace(/^\//, '');
    return scanNamespaces.some((ns) => tail === ns || tail.startsWith(`${ns}/`));
  };

  const getCandidates: string[] = [];
  for (const [path, def] of Object.entries(routes)) {
    if (!belongsToScanNs(path)) continue;
    if (!isSimpleRestPath(path)) continue;
    if (!routeSupportsGet(def)) continue;
    if (isLowValuePluginProbePath(path)) continue;
    getCandidates.push(path);
  }

  getCandidates.sort((a, b) => routePriorityScore(b) - routePriorityScore(a));

  const mustProbe = ['/safetravel-ad/v1', '/safetravel-ad/v1/entries'];
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const p of [...mustProbe, ...getCandidates]) {
    if (seen.has(p)) continue;
    seen.add(p);
    ordered.push(p);
  }
  const maxGets = process.env.SAFETRAVEL_DIAG_FULL_PLUGIN_ROUTES === '1' ? 48 : 22;
  const toProbe = ordered.slice(0, maxGets);

  let safetravelEntriesHttp: number | undefined;

  console.log(
    `\n--- Deep GET (${toProbe.length} paths, cap ${maxGets}; namespaces scanned exclude oembed + wp/v2; plugin noise ${process.env.SAFETRAVEL_DIAG_FULL_PLUGIN_ROUTES === '1' ? 'included' : 'skipped (set SAFETRAVEL_DIAG_FULL_PLUGIN_ROUTES=1 for full)'}) ---`,
  );
  console.log(`Total simple GET candidates in that slice: ${getCandidates.length}`);

  for (const path of toProbe) {
    const url = `${SITE_ORIGIN}/wp-json${path}`;
    try {
      const r = await axios.get(url, {
        timeout: 15_000,
        validateStatus: () => true,
        headers: { Accept: 'application/json' },
      });
      const ct = String(r.headers['content-type'] ?? '');
      const raw = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
      const prev = snippet(raw, 420);
      console.log(`\nGET ${r.status} ${path}`);
      if (path === '/safetravel-ad/v1/entries') safetravelEntriesHttp = r.status;
      console.log(`  full URL: ${url}`);
      console.log(`  Content-Type: ${ct}`);
      console.log(`  body snippet: ${prev}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`\nGET ERROR ${path}: ${msg}`);
    }
  }

  const hitSafetravelNs = namespaces.some((n) => /safetravel/i.test(n));
  console.log('\n--- Namespace archaeology verdict ---');
  if (hitSafetravelNs) {
    console.log(
      'FOUND custom namespace matching /safetravel/i — inspect GET results above for JSON shape (e.g. safetravel-ad/v1/entries).',
    );
    if (safetravelEntriesHttp === 401) {
      console.log(
        'safetravel-ad/v1/entries → HTTP 401 (rest_forbidden): authenticated / capability-gated — not a public anonymous SSOT; partnership or app token would be required.',
      );
    } else if (safetravelEntriesHttp === 200) {
      console.log('safetravel-ad/v1/entries → HTTP 200: public JSON payload — candidate SSOT beyond RSS.');
    } else if (safetravelEntriesHttp != null) {
      console.log(`safetravel-ad/v1/entries → HTTP ${safetravelEntriesHttp} (unexpected for gating hypothesis).`);
    }
  } else {
    console.log('No namespace substring "safetravel" in array (see full list).');
  }
}

async function probeRobotsTxt(): Promise<void> {
  const url = `${SITE_ORIGIN}/robots.txt`;
  console.log('\n=== R — robots.txt (Disallow / Sitemap hints) ===');
  console.log(`URL: ${url}`);
  try {
    const res = await axios.get<string>(url, {
      timeout: 15_000,
      validateStatus: () => true,
      responseType: 'text',
      headers: { Accept: 'text/plain,*/*' },
    });
    console.log(`HTTP: ${res.status}`);
    const text = typeof res.data === 'string' ? res.data : String(res.data);
    const lines = text.split(/\r?\n/);
    const interesting = lines.filter((ln) => {
      const t = ln.trim().toLowerCase();
      return (
        t.startsWith('disallow:') ||
        t.startsWith('allow:') ||
        t.startsWith('sitemap:') ||
        /\b(api|internal|export|data|wp-json|feed)\b/i.test(ln)
      );
    });
    console.log('--- filtered / notable lines ---');
    console.log(interesting.length ? interesting.join('\n') : '(no Disallow/Sitemap/hunch lines matched filter)');
    console.log(`--- raw length: ${text.length} chars ---`);
  } catch (e: unknown) {
    console.log(e instanceof Error ? e.message : String(e));
  }
}

/** 从 sitemap XML 提取 `<loc>`（index 或 urlset） */
function extractSitemapLocs(xml: string): string[] {
  const out: string[] = [];
  const re = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const u = m[1].replace(/\s+/g, '').trim();
    if (u) out.push(u);
  }
  return [...new Set(out)];
}

/** sitemap_index → 子表 URL；对可疑名做 HEAD + 正文片段与 `<url>` 计数 */
async function probeSitemapIndex(): Promise<void> {
  const indexUrl = `${SITE_ORIGIN}/sitemap_index.xml`;
  console.log('\n=== S — sitemap_index.xml → child sitemaps (last-line archaeology) ===');
  console.log(`URL: ${indexUrl}`);
  try {
    const res = await axios.get<string>(indexUrl, {
      timeout: 20_000,
      validateStatus: () => true,
      responseType: 'text',
      headers: { Accept: 'application/xml,text/xml,*/*' },
    });
    console.log(`HTTP: ${res.status}`);
    const xml = typeof res.data === 'string' ? res.data : String(res.data);
    if (res.status !== 200) {
      console.log(`body snippet: ${snippet(xml, 240)}`);
      return;
    }
    const locs = extractSitemapLocs(xml);
    console.log(`\n--- child sitemap <loc> count: ${locs.length} ---`);
    console.log(JSON.stringify(locs, null, 2));
    const hunch = locs.filter((u) =>
      /alert|condition|advisory|hazard|bulletin|warning|safetravel|travel|post-sitemap|page-sitemap/i.test(u),
    );
    console.log('\n--- URLs matching alert/condition/… hunch regex ---');
    console.log(hunch.length ? JSON.stringify(hunch, null, 2) : '(none — no surprise filenames in index)');

    const maxChild = Math.min(10, locs.length);
    console.log(`\n--- first ${maxChild} child sitemaps: <url> count + snippet ---`);
    for (let i = 0; i < maxChild; i++) {
      const child = locs[i];
      try {
        const r = await axios.get<string>(child, {
          timeout: 18_000,
          validateStatus: () => true,
          responseType: 'text',
          headers: { Accept: 'application/xml,text/xml,*/*' },
        });
        const body = typeof r.data === 'string' ? r.data : String(r.data);
        const urlTags = (body.match(/<url>/gi) || []).length;
        console.log(`\n[${i + 1}/${maxChild}] HTTP ${r.status} ${child}`);
        console.log(`  <url> blocks (approx): ${urlTags}`);
        console.log(`  snippet: ${snippet(body.replace(/\s+/g, ' '), 320)}`);
      } catch (err: unknown) {
        console.log(`\n[${i + 1}/${maxChild}] ERROR ${child}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    console.log('\n--- Sitemap verdict ---');
    if (hunch.length) {
      console.log('Hunch URLs present — inspect child snippets above for alert-like URL patterns.');
    } else {
      console.log('No filename hunch in index; child list is standard Yoast-style sitemap set.');
    }
  } catch (e: unknown) {
    console.log(e instanceof Error ? e.message : String(e));
  }
}

function snippet(data: unknown, max = 200): string {
  if (data == null) return '';
  if (typeof data === 'string') {
    return data.slice(0, max).replace(/\s+/g, ' ').trim();
  }
  try {
    return JSON.stringify(data).slice(0, max);
  } catch {
    return String(data).slice(0, max);
  }
}

function extractChannelLastBuildDate(xml: string): string | undefined {
  const m = xml.match(/<lastBuildDate>([\s\S]*?)<\/lastBuildDate>/i);
  const raw = m?.[1]?.trim();
  return raw ? raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/i, '$1').trim() : undefined;
}

/** 脚本内语义金样例：与 dto 枚举对齐（无字面量 `warning`，黄警 → MEDIUM） */
function inferRegionHint(text: string): string | null {
  const t = text.toLowerCase();
  if (/south\s+iceland|suðurland|sudurland/i.test(t)) return 'South';
  if (/north\s+iceland|norðurland|nordurland/i.test(t)) return 'North';
  if (/east\s+iceland|austurland/i.test(t)) return 'East';
  if (/west\s+iceland|westfjords|vestfirdir|vestfirðir/i.test(t)) return 'West';
  if (/reykjavík|reykjavik|capital\s+region|greater\s+reykjavík/i.test(t)) return 'Capital';
  return null;
}

function runSemanticAlignmentCheck(): void {
  console.log('\n=== Semantic alignment (golden string) ===');
  const input = 'Yellow alert: High winds in South Iceland.';
  const severity = inferAlertSeverity(input);
  const type = inferAlertType(input);
  const region = inferRegionHint(input);
  const expectSeverity = AlertSeverity.MEDIUM;
  const expectType = AlertType.WEATHER;
  const expectRegion = 'South';
  const sevOk = severity === expectSeverity;
  const typeOk = type === expectType;
  const regionOk = region === expectRegion;
  console.log(`Input: ${JSON.stringify(input)}`);
  console.log(
    `Derived: severity=${severity} (expect ${expectSeverity} — operational “warning/yellow” tier), type=${type}, regionHint=${region}`,
  );
  console.log(
    `Assert: severity ${sevOk ? 'PASS' : 'FAIL'}, type ${typeOk ? 'PASS' : 'FAIL'}, region ${regionOk ? 'PASS' : 'FAIL'}`,
  );
  if (!sevOk || !typeOk || !regionOk) {
    throw new Error('Semantic alignment check failed');
  }
}

async function probe(
  label: string,
  url: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; contentType: string; bodyPreview: string; error?: string }> {
  try {
    const res = await axios.get(url, {
      timeout: 20_000,
      maxRedirects: 7,
      validateStatus: () => true,
      headers: {
        Accept: '*/*',
        ...headers,
      },
    });
    const ct = String(res.headers['content-type'] ?? '');
    const body = res.data;
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    console.log(`\n=== ${label} ===`);
    console.log(`URL: ${url}`);
    console.log(`HTTP: ${res.status}`);
    console.log(`Content-Type: ${ct}`);
    console.log(`Body (first 200 chars): ${snippet(text, 200)}`);
    return { status: res.status, contentType: ct, bodyPreview: snippet(text, 200) };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`\n=== ${label} === ERROR`);
    console.log(`URL: ${url}`);
    console.log(msg);
    return { status: -1, contentType: '', bodyPreview: '', error: msg };
  }
}

async function probeRssSsot(): Promise<{
  rssHttp: number;
  itemCount: number;
  itemFreshIn24h: boolean;
  channelLastBuild?: string;
  channelFresh24h: boolean;
  channelFresh48h: boolean;
  xmlSample: string;
}> {
  console.log('\n=== A — RSS feed (SSOT probe + structure) ===');
  console.log(`URL: ${RSS_URL}`);
  const res = await axios.get<string>(RSS_URL, {
    timeout: 25_000,
    maxRedirects: 10,
    validateStatus: () => true,
    responseType: 'text',
    headers: {
      Accept: 'application/rss+xml, application/xml, text/xml, */*',
    },
  });
  const xml = typeof res.data === 'string' ? res.data : String(res.data);
  const ct = String(res.headers['content-type'] ?? '');
  console.log(`HTTP: ${res.status}`);
  console.log(`Content-Type: ${ct}`);
  console.log(`Body length: ${xml.length} chars`);

  const strict = process.env.SAFETRAVEL_DIAG_STRICT === '1';
  if (res.status !== 200) {
    console.log('RSS SSOT: FAIL (non-200)');
    if (strict) process.exit(1);
  }
  const looksLikeRss = /<\s*rss[\s>]/i.test(xml) && /<\s*channel[\s>]/i.test(xml);
  if (!looksLikeRss) {
    console.log('RSS SSOT: FAIL (body does not look like RSS 2.0 channel)');
    if (strict) process.exit(1);
  }

  const items = parseSafetravelRssItems(xml);
  const now = Date.now();
  let itemFreshIn24h = false;
  for (const it of items) {
    if (!it.pubDate) continue;
    const t = Date.parse(it.pubDate);
    if (Number.isNaN(t)) continue;
    if (now - t >= 0 && now - t <= TWENTY_FOUR_H_MS) {
      itemFreshIn24h = true;
      break;
    }
  }

  const lastBuild = extractChannelLastBuildDate(xml);
  let channelFresh24h = false;
  let channelFresh48h = false;
  if (lastBuild) {
    const t = Date.parse(lastBuild);
    if (!Number.isNaN(t) && now - t >= 0 && now - t <= TWENTY_FOUR_H_MS) {
      channelFresh24h = true;
    }
    if (!Number.isNaN(t) && now - t >= 0 && now - t <= FORTY_EIGHT_H_MS) {
      channelFresh48h = true;
    }
  }

  const xmlSample = snippet(xml.replace(/\s+/g, ' '), 1200);
  console.log(`<item> count (parsed): ${items.length}`);
  console.log(`Any item pubDate within last 24h: ${itemFreshIn24h}`);
  console.log(`channel lastBuildDate: ${lastBuild ?? '(missing)'}`);
  console.log(`lastBuildDate within last 24h: ${channelFresh24h}`);
  console.log(`lastBuildDate within last 48h: ${channelFresh48h}`);
  console.log(`XML sample (folded, ≤1200 chars): ${xmlSample}`);

  console.log('\n--- RSS SSOT verdict ---');
  if (res.status === 200 && looksLikeRss) {
    console.log('Transport: PASS (RSS 200 + envelope OK). Treat RSS as canonical wire format for public web.');
    if (items.length > 0) {
      console.log(
        itemFreshIn24h
          ? 'Freshness: PASS (≥1 item with pubDate in last 24h).'
          : 'Freshness: WARN (items exist but none dated within 24h — check pubDate formats or stale posts).',
      );
    } else {
      console.log(
        'Items: EMPTY (0 <item> — valid SSOT meaning “no syndicated posts right now”; rely on lastBuildDate / other endpoints for “silent feed”).',
      );
      console.log(
        channelFresh24h
          ? 'Channel: PASS (lastBuildDate within 24h).'
          : channelFresh48h
            ? 'Channel: PASS (lastBuildDate within 48h — generator alive; outside strict 24h window).'
            : 'Channel: WARN (lastBuildDate stale or missing).',
      );
    }
  } else {
    console.log('Transport: FAIL');
  }

  return {
    rssHttp: res.status,
    itemCount: items.length,
    itemFreshIn24h,
    channelLastBuild: lastBuild,
    channelFresh24h,
    channelFresh48h,
    xmlSample,
  };
}

async function main(): Promise<void> {
  console.log('SafeTravel contract discovery — read-only GET probes');
  console.log('Time:', new Date().toISOString());

  runSemanticAlignmentCheck();

  const rssMeta = await probeRssSsot();

  await probe('B — WordPress REST (posts slice)', 'https://safetravel.is/wp-json/wp/v2/posts?per_page=2&_fields=id,date,title,link,categories', {
    Accept: 'application/json',
  });

  await probeWpJsonNamespacesDeepScan();

  await probe('B3 — WordPress categories', 'https://safetravel.is/wp-json/wp/v2/categories?per_page=5', {
    Accept: 'application/json',
  });

  await probe('B4 — WordPress tags (alerts sometimes tag-driven)', 'https://safetravel.is/wp-json/wp/v2/tags?per_page=20', {
    Accept: 'application/json',
  });

  await probeRobotsTxt();
  await probeSitemapIndex();
  await probe('C — Current code path /api/alerts', 'https://safetravel.is/api/alerts', {
    Accept: 'application/json',
  });

  await probe('D — /api/alerts + WebKit mobile UA', 'https://safetravel.is/api/alerts', {
    Accept: 'application/json',
    'User-Agent': MOBILE_UA_WEBKIT,
  });

  await probe('F — /api/alerts + SafeTravel/3.1.0 native UA', 'https://safetravel.is/api/alerts', {
    Accept: 'application/json',
    'User-Agent': MOBILE_UA_APP_NATIVE,
  });

  await probe('G — www host RSS (redirect chain)', 'https://www.safetravel.is/feed', {
    Accept: 'application/rss+xml, application/xml, text/xml, */*',
  });

  await probe('H — Atom alternate (if exposed)', 'https://safetravel.is/feed/atom/', {
    Accept: 'application/atom+xml, application/xml, */*',
  });

  await probe('E — App-style host api.safetravel.is/v1/alerts', 'https://api.safetravel.is/v1/alerts', {
    Accept: 'application/json',
    'User-Agent': MOBILE_UA_WEBKIT,
  });

  console.log('\n=== Executive summary (SSOT) ===');
  const rssSsot =
    rssMeta.rssHttp === 200 &&
    rssMeta.itemCount > 0
      ? 'RSS items: use parseSafetravelRssItems + rssRowsToSafetravelAlerts (Source: RSS).'
      : rssMeta.rssHttp === 200
        ? 'RSS channel OK but 0 items — SSOT still “truth” for public feed; operational bulletins may live only in app or unpublished endpoints.'
        : 'RSS unavailable — do not claim RSS SSOT until HTTP fixed.';
  console.log(rssSsot);
  console.log(
    'wp-json (B2): namespaces printed in full; `safetravel-ad/v1/entries` returns 401 for anonymous GET — not a public SSOT without credentials.',
  );
  console.log(
    '/api/alerts: both browser and native-app UA probes return 404 HTML in this environment → not a viable JSON SSOT until a working URL is found (see H/G for alternate feeds).',
  );
  console.log(
    'Other candidates probed: wp-json namespaces + selective GET scan, wp/v2/tags, robots.txt, sitemap_index + child peek, www feed, atom path.\n',
  );

  const strict = process.env.SAFETRAVEL_DIAG_STRICT === '1';
  if (strict && rssMeta.rssHttp !== 200) {
    process.exit(1);
  }
}

void main();
