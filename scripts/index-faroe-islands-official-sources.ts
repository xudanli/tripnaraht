/**
 * 法罗群岛官方旅游信息源索引脚本
 * 
 * 从官方网站抓取内容并索引到RAG系统
 * 
 * 数据源：
 * - Visit Faroe Islands (https://visitfaroeislands.com/)
 * - Visit Faroe Islands Plan Your Stay (行前准备页面)
 * - Visit Faroe Islands Brochures (官方手册下载页)
 * - Faroe Islands Government (法罗群岛政府网站)
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import * as https from 'https';
import * as dotenv from 'dotenv';
import { JSDOM } from 'jsdom';

dotenv.config();

const prisma = new PrismaClient();

// 官方数据源配置
const OFFICIAL_SOURCES = [
  {
    name: 'Visit Faroe Islands Home',
    url: 'https://visitfaroeislands.com/en',
    category: 'official_tourism',
    description: '法罗群岛官方旅游网站主页',
    priority: 1,
  },
  {
    name: 'Visit Faroe Islands Plan Your Stay',
    url: 'https://visitfaroeislands.com/en/plan-your-stay',
    category: 'official_tourism',
    description: '法罗群岛官方行前准备指南',
    priority: 1,
  },
  {
    name: 'Visit Faroe Islands Brochures',
    url: 'https://visitfaroeislands.com/en/brochures',
    category: 'official_resources',
    description: '法罗群岛官方旅游手册与宣传资料',
    priority: 1,
  },
  {
    name: 'Faroe Islands Government',
    url: 'https://www.government.fo/en/',
    category: 'official_government',
    description: '法罗群岛政府官方网站',
    priority: 1,
  },
];

// Embedding服务
class EmbeddingService {
  private httpClient: any;
  private baseUrl: string;

  constructor() {
    this.baseUrl = process.env.PYTHON_AI_SERVICE_URL || 'http://121.43.192.56:8001';
    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      proxy: false,
      httpsAgent: new https.Agent({ keepAlive: true, family: 4 }),
    });
  }

  async generateEmbeddingsBatch(texts: string[], batchSize: number = 10): Promise<number[][]> {
    const results: number[][] = [];
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      try {
        const response = await this.httpClient.post('/api/v1/embeddings', {
          texts: batch,
          model: 'bge-m3',
          return_sparse: false,
        });
        if (response.data && response.data.embeddings) {
          const embeddings = response.data.embeddings.map((e: any) => e.dense || e);
          results.push(...embeddings);
          console.log(`  📊 向量化进度: ${results.length}/${texts.length}`);
        }
      } catch (error: any) {
        console.error(`  ⚠️  批次 ${i}-${i + batch.length} 向量化失败:`, error.message);
        batch.forEach(() => {
          const zeroVector = new Array(1024).fill(0);
          results.push(zeroVector);
        });
      }
      if (i + batchSize < texts.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    return results;
  }
}

const embeddingService = new EmbeddingService();

/**
 * 从URL抓取网页内容
 */
async function fetchWebContent(url: string): Promise<{ title: string; content: string; text: string }> {
  try {
    console.log(`  🌐 抓取网页: ${url}`);
    
    // 创建axios实例，禁用自动重定向
    const axiosInstance = axios.create({
      timeout: 30000,
      maxRedirects: 0, // 禁用自动重定向
      validateStatus: (status) => status < 500,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    let response;
    let finalUrl = url;
    let redirectCount = 0;
    const maxRedirects = 5;

    // 手动处理重定向
    while (redirectCount < maxRedirects) {
      try {
        response = await axiosInstance.get(finalUrl);
        if (response.status >= 200 && response.status < 300) {
          break; // 成功获取
        }
        if (response.status >= 300 && response.status < 400) {
          // 重定向
          const location = response.headers.location;
          if (location) {
            finalUrl = location.startsWith('http') ? location : new URL(location, finalUrl).href;
            redirectCount++;
            continue;
          }
        }
        throw new Error(`HTTP ${response.status}`);
      } catch (error: any) {
        if (error.response?.status >= 300 && error.response?.status < 400) {
          const location = error.response.headers.location;
          if (location) {
            finalUrl = location.startsWith('http') ? location : new URL(location, finalUrl).href;
            redirectCount++;
            continue;
          }
        }
        // 如果禁用重定向失败，尝试启用重定向
        if (redirectCount === 0) {
          response = await axios.get(finalUrl, {
            timeout: 30000,
            maxRedirects: 5,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
          });
          break;
        }
        throw error;
      }
    }

    if (!response) {
      throw new Error('Failed to fetch after redirects');
    }

    const dom = new JSDOM(response.data);
    const document = dom.window.document;

    // 提取标题
    const title = document.querySelector('title')?.textContent || 
                  document.querySelector('h1')?.textContent || 
                  url;

    // 移除script和style标签
    const scripts = document.querySelectorAll('script, style, nav, footer, header');
    scripts.forEach(el => el.remove());

    // 提取主要内容
    const mainContent = document.querySelector('main') || 
                       document.querySelector('article') ||
                       document.querySelector('.content') ||
                       document.querySelector('.main-content') ||
                       document.querySelector('.page-content') ||
                       document.body;

    // 提取文本内容
    const text = mainContent?.textContent || '';
    
    // 清理文本
    const cleanedText = text
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, '\n')
      .trim();

    // 提取结构化内容（段落、列表等）
    const paragraphs: string[] = [];
    const headings: string[] = [];

    mainContent?.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(h => {
      const headingText = h.textContent?.trim();
      if (headingText) {
        headings.push(headingText);
      }
    });

    mainContent?.querySelectorAll('p, li').forEach(el => {
      const text = el.textContent?.trim();
      if (text && text.length > 20) {
        paragraphs.push(text);
      }
    });

    const structuredContent = {
      title,
      headings,
      paragraphs,
      url,
      fetchedAt: new Date().toISOString(),
    };

    return {
      title,
      content: JSON.stringify(structuredContent, null, 2),
      text: cleanedText.substring(0, 50000), // 限制长度
    };
  } catch (error: any) {
    console.error(`  ❌ 抓取失败: ${error.message}`);
    throw error;
  }
}

/**
 * 分块策略：按段落和章节分块
 */
function chunkWebContent(
  source: typeof OFFICIAL_SOURCES[0],
  title: string,
  content: string,
  text: string
): Array<{
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

  const baseFilename = source.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const credibilityScore = 0.95; // 官方来源高可信度

  try {
    const structured = JSON.parse(content);
    
    // Chunk 1: 标题和概述
    if (structured.title) {
      chunks.push({
        chunkId: `${baseFilename}_overview`,
        type: 'overview',
        content: `标题: ${structured.title}\n来源: ${source.name}\nURL: ${source.url}\n描述: ${source.description}`,
        section: 'overview',
        credibilityScore,
        keywords: [source.name, 'official', 'faroe islands', 'tourism', 'visit faroe islands'],
        metadata: {
          source: source.name,
          url: source.url,
          category: source.category,
          type: 'official_source',
        },
      });
    }

    // Chunk 2-N: 按段落分块
    if (structured.paragraphs && structured.paragraphs.length > 0) {
      structured.paragraphs.forEach((para: string, idx: number) => {
        if (para.trim().length > 50) {
          chunks.push({
            chunkId: `${baseFilename}_para_${idx}`,
            type: 'content',
            content: para,
            section: 'content',
            credibilityScore,
            keywords: extractKeywords(para),
            metadata: {
              source: source.name,
              url: source.url,
              category: source.category,
              paragraphIndex: idx,
              type: 'official_source',
            },
          });
        }
      });
    }

    // 如果没有结构化内容，使用全文
    if (chunks.length === 0 && text) {
      // 按长度分块（每5000字符一个chunk）
      const chunkSize = 5000;
      for (let i = 0; i < text.length; i += chunkSize) {
        const chunkText = text.substring(i, i + chunkSize);
        chunks.push({
          chunkId: `${baseFilename}_chunk_${Math.floor(i / chunkSize)}`,
          type: 'content',
          content: chunkText,
          section: 'content',
          credibilityScore,
          keywords: extractKeywords(chunkText),
          metadata: {
            source: source.name,
            url: source.url,
            category: source.category,
            chunkIndex: Math.floor(i / chunkSize),
            type: 'official_source',
          },
        });
      }
    }
  } catch (error) {
    // 如果解析失败，使用全文分块
    const chunkSize = 5000;
    for (let i = 0; i < text.length; i += chunkSize) {
      const chunkText = text.substring(i, i + chunkSize);
      chunks.push({
        chunkId: `${baseFilename}_chunk_${Math.floor(i / chunkSize)}`,
        type: 'content',
        content: chunkText,
        section: 'content',
        credibilityScore,
        keywords: extractKeywords(chunkText),
        metadata: {
          source: source.name,
          url: source.url,
          category: source.category,
          chunkIndex: Math.floor(i / chunkSize),
          type: 'official_source',
        },
      });
    }
  }

  return chunks;
}

/**
 * 提取关键词
 */
function extractKeywords(text: string): string[] {
  const keywords: Set<string> = new Set();
  const lowerText = text.toLowerCase();
  
  // 法罗群岛相关关键词
  const faroeKeywords = [
    'faroe islands', 'faroe', 'torshavn', 'visit faroe islands',
    'visa', 'entry', 'requirements', 'tourism', 'travel', 'visitor', 'tourist',
    'official', 'government', 'denmark', 'autonomous', 'schengen',
    'hiking', 'nature', 'sheep', 'fjord', 'village',
    'passport', 'permit', 'brochure', 'guide',
  ];
  
  faroeKeywords.forEach(kw => {
    if (lowerText.includes(kw)) {
      keywords.add(kw);
    }
  });
  
  // 提取常见词汇（长度3-20）
  const words = lowerText.match(/\b[a-z]{3,20}\b/g) || [];
  words.slice(0, 10).forEach(w => keywords.add(w));
  
  return Array.from(keywords).slice(0, 20);
}

/**
 * 主函数
 */
async function indexOfficialSources() {
  try {
    console.log('🚀 开始索引法罗群岛官方旅游信息源...\n');

    let successCount = 0;
    let failCount = 0;

    for (const source of OFFICIAL_SOURCES) {
      try {
        console.log(`\n📝 处理来源: ${source.name}`);
        console.log(`   URL: ${source.url}`);
        console.log(`   类别: ${source.category}`);

        // 1. 抓取网页内容
        const { title, content, text } = await fetchWebContent(source.url);
        console.log(`  ✅ 抓取成功: ${title.substring(0, 50)}...`);

        // 2. 生成chunks
        const chunks = chunkWebContent(source, title, content, text);
        console.log(`  ✂️  生成 ${chunks.length} 个chunks`);

        if (chunks.length === 0) {
          console.log(`  ⚠️  未生成chunks，跳过`);
          continue;
        }

        // 3. 保存文件记录
        const filename = `${source.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}.json`;
        const filepath = `docs/faroe-islands/official-sources/${filename}`;

        const fileRecord = await prisma.knowledgeFile.upsert({
          where: {
            filename,
          },
          update: {
            filepath,
            category: source.category,
            updatedAt: new Date(),
          },
          create: {
            filename,
            filepath,
            category: source.category,
            version: '1.0.0',
            language: 'en',
            credibilityScore: 0.95,
            dataSources: ['official_website'],
            lastUpdated: new Date(),
          },
        });

        const fileId = fileRecord.id;
        console.log(`  💾 文件记录已保存: ${fileId}`);

        // 4. 删除旧chunks
        await prisma.chunk.deleteMany({
          where: { fileId },
        });

        // 5. 生成向量
        console.log(`  🔢 开始向量化...`);
        const texts = chunks.map(c => c.content);
        const embeddings = await embeddingService.generateEmbeddingsBatch(texts, 10);
        console.log(`  ✅ 向量化完成`);

        // 6. 保存chunks
        console.log(`  💾 保存chunks到数据库...`);
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const embedding = embeddings[i];
          const embeddingStr = `[${embedding.join(',')}]`;

          // 将keywords数组转换为PostgreSQL数组格式
          const keywordsArray = `{${chunk.keywords.map(k => `"${k.replace(/"/g, '\\"')}"`).join(',')}}`;
          
          await prisma.$executeRawUnsafe(
            `
            INSERT INTO chunks (
              id, chunk_id, content, embedding, type, section, credibility_score, keywords, file_id, metadata, created_at, updated_at
            )
            VALUES (
              gen_random_uuid(),
              $1,
              $2,
              $3::vector(1024),
              $4,
              $5,
              $6,
              $7::text[],
              $8::uuid,
              $9::jsonb,
              NOW(),
              NOW()
            )
            ON CONFLICT (chunk_id) DO UPDATE SET
              content = EXCLUDED.content,
              embedding = EXCLUDED.embedding,
              type = EXCLUDED.type,
              section = EXCLUDED.section,
              credibility_score = EXCLUDED.credibility_score,
              keywords = EXCLUDED.keywords,
              metadata = EXCLUDED.metadata,
              updated_at = NOW()
          `,
            chunk.chunkId,
            chunk.content,
            embeddingStr,
            chunk.type,
            chunk.section || null,
            chunk.credibilityScore,
            keywordsArray,
            fileId,
            chunk.metadata ? JSON.stringify(chunk.metadata) : null
          );

          if ((i + 1) % 5 === 0) {
            console.log(`    📊 插入进度: ${i + 1}/${chunks.length}`);
          }
        }

        console.log(`  ✅ 完成: ${source.name}`);
        successCount++;

        // 延迟避免请求过快
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error: any) {
        console.error(`  ❌ 处理失败: ${error.message}`);
        failCount++;
      }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ 索引完成！`);
    console.log(`   成功: ${successCount} 个来源`);
    console.log(`   失败: ${failCount} 个来源`);
    console.log('='.repeat(60));

  } catch (error: any) {
    console.error('❌ 索引失败:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 运行
indexOfficialSources().catch(console.error);
