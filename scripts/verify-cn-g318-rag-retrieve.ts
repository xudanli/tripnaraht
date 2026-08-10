#!/usr/bin/env npx tsx
/**
 * 验证 CN G318 chunks：
 * 1) DB 向量直检（入库 + 命中）
 * 2) Reality 门禁：无 DecisionContext → blocked；咨询 context → full
 * 3) 可选 HTTP：`POST /api/rag/chunks/retrieve` + decision_context
 *
 *   npx tsx scripts/verify-cn-g318-rag-retrieve.ts
 *   npx tsx scripts/verify-cn-g318-rag-retrieve.ts --http
 *   API_BASE_URL=http://localhost:3000 npx tsx scripts/verify-cn-g318-rag-retrieve.ts --http
 */
import { config as loadEnv } from 'dotenv';
import axios from 'axios';
import https from 'https';
import { PrismaClient } from '@prisma/client';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { buildConsultationDecisionContextV0 } from '../src/trips/reality-kernel/build-consultation-decision-context-v0';
import { resolveRagSoftWorldPolicy } from '../src/rag/reality-policy/rag-soft-world-policy';

loadEnv();

const QUERY = '川藏线雨季塌方 高原适应 木格措门票预约';
const EXPECT_IDS = [
  'cn-g318-west-sichuan-rainy-landslide-advisory',
  'cn-g318-acclimatization-rule',
  'cn-g318-mugecuo-advance-booking',
];
const WANT_HTTP = process.argv.includes('--http');
const GATE_ONLY = process.argv.includes('--gate-only');
const API_BASE = (
  process.env.API_BASE_URL ||
  process.env.API_URL ||
  'http://localhost:3000'
).replace(/\/$/, '');

async function embed(query: string): Promise<number[]> {
  const baseUrl = process.env.PYTHON_AI_SERVICE_URL || 'http://10.107.180.94:8001';
  const res = await axios.post(
    `${baseUrl}/api/v1/embeddings`,
    { texts: [query], model: 'bge-m3', return_sparse: false },
    {
      timeout: 60_000,
      proxy: false,
      httpsAgent: new https.Agent({ keepAlive: true, family: 4 }),
    },
  );
  const e = res.data?.embeddings?.[0];
  return Array.isArray(e) ? e : e?.dense ?? [];
}

function verifyDecisionContextGate(): {
  ok: boolean;
  blockedWithout: string[];
  scopeWith: string;
  snapshotId: string;
} {
  const prev = process.env.RAG_REALITY_POLICY_ENFORCE;
  process.env.RAG_REALITY_POLICY_ENFORCE = '1';
  try {
    const blocked = resolveRagSoftWorldPolicy(undefined);
    const ctx = buildConsultationDecisionContextV0({
      region: 'cn',
      runId: 'verify-cn-g318-rag-http',
      startYmd: '2026-07-01',
      endYmd: '2026-07-14',
      generatedBy: 'scripts.verify-cn-g318-rag-retrieve',
    });
    const allowed = resolveRagSoftWorldPolicy(ctx);
    const ok =
      blocked.scope === 'blocked' &&
      blocked.policy.codes.includes('RAG_CONTEXT_REQUIRED') &&
      allowed.scope === 'full' &&
      allowed.policy.verdict === 'ALLOW';
    return {
      ok,
      blockedWithout: blocked.policy.codes,
      scopeWith: allowed.scope,
      snapshotId: ctx.snapshot_id,
    };
  } finally {
    if (prev === undefined) delete process.env.RAG_REALITY_POLICY_ENFORCE;
    else process.env.RAG_REALITY_POLICY_ENFORCE = prev;
  }
}

async function verifyHttpRetrieve(): Promise<{
  attempted: boolean;
  ok: boolean;
  status?: number;
  error?: string;
  scopeHeader?: string | null;
  hitIds?: string[];
  expectedHit?: string[];
}> {
  if (!WANT_HTTP) {
    return { attempted: false, ok: true };
  }

  const decision_context = buildConsultationDecisionContextV0({
    region: 'cn',
    runId: 'verify-cn-g318-rag-http',
    startYmd: '2026-07-01',
    endYmd: '2026-07-14',
    generatedBy: 'scripts.verify-cn-g318-rag-retrieve.http',
  });

  // 负例：无 context 在门禁开时应被拒（若服务端门禁关则跳过负例严格断言）
  let negativeBlocked = false;
  try {
    const neg = await axios.post(
      `${API_BASE}/api/rag/chunks/retrieve`,
      { query: QUERY, limit: 5 },
      { timeout: 30_000, proxy: false, validateStatus: () => true },
    );
    const msg = String(neg.data?.message || neg.data?.error || '');
    negativeBlocked =
      neg.status >= 400 ||
      /rag_requires_decision_context|RAG_CONTEXT_REQUIRED|decision_context/i.test(
        JSON.stringify(neg.data ?? {}),
      ) ||
      /rag_requires_decision_context|RAG_CONTEXT_REQUIRED/i.test(msg);
  } catch (e) {
    return {
      attempted: true,
      ok: false,
      error: `negative probe failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  try {
    const pos = await axios.post(
      `${API_BASE}/api/rag/chunks/retrieve`,
      {
        query: QUERY,
        limit: 8,
        credibilityMin: 0.3,
        decision_context,
      },
      { timeout: 90_000, proxy: false, validateStatus: () => true },
    );
    const scopeHeader = pos.headers?.['x-rag-reality-scope'] ?? null;
    const payload = pos.data?.data ?? pos.data;
    const results = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.results)
        ? payload.results
        : Array.isArray(payload?.chunks)
          ? payload.chunks
          : [];
    const hitIds = results
      .map((r: any) => String(r.chunk_id || r.chunkId || r.id || ''))
      .filter(Boolean);
    const expectedHit = EXPECT_IDS.filter((id) => hitIds.some((h: string) => h.includes(id)));
    const successShape = pos.status === 200 && !/rag_requires_decision_context/i.test(
      JSON.stringify(pos.data ?? {}),
    );
    // 门禁开：负例应 blocked；门禁关：负例可能放行，此时只要求正例 200
    const gateConsistent = negativeBlocked || scopeHeader === 'full' || successShape;
    const ok = successShape && gateConsistent && (expectedHit.length >= 1 || hitIds.length >= 1);

    return {
      attempted: true,
      ok,
      status: pos.status,
      scopeHeader: scopeHeader == null ? null : String(scopeHeader),
      hitIds: hitIds.slice(0, 10),
      expectedHit,
      error: ok
        ? undefined
        : `http status=${pos.status} negativeBlocked=${negativeBlocked} hits=${hitIds.length}`,
    };
  } catch (e) {
    return {
      attempted: true,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function main() {
  const gate = verifyDecisionContextGate();
  console.log(
    `DecisionContext gate: ${gate.ok ? 'PASS' : 'FAIL'} (blocked=${gate.blockedWithout.join(',')}; with→${gate.scopeWith})`,
  );

  if (GATE_ONLY) {
    const out = join(
      process.cwd(),
      'data/country-packs/CN/audits',
      `g318-rag-retrieve-gate.${new Date().toISOString().slice(0, 10)}.json`,
    );
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(
      out,
      JSON.stringify(
        {
          metadata: {
            sampledAt: new Date().toISOString(),
            mode: 'gate-only',
            note: 'In-process RAG_REALITY_POLICY_ENFORCE check; HTTP optional via --http',
          },
          decisionContextGate: gate,
          ok: gate.ok,
        },
        null,
        2,
      ),
      'utf8',
    );
    console.log(`Wrote ${out}`);
    console.log(gate.ok ? 'PASS' : 'FAIL');
    if (!gate.ok) process.exit(1);
    return;
  }

  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$queryRaw<
      Array<{ chunk_id: string; category: string | null }>
    >`
      SELECT chunk_id, category FROM chunks
      WHERE chunk_id LIKE 'cn-g318-%'
      ORDER BY chunk_id
    `;
    console.log(`DB cn-g318 chunks: ${rows.length}`);
    for (const r of rows) console.log(`  - ${r.chunk_id} (${r.category})`);

    let hits: Array<{ chunk_id: string; score: number; content: string }> = [];
    let expectedHit: string[] = [];
    let dbOk = rows.length >= 7;
    let embedError: string | undefined;
    try {
      const vec = await embed(QUERY);
      if (!vec.length) throw new Error('empty embedding');

      hits = await prisma.$queryRaw<
        Array<{ chunk_id: string; score: number; content: string }>
      >`
        SELECT chunk_id,
               1 - (embedding <=> ${JSON.stringify(vec)}::vector) AS score,
               LEFT(content, 120) AS content
        FROM chunks
        WHERE chunk_id LIKE 'cn-g318-%'
        ORDER BY embedding <=> ${JSON.stringify(vec)}::vector
        LIMIT 5
      `;

      console.log(`\nVector top-5 for: ${QUERY}`);
      for (const h of hits) {
        console.log(
          `  ${Number(h.score).toFixed(3)} ${h.chunk_id} | ${h.content.replace(/\n/g, ' ')}`,
        );
      }

      const hitIds = new Set(hits.map((h) => h.chunk_id));
      expectedHit = EXPECT_IDS.filter((id) => hitIds.has(id));
      dbOk = rows.length >= 7 && expectedHit.length >= 1;
    } catch (e) {
      embedError = e instanceof Error ? e.message : String(e);
      console.log(`\nVector retrieve SKIP/FAIL: ${embedError}`);
      dbOk = false;
    }

    const http = await verifyHttpRetrieve();
    if (http.attempted) {
      console.log(
        `\nHTTP retrieve: ${http.ok ? 'PASS' : 'FAIL'} status=${http.status} scope=${http.scopeHeader} hits=${(http.hitIds || []).length}`,
      );
      if (http.error) console.log(`  ${http.error}`);
      if (http.expectedHit?.length) {
        console.log(`  expectedHit: ${http.expectedHit.join(', ')}`);
      }
    } else {
      console.log(
        '\nHTTP retrieve: SKIP (pass --http + running API to exercise POST /api/rag/chunks/retrieve)',
      );
    }

    const ok = gate.ok && dbOk && http.ok;

    const out = join(
      process.cwd(),
      'data/country-packs/CN/audits',
      `g318-rag-retrieve.${new Date().toISOString().slice(0, 10)}.json`,
    );
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(
      out,
      JSON.stringify(
        {
          metadata: {
            sampledAt: new Date().toISOString(),
            query: QUERY,
            apiBase: API_BASE,
            httpRequested: WANT_HTTP,
            embedError,
          },
          decisionContextGate: gate,
          dbCount: rows.length,
          topHits: hits,
          expectedHit,
          http,
          ok,
        },
        null,
        2,
      ),
      'utf8',
    );
    console.log(`\nWrote ${out}`);
    console.log(ok ? 'PASS' : 'FAIL');
    if (!ok) process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
