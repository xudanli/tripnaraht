#!/usr/bin/env npx tsx
/**
 * 为中国已有 Place 生成 LLM 中文描述（可选补 nameEN）。
 * 优先 DeepSeek；写入 Place.description / nameEN / metadata.llmDescription。
 *
 *   npx tsx scripts/enrich-china-places-llm-description.ts --report
 *   npx tsx scripts/enrich-china-places-llm-description.ts --classic-seed --limit=40
 *   npx tsx scripts/enrich-china-places-llm-description.ts --needs-llm --limit=50
 *   npx tsx scripts/enrich-china-places-llm-description.ts --needs-llm --level=5A --limit=40
 *   npx tsx scripts/enrich-china-places-llm-description.ts --needs-llm --level=4A,5A --limit=80
 *   npx tsx scripts/enrich-china-places-llm-description.ts --classic-seed --dry-run
 *
 * 需要 DEEPSEEK_API_KEY（.env）
 */
import { config as loadEnv } from 'dotenv';
import axios from 'axios';
import https from 'https';
import dns from 'node:dns';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient, Prisma } from '@prisma/client';

loadEnv();
dns.setDefaultResultOrder('ipv4first');

const prisma = new PrismaClient();
const DRY = process.argv.includes('--dry-run');
const REPORT = process.argv.includes('--report');
const CLASSIC = process.argv.includes('--classic-seed');
const NEEDS = process.argv.includes('--needs-llm');
const FORCE = process.argv.includes('--force');
const LIMIT = Number(
  process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? 40,
);
/** 例：--level=5A 或 --level=4A,5A；空则不限等级 */
const LEVEL_RAW = (
  process.argv.find((a) => a.startsWith('--level='))?.split('=')[1] ?? ''
)
  .split(',')
  .map((s) => s.trim().toUpperCase())
  .filter((s) => /^[0-9]A$/.test(s));
const DELAY_MS = Number(process.env.CN_LLM_DESC_DELAY_MS ?? 800);
const MODEL = process.env.DEEPSEEK_MODEL || process.env.CN_LLM_DESC_MODEL || 'deepseek-chat';

type PlaceRow = {
  id: number;
  nameCN: string;
  nameEN: string | null;
  address: string | null;
  description: string | null;
  category: string;
  rating: number | null;
  metadata: any;
  cityCN: string | null;
  lat: number | null;
  lng: number | null;
};

/** 高德拼装短描述 / 过短文本 → 需要 LLM 重写 */
function needsLlmDescription(desc: string | null | undefined): boolean {
  const d = (desc || '').trim();
  if (!d) return true;
  if (d.length < 40) return true;
  if (/类型：|标签：|开放：|门票：/.test(d) && d.length < 220) return true;
  if (d.includes('enrich-china-places-from-amap')) return true;
  return false;
}

async function report() {
  const rows = await prisma.$queryRaw<
    Array<{
      attractions: number;
      no_desc: number;
      stub_or_short: number;
      has_llm_meta: number;
      classic_need: number;
    }>
  >`
    SELECT
      COUNT(*) FILTER (WHERE p.category = 'ATTRACTION')::int AS attractions,
      COUNT(*) FILTER (
        WHERE p.category = 'ATTRACTION'
          AND (p.description IS NULL OR btrim(p.description) = '')
      )::int AS no_desc,
      COUNT(*) FILTER (
        WHERE p.category = 'ATTRACTION'
          AND (
            p.description IS NULL
            OR length(btrim(p.description)) < 40
            OR (
              p.description ~ '类型：|标签：|开放：|门票：'
              AND length(btrim(p.description)) < 220
            )
          )
      )::int AS stub_or_short,
      COUNT(*) FILTER (
        WHERE p.metadata ? 'llmDescription'
      )::int AS has_llm_meta,
      COUNT(*) FILTER (
        WHERE p.data_source = 'classic-route-seed'
          AND p.category = 'ATTRACTION'
          AND (
            p.description IS NULL
            OR length(btrim(p.description)) < 40
            OR p.description ~ '类型：|标签：'
            OR NOT (p.metadata ? 'llmDescription')
          )
      )::int AS classic_need
    FROM "Place" p
    JOIN "City" c ON c.id = p."cityId"
    WHERE c."countryCode" = 'CN'
  `;
  console.log('\n=== CN LLM 描述缺口 ===');
  console.log(JSON.stringify(rows[0], null, 2));
  console.log('');
}

async function loadCandidates(): Promise<PlaceRow[]> {
  if (CLASSIC) {
    return prisma.$queryRaw<PlaceRow[]>`
      SELECT
        p.id, p."nameCN", p."nameEN", p.address, p.description, p.category::text AS category,
        p.rating, p.metadata, c."nameCN" AS "cityCN",
        ST_Y(p.location::geometry) AS lat, ST_X(p.location::geometry) AS lng
      FROM "Place" p
      JOIN "City" c ON c.id = p."cityId"
      WHERE c."countryCode" = 'CN'
        AND p.category = 'ATTRACTION'
        AND p.data_source = 'classic-route-seed'
        AND (
          ${FORCE}
          OR NOT (p.metadata ? 'llmDescription')
          OR p.description IS NULL
          OR length(btrim(COALESCE(p.description,''))) < 40
          OR p.description ~ '类型：|标签：|开放：|门票：'
        )
      ORDER BY p.id
      LIMIT ${LIMIT}
    `;
  }
  if (NEEDS) {
    const levelFilter =
      LEVEL_RAW.length > 0
        ? Prisma.sql`AND p.metadata->>'level' IN (${Prisma.join(LEVEL_RAW)})`
        : Prisma.sql``;
    return prisma.$queryRaw<PlaceRow[]>`
      SELECT
        p.id, p."nameCN", p."nameEN", p.address, p.description, p.category::text AS category,
        p.rating, p.metadata, c."nameCN" AS "cityCN",
        ST_Y(p.location::geometry) AS lat, ST_X(p.location::geometry) AS lng
      FROM "Place" p
      JOIN "City" c ON c.id = p."cityId"
      WHERE c."countryCode" = 'CN'
        AND p.category = 'ATTRACTION'
        AND (
          ${FORCE}
          OR NOT (p.metadata ? 'llmDescription')
        )
        AND (
          p.description IS NULL
          OR length(btrim(COALESCE(p.description,''))) < 40
          OR (
            p.description ~ '类型：|标签：|开放：|门票：'
            AND length(btrim(p.description)) < 220
          )
        )
        ${levelFilter}
      ORDER BY
        CASE WHEN p.data_source = 'classic-route-seed' THEN 0 ELSE 1 END,
        CASE WHEN p.metadata ? 'amapId' THEN 0 ELSE 1 END,
        CASE p.metadata->>'level'
          WHEN '5A' THEN 0
          WHEN '4A' THEN 1
          ELSE 2
        END,
        p.rating DESC NULLS LAST,
        p.id
      LIMIT ${LIMIT}
    `;
  }
  throw new Error('请指定 --classic-seed 或 --needs-llm（或仅 --report）');
}

function createClient() {
  const apiKey = (process.env.DEEPSEEK_API_KEY || '').replace(/^["']|["']$/g, '').trim();
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY 未配置');
  const baseURL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';
  return axios.create({
    baseURL,
    timeout: 60_000,
    proxy: false,
    httpsAgent: new https.Agent({ keepAlive: true, family: 4 }),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });
}

type LlmOut = {
  descriptionCN: string;
  nameEN?: string;
  tags?: string[];
  visitTipCN?: string;
  /** 建议停留分钟（30–480），供行程排程 */
  suggestedDurationMin?: number;
};

function extractJson(text: string): LlmOut | null {
  const raw = text.trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1].trim() : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1)) as LlmOut;
  } catch {
    return null;
  }
}

async function generateDesc(client: ReturnType<typeof createClient>, place: PlaceRow): Promise<LlmOut> {
  const meta = place.metadata || {};
  const basic = meta.basic || {};
  const facts = {
    nameCN: place.nameCN,
    nameEN: place.nameEN,
    cityCN: place.cityCN,
    address: place.address || meta.address || basic.address,
    amapName: meta.amapName,
    amapType: basic.type || meta.type,
    highlights: meta.highlights,
    openingHours: basic.openingHours || meta.openingHours,
    ticketPrice: basic.ticketPrice || meta.ticketPrice,
    level: meta.level,
    altitudeMeters: meta.altitudeMeters ?? meta.elevationMeters,
    lat: place.lat,
    lng: place.lng,
    rating: place.rating,
  };

  const system = `你是中国自驾/旅行产品的 POI 文案编辑。根据给定事实写简洁中文景点介绍，供行程规划系统使用。
要求：
1. 只输出 JSON：{"descriptionCN":"...","nameEN":"...","tags":[".."],"visitTipCN":"...","suggestedDurationMin":90}
2. descriptionCN：80–160 字，说明是什么、为何值得去、适合什么节奏；勿编造精确票价/开放时间数字（可用「建议出行前核实」）。
3. nameEN：若原无英文名则补常用英文/拼音译名；已有可原样或微调。
4. tags：3–6 个短标签（中文）。
5. visitTipCN：一句实用提示（预约/海拔/季节/驾驶节奏等，有则写）。
6. suggestedDurationMin：建议停留分钟（整数 30–480）；观景台偏短、博物馆/风景区偏长，勿一律 120。
7. 不要虚构不存在的世界遗产/5A 等级；事实里没有的等级不要写。`;

  const user = `请为以下中国 POI 生成文案：\n${JSON.stringify(facts, null, 2)}`;

  const { data } = await client.post('/chat/completions', {
    model: MODEL,
    temperature: 0.4,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });

  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    throw new Error('empty_llm_content');
  }
  const parsed = extractJson(content);
  if (!parsed?.descriptionCN?.trim()) {
    throw new Error('invalid_llm_json');
  }
  return parsed;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  if (REPORT || (!CLASSIC && !NEEDS)) {
    await report();
    if (!CLASSIC && !NEEDS) return;
  }

  const client = createClient();
  const candidates = await loadCandidates();
  console.log(
    `LLM-describing ${candidates.length} CN places` +
      `${CLASSIC ? ' (classic-seed)' : ''}${NEEDS ? ' (needs-llm)' : ''}` +
      `${LEVEL_RAW.length ? ` level=${LEVEL_RAW.join(',')}` : ''}` +
      `${DRY ? ' [dry-run]' : ''} model=${MODEL}\n`,
  );

  const results: Record<string, unknown>[] = [];
  let ok = 0;
  let fail = 0;
  let skipped = 0;

  for (const place of candidates) {
    if (!FORCE && !needsLlmDescription(place.description) && place.metadata?.llmDescription) {
      skipped++;
      console.log(`→ #${place.id} ${place.nameCN} ... skip`);
      continue;
    }
    process.stdout.write(`→ #${place.id} ${place.nameCN} ... `);
    try {
      const out = await generateDesc(client, place);
      const desc = out.descriptionCN.trim();
      const nameEN =
        (out.nameEN || '').trim() ||
        place.nameEN ||
        undefined;
      const tip = (out.visitTipCN || '').trim();
      const tags = Array.isArray(out.tags) ? out.tags.filter(Boolean).slice(0, 8) : [];
      const durationMin = Number(out.suggestedDurationMin);
      const suggestedDurationMin =
        Number.isFinite(durationMin) && durationMin >= 30 && durationMin <= 480
          ? Math.round(durationMin)
          : undefined;

      const meta = { ...(place.metadata || {}) };
      meta.llmDescription = {
        model: MODEL,
        generatedAt: new Date().toISOString(),
        visitTipCN: tip || undefined,
        tags,
        ...(suggestedDurationMin != null ? { suggestedDurationMin } : {}),
      };
      if (tags.length) {
        meta.highlights = Array.from(
          new Set([...(Array.isArray(meta.highlights) ? meta.highlights : []), ...tags]),
        ).slice(0, 12);
      }
      if (tip) {
        meta.visitTipCN = tip;
      }
      if (suggestedDurationMin != null) {
        meta.estimated_duration_min = suggestedDurationMin;
        meta.duration_minutes = suggestedDurationMin;
      }

      if (!DRY) {
        await prisma.place.update({
          where: { id: place.id },
          data: {
            description: tip ? `${desc}\n${tip}` : desc,
            ...(nameEN && !place.nameEN ? { nameEN } : {}),
            metadata: meta as Prisma.InputJsonValue,
            dataFreshness: 'llm-described',
            updatedAt: new Date(),
          },
        });
      }

      ok++;
      console.log(`OK ${desc.slice(0, 36)}…`);
      results.push({
        id: place.id,
        nameCN: place.nameCN,
        ok: true,
        chars: desc.length,
        nameEN: nameEN || null,
      });
    } catch (e) {
      fail++;
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`ERR ${msg}`);
      results.push({ id: place.id, nameCN: place.nameCN, ok: false, error: msg });
      if (/401|402|429|quota|rate/i.test(msg)) {
        console.warn('疑似配额/鉴权问题，停止本批');
        break;
      }
    }
    await sleep(DELAY_MS);
  }

  const summary = {
    mode: CLASSIC ? 'classic-seed' : 'needs-llm',
    dryRun: DRY,
    model: MODEL,
    candidates: candidates.length,
    ok,
    fail,
    skipped,
    sampledAt: new Date().toISOString(),
  };

  const outDir = join(process.cwd(), 'data/country-packs/CN/audits');
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outPath = join(outDir, `china-place-llm-desc.${stamp}.json`);
  writeFileSync(outPath, JSON.stringify({ metadata: summary, results }, null, 2));
  console.log(`\nWrote ${outPath}`);
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
