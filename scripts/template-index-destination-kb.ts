#!/usr/bin/env tsx
/**
 * 新目的地知识库索引脚本模板
 * 
 * 使用方法：
 * 1. 复制此文件：cp scripts/template-index-destination-kb.ts scripts/index-{destination}-kb-standalone.ts
 * 2. 修改配置：更新 DESTINATION_NAME 和 KB_PATH
 * 3. 运行脚本：npx tsx scripts/index-{destination}-kb-standalone.ts
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

// ========== 配置区域 ==========
// TODO: 修改以下配置
const DESTINATION_NAME = 'your-destination'; // 目的地名称（小写，用连字符分隔）
const KB_PATH = path.join(process.cwd(), 'docs', DESTINATION_NAME); // 知识库路径
// =============================

// 加载环境变量
try {
  require('dotenv').config();
} catch (e) {
  // dotenv 不可用，使用 process.env
}

// 初始化 OpenAI HTTP 客户端（使用代理）
function createOpenAIHttp(baseUrl: string) {
  const axios = require('axios');
  const { HttpsProxyAgent } = require('https-proxy-agent');
  const proxyUrl = process.env.HTTP_PROXY || 'http://127.0.0.1:9090';
  
  const httpsAgent = new HttpsProxyAgent(proxyUrl);
  
  return axios.create({
    baseURL: baseUrl,
    httpsAgent,
    proxy: false,
    timeout: 300000,
  });
}

// 简化的 Embedding 服务
class SimpleEmbeddingService {
  private openaiHttp: any;
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY 未配置');
    }

    const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    this.openaiHttp = createOpenAIHttp(baseUrl);
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openaiHttp.post(
        '/embeddings',
        {
          model: 'text-embedding-3-small',
          input: text,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
          },
        }
      );

      if (response.data && response.data.data && response.data.data.length > 0) {
        return response.data.data[0].embedding;
      }

      throw new Error('OpenAI API 返回格式错误');
    } catch (error: any) {
      console.error('Embedding 生成失败:', error.message);
      throw error;
    }
  }

  async generateEmbeddingsBatch(texts: string[], batchSize: number = 10): Promise<number[][]> {
    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      
      for (let j = 0; j < batch.length; j++) {
        const text = batch[j];
        const textIndex = i + j;
        
        try {
          const embedding = await this.generateEmbedding(text);
          results.push(embedding);
          
          if (results.length % 5 === 0) {
            console.log(`  📊 向量化进度: ${results.length}/${texts.length}`);
          }
        } catch (error: any) {
          console.error(`  ⚠️  文本 ${textIndex} 向量化失败:`, error.message);
          const zeroVector = new Array(1536).fill(0);
          results.push(zeroVector);
        }
        
        if (j < batch.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
      
      if (i + batchSize < texts.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    return results;
  }
}

// 加载所有文件
function loadAllFiles(kbPath: string): Array<{
  filename: string;
  filepath: string;
  content: any;
  metadata: any;
}> {
  const files: Array<{
    filename: string;
    filepath: string;
    content: any;
    metadata: any;
  }> = [];

  const walkDir = (dirPath: string) => {
    if (!fs.existsSync(dirPath)) {
      console.warn(`⚠️  目录不存在: ${dirPath}`);
      return;
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.name.endsWith('.json')) {
        try {
          const fileContent = fs.readFileSync(fullPath, 'utf-8');
          const content = JSON.parse(fileContent);

          files.push({
            filename: entry.name,
            filepath: path.relative(process.cwd(), fullPath),
            content,
            metadata: content.metadata || {
              version: '1.0.0',
              credibility_score: 0.8,
              language: 'zh-CN',
              data_sources: [],
              last_updated: new Date().toISOString(),
            },
          });
        } catch (error: any) {
          console.error(`❌ 解析文件失败: ${fullPath}`, error.message);
        }
      }
    }
  };

  walkDir(kbPath);
  return files;
}

// 检测文件类别
function detectCategory(filename: string): string {
  const nameLower = filename.toLowerCase();
  
  if (nameLower.includes('poi') || nameLower.includes('attraction') || nameLower.includes('accommodation')) {
    return 'pois';
  }
  if (nameLower.includes('route')) {
    return 'routes';
  }
  if (nameLower.includes('practical') || nameLower.includes('guide')) {
    return 'practical_guides';
  }
  if (nameLower.includes('risk') || nameLower.includes('safety')) {
    return 'safety';
  }
  
  return 'pois'; // 默认
}

// 提取关键词
function extractKeywords(item: any): string[] {
  const keywords: string[] = [];
  
  if (item.name) keywords.push(item.name);
  if (item.nameCN) keywords.push(item.nameCN);
  if (item.nameEN) keywords.push(item.nameEN);
  if (item.category) keywords.push(item.category);
  if (item.highlights && Array.isArray(item.highlights)) {
    keywords.push(...item.highlights);
  }
  if (item.location) keywords.push(item.location);
  if (item.region) keywords.push(item.region);
  
  return [...new Set(keywords)]; // 去重
}

// 自动分块
function autoChunk(fileData: any): Array<{
  chunkId: string;
  content: string;
  type: string;
  credibilityScore: number;
  keywords: string[];
  section?: string;
  metadata?: any;
}> {
  const chunks: Array<{
    chunkId: string;
    content: string;
    type: string;
    credibilityScore: number;
    keywords: string[];
    section?: string;
    metadata?: any;
  }> = [];
  
  const credibility = fileData.metadata?.credibility_score || 0.8;

  // 策略1: pois/*.json - 按POI分块
  if (fileData.filename.includes('pois') || fileData.filename.includes('poi')) {
    const pois = fileData.content.pois || fileData.content.attractions || [];
    pois.forEach((item: any, index: number) => {
      const parts: string[] = [];
      parts.push(`POI名称: ${item.name || item.nameCN || `POI${index}`}`);
      if (item.nameEN) parts.push(`英文名: ${item.nameEN}`);
      if (item.description) parts.push(`描述: ${item.description}`);
      if (item.coordinates) parts.push(`坐标: ${item.coordinates[0]}, ${item.coordinates[1]}`);
      if (item.address) parts.push(`地址: ${item.address}`);
      if (item.category) parts.push(`类别: ${item.category}`);
      if (item.highlights) parts.push(`亮点: ${Array.isArray(item.highlights) ? item.highlights.join('、') : item.highlights}`);
      if (item.opening_hours) parts.push(`开放时间: ${item.opening_hours}`);
      if (item.ticket_price) parts.push(`门票价格: ${item.ticket_price}`);
      
      chunks.push({
        chunkId: `${fileData.filename}_${item.poi_id || item.id || index}`,
        content: parts.join('\n'),
        type: 'poi',
        credibilityScore: credibility,
        keywords: extractKeywords(item),
        section: item.location || item.region,
        metadata: { file: fileData.filename, poiId: item.poi_id || item.id },
      });
    });
    
    if (chunks.length > 0) return chunks;
  }

  // 策略2: 默认 - 将整个文件作为一个chunk
  const contentStr = JSON.stringify(fileData.content, null, 2);
  chunks.push({
    chunkId: `${fileData.filename}_full`,
    content: contentStr,
    type: 'full',
    credibilityScore: credibility,
    keywords: [fileData.filename],
    metadata: { file: fileData.filename },
  });

  return chunks;
}

// 主函数
async function indexKnowledgeBase() {
  const prisma = new PrismaClient();
  const embeddingService = new SimpleEmbeddingService();

  try {
    console.log('='.repeat(80));
    console.log(`🚀 开始索引 ${DESTINATION_NAME} 知识库...`);
    console.log('='.repeat(80));
    console.log(`📁 知识库路径: ${KB_PATH}\n`);

    if (!fs.existsSync(KB_PATH)) {
      console.error(`❌ 知识库目录不存在: ${KB_PATH}`);
      console.log(`💡 请先创建目录并添加文档文件`);
      return;
    }

    // 1. 加载所有文件
    console.log('📂 加载文件...');
    const files = loadAllFiles(KB_PATH);
    console.log(`✅ 找到 ${files.length} 个文件\n`);

    if (files.length === 0) {
      console.log('⚠️  没有找到任何文件，请检查目录路径');
      return;
    }

    let totalChunks = 0;
    let successCount = 0;
    let failCount = 0;

    // 2. 处理每个文件
    for (const fileData of files) {
      console.log(`\n📝 处理文件: ${fileData.filename}`);

      try {
        // 2.1 保存文件记录
        const category = detectCategory(fileData.filename);
        const file = await prisma.knowledgeFile.upsert({
          where: { filename: fileData.filename },
          update: {
            filepath: fileData.filepath,
            category,
            version: fileData.metadata.version,
            credibilityScore: fileData.metadata.credibility_score,
            dataSources: fileData.metadata.data_sources || [],
            lastUpdated: new Date(fileData.metadata.last_updated),
          },
          create: {
            filename: fileData.filename,
            filepath: fileData.filepath,
            category,
            version: fileData.metadata.version,
            language: fileData.metadata.language || 'zh-CN',
            credibilityScore: fileData.metadata.credibility_score,
            dataSources: fileData.metadata.data_sources || [],
            lastUpdated: new Date(fileData.metadata.last_updated),
          },
        });

        const fileId = file.id;
        console.log(`  ✅ 文件记录已保存: ${fileId}`);

        // 2.2 删除旧chunks
        await prisma.chunk.deleteMany({
          where: { fileId },
        });

        // 2.3 分块
        const chunks = autoChunk(fileData);
        console.log(`  ✂️  生成 ${chunks.length} 个chunks`);
        totalChunks += chunks.length;

        if (chunks.length === 0) {
          console.log(`  ⚠️  跳过：没有生成任何chunks`);
          continue;
        }

        // 2.4 向量化
        console.log(`  🔢 开始向量化...`);
        const texts = chunks.map((c) => c.content);
        const embeddings = await embeddingService.generateEmbeddingsBatch(texts);
        console.log(`  ✅ 向量化完成`);

        // 2.5 批量插入
        console.log(`  💾 保存到数据库...`);
        const batchSize = 50;
        for (let i = 0; i < chunks.length; i += batchSize) {
          const batch = chunks.slice(i, i + batchSize);
          const batchEmbeddings = embeddings.slice(i, i + batchSize);

          await prisma.$transaction(
            batch.map((chunk, idx) => {
              const embedding = batchEmbeddings[idx];
              return prisma.$executeRaw`
                INSERT INTO chunks (
                  id, chunk_id, content, embedding, type, credibility_score, 
                  keywords, file_id, section, metadata, created_at, updated_at
                )
                VALUES (
                  gen_random_uuid(),
                  ${chunk.chunkId},
                  ${chunk.content.substring(0, 50000)},
                  ${JSON.stringify(embedding)}::vector,
                  ${chunk.type},
                  ${chunk.credibilityScore},
                  ${chunk.keywords}::text[],
                  ${fileId}::uuid,
                  ${chunk.section || null},
                  ${chunk.metadata ? JSON.stringify(chunk.metadata) : null}::jsonb,
                  NOW(),
                  NOW()
                )
                ON CONFLICT (chunk_id) DO UPDATE SET
                  content = EXCLUDED.content,
                  embedding = EXCLUDED.embedding,
                  type = EXCLUDED.type,
                  credibility_score = EXCLUDED.credibility_score,
                  keywords = EXCLUDED.keywords,
                  section = EXCLUDED.section,
                  metadata = EXCLUDED.metadata,
                  updated_at = NOW()
              `;
            })
          );
        }

        console.log(`  ✅ 保存完成`);
        successCount++;
      } catch (error: any) {
        console.error(`  ❌ 处理失败:`, error.message);
        failCount++;
      }
    }

    // 3. 总结
    console.log('\n' + '='.repeat(80));
    console.log('📊 索引完成');
    console.log('='.repeat(80));
    console.log(`✅ 成功: ${successCount} 个文件`);
    console.log(`❌ 失败: ${failCount} 个文件`);
    console.log(`📦 总chunks: ${totalChunks}`);
    console.log('');

    if (successCount > 0) {
      console.log('💡 下一步：');
      console.log('   1. 运行质量检查: npx tsx scripts/check-poi-documents.ts');
      console.log('   2. 运行质量修复: npx tsx scripts/fix-poi-documents-quality.ts --execute');
    }

  } catch (error: any) {
    console.error('❌ 索引失败:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 执行
indexKnowledgeBase()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('执行失败:', error);
    process.exit(1);
  });
