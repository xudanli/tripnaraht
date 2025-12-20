/**
 * 为指定的Place ID生成embedding
 * 
 * 使用方法：
 * npx ts-node --project tsconfig.backend.json scripts/generate-embeddings-for-ids.ts 28838 28839 28840 28841
 */

import { PrismaClient, Prisma } from '@prisma/client';
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
  
  if (metadata?.aliases) {
    if (Array.isArray(metadata.aliases)) {
      parts.push(metadata.aliases.join(' '));
    }
  }

  return parts.join(' ');
}

async function generateEmbeddingsForIds(placeIds: number[]) {
  const prisma = new PrismaClient();
  
  // 创建 NestJS 应用上下文以使用 EmbeddingService
  const app = await NestFactory.createApplicationContext(AppModule);
  const embeddingService = app.get(EmbeddingService);
  const configService = app.get(ConfigService);

  try {
    console.log(`开始为 ${placeIds.length} 个Place生成embedding...\n`);

    // 检查 embedding 服务是否可用
    const provider = process.env.EMBEDDING_PROVIDER || configService.get<string>('EMBEDDING_PROVIDER') || 'openai';
    const apiKeyEnvName = provider === 'openai' ? 'OPENAI_API_KEY' : 'HUGGINGFACE_API_KEY';
    let apiKey = process.env[apiKeyEnvName] || configService.get<string>(apiKeyEnvName);

    if (!apiKey || apiKey.includes('your_api_key') || apiKey.length < 20) {
      console.error(`❌ ${provider.toUpperCase()} API Key 未配置或无效`);
      process.exit(1);
    }

    console.log(`✅ 使用 ${provider.toUpperCase()} 作为 embedding 提供商\n`);

    // 查询指定的Place
    // 使用Prisma.sql来正确格式化IN子句
    const placeIdSqls = placeIds.map(id => Prisma.sql`${id}`);
    const places = await prisma.$queryRaw<Array<{
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
      WHERE id IN (${Prisma.join(placeIdSqls, ',')})
    `;

    console.log(`找到 ${places.length} 个Place\n`);

    if (places.length === 0) {
      console.log('❌ 未找到指定的Place');
      return;
    }

    // 生成embedding
    let successCount = 0;
    let failCount = 0;

    for (const place of places) {
      try {
        // 构建搜索文本
        const searchText = buildSearchText(place);
        
        if (!searchText || searchText.trim().length === 0) {
          console.log(`  ⚠️  Place ${place.id} (${place.nameCN}) 没有可用的文本，跳过`);
          continue;
        }

        console.log(`  处理 Place ${place.id} (${place.nameCN})...`);
        console.log(`    搜索文本: ${searchText.substring(0, 100)}...`);

        // 生成 embedding
        const embedding = await embeddingService.generateEmbedding(searchText);

        // 更新数据库
        const embeddingStr = `[${embedding.join(',')}]`;
        await prisma.$executeRawUnsafe(
          `UPDATE "Place" SET embedding = $1::vector WHERE id = $2`,
          embeddingStr,
          place.id
        );

        successCount++;
        console.log(`  ✅ Place ${place.id} (${place.nameCN}) - embedding 已生成\n`);
      } catch (error: any) {
        failCount++;
        const errorMsg = error.message || error.toString() || 'Unknown error';
        console.error(`  ❌ Place ${place.id} (${place.nameCN}) - 失败: ${errorMsg}\n`);
        if (error.response) {
          console.error(`     API 响应: ${JSON.stringify(error.response.data)}`);
        }
      }

      // 延迟以避免 API 限流
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    console.log('\n✅ 生成完成！');
    console.log(`  - 成功: ${successCount}`);
    console.log(`  - 失败: ${failCount}`);
    console.log(`  - 总计: ${places.length}`);
  } catch (error: any) {
    console.error('❌ 生成失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await app.close();
  }
}

// 从命令行参数获取Place ID
const placeIds = process.argv.slice(2).map(id => parseInt(id, 10)).filter(id => !isNaN(id));

if (placeIds.length === 0) {
  console.error('❌ 请提供Place ID作为参数');
  console.error('使用方法: npx ts-node scripts/generate-embeddings-for-ids.ts <id1> <id2> ...');
  process.exit(1);
}

generateEmbeddingsForIds(placeIds);

