// scripts/generate-place-embeddings.ts
/**
 * 为 Place 数据批量生成 embedding
 * 
 * 运行方式: npm run generate:embeddings
 * 或: ts-node --project tsconfig.backend.json scripts/generate-place-embeddings.ts
 */

import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { EmbeddingService } from '../src/places/services/embedding.service';

/**
 * 构建搜索文本
 */
function buildSearchText(place: any): string {
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

  return parts.join(' ');
}

async function generateEmbeddings() {
  const prisma = new PrismaClient();
  
  // 创建 NestJS 应用上下文以使用 EmbeddingService
  const app = await NestFactory.createApplicationContext(AppModule);
  const embeddingService = app.get(EmbeddingService);
  const configService = app.get(ConfigService);

  try {
    console.log('开始批量生成 Place embedding...\n');

    // 检查 embedding 服务是否可用
    // 直接从环境变量读取，避免 ConfigService 读取到无效值
    const provider = process.env.EMBEDDING_PROVIDER || configService.get<string>('EMBEDDING_PROVIDER') || 'openai';
    const apiKeyEnvName = provider === 'openai' ? 'OPENAI_API_KEY' : 'HUGGINGFACE_API_KEY';
    let apiKey = process.env[apiKeyEnvName] || configService.get<string>(apiKeyEnvName);

    // 清理 API Key（移除可能的 "your_api_key" 或无效值）
    if (apiKey && (apiKey.includes('your_api_key') || apiKey.length < 20)) {
      // 尝试从所有环境变量中找到有效的 key
      const allKeys = Object.keys(process.env).filter(k => k.includes('OPENAI') || k.includes('HUGGINGFACE'));
      for (const key of allKeys) {
        const value = process.env[key];
        if (value && !value.includes('your_api_key') && value.length >= 20) {
          apiKey = value;
          console.log(`✅ 从环境变量 ${key} 读取 API Key`);
          break;
        }
      }
    }

    if (!apiKey || apiKey.includes('your_api_key') || apiKey.length < 20) {
      console.error(`❌ ${provider.toUpperCase()} API Key 未配置或无效`);
      console.error('请在 .env 文件中配置有效的 API Key:');
      if (provider === 'openai') {
        console.error('  OPENAI_API_KEY=sk-proj-...');
      } else {
        console.error('  HUGGINGFACE_API_KEY=hf_...');
      }
      process.exit(1);
    }

    console.log(`✅ 使用 ${provider.toUpperCase()} 作为 embedding 提供商\n`);

    // 1. 查询所有没有 embedding 的 Place（使用原始 SQL，因为 embedding 是 Unsupported 类型）
    const placesWithoutEmbedding = await prisma.$queryRaw<Array<{
      id: number;
      nameCN: string;
      nameEN: string | null;
      address: string | null;
      metadata: any;
    }>>`
      SELECT 
        id,
        "nameCN",
        "nameEN",
        address,
        metadata
      FROM "Place"
      WHERE embedding IS NULL
      ORDER BY id
    `;

    console.log(`找到 ${placesWithoutEmbedding.length} 个需要生成 embedding 的地点\n`);

    if (placesWithoutEmbedding.length === 0) {
      console.log('✅ 所有地点都已生成 embedding');
      return;
    }

    // 2. 批量生成 embedding
    const batchSize = 10; // 每批处理10个
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < placesWithoutEmbedding.length; i += batchSize) {
      const batch = placesWithoutEmbedding.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(placesWithoutEmbedding.length / batchSize);

      console.log(`处理批次 ${batchNumber}/${totalBatches} (${batch.length} 个地点)...`);

      for (const place of batch) {
        try {
          // 构建搜索文本
          const searchText = buildSearchText(place);
          
          if (!searchText || searchText.trim().length === 0) {
            console.log(`  ⚠️  Place ${place.id} (${place.nameCN}) 没有可用的文本，跳过`);
            continue;
          }

          // 生成 embedding
          const embedding = await embeddingService.generateEmbedding(searchText);

          // 更新数据库
          // 注意：Prisma 不支持直接更新 vector 类型，需要使用原始 SQL
          // 将 embedding 数组转换为 PostgreSQL vector 格式字符串
          const embeddingStr = `[${embedding.join(',')}]`;
          await prisma.$executeRawUnsafe(
            `UPDATE "Place" SET embedding = $1::vector WHERE id = $2`,
            embeddingStr,
            place.id
          );

          successCount++;
          console.log(`  ✅ Place ${place.id} (${place.nameCN}) - embedding 已生成`);
        } catch (error: any) {
          failCount++;
          const errorMsg = error.message || error.toString() || 'Unknown error';
          console.error(`  ❌ Place ${place.id} (${place.nameCN}) - 失败: ${errorMsg}`);
          if (error.response) {
            console.error(`     API 响应: ${JSON.stringify(error.response.data)}`);
          }
        }

        // 延迟以避免 API 限流
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // 批次间延迟
      if (i + batchSize < placesWithoutEmbedding.length) {
        console.log('  等待 1 秒后继续下一批次...\n');
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    console.log('\n✅ 批量生成完成！');
    console.log(`  - 成功: ${successCount}`);
    console.log(`  - 失败: ${failCount}`);
    console.log(`  - 总计: ${placesWithoutEmbedding.length}`);

    // 3. 验证结果
    const placesWithEmbedding = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM "Place" WHERE embedding IS NOT NULL;
    `;

    console.log(`\n当前统计:`);
    console.log(`  - 已有 embedding 的地点: ${placesWithEmbedding[0]?.count || 0}`);
  } catch (error: any) {
    console.error('❌ 批量生成失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await app.close();
  }
}

generateEmbeddings();

