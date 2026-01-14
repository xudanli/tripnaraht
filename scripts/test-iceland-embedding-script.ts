/**
 * 测试脚本：快速验证冰岛 Place embedding 生成脚本的核心功能
 */

import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { EmbeddingService } from '../src/places/services/embedding.service';

const prisma = new PrismaClient();

async function main() {
  console.log('=== 冰岛 Place Embedding 生成脚本 - 测试模式 ===\n');

  let app;
  let embeddingService: EmbeddingService | null = null;

  try {
    // 1. 初始化 NestJS 应用
    console.log('步骤 1/5: 初始化 NestJS 应用...');
    const startTime = Date.now();
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
    });
    console.log(`  ✓ 完成 (耗时: ${Date.now() - startTime}ms)\n`);

    // 2. 获取 EmbeddingService
    console.log('步骤 2/5: 获取 EmbeddingService...');
    embeddingService = app.get(EmbeddingService);
    if (!embeddingService) {
      throw new Error('EmbeddingService 未找到');
    }
    console.log('  ✓ EmbeddingService 获取成功\n');

    // 3. 查询数据库
    console.log('步骤 3/5: 查询冰岛 Place 数据...');
    const totalCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM "Place" p
      INNER JOIN "City" c ON p."cityId" = c.id
      WHERE c."countryCode" = 'IS'
    `;
    const total = Number(totalCount[0]?.count || 0);
    console.log(`  ✓ 冰岛 Place 总数: ${total}\n`);

    const needEmbeddingCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM "Place" p
      INNER JOIN "City" c ON p."cityId" = c.id
      WHERE c."countryCode" = 'IS'
        AND p.embedding IS NULL
    `;
    const needCount = Number(needEmbeddingCount[0]?.count || 0);
    console.log(`  ✓ 需要生成 embedding: ${needCount}\n`);

    if (needCount === 0) {
      console.log('所有 Place 都已具备 embedding，无需处理。');
      return;
    }

    // 4. 测试生成一个 embedding
    console.log('步骤 4/5: 测试生成单个 embedding...');
    const testPlace = await prisma.$queryRaw<Array<{
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
        AND p.embedding IS NULL
      LIMIT 1
    `;

    if (testPlace.length === 0) {
      console.log('  ⚠️ 没有找到需要处理的 Place');
      return;
    }

    const place = testPlace[0];
    console.log(`  测试 Place: ID=${place.id}, 名称=${place.nameCN}`);

    // 构建搜索文本
    const parts: string[] = [];
    if (place.nameCN) parts.push(place.nameCN);
    if (place.nameEN) parts.push(place.nameEN);
    if (place.address) parts.push(place.address);
    const searchText = parts.join(' ');

    if (!searchText || searchText.trim().length === 0) {
      console.log('  ⚠️ Place 没有可用的文本内容，跳过');
    } else {
      console.log(`  搜索文本: "${searchText.substring(0, 50)}..."`);
      
      try {
        const embedding = await embeddingService.generateEmbedding(searchText);
        const isZeroVector = embedding.every(v => v === 0);
        
        if (isZeroVector) {
          console.log('  ✗ embedding 生成失败（零向量）');
        } else {
          console.log(`  ✓ embedding 生成成功 (维度: ${embedding.length})`);
          console.log(`    前 5 个值: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);
        }
      } catch (error: any) {
        console.log(`  ✗ embedding 生成失败: ${error.message}`);
      }
    }

    console.log('\n步骤 5/5: 脚本测试完成');
    console.log('\n如果上述测试成功，可以运行完整脚本:');
    console.log('  npx tsx scripts/generate-iceland-place-embeddings.ts');

  } catch (error: any) {
    console.error('\n❌ 脚本执行失败:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    if (app) {
      await app.close();
    }
    await prisma.$disconnect();
  }
}

main();
