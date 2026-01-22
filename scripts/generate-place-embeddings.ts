#!/usr/bin/env tsx
/**
 * 通用 Place Embedding 生成脚本
 * 
 * 为 Place 表中的记录生成向量数据（embedding），支持按国家、城市筛选
 * 
 * 使用方法：
 *   # 处理所有地点
 *   tsx scripts/generate-place-embeddings.ts
 * 
 *   # 处理指定国家的地点
 *   tsx scripts/generate-place-embeddings.ts --country=IS
 *   tsx scripts/generate-place-embeddings.ts --country=JP
 * 
 *   # 处理指定城市的地点
 *   tsx scripts/generate-place-embeddings.ts --city=Reykjavik
 *   tsx scripts/generate-place-embeddings.ts --city=Tokyo
 * 
 *   # 组合使用
 *   tsx scripts/generate-place-embeddings.ts --country=JP --city=Tokyo
 * 
 *   # 强制重新生成（覆盖已有 embedding）
 *   tsx scripts/generate-place-embeddings.ts --country=IS --force
 * 
 *   # 调整批量大小和延迟
 *   tsx scripts/generate-place-embeddings.ts --country=IS --batch=20 --delay=200
 * 
 *   # 只显示统计信息，不执行生成
 *   tsx scripts/generate-place-embeddings.ts --country=IS --dry-run
 * 
 * 环境变量：
 *   BATCH_SIZE - 批量大小（默认 10）
 *   DELAY_MS - 批次间延迟毫秒数（默认 100）
 */

import { PrismaClient, Prisma } from '@prisma/client';
import axios, { AxiosInstance } from 'axios';
import https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';
import dns from 'node:dns';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

const prisma = new PrismaClient();

// 强制 IPv4 优先
dns.setDefaultResultOrder('ipv4first');

/**
 * 简化的 Embedding 服务（不依赖 NestJS）
 */
class SimpleEmbeddingService {
  private readonly provider: string;
  private readonly openaiApiKey: string;
  private readonly openaiBaseUrl: string;
  private readonly httpClient: AxiosInstance;

  constructor() {
    this.provider = process.env.EMBEDDING_PROVIDER || 'openai';
    this.openaiApiKey = process.env.OPENAI_API_KEY || '';
    this.openaiBaseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    
    if (!this.openaiApiKey) {
      console.warn('⚠️ OPENAI_API_KEY 未配置，embedding 生成将失败');
    }

    // 检查代理配置
    const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || 
                     process.env.ALL_PROXY || process.env.all_proxy;

    // 创建 HTTPS Agent
    let httpsAgent: https.Agent | HttpsProxyAgent<string>;
    if (proxyUrl) {
      console.log(`  使用代理: ${proxyUrl}`);
      httpsAgent = new HttpsProxyAgent<string>(proxyUrl);
    } else {
      httpsAgent = new https.Agent({
        keepAlive: true,
        timeout: 60000,
        family: 4, // 强制 IPv4
      });
    }

    // 创建 HTTP 客户端
    this.httpClient = axios.create({
      baseURL: this.openaiBaseUrl,
      timeout: 60000,
      proxy: false, // 禁用 axios 自带的代理处理
      httpsAgent,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (!text || text.trim().length === 0) {
      throw new Error('文本不能为空');
    }

    try {
      const response = await this.httpClient.post(
        '/embeddings',
        {
          model: 'text-embedding-3-small',
          input: text,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
          },
        }
      );

      if (response.data?.data?.[0]?.embedding) {
        return response.data.data[0].embedding;
      }

      throw new Error('OpenAI API 返回格式错误');
    } catch (error: any) {
      if (error.response) {
        throw new Error(`OpenAI API 错误 (${error.response.status}): ${error.response.data?.error?.message || '未知错误'}`);
      }
      throw error;
    }
  }

  getEmbeddingDimension(): number {
    return 1536; // text-embedding-3-small 的维度
  }
}

// 命令行参数接口
interface CliOptions {
  country?: string;      // 国家代码（如 IS, JP, CN）
  city?: string;         // 城市名称
  force?: boolean;       // 强制重新生成
  batch?: number;        // 批量大小
  delay?: number;        // 批次间延迟（毫秒）
  dryRun?: boolean;      // 只显示统计，不执行
  limit?: number;        // 最大处理数量
}

/**
 * 解析命令行参数
 */
function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {};

  for (const arg of args) {
    if (arg.startsWith('--country=')) {
      options.country = arg.split('=')[1].toUpperCase();
    } else if (arg.startsWith('--city=')) {
      options.city = arg.split('=')[1];
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg.startsWith('--batch=')) {
      options.batch = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--delay=')) {
      options.delay = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg.startsWith('--limit=')) {
      options.limit = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

/**
 * 打印帮助信息
 */
function printHelp() {
  console.log(`
通用 Place Embedding 生成脚本

用法：
  tsx scripts/generate-place-embeddings.ts [选项]

选项：
  --country=CODE    指定国家代码（如 IS, JP, CN, US）
  --city=NAME       指定城市名称（支持中文或英文）
  --force           强制重新生成（覆盖已有 embedding）
  --batch=N         批量大小（默认 10）
  --delay=MS        批次间延迟毫秒数（默认 100）
  --limit=N         最大处理数量
  --dry-run         只显示统计信息，不执行生成
  --help, -h        显示帮助信息

示例：
  # 处理所有地点
  tsx scripts/generate-place-embeddings.ts

  # 处理冰岛的地点
  tsx scripts/generate-place-embeddings.ts --country=IS

  # 处理日本东京的地点
  tsx scripts/generate-place-embeddings.ts --country=JP --city=Tokyo

  # 强制重新生成，限制处理 100 个
  tsx scripts/generate-place-embeddings.ts --country=IS --force --limit=100

  # 预览模式，只显示统计
  tsx scripts/generate-place-embeddings.ts --country=IS --dry-run
`);
}

/**
 * 构建 Place 的搜索文本（与 PlacesService.buildSearchText 保持一致）
 */
function buildSearchText(place: {
  nameCN: string;
  nameEN?: string | null;
  address?: string | null;
  description?: string | null;
  metadata?: any;
}): string {
  const parts: string[] = [];

  // 名称
  if (place.nameCN) parts.push(place.nameCN);
  if (place.nameEN) parts.push(place.nameEN);

  // 地址
  if (place.address) parts.push(place.address);

  // 描述
  if (place.description) parts.push(place.description);

  // 从 metadata 中提取
  const metadata = place.metadata as any;
  if (metadata?.description) parts.push(metadata.description);
  
  if (metadata?.tags) {
    if (Array.isArray(metadata.tags)) {
      parts.push(metadata.tags.join(' '));
    }
  }
  
  if (metadata?.reviews) {
    // 提取前3条评论的关键词
    const reviews = Array.isArray(metadata.reviews) ? metadata.reviews.slice(0, 3) : [];
    reviews.forEach((review: any) => {
      if (review.text) {
        // 只提取评论的前100个字符，避免文本过长
        parts.push(review.text.substring(0, 100));
      }
    });
  }

  // 地区相关字段
  if (metadata?.regionKey) {
    parts.push(metadata.regionKey);
  }

  if (metadata?.canonicalType) {
    parts.push(metadata.canonicalType);
  }

  return parts.join(' ');
}

/**
 * 为单个 Place 生成并更新 embedding
 */
async function generatePlaceEmbedding(
  placeId: number,
  place: {
    nameCN: string;
    nameEN?: string | null;
    address?: string | null;
    description?: string | null;
    metadata?: any;
  },
  embeddingService: SimpleEmbeddingService
): Promise<{ success: boolean; error?: string }> {
  try {
    // 构建搜索文本
    const searchText = buildSearchText(place);

    if (!searchText || searchText.trim().length === 0) {
      return {
        success: false,
        error: '没有可用的文本内容',
      };
    }

    // 生成 embedding
    const embedding = await embeddingService.generateEmbedding(searchText);

    // 检查是否为降级后的零向量
    const isZeroVector = embedding.every(v => v === 0);
    if (isZeroVector) {
      return {
        success: false,
        error: 'embedding 生成失败（零向量）',
      };
    }

    // 更新数据库
    const embeddingStr = `[${embedding.join(',')}]`;
    await prisma.$executeRawUnsafe(
      `UPDATE "Place" SET embedding = $1::vector WHERE id = $2`,
      embeddingStr,
      placeId
    );

    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || String(error),
    };
  }
}

/**
 * 批量处理 Place embeddings（带进度显示和错误处理）
 */
async function generateEmbeddingsBatch(
  places: Array<{
    id: number;
    nameCN: string;
    nameEN?: string | null;
    address?: string | null;
    description?: string | null;
    metadata?: any;
  }>,
  embeddingService: SimpleEmbeddingService,
  options: { batchSize: number; delayMs: number; force: boolean }
): Promise<{
  total: number;
  success: number;
  failed: number;
  skipped: number;
  errors: Array<{ placeId: number; name: string; error: string }>;
}> {
  const { batchSize, delayMs, force } = options;
  let success = 0;
  let failed = 0;
  let skipped = 0;
  const errors: Array<{ placeId: number; name: string; error: string }> = [];

  console.log(`\n开始批量生成 embedding，共 ${places.length} 个 Place`);
  console.log(`批量大小: ${batchSize}, 延迟: ${delayMs}ms, 强制模式: ${force ? '是' : '否'}\n`);

  // 分批处理
  for (let i = 0; i < places.length; i += batchSize) {
    const batch = places.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(places.length / batchSize);

    console.log(`处理批次 ${batchNum}/${totalBatches} (${batch.length} 个 Place)...`);

    // 并发处理当前批次
    await Promise.all(
      batch.map(async (place) => {
        // 如果不是强制模式，检查是否已有有效 embedding
        if (!force) {
          const existingPlace = await prisma.$queryRawUnsafe<Array<{ embedding_text: string | null }>>(
            `SELECT embedding::text as embedding_text FROM "Place" WHERE id = $1`,
            place.id
          );

          const embeddingStr = existingPlace[0]?.embedding_text;
          if (embeddingStr) {
            // 检查是否是零向量
            const embeddingArray = embeddingStr.match(/\[(.*?)\]/)?.[1];
            if (embeddingArray) {
              const values = embeddingArray.split(',').map((v: string) => parseFloat(v.trim()));
              const isZeroVector = values.every((v: number) => v === 0 || isNaN(v));
              if (!isZeroVector) {
                console.log(`  ⏭️  Place ${place.id} (${place.nameCN}) 已有有效 embedding，跳过`);
                skipped++;
                return;
              }
            }
          }
        }

        const result = await generatePlaceEmbedding(place.id, place, embeddingService);
        
        if (result.success) {
          console.log(`  ✓ Place ${place.id} (${place.nameCN}): 成功`);
          success++;
        } else {
          console.log(`  ✗ Place ${place.id} (${place.nameCN}): 失败 - ${result.error}`);
          failed++;
          errors.push({
            placeId: place.id,
            name: place.nameCN,
            error: result.error || '未知错误',
          });
        }
      })
    );

    // 批次间延迟，避免 API 限流
    if (i + batchSize < places.length) {
      console.log(`  等待 ${delayMs}ms...\n`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return {
    total: places.length,
    success,
    failed,
    skipped,
    errors,
  };
}

/**
 * 构建查询条件
 */
function buildWhereClause(options: CliOptions, includeEmbeddingCheck: boolean): Prisma.Sql {
  const conditions: Prisma.Sql[] = [];

  // 国家过滤
  if (options.country) {
    conditions.push(Prisma.sql`c."countryCode" = ${options.country}`);
  }

  // 城市过滤（支持中文名或英文名）
  if (options.city) {
    conditions.push(Prisma.sql`(c."nameCN" ILIKE ${`%${options.city}%`} OR c."nameEN" ILIKE ${`%${options.city}%`})`);
  }

  // 如果不是强制模式，只查询没有 embedding 或 embedding 为零向量的记录
  if (includeEmbeddingCheck && !options.force) {
    conditions.push(Prisma.sql`(
      p.embedding IS NULL 
      OR p.embedding::text LIKE '[0,0,0%'
      OR array_length(string_to_array(trim(both '[]' from p.embedding::text), ','), 1) IS NULL
    )`);
  }

  if (conditions.length === 0) {
    return Prisma.sql`WHERE 1=1`;
  }

  return Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;
}

/**
 * 主函数
 */
async function main() {
  const options = parseArgs();
  
  // 显示标题
  let title = '通用 Place Embedding 生成脚本';
  if (options.country) {
    title = `${options.country} Place Embedding 生成脚本`;
  }
  if (options.city) {
    title += ` (${options.city})`;
  }
  
  console.log(`=== ${title} ===\n`);

  // 显示选项
  console.log('运行选项:');
  console.log(`  国家: ${options.country || '全部'}`);
  console.log(`  城市: ${options.city || '全部'}`);
  console.log(`  强制模式: ${options.force ? '是' : '否'}`);
  console.log(`  批量大小: ${options.batch || 10}`);
  console.log(`  延迟: ${options.delay || 100}ms`);
  console.log(`  最大数量: ${options.limit || '无限制'}`);
  console.log(`  预览模式: ${options.dryRun ? '是' : '否'}\n`);

  let embeddingService: SimpleEmbeddingService | null = null;

  try {
    // 1. 初始化 Embedding 服务
    console.log('初始化 Embedding 服务...');
    embeddingService = new SimpleEmbeddingService();
    console.log('✓ Embedding 服务初始化完成\n');

    // 2. 查询总数统计
    console.log('查询 Place 统计信息...');
    
    const totalWhereClause = buildWhereClause(options, false);
    const totalCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM "Place" p
      LEFT JOIN "City" c ON p."cityId" = c.id
      ${totalWhereClause}
    `;
    console.log(`  符合条件的 Place 总数: ${totalCount[0]?.count || 0}`);

    // 3. 查询需要处理的 Place
    const whereClause = buildWhereClause(options, true);
    let limitClause = Prisma.sql``;
    if (options.limit) {
      limitClause = Prisma.sql`LIMIT ${options.limit}`;
    }

    const places = await prisma.$queryRaw<Array<{
      id: number;
      nameCN: string;
      nameEN: string | null;
      address: string | null;
      description: string | null;
      metadata: any;
      cityName: string | null;
      countryCode: string | null;
    }>>`
      SELECT 
        p.id,
        p."nameCN",
        p."nameEN",
        p.address,
        p.description,
        p.metadata,
        c."nameCN" as "cityName",
        c."countryCode"
      FROM "Place" p
      LEFT JOIN "City" c ON p."cityId" = c.id
      ${whereClause}
      ORDER BY p.id
      ${limitClause}
    `;

    console.log(`  需要处理的 Place 数量: ${places.length}\n`);

    if (places.length === 0) {
      console.log('✓ 所有 Place 都已具备 embedding，无需处理。');
      return;
    }

    // 4. 显示统计信息
    console.log('数据统计:');
    const withNameEN = places.filter(p => p.nameEN).length;
    const withAddress = places.filter(p => p.address).length;
    const withDescription = places.filter(p => p.description).length;
    const withMetadata = places.filter(p => p.metadata).length;
    
    // 按国家统计
    const byCountry = places.reduce((acc, p) => {
      const code = p.countryCode || 'Unknown';
      acc[code] = (acc[code] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log(`  - 有英文名称: ${withNameEN} (${(withNameEN / places.length * 100).toFixed(1)}%)`);
    console.log(`  - 有地址: ${withAddress} (${(withAddress / places.length * 100).toFixed(1)}%)`);
    console.log(`  - 有描述: ${withDescription} (${(withDescription / places.length * 100).toFixed(1)}%)`);
    console.log(`  - 有元数据: ${withMetadata} (${(withMetadata / places.length * 100).toFixed(1)}%)`);
    
    console.log('\n  按国家分布:');
    Object.entries(byCountry)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([code, count]) => {
        console.log(`    ${code}: ${count} (${(count / places.length * 100).toFixed(1)}%)`);
      });

    // 5. 如果是预览模式，到此结束
    if (options.dryRun) {
      console.log('\n✓ 预览模式，不执行生成操作。');
      return;
    }

    // 6. 批量生成 embedding
    const batchSize = options.batch || parseInt(process.env.BATCH_SIZE || '10', 10);
    const delayMs = options.delay || parseInt(process.env.DELAY_MS || '100', 10);

    const results = await generateEmbeddingsBatch(
      places,
      embeddingService,
      { batchSize, delayMs, force: options.force || false }
    );

    // 7. 显示结果统计
    console.log('\n=== 处理完成 ===');
    console.log(`总计: ${results.total}`);
    console.log(`成功: ${results.success} (${(results.success / results.total * 100).toFixed(1)}%)`);
    console.log(`失败: ${results.failed} (${(results.failed / results.total * 100).toFixed(1)}%)`);
    console.log(`跳过: ${results.skipped} (${(results.skipped / results.total * 100).toFixed(1)}%)`);

    if (results.errors.length > 0) {
      console.log('\n失败详情（前 10 个）:');
      results.errors.slice(0, 10).forEach(err => {
        console.log(`  - Place ${err.placeId} (${err.name}): ${err.error}`);
      });
      if (results.errors.length > 10) {
        console.log(`  ... 还有 ${results.errors.length - 10} 个错误`);
      }
    }

  } catch (error: any) {
    console.error('\n❌ 脚本执行失败:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    // 清理资源
    await prisma.$disconnect();
  }
}

// 运行脚本
if (require.main === module) {
  main().catch(error => {
    console.error('未处理的错误:', error);
    process.exit(1);
  });
}

export { main };
