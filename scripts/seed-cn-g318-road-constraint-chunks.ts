#!/usr/bin/env npx ts-node
/**
 * Upsert P0 CN G318 road-constraint chunks into `chunks`（需 DB + embedding）。
 *
 *   npm run validate:country-road-constraint-seeds
 *   npm run seed:cn-g318-road-constraint-chunks              # dry-run
 *   SEED_CN_G318_ROAD_CONSTRAINT_WRITE=1 npm run seed:cn-g318-road-constraint-chunks
 */
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import https from 'https';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';

loadEnv();

const SEED_PATH = path.join(__dirname, '../data/rag/cn-g318-road-constraint-chunks.p0.json');
const FILE_NAME = 'cn-g318-road-constraint-p0.json';

class BgeEmbeddingService {
  private httpClient: ReturnType<typeof axios.create>;

  constructor() {
    const baseUrl = process.env.PYTHON_AI_SERVICE_URL || 'http://10.107.180.94:8001';
    this.httpClient = axios.create({
      baseURL: baseUrl,
      timeout: 90_000,
      proxy: false,
      httpsAgent: new https.Agent({ keepAlive: true, family: 4 }),
    });
  }

  async embed(texts: string[]): Promise<number[][]> {
    const res = await this.httpClient.post('/api/v1/embeddings', {
      texts,
      model: 'bge-m3',
      return_sparse: false,
    });
    const embeddings = res.data?.embeddings as Array<{ dense?: number[] } | number[]>;
    return embeddings.map((e) => (Array.isArray(e) ? e : (e.dense ?? [])));
  }
}

async function main(): Promise<void> {
  const write = process.env.SEED_CN_G318_ROAD_CONSTRAINT_WRITE === '1';
  const doc = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8')) as {
    chunks: Array<{
      chunk_id: string;
      type: string;
      category: string;
      content: string;
      credibility_score: number;
      keywords: string[];
      metadata: Record<string, unknown>;
    }>;
  };

  if (!write) {
    console.log(`DRY-RUN: would upsert ${doc.chunks.length} chunks from ${SEED_PATH}`);
    console.log(
      'Set SEED_CN_G318_ROAD_CONSTRAINT_WRITE=1 to write (needs DATABASE_URL + PYTHON_AI_SERVICE_URL).',
    );
    return;
  }

  const prisma = new PrismaClient();
  const embedder = new BgeEmbeddingService();
  try {
    let file = await prisma.knowledgeFile.findFirst({
      where: { filename: FILE_NAME },
    });
    if (!file) {
      file = await prisma.knowledgeFile.create({
        data: {
          filename: FILE_NAME,
          filepath: `data/rag/${FILE_NAME}`,
          category: 'risks',
          subType: 'road-constraint-p0',
          countryCode: 'CN',
          version: 'p0-g318-v1',
          language: 'zh',
          credibilityScore: 0.84,
          dataSources: ['cn-g318-decision-closure-p0-seed'],
          lastUpdated: new Date(),
        },
      });
      console.log(`Created knowledge_file ${file.id}`);
    }

    console.log(`Embedding ${doc.chunks.length} texts via ${process.env.PYTHON_AI_SERVICE_URL} ...`);
    const texts = doc.chunks.map((c) => c.content);
    const embeddings = await embedder.embed(texts);

    for (let i = 0; i < doc.chunks.length; i++) {
      const c = doc.chunks[i]!;
      const embedding = embeddings[i];
      if (!embedding?.length) {
        throw new Error(`Empty embedding for ${c.chunk_id}`);
      }
      await prisma.$executeRaw`
        INSERT INTO chunks (
          id, chunk_id, content, embedding, type, credibility_score,
          keywords, file_id, section, metadata, category, created_at, updated_at
        )
        VALUES (
          gen_random_uuid(),
          ${c.chunk_id},
          ${c.content.substring(0, 50000)},
          ${JSON.stringify(embedding)}::vector,
          ${c.type},
          ${c.credibility_score},
          ${c.keywords}::text[],
          ${file!.id}::uuid,
          'road-constraint-p0',
          ${JSON.stringify(c.metadata)}::jsonb,
          ${c.category},
          NOW(),
          NOW()
        )
        ON CONFLICT (chunk_id) DO UPDATE SET
          content = EXCLUDED.content,
          embedding = EXCLUDED.embedding,
          metadata = EXCLUDED.metadata,
          category = EXCLUDED.category,
          updated_at = NOW()
      `;
      console.log(`Upserted ${c.chunk_id} (dim=${embedding.length})`);
    }
    console.log(`Done: ${doc.chunks.length} CN G318 road-constraint chunks.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
