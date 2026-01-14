/**
 * 为冰岛所有城市的 Place 生成向量数据（embedding）
 * 
 * 用途：
 * - 批量生成冰岛所有 Place 记录的 embedding
 * - 提升向量搜索的准确性和覆盖率
 * 
 * 使用方法：
 *   tsx scripts/generate-iceland-place-embeddings.ts
 * 
 * 或使用 npm script：
 *   npm run script:generate-iceland-embeddings
 */

import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { EmbeddingService } from '../src/places/services/embedding.service';

const prisma = new PrismaClient();

/**
 * 构建 Place 的搜索文本（与 PlacesService.buildSearchText 保持一致）
 */
function buildSearchText(place: {
  nameCN: string;
  nameEN?: string | null;
  address?: string | null;
  metadata?: any;
}): string {
  const parts: string[] = [];

  // 名称
  if (place.nameCN) parts.push(place.nameCN);
  if (place.nameEN) parts.push(place.nameEN);

  // 地址
  if (place.address) parts.push(place.address);

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

  // 冰岛特有的字段
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
    metadata?: any;
  },
  embeddingService: EmbeddingService,
  batchSize: number = 1
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
    metadata?: any;
  }>,
  embeddingService: EmbeddingService,
  batchSize: number = 10,
  delayMs: number = 100
): Promise<{
  total: number;
  success: number;
  failed: number;
  skipped: number;
  errors: Array<{ placeId: number; name: string; error: string }>;
}> {
  let success = 0;
  let failed = 0;
  let skipped = 0;
  const errors: Array<{ placeId: number; name: string; error: string }> = [];

  console.log(`\n开始批量生成 embedding，共 ${places.length} 个 Place`);
  console.log(`批量大小: ${batchSize}, 延迟: ${delayMs}ms\n`);

  // 分批处理
  for (let i = 0; i < places.length; i += batchSize) {
    const batch = places.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(places.length / batchSize);

    console.log(`处理批次 ${batchNum}/${totalBatches} (${batch.length} 个 Place)...`);

    // 并发处理当前批次
    const results = await Promise.all(
      batch.map(async (place) => {
        // 检查是否已有有效 embedding（不是 NULL 也不是零向量）
        const existingPlace = await prisma.$queryRawUnsafe<Array<{ embedding: any }>>(
          `SELECT embedding FROM "Place" WHERE id = $1`,
          place.id
        );

        const embeddingStr = existingPlace[0]?.embedding;
        if (embeddingStr) {
          // 检查是否是零向量（通常零向量会以 [0,0,0...] 开头）
          const embeddingArray = embeddingStr.match(/\[(.*?)\]/)?.[1];
          if (embeddingArray) {
            const values = embeddingArray.split(',').map(v => parseFloat(v.trim()));
            const isZeroVector = values.every(v => v === 0 || isNaN(v));
            if (!isZeroVector) {
              console.log(`  Place ${place.id} (${place.nameCN}) 已有有效 embedding，跳过`);
              skipped++;
              return { placeId: place.id, success: true, skipped: true };
            }
          }
        }

        const result = await generatePlaceEmbedding(place.id, place, embeddingService, batchSize);
        
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

        return { placeId: place.id, success: result.success, skipped: false };
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
 * 主函数
 */
async function main() {
  console.log('=== 冰岛 Place Embedding 生成脚本 ===\n');

  let app;
  let embeddingService: EmbeddingService | null = null;

  try {
    // 1. 初始化 NestJS 应用（用于获取 EmbeddingService）
    console.log('初始化 NestJS 应用...');
    console.log('（这可能需要几秒钟，请耐心等待）\n');
    // 使用更简洁的日志配置，只输出错误和警告
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error', 'warn'], // 只输出错误和警告
    });
    
    // 添加进度指示
    process.stdout.write('  正在加载模块...\r');

    embeddingService = app.get(EmbeddingService);
    if (!embeddingService) {
      throw new Error('EmbeddingService 未找到');
    }

    console.log('✓ NestJS 应用初始化完成\n');

    // 2. 查询冰岛所有城市的 Place
    console.log('查询冰岛所有城市的 Place...');
    
    // 先查询符合条件的 Place 总数
    const totalCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM "Place" p
      INNER JOIN "City" c ON p."cityId" = c.id
      WHERE c."countryCode" = 'IS'
    `;
    console.log(`  冰岛 Place 总数: ${totalCount[0]?.count || 0}`);

    // 查询需要生成 embedding 的 Place
    const icelandPlaces = await prisma.$queryRaw<Array<{
      id: number;
      nameCN: string;
      nameEN: string | null;
      address: string | null;
      metadata: any;
    }>>`
      SELECT 
        p.id,
        p."nameCN",
        p."nameEN",
        p.address,
        p.metadata
      FROM "Place" p
      INNER JOIN "City" c ON p."cityId" = c.id
      WHERE c."countryCode" = 'IS'
        AND (p.embedding IS NULL 
             OR p.embedding::text LIKE '[0,0,0%'
             OR array_length(string_to_array(trim(both '[]' from p.embedding::text), ','), 1) IS NULL)
      ORDER BY p.id
    `;

    console.log(`✓ 找到 ${icelandPlaces.length} 个需要生成 embedding 的 Place\n`);

    if (icelandPlaces.length === 0) {
      console.log('所有 Place 都已具备 embedding，无需处理。');
      return;
    }

    // 3. 显示统计信息
    console.log('统计信息:');
    const withNameEN = icelandPlaces.filter(p => p.nameEN).length;
    const withAddress = icelandPlaces.filter(p => p.address).length;
    const withMetadata = icelandPlaces.filter(p => p.metadata).length;
    console.log(`  - 有英文名称: ${withNameEN} (${(withNameEN / icelandPlaces.length * 100).toFixed(1)}%)`);
    console.log(`  - 有地址: ${withAddress} (${(withAddress / icelandPlaces.length * 100).toFixed(1)}%)`);
    console.log(`  - 有元数据: ${withMetadata} (${(withMetadata / icelandPlaces.length * 100).toFixed(1)}%)\n`);

    // 4. 批量生成 embedding
    const batchSize = parseInt(process.env.BATCH_SIZE || '10', 10);
    const delayMs = parseInt(process.env.DELAY_MS || '100', 10);

    const results = await generateEmbeddingsBatch(
      icelandPlaces,
      embeddingService,
      batchSize,
      delayMs
    );

    // 5. 显示结果统计
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
    if (app) {
      await app.close();
    }
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
