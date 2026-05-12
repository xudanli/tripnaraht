#!/usr/bin/env tsx
/**
 * 通用的知识库索引脚本
 * 自动扫描docs文件夹下的所有目录，导入所有JSON文件到RAG系统
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
    this.baseUrl = process.env.PYTHON_AI_SERVICE_URL || 'http://101.37.240.9:18001';
    
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

const embeddingService = new SimpleEmbeddingService();

// 递归加载所有JSON文件
function loadAllFiles(dirPath: string, fileList: Array<{ path: string; filename: string }> = []): Array<{ path: string; filename: string }> {
  const files = fs.readdirSync(dirPath);

  files.forEach(file => {
    const filePath = path.join(dirPath, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      loadAllFiles(filePath, fileList);
    } else if (file.endsWith('.json')) {
      fileList.push({
        path: filePath,
        filename: file,
      });
    }
  });

  return fileList;
}

// 检测文件类别
function detectCategory(filepath: string, filename: string): string {
  const lowerPath = filepath.toLowerCase();
  const lowerName = filename.toLowerCase();

  if (lowerPath.includes('decision') || lowerPath.includes('personas') || lowerName.includes('personas')) {
    return 'decision_support';
  }
  if (lowerPath.includes('risk') || lowerPath.includes('safety') || lowerName.includes('risk')) {
    return 'safety';
  }
  if (lowerPath.includes('route') || lowerName.includes('route')) {
    return 'routes';
  }
  if (lowerPath.includes('poi') || lowerPath.includes('attraction') || lowerName.includes('attraction')) {
    return 'pois';
  }
  if (lowerPath.includes('practical') || lowerPath.includes('equipment') || lowerPath.includes('packing')) {
    return 'practical_guides';
  }
  if (lowerPath.includes('logistics') || lowerPath.includes('transportation') || lowerPath.includes('accommodation')) {
    return 'logistics';
  }
  if (lowerPath.includes('culture') || lowerPath.includes('heritage') || lowerPath.includes('history')) {
    return 'culture';
  }
  if (lowerPath.includes('case-studies') || lowerPath.includes('scenarios')) {
    return 'decision_support';
  }
  if (lowerPath.includes('integration')) {
    return 'general';
  }

  return 'general';
}

// 提取关键词
function extractKeywords(content: any, regionName: string): string[] {
  const keywords: Set<string> = new Set();
  
  // 添加地区相关关键词
  keywords.add(regionName);
  
  // 从文件名和路径提取
  const text = JSON.stringify(content).toLowerCase();
  
  // 常见关键词模式
  const commonPatterns = [
    /\b(attraction|景点|viewpoint|view|peak|mountain|glacier|fjord|beach|coast)\b/gi,
    /\b(route|trail|hike|trek|path|way)\b/gi,
    /\b(risk|danger|hazard|safety|warning)\b/gi,
    /\b(accommodation|hotel|lodge|camp|住宿)\b/gi,
    /\b(transportation|transport|car|bus|ferry|交通)\b/gi,
    /\b(equipment|gear|packing|装备)\b/gi,
  ];

  commonPatterns.forEach(pattern => {
    const matches = text.match(pattern);
    if (matches) {
      matches.forEach(m => keywords.add(m.toLowerCase()));
    }
  });

  return Array.from(keywords).slice(0, 20);
}

// 递归提取文本内容
function extractNestedText(obj: any, depth: number = 0): string {
  if (depth > 10) return ''; // 防止过深递归

  if (typeof obj === 'string') {
    return obj;
  }
  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return String(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(item => extractNestedText(item, depth + 1)).join(' ');
  }
  if (obj && typeof obj === 'object') {
    return Object.entries(obj)
      .map(([key, value]) => {
        // 跳过元数据字段
        if (['id', 'uuid', 'created_at', 'updated_at', 'metadata'].includes(key)) {
          return '';
        }
        return `${key}: ${extractNestedText(value, depth + 1)}`;
      })
      .filter(Boolean)
      .join(' ');
  }
  return '';
}

/**
 * 专用Chunk策略：user-personas.json
 * 针对法罗群岛用户画像文件的精确分块策略
 */
function chunkUserPersonas(content: any, filename: string): Array<{
  chunkId: string;
  content: string;
  type: string;
  section?: string;
  credibilityScore: number;
  keywords: string[];
  metadata?: any;
}> {
  const chunks: Array<{
    chunkId: string;
    content: string;
    type: string;
    section?: string;
    credibilityScore: number;
    keywords: string[];
    metadata?: any;
  }> = [];

  const baseFilename = path.basename(filename, '.json');
  const credibilityScore = content.metadata?.credibility_score || 0.9;
  let chunkIndex = 0;

  // 辅助函数：提取嵌套文本
  function extractText(obj: any, depth: number = 0): string {
    if (depth > 10) return '';
    if (typeof obj === 'string') return obj;
    if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj);
    if (Array.isArray(obj)) {
      return obj.map(item => extractText(item, depth + 1)).join(' ');
    }
    if (obj && typeof obj === 'object') {
      return Object.entries(obj)
        .filter(([key]) => !['id', 'uuid', 'created_at', 'updated_at'].includes(key))
        .map(([key, value]) => `${key}: ${extractText(value, depth + 1)}`)
        .filter(Boolean)
        .join(' ');
    }
    return '';
  }

  // 辅助函数：提取关键词
  function extractPersonaKeywords(obj: any): string[] {
    const keywords = new Set<string>();
    const text = JSON.stringify(obj).toLowerCase();
    
    // 提取persona相关关键词
    if (obj.persona_id) keywords.add(obj.persona_id);
    if (obj.persona_name) keywords.add(obj.persona_name.toLowerCase());
    if (obj.persona_name_en) keywords.add(obj.persona_name_en.toLowerCase());
    
    // 提取常见关键词
    const patterns = [
      /\b(persona|user|profile|画像)\b/gi,
      /\b(risk|safety|challenge)\b/gi,
      /\b(route|trail|hike)\b/gi,
      /\b(equipment|gear|packing)\b/gi,
    ];
    
    patterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) matches.forEach(m => keywords.add(m.toLowerCase()));
    });
    
    return Array.from(keywords).slice(0, 20);
  }

  // Chunk 1: metadata
  if (content.metadata) {
    chunks.push({
      chunkId: `${baseFilename}_metadata_${chunkIndex}`,
      type: 'metadata',
      content: extractText(content.metadata),
      section: 'metadata',
      credibilityScore,
      keywords: ['metadata', 'version', 'credibility', 'data_sources'],
      metadata: { section: 'metadata' },
    });
    chunkIndex++;
  }

  // Chunk 2: overview
  if (content.overview) {
    chunks.push({
      chunkId: `${baseFilename}_overview_${chunkIndex}`,
      type: 'section',
      content: extractText(content.overview),
      section: 'overview',
      credibilityScore,
      keywords: ['overview', 'concept', 'philosophy', 'dynamic'],
      metadata: { section: 'overview' },
    });
    chunkIndex++;
  }

  // Chunks 3-7: user_personas (每个persona一个chunk) ⭐ 关键优化
  if (Array.isArray(content.user_personas)) {
    content.user_personas.forEach((persona: any, idx: number) => {
      const personaText = extractText(persona);
      if (personaText.trim().length > 50) {
        chunks.push({
          chunkId: `${baseFilename}_user_personas_${chunkIndex}`,
          type: 'persona',
          content: personaText,
          section: 'user_personas',
          credibilityScore,
          keywords: extractPersonaKeywords(persona),
          metadata: {
            section: 'user_personas',
            persona_id: persona.persona_id,
            persona_name: persona.persona_name,
            index: idx,
          },
        });
        chunkIndex++;
      }
    });
  }

  // Chunk 8: dynamic_persona_system
  if (content.dynamic_persona_system) {
    chunks.push({
      chunkId: `${baseFilename}_dynamic_persona_system_${chunkIndex}`,
      type: 'section',
      content: extractText(content.dynamic_persona_system),
      section: 'dynamic_persona_system',
      credibilityScore,
      keywords: ['dynamic', 'state', 'adaptation', 'signals'],
      metadata: { section: 'dynamic_persona_system' },
    });
    chunkIndex++;
  }

  // Chunks 9-11: persona_based_content_customization (3个子部分) ⭐ 关键优化
  if (content.persona_based_content_customization) {
    const customization = content.persona_based_content_customization;
    
    if (customization.risk_communication) {
      chunks.push({
        chunkId: `${baseFilename}_persona_based_content_customization_${chunkIndex}`,
        type: 'section',
        content: `risk_communication: ${extractText(customization.risk_communication)}`,
        section: 'persona_based_content_customization.risk_communication',
        credibilityScore,
        keywords: ['risk', 'communication', 'persona', 'customization'],
        metadata: { section: 'persona_based_content_customization', subsection: 'risk_communication' },
      });
      chunkIndex++;
    }
    
    if (customization.route_recommendation_emphasis) {
      chunks.push({
        chunkId: `${baseFilename}_persona_based_content_customization_${chunkIndex}`,
        type: 'section',
        content: `route_recommendation_emphasis: ${extractText(customization.route_recommendation_emphasis)}`,
        section: 'persona_based_content_customization.route_recommendation_emphasis',
        credibilityScore,
        keywords: ['route', 'recommendation', 'persona', 'emphasis'],
        metadata: { section: 'persona_based_content_customization', subsection: 'route_recommendation_emphasis' },
      });
      chunkIndex++;
    }
    
    if (customization.equipment_guidance) {
      chunks.push({
        chunkId: `${baseFilename}_persona_based_content_customization_${chunkIndex}`,
        type: 'section',
        content: `equipment_guidance: ${extractText(customization.equipment_guidance)}`,
        section: 'persona_based_content_customization.equipment_guidance',
        credibilityScore,
        keywords: ['equipment', 'guidance', 'persona', 'customization'],
        metadata: { section: 'persona_based_content_customization', subsection: 'equipment_guidance' },
      });
      chunkIndex++;
    }
  }

  // Chunk 12: persona_evolution_tracking
  if (content.persona_evolution_tracking) {
    chunks.push({
      chunkId: `${baseFilename}_persona_evolution_tracking_${chunkIndex}`,
      type: 'section',
      content: extractText(content.persona_evolution_tracking),
      section: 'persona_evolution_tracking',
      credibilityScore,
      keywords: ['evolution', 'tracking', 'growth', 'persona'],
      metadata: { section: 'persona_evolution_tracking' },
    });
    chunkIndex++;
  }

  // Chunk 13: multi_persona_group_dynamics
  if (content.multi_persona_group_dynamics) {
    chunks.push({
      chunkId: `${baseFilename}_multi_persona_group_dynamics_${chunkIndex}`,
      type: 'section',
      content: extractText(content.multi_persona_group_dynamics),
      section: 'multi_persona_group_dynamics',
      credibilityScore,
      keywords: ['group', 'dynamics', 'multi_persona', 'team'],
      metadata: { section: 'multi_persona_group_dynamics' },
    });
    chunkIndex++;
  }

  // Chunk 14: privacy_and_ethics
  if (content.privacy_and_ethics) {
    chunks.push({
      chunkId: `${baseFilename}_privacy_and_ethics_${chunkIndex}`,
      type: 'section',
      content: extractText(content.privacy_and_ethics),
      section: 'privacy_and_ethics',
      credibilityScore,
      keywords: ['privacy', 'ethics', 'data_storage', 'user_control'],
      metadata: { section: 'privacy_and_ethics' },
    });
    chunkIndex++;
  }

  // Chunk 15: output_example
  if (content.output_example) {
    chunks.push({
      chunkId: `${baseFilename}_output_example_${chunkIndex}`,
      type: 'section',
      content: extractText(content.output_example),
      section: 'output_example',
      credibilityScore,
      keywords: ['output', 'example', 'profile_card', 'recommendation'],
      metadata: { section: 'output_example' },
    });
    chunkIndex++;
  }

  // Chunk 16: data_provenance
  if (content.data_provenance) {
    chunks.push({
      chunkId: `${baseFilename}_data_provenance_${chunkIndex}`,
      type: 'section',
      content: extractText(content.data_provenance),
      section: 'data_provenance',
      credibilityScore,
      keywords: ['data', 'provenance', 'validation', 'model_basis'],
      metadata: { section: 'data_provenance' },
    });
    chunkIndex++;
  }

  return chunks;
}

// 智能分块
function autoChunk(content: any, filename: string): Array<{
  chunkId: string;
  content: string;
  type: string;
  section?: string;
  credibilityScore: number;
  keywords: string[];
  metadata?: any;
}> {
  const chunks: Array<{
    chunkId: string;
    content: string;
    type: string;
    section?: string;
    credibilityScore: number;
    keywords: string[];
    metadata?: any;
  }> = [];

  const baseFilename = path.basename(filename, '.json');
  let chunkIndex = 0;

  // 如果是数组，每个元素作为一个chunk
  if (Array.isArray(content)) {
    content.forEach((item, idx) => {
      const text = extractNestedText(item);
      if (text.trim().length > 50) {
        chunks.push({
          chunkId: `${baseFilename}_item_${idx}`,
          content: text.substring(0, 50000),
          type: detectChunkType(item, filename),
          credibilityScore: 0.9,
          keywords: extractKeywords(item, ''),
          metadata: { index: idx, total: content.length },
        });
        chunkIndex++;
      }
    });
  }
  // 如果是对象，尝试按结构分块
  else if (content && typeof content === 'object') {
    // 检查是否有明显的分块结构
    const keys = Object.keys(content);
    
    // 如果对象有多个主要部分，每个部分作为一个chunk
    if (keys.length > 3) {
      keys.forEach((key, idx) => {
        const value = content[key];
        const text = extractNestedText(value);
        if (text.trim().length > 50) {
          chunks.push({
            chunkId: `${baseFilename}_${key}_${idx}`,
            content: text.substring(0, 50000),
            type: detectChunkType(value, filename),
            section: key,
            credibilityScore: 0.9,
            keywords: extractKeywords(value, ''),
            metadata: { section: key },
          });
          chunkIndex++;
        }
      });
    } else {
      // 整个对象作为一个chunk
      const text = extractNestedText(content);
      if (text.trim().length > 50) {
        chunks.push({
          chunkId: `${baseFilename}_full`,
          content: text.substring(0, 50000),
          type: 'full',
          credibilityScore: 0.9,
          keywords: extractKeywords(content, ''),
          metadata: {},
        });
      }
    }
  }
  // 如果是字符串，直接作为chunk
  else if (typeof content === 'string' && content.trim().length > 50) {
    chunks.push({
      chunkId: `${baseFilename}_text`,
      content: content.substring(0, 50000),
      type: 'section',
      credibilityScore: 0.9,
      keywords: extractKeywords({ text: content }, ''),
      metadata: {},
    });
  }

  // 如果没有生成任何chunk，创建一个默认chunk
  if (chunks.length === 0) {
    const text = JSON.stringify(content, null, 2);
    chunks.push({
      chunkId: `${baseFilename}_default`,
      content: text.substring(0, 50000),
      type: 'full',
      credibilityScore: 0.9,
      keywords: extractKeywords(content, ''),
      metadata: {},
    });
  }

  return chunks;
}

// 检测chunk类型
function detectChunkType(item: any, filename: string): string {
  const lowerName = filename.toLowerCase();
  const text = JSON.stringify(item).toLowerCase();

  if (lowerName.includes('personas') || text.includes('persona')) {
    return 'persona';
  }
  if (lowerName.includes('route') || text.includes('route') || text.includes('trail')) {
    return 'route';
  }
  if (lowerName.includes('risk') || text.includes('risk') || text.includes('hazard')) {
    return 'risk';
  }
  if (text.includes('attraction') || text.includes('poi') || text.includes('viewpoint')) {
    return 'poi';
  }
  if (text.includes('accommodation') || text.includes('hotel') || text.includes('lodge')) {
    return 'logistics';
  }
  if (text.includes('equipment') || text.includes('gear') || text.includes('packing')) {
    return 'logistics';
  }

  return 'section';
}

async function indexKnowledgeBase() {
  try {
    console.log('🚀 开始索引docs文件夹下的所有知识库...\n');

    // 1. 确定知识库路径（优先使用./docs，忽略KB_PATH环境变量）
    const docsPath = './docs';
    console.log(`📁 知识库路径: ${docsPath}\n`);

    if (!fs.existsSync(docsPath)) {
      throw new Error(`知识库路径不存在: ${docsPath}`);
    }

    // 2. 扫描所有子目录
    const subdirs = fs.readdirSync(docsPath)
      .filter(item => {
        const itemPath = path.join(docsPath, item);
        return fs.statSync(itemPath).isDirectory();
      })
      .map(dir => path.join(docsPath, dir));

    console.log(`📂 找到 ${subdirs.length} 个子目录\n`);

    let totalFilesProcessed = 0;
    let totalChunksCreated = 0;
    let totalChunksIndexed = 0;

    // 3. 处理每个子目录
    for (const subdir of subdirs) {
      const regionName = path.basename(subdir);
      console.log(`\n${'='.repeat(60)}`);
      console.log(`📍 处理目录: ${regionName}`);
      console.log('='.repeat(60));

      // 加载该目录下的所有JSON文件
      const files = loadAllFiles(subdir);
      
      if (files.length === 0) {
        console.log(`  ⚠️  目录 ${regionName} 中没有JSON文件，跳过\n`);
        continue;
      }

      console.log(`  📚 找到 ${files.length} 个JSON文件\n`);

      // 处理每个文件
      for (const fileData of files) {
        try {
          console.log(`📝 处理文件: ${fileData.filename}`);

          // 读取文件内容
          const rawData = fs.readFileSync(fileData.path, 'utf-8');
          const content = JSON.parse(rawData);

          // 检测类别
          const category = detectCategory(fileData.path, fileData.filename);

          // 保存文件记录
          // 注意：使用filepath查找，因为不同区域可能有相同文件名
          // 由于filepath没有唯一约束，先查找再决定创建或更新
          let fileRecord = await prisma.knowledgeFile.findFirst({
            where: {
              filepath: fileData.path,
            },
          });

          if (fileRecord) {
            // 更新现有记录
            fileRecord = await prisma.knowledgeFile.update({
              where: {
                id: fileRecord.id,
              },
              data: {
                filename: fileData.filename,
                category,
                updatedAt: new Date(),
              },
            });
          } else {
            // 检查是否有同名文件（可能被覆盖）
            const existingByFilename = await prisma.knowledgeFile.findUnique({
              where: {
                filename: fileData.filename,
              },
            });

            if (existingByFilename && existingByFilename.filepath !== fileData.path) {
              // 同名但不同路径，需要创建新记录
              // 但filename有唯一约束，需要生成唯一文件名
              const pathParts = fileData.path.split('/');
              const region = pathParts[pathParts.length - 3] || 'unknown';
              const uniqueFilename = `${region}_${fileData.filename}`;
              
              fileRecord = await prisma.knowledgeFile.create({
                data: {
                  filename: uniqueFilename,
                  filepath: fileData.path,
                  category,
                  version: '1.0.0',
                  language: 'zh-CN',
                  credibilityScore: 0.9,
                  dataSources: ['manual'],
                  lastUpdated: new Date(),
                },
              });
            } else {
              // 创建新记录
              fileRecord = await prisma.knowledgeFile.create({
                data: {
                  filename: fileData.filename,
                  filepath: fileData.path,
                  category,
                  version: '1.0.0',
                  language: 'zh-CN',
                  credibilityScore: 0.9,
                  dataSources: ['manual'],
                  lastUpdated: new Date(),
                },
              });
            }
          }

          const fileId = fileRecord.id;

          // 生成chunks（使用专用策略或通用策略）
          let chunks: Array<{
            chunkId: string;
            content: string;
            type: string;
            section?: string;
            credibilityScore: number;
            keywords: string[];
            metadata?: any;
          }>;
          
          // 检测是否需要使用专用chunk策略
          if (fileData.filename === 'user-personas.json' || fileData.filename.includes('user-personas')) {
            console.log(`  🎯 使用专用Chunk策略: chunkUserPersonas`);
            chunks = chunkUserPersonas(content, fileData.filename);
          } else {
            chunks = autoChunk(content, fileData.filename);
          }
          
          console.log(`  ✂️  生成 ${chunks.length} 个chunks`);

          if (chunks.length === 0) {
            console.log(`  ⚠️  文件 ${fileData.filename} 没有生成任何chunks，跳过`);
            continue;
          }

          // 生成向量
          console.log(`  🔢 开始向量化...`);
          const chunkContents = chunks.map(c => c.content);
          const embeddings = await embeddingService.generateEmbeddingsBatch(chunkContents, 10);
          console.log(`  ✅ 向量化完成`);

          // 保存到数据库
          console.log(`  💾 保存到数据库...`);
          const batchSize = 50;
          let indexed = 0;

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

            indexed += batch.length;
            console.log(`  📊 已索引: ${indexed}/${chunks.length}`);
          }

          totalFilesProcessed++;
          totalChunksCreated += chunks.length;
          totalChunksIndexed += indexed;

          console.log(`  ✅ 文件处理完成: ${fileData.filename}\n`);

        } catch (error: any) {
          console.error(`  ❌ 处理失败: ${fileData.filename}`, error.message);
          if (error.stack) {
            console.error(error.stack);
          }
          // 继续处理下一个文件
        }
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 索引统计:');
    console.log(`  处理目录数: ${subdirs.length}`);
    console.log(`  处理文件数: ${totalFilesProcessed}`);
    console.log(`  生成chunks数: ${totalChunksCreated}`);
    console.log(`  成功索引数: ${totalChunksIndexed}`);
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

// 执行
indexKnowledgeBase()
  .then(() => {
    console.log('\n✅ 索引脚本执行完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ 索引脚本执行失败:', error);
    process.exit(1);
  });
