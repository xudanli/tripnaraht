// scripts/index-iceland-kb-standalone.ts
// 独立的知识库索引脚本，不依赖 NestJS 应用上下文

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

// 加载环境变量（如果 dotenv 不可用，直接使用 process.env）
try {
  require('dotenv').config();
} catch (e) {
  // dotenv 不可用，使用 process.env（从系统环境变量读取）
}

// 初始化 OpenAI HTTP 客户端（使用代理）
function createOpenAIHttp(baseUrl: string) {
  const axios = require('axios');
  const proxyUrl = process.env.HTTP_PROXY || 'http://127.0.0.1:9090';
  
    return axios.create({
      baseURL: baseUrl,
      proxy: proxyUrl ? {
        host: '127.0.0.1',
        port: 9090,
      } : false,
      timeout: 300000, // 增加到 300 秒 (5 分钟)
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
            
            // 显示进度
            if (results.length % 5 === 0) {
              console.log(`  📊 向量化进度: ${results.length}/${texts.length}`);
            }
          } catch (error: any) {
            console.error(`  ⚠️  文本 ${textIndex} 向量化失败:`, error.message);
            // 生成零向量作为降级
            const zeroVector = new Array(1536).fill(0);
            results.push(zeroVector);
          }
          
          // 避免 API 限流（批次间延迟）
          if (j < batch.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
        
        // 批次间延迟
        if (i + batchSize < texts.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    return results;
  }
}

// 简化的知识库加载器
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
              filepath: fullPath,
              content,
              metadata: content.metadata || {
                version: '1.0.0',
                credibility_score: 0.8,
                language: 'zh-CN',
                data_sources: [],
                last_updated: new Date().toISOString(),
              },
            });

            console.log(`✅ 已加载: ${entry.name}`);
          } catch (error: any) {
            console.error(`❌ 加载失败 ${entry.name}:`, error.message);
            console.error(`   文件路径: ${fullPath}`);
            // 继续处理其他文件，不中断
          }
        }
    }
  };

  walkDir(kbPath);
  return files;
}

// 检测文件分类
function detectCategory(filename: string): string {
  if (filename.includes('rhythm') || filename.includes('persona')) {
    return 'decision_support';
  }
  if (filename.includes('rental') || filename.includes('packing')) {
    return 'practical_guides';
  }
  if (filename.includes('rules')) {
    return 'culture_rules';
  }
  if (filename.includes('risk') || filename.includes('hazard')) {
    return 'safety';
  }
  if (filename.includes('weather') || filename.includes('seasonal') || filename.includes('climate')) {
    return 'geography_seasonal';
  }
  if (filename.includes('route')) {
    return 'routes';
  }
  if (filename.includes('poi') || filename.includes('accommodation') || filename.includes('attraction')) {
    return 'pois';
  }
  return 'general';
}

// 简化的分块服务
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

  // 策略1: rhythm-patterns.json
  if (fileData.filename.includes('rhythm')) {
    const patterns = fileData.content.rhythm_patterns || fileData.content.patterns || [];
    patterns.forEach((item: any, index: number) => {
      const itemId = item.rhythm_id || item.id || `item_${index}`;
      chunks.push({
        chunkId: `${fileData.filename}_${itemId}_${index}`,
        content: JSON.stringify(item, null, 2),
        type: 'rhythm_pattern',
        credibilityScore: fileData.metadata.credibility_score,
        keywords: [item.rhythm_name || item.name || ''].filter(Boolean),
        metadata: { file: fileData.filename, index },
      });
    });
    return chunks;
  }

  // 策略2: car-rental-guide.json (按章节)
  if (fileData.filename.includes('rental')) {
    const sections = [
      'overview',
      'rental_companies',
      'vehicle_types',
      'insurance_breakdown',
      'pickup_process',
      'driving_rules',
      'return_process',
      'cost_planning',
    ];
    sections.forEach((section) => {
      if (fileData.content[section]) {
        chunks.push({
          chunkId: `${fileData.filename}_${section}`,
          content: JSON.stringify({ [section]: fileData.content[section] }, null, 2),
          type: 'operational_guide',
          credibilityScore: fileData.metadata.credibility_score,
          keywords: [section],
          section,
          metadata: { file: fileData.filename },
        });
      }
    });
    return chunks;
  }

  // 策略3: local-rules.json (按规则)
  if (fileData.filename.includes('rules')) {
    const rules = fileData.content.environmental_laws?.laws || 
                  fileData.content.laws || 
                  fileData.content.rules || 
                  [];
    rules.forEach((rule: any, index: number) => {
      chunks.push({
        chunkId: `${fileData.filename}_rule_${rule.law_id || index}`,
        content: JSON.stringify(rule, null, 2),
        type: 'legal_rule',
        credibilityScore: fileData.metadata.credibility_score,
        keywords: [rule.law, rule.name_en, ...(rule.prohibited || [])].filter(Boolean),
        metadata: { file: fileData.filename, severity: rule.penalty ? 'high' : 'medium' },
      });
    });
    return chunks;
  }

  // 默认：整个文件作为一个chunk
  return [{
    chunkId: `${fileData.filename}_full`,
    content: JSON.stringify(fileData.content, null, 2),
    type: 'general',
    credibilityScore: fileData.metadata.credibility_score,
    keywords: [fileData.filename],
  }];
}

async function indexKnowledgeBase() {
  const prisma = new PrismaClient();
  const embeddingService = new SimpleEmbeddingService();

  try {
    console.log('🚀 开始索引冰岛知识库...\n');

    // 1. 确定知识库路径
    const kbPath = process.env.KB_PATH || './docs/iceland';
    console.log(`📁 知识库路径: ${kbPath}\n`);

    if (!fs.existsSync(kbPath)) {
      console.error(`❌ 知识库路径不存在: ${kbPath}`);
      console.log(`💡 请确认路径是否正确，或设置环境变量 KB_PATH`);
      console.log(`💡 当前工作目录: ${process.cwd()}`);
      console.log(`💡 尝试查找 docs/iceland 目录...`);
      
      // 尝试查找 docs/iceland
      const possiblePaths = [
        './docs/iceland',
        '../docs/iceland',
        path.join(process.cwd(), 'docs', 'iceland'),
      ];
      
      for (const possiblePath of possiblePaths) {
        if (fs.existsSync(possiblePath)) {
          console.log(`✅ 找到知识库路径: ${possiblePath}`);
          const kbPath = possiblePath;
          break;
        }
      }
      
      throw new Error(`知识库路径不存在: ${kbPath}`);
    }

    // 2. 加载所有文件
    console.log('📚 加载知识库文件...\n');
    const files = loadAllFiles(kbPath);
    console.log(`\n📊 总共加载 ${files.length} 个文件\n`);

    if (files.length === 0) {
      console.log('⚠️  没有找到任何 JSON 文件');
      return;
    }

    // 3. 处理每个文件
    for (const fileData of files) {
      console.log(`\n📝 处理文件: ${fileData.filename}`);

      try {
        // 3.1 保存文件记录
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

        // 3.2 分块
        const chunks = autoChunk(fileData);
        console.log(`  ✂️  生成 ${chunks.length} 个chunks`);

        if (chunks.length === 0) {
          console.log(`  ⚠️  跳过：没有生成任何chunks`);
          continue;
        }

        // 3.3 向量化
        console.log(`  🔢 开始向量化...`);
        const texts = chunks.map((c) => c.content);
        const embeddings = await embeddingService.generateEmbeddingsBatch(texts);
        console.log(`  ✅ 向量化完成`);

        // 3.4 批量插入
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
                  updated_at = NOW()
              `;
            })
          );
        }

        console.log(`  ✅ 文件索引完成`);
      } catch (error: any) {
        console.error(`  ❌ 文件处理失败:`, error.message);
        // 继续处理下一个文件
      }
    }

    console.log('\n✅ 知识库索引完成！\n');

    // 4. 统计信息
    const fileCount = await prisma.knowledgeFile.count();
    const chunkCount = await prisma.chunk.count();
    const chunkWithEmbedding = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*) as count FROM chunks WHERE embedding IS NOT NULL`
    );

    console.log('📊 索引统计:');
    console.log(`  - 文件数: ${fileCount}`);
    console.log(`  - 分块数: ${chunkCount}`);
    console.log(`  - 有向量的分块: ${Number(chunkWithEmbedding[0]?.count || 0)}`);

  } catch (error: any) {
    console.error('\n❌ 索引失败:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

indexKnowledgeBase()
  .then(() => {
    console.log('\n✅ 索引脚本执行完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 索引脚本执行失败:', error);
    process.exit(1);
  });
