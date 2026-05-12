/**
 * 知识库 RAG 索引脚本 v3
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const DOCS_ROOT = path.join(__dirname, '..', 'docs');
const PYTHON_AI_URL = process.env.PYTHON_AI_SERVICE_URL || 'http://101.37.240.9:18001';

const CATEGORY_MAP: Record<string, string> = {
  'routes': 'ROUTE_INFO', 'risks': 'RISK_INFO', 'pois': 'POI_INFO',
  'geography': 'GEOGRAPHY', 'practical': 'PRACTICAL', 'decision-support': 'DECISION_SUPPORT',
};

async function generateEmbedding(texts: string[]): Promise<number[][]> {
  try {
    const response = await axios.post(
      `${PYTHON_AI_URL}/api/v1/embeddings`,
      { texts, model: 'bge-m3', return_sparse: false },
      { timeout: 60000 }
    );
    if (response.data?.embeddings) {
      return response.data.embeddings.map((e: any) => e.dense || e);
    }
    throw new Error('Invalid');
  } catch {
    return texts.map(() => new Array(1024).fill(0));
  }
}

function extractText(obj: any): string {
  if (!obj) return '';
  if (typeof obj === 'string') return obj;
  if (typeof obj === 'number') return String(obj);
  if (Array.isArray(obj)) return obj.map(extractText).filter(Boolean).join('\n');
  if (typeof obj === 'object') {
    return Object.entries(obj).map(([k, v]) => {
      const t = extractText(v);
      return t && t.length > 5 ? `${k}: ${t}` : '';
    }).filter(Boolean).join('\n');
  }
  return '';
}

function extractKeywords(obj: any): string[] {
  const kw: string[] = [];
  if (obj?.name) kw.push(String(obj.name));
  if (obj?.route_name) kw.push(String(obj.route_name));
  if (obj?.tags && Array.isArray(obj.tags)) kw.push(...obj.tags.map(String));
  return kw.slice(0, 10).map(k => k.replace(/["\n\r]/g, ''));
}

async function getOrCreateFileRecord(relativePath: string): Promise<string> {
  const existing = await prisma.$queryRaw<any[]>`
    SELECT id FROM knowledge_files WHERE filename = ${relativePath} LIMIT 1
  `;
  if (existing.length > 0) return existing[0].id;
  
  const result = await prisma.$queryRaw<any[]>`
    INSERT INTO knowledge_files (
      id, filename, filepath, category, version, 
      language, credibility_score, last_updated, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), ${relativePath}, ${relativePath}, 'knowledge-base', '1.0',
      'zh-CN', 0.8, NOW(), NOW(), NOW()
    )
    ON CONFLICT (filename) DO UPDATE SET updated_at = NOW()
    RETURNING id
  `;
  return result[0].id;
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  
  console.log('\n=== 知识库 RAG 索引 v3 ===\n');
  if (isDryRun) console.log('模式: 仅检查\n');
  
  try {
    await axios.get(`${PYTHON_AI_URL}/health`, { timeout: 5000 });
    console.log('Python AI: OK\n');
  } catch {
    console.log('Python AI: 不可用\n');
    return;
  }
  
  let totalFiles = 0, totalChunks = 0, indexed = 0, errors = 0;
  
  const destinations = fs.readdirSync(DOCS_ROOT).filter(d => {
    const p = path.join(DOCS_ROOT, d);
    return fs.statSync(p).isDirectory() && !d.startsWith('.');
  });
  
  for (const dest of destinations) {
    const destPath = path.join(DOCS_ROOT, dest);
    console.log(`${dest}`);
    
    function findJsonFiles(dir: string): string[] {
      const files: string[] = [];
      try {
        for (const item of fs.readdirSync(dir)) {
          const p = path.join(dir, item);
          if (fs.statSync(p).isDirectory()) files.push(...findJsonFiles(p));
          else if (item.endsWith('.json')) files.push(p);
        }
      } catch {}
      return files;
    }
    
    for (const file of findJsonFiles(destPath)) {
      totalFiles++;
      const relativePath = path.relative(DOCS_ROOT, file);
      const rel = path.relative(destPath, file);
      
      try {
        const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
        const dirName = path.basename(path.dirname(file));
        const category = CATEGORY_MAP[dirName] || 'GENERAL';
        
        // 提取 chunks
        const chunks: { content: string; keywords: string[] }[] = [];
        const arrays = [data.routes, data.risks, data.attractions, data.pois, data.places].filter(a => Array.isArray(a));
        
        if (arrays.length > 0) {
          for (const arr of arrays) {
            for (const item of arr) {
              const content = extractText(item);
              if (content.length > 50) {
                chunks.push({ content: content.slice(0, 4000), keywords: extractKeywords(item) });
              }
            }
          }
        }
        
        if (chunks.length === 0) {
          const content = extractText(data);
          if (content.length > 50) {
            chunks.push({ content: content.slice(0, 4000), keywords: extractKeywords(data) });
          }
        }
        
        if (chunks.length === 0) continue;
        totalChunks += chunks.length;
        
        if (isDryRun) {
          indexed += chunks.length;
          continue;
        }
        
        const fileId = await getOrCreateFileRecord(relativePath);
        const embeddings = await generateEmbedding(chunks.map(c => c.content));
        
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const chunkId = `kb_${dest}_${path.basename(file, '.json')}_${i}`;
          const embStr = `[${embeddings[i].join(',')}]`;
          const kwStr = chunk.keywords.length > 0 ? `{${chunk.keywords.map(k => `"${k}"`).join(',')}}` : '{}';
          const meta = JSON.stringify({ source: relativePath, destination: dest });
          
          const existing = await prisma.$queryRaw<any[]>`SELECT id FROM chunks WHERE chunk_id = ${chunkId}`;
          
          if (existing.length > 0) {
            await prisma.$executeRaw`
              UPDATE chunks SET content = ${chunk.content}, category = ${category},
                keywords = ${kwStr}::text[], metadata = ${meta}::jsonb, credibility_score = 0.8,
                embedding = ${embStr}::vector, updated_at = NOW()
              WHERE chunk_id = ${chunkId}
            `;
          } else {
            await prisma.$executeRaw`
              INSERT INTO chunks (
                id, chunk_id, content, type, section, credibility_score,
                keywords, file_id, metadata, token_count,
                created_at, updated_at, category, last_verified_at, embedding
              ) VALUES (
                gen_random_uuid(), ${chunkId}, ${chunk.content}, 'knowledge-base', NULL, 0.8,
                ${kwStr}::text[], ${fileId}::uuid, ${meta}::jsonb, NULL,
                NOW(), NOW(), ${category}, NULL, ${embStr}::vector
              )
            `;
          }
          indexed++;
        }
        console.log(`  ${rel}: ${chunks.length} ok`);
      } catch (err: any) {
        console.log(`  ${rel}: ERR`);
        errors++;
      }
    }
  }
  
  console.log(`\n统计: 文件 ${totalFiles}, chunks ${totalChunks}, 索引 ${indexed}, 错误 ${errors}\n`);
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
export {};
