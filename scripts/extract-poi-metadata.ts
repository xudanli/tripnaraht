/**
 * Extract structured metadata from long POI chunks (POI_HOURS / GEOGRAPHY).
 *
 * Goal:
 * - Traverse `chunks` where category in POI_HOURS/GEOGRAPHY
 * - Use LLM to extract structured signals (seasonality / F-road constraints / cost info)
 * - Backfill `chunks.metadata.structured_data` (JSONB) in-place
 *
 * Usage:
 *   npx tsx scripts/extract-poi-metadata.ts --dry-run --limit=50
 *   npx tsx scripts/extract-poi-metadata.ts --apply --limit=200
 *   npx tsx scripts/extract-poi-metadata.ts --dry-run --all --limit=200
 *   npx tsx scripts/extract-poi-metadata.ts --dry-run --chunk-id=kb_xxx
 *   npx tsx scripts/extract-poi-metadata.ts --dry-run --file-id=00000000-0000-4000-8000-000000000001
 *   npx tsx scripts/extract-poi-metadata.ts --dry-run --min-tokens=1500 --limit=50
 *   npx tsx scripts/extract-poi-metadata.ts --dry-run --two-stage --min-tokens=1500 --limit=50
 *
 * Env:
 * - DATABASE_URL (Prisma)
 * - OPENAI_API_KEY (required unless --dry-run with --no-llm)
 * - OPENAI_BASE_URL (optional)
 * - OPENAI_MODEL (optional, default gpt-4o-mini)
 * - OPENAI_MODEL_SNIPPETS (optional, stage1 model, default gpt-4o-mini)
 * - OPENAI_MODEL_EXTRACT (optional, stage2 model, default gpt-4o-mini)
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';
import axios from 'axios';
import https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

type ExtractedStructuredData = {
  opening_seasonal?: {
    /** e.g. "late June to early September" */
    summary?: string;
    /** known or inferred month range (1-12) */
    open_month_from?: number;
    open_month_to?: number;
    /** free-text exceptions */
    exceptions?: string[];
  };
  f_road_required?: {
    required?: boolean;
    roads?: string[];
    notes?: string;
  };
  cost_info?: {
    summary?: string;
    currency?: string;
    amounts?: Array<{ amount: number; unit?: string; note?: string }>;
  };
  source_snippets?: string[];
};

function parseArgs(argv: string[]) {
  const args = new Map<string, string | boolean>();
  for (const raw of argv.slice(2)) {
    if (raw === '--apply') args.set('apply', true);
    else if (raw === '--dry-run') args.set('dryRun', true);
    else if (raw === '--no-llm') args.set('noLlm', true);
    else if (raw === '--all') args.set('all', true);
    else if (raw === '--two-stage') args.set('twoStage', true);
    else if (raw.startsWith('--limit=')) args.set('limit', raw.split('=')[1]);
    else if (raw.startsWith('--batch-size=')) args.set('batchSize', raw.split('=')[1]);
    else if (raw.startsWith('--chunk-id=')) args.set('chunkId', raw.split('=')[1]);
    else if (raw.startsWith('--file-id=')) args.set('fileId', raw.split('=')[1]);
    else if (raw.startsWith('--min-tokens=')) args.set('minTokens', raw.split('=')[1]);
    else if (raw === '--only-missing') args.set('onlyMissing', true);
    else if (raw.startsWith('--report=')) args.set('report', raw.split('=')[1]);
  }
  const apply = Boolean(args.get('apply'));
  const dryRun = Boolean(args.get('dryRun')) || !apply;
  const all = Boolean(args.get('all'));
  const onlyMissing = all ? false : Boolean(args.get('onlyMissing')) || true;
  return {
    apply,
    dryRun,
    noLlm: Boolean(args.get('noLlm')),
    twoStage: Boolean(args.get('twoStage')),
    limit: parseInt(String(args.get('limit') ?? '200'), 10),
    batchSize: parseInt(String(args.get('batchSize') ?? '10'), 10),
    onlyMissing,
    chunkId: (args.get('chunkId') as string | undefined) ?? undefined,
    fileId: (args.get('fileId') as string | undefined) ?? undefined,
    minTokens: parseInt(String(args.get('minTokens') ?? '0'), 10),
    reportPath: String(args.get('report') ?? 'artifacts/poi-metadata-extraction.report.json'),
  };
}

function getOpenAiConfig() {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }
  return { apiKey, baseUrl, model };
}

function buildPrompt(category: string, content: string): string {
  const trimmed = content.length > 6000 ? content.slice(0, 6000) : content;
  return [
    '你是旅行领域的结构化信息抽取器。请从给定文本中提取 POI/地理条目中的关键约束信号。',
    '',
    '抽取目标字段（全部可选；未知则省略或填 null）：',
    '- opening_seasonal: 季节性开放信息（月份范围、摘要、例外）',
    '- f_road_required: 是否涉及 F 路、是否要求 4x4、涉及的道路编号（如 F206 / 35 / 1 等）',
    '- cost_info: 费用信息（金额、币种、计价单位、摘要）',
    '- source_snippets: 2-5 条最能支撑结论的原文短句（<=120 字/条）',
    '',
    `chunk_category=${category}`,
    '',
    '原文：',
    '---',
    trimmed,
    '---',
    '',
    '请只输出严格 JSON（不要 markdown 代码块，不要解释）。',
  ].join('\n');
}

function buildSnippetsPrompt(category: string, content: string): string {
  const trimmed = content.length > 8000 ? content.slice(0, 8000) : content;
  return [
    '你是旅行领域的信息定位器。请从给定文本中找出最能支持约束结论的原文短句。',
    '',
    '要求：',
    '- 返回 2-6 条 source_snippets',
    '- 每条 <= 120 字，尽量包含数字、道路编号（如 F206）、日期/月份、是否开放/封闭、费用金额等关键事实',
    '- 只输出严格 JSON（不要 markdown，不要解释）',
    '',
    `chunk_category=${category}`,
    '',
    '原文：',
    '---',
    trimmed,
    '---',
  ].join('\n');
}

function buildExtractFromSnippetsPrompt(category: string, snippets: string[]): string {
  const lines = snippets
    .filter((s) => typeof s === 'string' && s.trim().length > 0)
    .slice(0, 8)
    .map((s, i) => `${i + 1}. ${s.trim()}`);
  return [
    '你是旅行领域的结构化信息抽取器。请仅基于提供的原文短句抽取结构化约束信号。',
    '',
    '抽取目标字段（全部可选；未知则省略或填 null）：',
    '- opening_seasonal: 季节性开放信息（月份范围、摘要、例外）',
    '- f_road_required: 是否涉及 F 路、是否要求 4x4、涉及的道路编号（如 F206 / 35 / 1 等）',
    '- cost_info: 费用信息（金额、币种、计价单位、摘要）',
    '- source_snippets: 回填你用到的短句（可原样返回）',
    '',
    `chunk_category=${category}`,
    '',
    '原文短句：',
    ...lines,
    '',
    '请只输出严格 JSON（不要 markdown 代码块，不要解释）。',
  ].join('\n');
}

async function callOpenAiJsonObject<T>(prompt: string, options?: { model?: string; maxTokens?: number }): Promise<T> {
  const { apiKey, baseUrl, model: defaultModel } = getOpenAiConfig();
  const model = options?.model || defaultModel;
  const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.ALL_PROXY;
  const httpsAgent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : new https.Agent({ keepAlive: true, family: 4 });

  const resp = await axios.post(
    `${baseUrl.replace(/\/$/, '')}/chat/completions`,
    {
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: options?.maxTokens ?? 600,
      response_format: { type: 'json_object' },
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      httpsAgent,
      timeout: 60_000,
    },
  );

  const content = resp.data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    throw new Error('OpenAI API returned empty content');
  }
  return JSON.parse(content) as T;
}

async function callOpenAiExtract(prompt: string): Promise<ExtractedStructuredData> {
  return callOpenAiJsonObject<ExtractedStructuredData>(prompt, { maxTokens: 600 });
}

async function callOpenAiSnippets(prompt: string, modelOverride?: string): Promise<{ source_snippets?: string[] }> {
  return callOpenAiJsonObject<{ source_snippets?: string[] }>(prompt, { model: modelOverride, maxTokens: 300 });
}

async function main() {
  const { apply, dryRun, noLlm, twoStage, limit, batchSize, onlyMissing, chunkId, fileId, minTokens, reportPath } =
    parseArgs(process.argv);

  console.log(
    `[extract-poi-metadata] mode=${apply ? 'APPLY' : 'DRY_RUN'} llm=${noLlm ? 'OFF' : 'ON'} twoStage=${twoStage} onlyMissing=${onlyMissing} limit=${limit} batchSize=${batchSize} minTokens=${minTokens} chunkId=${chunkId ?? '-'} fileId=${fileId ?? '-'}`,
  );

  const categories = ['POI_HOURS', 'GEOGRAPHY'] as const;
  const rows = await prisma.chunk.findMany({
    where: {
      category: { in: [...categories] },
      ...(chunkId ? { chunkId } : {}),
      ...(fileId ? { fileId } : {}),
      ...(minTokens > 0 ? { tokenCount: { gte: minTokens } } : {}),
    },
    select: {
      id: true,
      chunkId: true,
      category: true,
      content: true,
      metadata: true,
      tokenCount: true,
      fileId: true,
      updatedAt: true,
    },
    take: limit,
    orderBy: { updatedAt: 'desc' },
  });

  const target = rows.filter((r) => {
    if (!onlyMissing) return true;
    const m: any = r.metadata ?? {};
    return m?.structured_data == null;
  });

  console.log(`[extract-poi-metadata] fetched=${rows.length} target=${target.length}`);

  const report: any[] = [];

  for (let i = 0; i < target.length; i += batchSize) {
    const batch = target.slice(i, i + batchSize);
    for (const r of batch) {
      try {
        let structured: ExtractedStructuredData;
        if (noLlm) {
          structured = {} as ExtractedStructuredData;
        } else if (!twoStage) {
          const prompt = buildPrompt(String(r.category ?? 'UNKNOWN'), r.content);
          structured = await callOpenAiExtract(prompt);
        } else {
          const stage1Model = process.env.OPENAI_MODEL_SNIPPETS || process.env.OPENAI_MODEL || 'gpt-4o-mini';
          const stage2Model = process.env.OPENAI_MODEL_EXTRACT || process.env.OPENAI_MODEL || 'gpt-4o-mini';
          const snippetsPrompt = buildSnippetsPrompt(String(r.category ?? 'UNKNOWN'), r.content);
          const snippetsResp = await callOpenAiSnippets(snippetsPrompt, stage1Model);
          const snippets = Array.isArray(snippetsResp?.source_snippets) ? snippetsResp.source_snippets : [];
          const extractPrompt = buildExtractFromSnippetsPrompt(String(r.category ?? 'UNKNOWN'), snippets);
          structured = await callOpenAiJsonObject<ExtractedStructuredData>(extractPrompt, {
            model: stage2Model,
            maxTokens: 600,
          });
          // Ensure we keep the snippets we used for traceability.
          structured.source_snippets = structured.source_snippets?.length ? structured.source_snippets : snippets;
        }
        report.push({
          id: r.id,
          chunkId: r.chunkId,
          category: r.category,
          fileId: r.fileId,
          tokenCount: r.tokenCount,
          structured_data: structured,
        });

        if (apply && !noLlm) {
          const prev: any = r.metadata ?? {};
          const next = {
            ...prev,
            structured_data: {
              ...structured,
              _extractedAt: new Date().toISOString(),
              _extractor: 'scripts/extract-poi-metadata.ts',
            },
          };
          await prisma.chunk.update({
            where: { id: r.id },
            data: { metadata: next },
          });
        }
        process.stdout.write('.');
      } catch (e: any) {
        report.push({
          id: r.id,
          chunkId: r.chunkId,
          category: r.category,
          fileId: r.fileId,
          tokenCount: r.tokenCount,
          error: e?.message ?? String(e),
        });
        process.stdout.write('E');
      }
    }
    process.stdout.write('\n');
  }

  const outPath = path.resolve(__dirname, `../${reportPath.replace(/^\/*/, '')}`);
  await import('fs/promises').then((fs) =>
    fs.writeFile(outPath, JSON.stringify({ apply, dryRun, noLlm, onlyMissing, report }, null, 2)),
  );
  console.log(`[extract-poi-metadata] wrote report: ${outPath}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

