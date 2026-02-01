#!/usr/bin/env tsx
/**
 * 独立的知识库索引脚本 - 阿尔卑斯
 * 将阿尔卑斯知识库文档导入到RAG系统
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import https from 'https';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

// 使用 Python AI Service 生成 embedding（BGE-M3, 1024维）
class SimpleEmbeddingService {
  private httpClient: any;
  private baseUrl: string;

  constructor() {
    this.baseUrl = process.env.PYTHON_AI_SERVICE_URL || 'http://121.43.192.56:8001';
    
    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      proxy: false,
      httpsAgent: new https.Agent({
        keepAlive: true,
        family: 4,
      }),
    });
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.httpClient.post(
        '/api/v1/embeddings',
        {
          texts: [text],
          model: 'bge-m3',
          return_sparse: false,
        }
      );

      if (response.data && response.data.embeddings && response.data.embeddings.length > 0) {
        return response.data.embeddings[0].dense || response.data.embeddings[0];
      }

      throw new Error('Python AI Service 返回格式错误');
    } catch (error: any) {
      console.error('Embedding 生成失败:', error.message);
      throw error;
    }
  }

  async generateEmbeddingsBatch(texts: string[], batchSize: number = 10): Promise<number[][]> {
    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      
      try {
        const response = await this.httpClient.post(
          '/api/v1/embeddings',
          {
            texts: batch,
            model: 'bge-m3',
            return_sparse: false,
          }
        );

        if (response.data && response.data.embeddings) {
          const embeddings = response.data.embeddings.map((e: any) => e.dense || e);
          results.push(...embeddings);
          
          if (results.length % 10 === 0) {
            console.log(`  📊 向量化进度: ${results.length}/${texts.length}`);
          }
        } else {
          throw new Error('批量embedding返回格式错误');
        }
      } catch (error: any) {
        console.error(`  ⚠️  批次 ${i}-${i + batch.length} 向量化失败:`, error.message);
        // 生成零向量作为降级
        batch.forEach(() => {
          const zeroVector = new Array(1024).fill(0);
          results.push(zeroVector);
        });
      }
      
      // 批次间延迟
      if (i + batchSize < texts.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    return results;
  }
}

// 加载所有JSON文件
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
        }
      }
    }
  };

  walkDir(kbPath);
  return files;
}

// 检测文件分类
function detectCategory(filename: string): string {
  if (filename.includes('rhythm') || filename.includes('persona') || filename.includes('feasibility')) {
    return 'decision_support';
  }
  if (filename.includes('equipment') || filename.includes('packing') || filename.includes('transportation')) {
    return 'practical_guides';
  }
  if (filename.includes('rules') || filename.includes('laws') || filename.includes('compliance')) {
    return 'compliance_rules';
  }
  if (filename.includes('risk') || filename.includes('weather') || filename.includes('terrain') || filename.includes('accessibility')) {
    return 'safety';
  }
  if (filename.includes('route')) {
    return 'routes';
  }
  if (filename.includes('poi') || filename.includes('attraction') || filename.includes('service')) {
    return 'pois';
  }
  return 'general';
}

// 提取关键词
function extractKeywords(item: any): string[] {
  const keywords: string[] = [];
  
  if (typeof item === 'string') {
    return [item];
  }
  
  if (!item || typeof item !== 'object') {
    return keywords;
  }

  // 提取名称字段
  ['name', 'name_cn', 'name_en', 'name_de', 'name_fr', 'name_it', 'title', 'route_name', 'route_name_en', 'poi_id'].forEach(field => {
    if (item[field] && typeof item[field] === 'string') {
      keywords.push(item[field]);
    }
  });

  // 提取标签和类别
  ['tags', 'categories', 'sub_categories', 'category', 'type'].forEach(field => {
    if (Array.isArray(item[field])) {
      keywords.push(...item[field].filter((t: any) => typeof t === 'string'));
    }
  });

  // 提取区域和位置
  ['region', 'location', 'area', 'country'].forEach(field => {
    if (item[field] && typeof item[field] === 'string') {
      keywords.push(item[field]);
    }
  });

  // 添加阿尔卑斯相关关键词
  keywords.push('阿尔卑斯', 'Alps', 'Alpine', '阿尔卑斯山');
  
  return [...new Set(keywords)];
}

// 提取嵌套文本内容
function extractNestedText(obj: any, depth: number = 0, maxDepth: number = 3): string {
  if (depth > maxDepth || !obj) return '';
  
  const parts: string[] = [];
  
  if (Array.isArray(obj)) {
    obj.forEach(item => {
      if (typeof item === 'string') {
        parts.push(item);
      } else if (typeof item === 'object') {
        const text = extractNestedText(item, depth + 1, maxDepth);
        if (text) parts.push(text);
      }
    });
  } else {
    const priorityFields = ['name', 'name_cn', 'name_en', 'title', 'description', 'overview', 
      'summary', 'content', 'details', 'intro', 'long_description', 'short_description', 'zh', 'en'];
    
    priorityFields.forEach(field => {
      if (obj[field]) {
        const value = obj[field];
        if (typeof value === 'string') {
          parts.push(value);
        } else if (Array.isArray(value)) {
          const items = value.filter(v => typeof v === 'string').join('、');
          if (items) parts.push(items);
        }
      }
    });
    
    Object.entries(obj).forEach(([key, value]) => {
      if (priorityFields.includes(key) || key === 'metadata') return;
      if (typeof value === 'object' && value !== null) {
        const text = extractNestedText(value, depth + 1, maxDepth);
        if (text && text.length > 20) {
          parts.push(text);
        }
      }
    });
  }
  
  return parts.join('\n');
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

  // 策略1: attractions.json - 按景点分块
  if (fileData.filename.includes('attractions')) {
    const attractions = fileData.content.attractions || [];
    attractions.forEach((item: any, index: number) => {
      const parts: string[] = [];
      parts.push(`景点名称: ${item.name || item.name_cn || `景点${index}`}`);
      if (item.name_en) parts.push(`英文名: ${item.name_en}`);
      if (item.description?.zh) parts.push(`描述: ${item.description.zh}`);
      if (item.description?.en) parts.push(`English: ${item.description.en}`);
      if (item.overview?.zh) parts.push(`概述: ${item.overview.zh}`);
      if (item.coordinates) parts.push(`坐标: ${item.coordinates[0]}, ${item.coordinates[1]}`);
      if (item.location) parts.push(`位置: ${item.location}`);
      if (item.type) parts.push(`类型: ${item.type}`);
      if (item.significance) parts.push(`重要性: ${item.significance}`);
      if (item.highlights) {
        const highlights = Array.isArray(item.highlights) ? item.highlights : [item.highlights];
        parts.push(`亮点: ${highlights.join('、')}`);
      }
      
      chunks.push({
        chunkId: `${fileData.filename}_${item.poi_id || index}`,
        content: parts.join('\n'),
        type: 'poi',
        credibilityScore: credibility,
        keywords: extractKeywords(item),
        section: item.location || item.region,
        metadata: { file: fileData.filename, poiId: item.poi_id },
      });
    });
    return chunks.length > 0 ? chunks : createDefaultChunks(fileData, credibility);
  }

  // 策略2: services.json - 按服务分块
  if (fileData.filename.includes('services')) {
    const content = fileData.content;
    const topKeys = Object.keys(content).filter(k => k !== 'metadata');
    
    topKeys.forEach(key => {
      const sectionData = content[key];
      if (Array.isArray(sectionData)) {
        sectionData.forEach((item: any, idx: number) => {
          const parts: string[] = [];
          parts.push(`服务名称: ${item.name || item.hut_name || `服务${idx}`}`);
          if (item.name_en) parts.push(`英文名: ${item.name_en}`);
          if (item.description) parts.push(`描述: ${item.description}`);
          if (item.location) parts.push(`位置: ${item.location}`);
          if (item.coordinates) parts.push(`坐标: ${item.coordinates[0]}, ${item.coordinates[1]}`);
          
          chunks.push({
            chunkId: `${fileData.filename}_${key}_${item.hut_id || item.system_id || item.station_id || idx}`,
            content: parts.join('\n'),
            type: 'service',
            credibilityScore: credibility,
            keywords: extractKeywords(item),
            section: key,
            metadata: { file: fileData.filename },
          });
        });
      }
    });
    if (chunks.length > 0) return chunks;
  }

  // 策略3: routes/*.json - 路线信息
  if (fileData.filename.includes('route')) {
    const route = fileData.content.route || fileData.content;
    const parts: string[] = [];
    
    if (route.route_name) parts.push(`路线名称: ${route.route_name}`);
    if (route.route_name_en) parts.push(`英文名: ${route.route_name_en}`);
    if (route.overview?.zh) parts.push(`概述: ${route.overview.zh}`);
    if (route.overview?.en) parts.push(`Overview: ${route.overview.en}`);
    if (route.total_distance_km) parts.push(`总距离: ${route.total_distance_km}公里`);
    if (route.duration_days) parts.push(`建议天数: ${route.duration_days}天`);
    if (route.difficulty_level) parts.push(`难度: ${route.difficulty_level}`);
    if (route.risk_level) parts.push(`风险等级: ${route.risk_level}`);
    if (route.best_seasons) parts.push(`最佳季节: ${Array.isArray(route.best_seasons) ? route.best_seasons.join('、') : route.best_seasons}`);
    
    const nestedText = extractNestedText(route, 0, 2);
    if (nestedText && nestedText.length > 50) {
      parts.push(nestedText);
    }
    
    const keywords = extractKeywords(route);
    keywords.push('路线', '阿尔卑斯路线');
    
    chunks.push({
      chunkId: `${fileData.filename}_route`,
      content: parts.length > 0 ? parts.join('\n') : extractNestedText(route),
      type: 'route',
      credibilityScore: credibility,
      keywords: [...new Set(keywords)],
      metadata: { file: fileData.filename, routeId: route.route_id || route.region_id },
    });
    return chunks;
  }

  // 策略4: risks/*.json - 风险数据
  if (fileData.filename.includes('risk')) {
    const content = fileData.content;
    const topKeys = Object.keys(content).filter(k => k !== 'metadata');
    
    topKeys.forEach(key => {
      const sectionData = content[key];
      if (Array.isArray(sectionData)) {
        sectionData.forEach((risk: any, idx: number) => {
          const parts: string[] = [];
          if (risk.risk_id) parts.push(`风险ID: ${risk.risk_id}`);
          if (risk.name) parts.push(`风险名称: ${risk.name}`);
          if (risk.description) parts.push(`描述: ${risk.description}`);
          if (risk.severity) parts.push(`严重程度: ${risk.severity}`);
          if (risk.affected_areas) parts.push(`影响区域: ${Array.isArray(risk.affected_areas) ? risk.affected_areas.join('、') : risk.affected_areas}`);
          
          const text = extractNestedText(risk);
          if (text && text.length > 50) {
            parts.push(text);
          }
          
          const keywords = extractKeywords(risk);
          keywords.push('风险', '安全', '阿尔卑斯风险');
          
          chunks.push({
            chunkId: `${fileData.filename}_${risk.risk_id || key}_${idx}`,
            content: parts.join('\n'),
            type: 'risk',
            credibilityScore: credibility,
            keywords: [...new Set(keywords)],
            section: key,
            metadata: { file: fileData.filename, riskId: risk.risk_id },
          });
        });
      } else if (sectionData && typeof sectionData === 'object') {
        const text = extractNestedText(sectionData);
        if (text && text.length > 50) {
          const keywords = extractKeywords(sectionData);
          keywords.push('风险', '安全', '阿尔卑斯风险');
          
          chunks.push({
            chunkId: `${fileData.filename}_${key}`,
            content: `[${key}]\n${text}`,
            type: 'risk',
            credibilityScore: credibility,
            keywords: [...new Set(keywords)],
            section: key,
            metadata: { file: fileData.filename },
          });
        }
      }
    });
    if (chunks.length > 0) return chunks;
  }

  // 策略5: 其他结构化文件 - 按顶级 key 分块
  const content = fileData.content;
  const topKeys = Object.keys(content).filter(k => k !== 'metadata');
  
  if (topKeys.length > 1 && topKeys.length <= 15) {
    topKeys.forEach(key => {
      const sectionData = content[key];
      if (sectionData && typeof sectionData === 'object') {
        const text = extractNestedText(sectionData);
        if (text && text.length > 50) {
          const keywords = extractKeywords(sectionData);
          keywords.push(fileData.filename.replace('.json', ''), key);
          
          chunks.push({
            chunkId: `${fileData.filename}_${key}`,
            content: `[${key}]\n${text}`,
            type: 'section',
            credibilityScore: credibility,
            keywords: [...new Set(keywords)],
            section: key,
            metadata: { file: fileData.filename },
          });
        }
      }
    });
    if (chunks.length > 0) return chunks;
  }

  // 默认策略
  return createDefaultChunks(fileData, credibility);
}

// 创建默认 chunk
function createDefaultChunks(fileData: any, credibility: number) {
  const text = extractNestedText(fileData.content);
  const keywords = extractKeywords(fileData.content);
  keywords.push(fileData.filename.replace('.json', ''));
  
  return [{
    chunkId: `${fileData.filename}_full`,
    content: text || JSON.stringify(fileData.content, null, 2).substring(0, 3000),
    type: 'full',
    credibilityScore: credibility,
    keywords: [...new Set(keywords)],
    metadata: { file: fileData.filename },
  }];
}

async function indexKnowledgeBase() {
  const embeddingService = new SimpleEmbeddingService();

  try {
    console.log('🚀 开始索引阿尔卑斯知识库...\n');

    // 1. 确定知识库路径
    const kbPath = process.env.KB_PATH || './docs/alps';
    console.log(`📁 知识库路径: ${kbPath}\n`);

    if (!fs.existsSync(kbPath)) {
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
    let totalChunks = 0;
    let totalIndexed = 0;

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
        totalChunks += chunks.length;

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

          // 使用原生SQL批量插入（与冰岛脚本保持一致）
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

          totalIndexed += batch.length;
          console.log(`  📊 已索引: ${totalIndexed}/${chunks.length}`);
        }

        console.log(`  ✅ 文件处理完成: ${fileData.filename}`);

      } catch (error: any) {
        console.error(`  ❌ 处理失败: ${fileData.filename}`, error.message);
        if (error.stack) {
          console.error(error.stack);
        }
        // 继续处理下一个文件
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 索引统计:');
    console.log(`  处理文件数: ${files.length}`);
    console.log(`  生成chunks数: ${totalChunks}`);
    console.log(`  成功索引数: ${totalIndexed}`);
    console.log('='.repeat(60));
    console.log('\n✅ 知识库索引完成！');

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

// 执行索引
indexKnowledgeBase()
  .then(() => {
    console.log('\n✅ 索引脚本执行完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ 索引脚本执行失败:', error);
    process.exit(1);
  });
