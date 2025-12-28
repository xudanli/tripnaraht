#!/usr/bin/env ts-node
/**
 * 根据其他字段反推 Place 表的 address 和 embedding
 * 
 * 功能：
 * 1. 从 metadata.rawTags 提取 address
 * 2. 从 cityId 关联的 City 信息构建 address
 * 3. 从 location 坐标和 City 信息构建 address
 * 4. 根据 nameCN、nameEN、address、metadata 等字段生成 embedding
 * 
 * 使用方法:
 *   npm run derive:place-fields -- --address      # 只反推 address
 *   npm run derive:place-fields -- --embedding    # 只生成 embedding
 *   npm run derive:place-fields -- --all           # 反推 address 和生成 embedding
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { EmbeddingService } from '../src/places/services/embedding.service';

const prisma = new PrismaClient();

/**
 * 从 metadata.rawTags 提取 address
 */
function extractAddressFromMetadata(metadata: any): string | null {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }

  const rawTags = metadata.rawTags || metadata;
  
  // 优先级：addr:full > address > addr:street + addr:city > addr:city
  if (rawTags['addr:full']) {
    return rawTags['addr:full'];
  }
  if (rawTags.address) {
    return rawTags.address;
  }
  
  // 组合街道和城市
  const street = rawTags['addr:street'];
  const city = rawTags['addr:city'];
  if (street && city) {
    return `${street}, ${city}`;
  }
  if (street) {
    return street;
  }
  if (city) {
    return city;
  }

  // 尝试其他可能的地址字段
  if (rawTags['addr:street:en']) {
    return rawTags['addr:street:en'];
  }
  if (rawTags['addr:city:en']) {
    return rawTags['addr:city:en'];
  }

  return null;
}

/**
 * 从 City 信息构建 address
 */
function buildAddressFromCity(city: { name: string; nameCN?: string | null; nameEN?: string | null }): string | null {
  // 优先使用中文名称，其次英文名称
  return city.nameCN || city.nameEN || city.name || null;
}

/**
 * 从 location 和 City 信息构建 address
 */
function buildAddressFromLocationAndCity(
  lat: number,
  lng: number,
  city: { name: string; nameCN?: string | null; nameEN?: string | null } | null
): string | null {
  if (!city) {
    return null;
  }
  
  // 构建简单的地址：城市名 + 坐标（作为后备）
  const cityName = city.nameCN || city.nameEN || city.name;
  return `${cityName} (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
}

/**
 * 构建用于生成 embedding 的搜索文本
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
  
  // 从 rawTags 中提取一些有用的信息
  if (metadata?.rawTags) {
    const rawTags = metadata.rawTags;
    // 提取类别信息
    if (rawTags.tourism) parts.push(rawTags.tourism);
    if (rawTags.amenity) parts.push(rawTags.amenity);
    if (rawTags.shop) parts.push(rawTags.shop);
    if (rawTags.natural) parts.push(rawTags.natural);
    if (rawTags.leisure) parts.push(rawTags.leisure);
    
    // 提取地区信息
    if (rawTags['addr:city']) parts.push(rawTags['addr:city']);
    if (rawTags['addr:region']) parts.push(rawTags['addr:region']);
  }
  
  // 从其他 metadata 字段提取
  if (metadata?.canonicalType) parts.push(metadata.canonicalType);
  if (metadata?.subCategory) parts.push(metadata.subCategory);
  if (metadata?.region) parts.push(metadata.region);
  
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

  return parts.join(' ').trim();
}

/**
 * 反推 address 字段
 */
async function deriveAddress() {
  console.log('🏠 开始反推 address 字段...\n');

  // 查找 address 为空的 Place
  const placesWithoutAddress = await prisma.$queryRaw<Array<{
    id: number;
    nameCN: string;
    nameEN: string | null;
    cityId: number | null;
    lat: number | null;
    lng: number | null;
    metadata: any;
    cityName: string | null;
    cityNameCN: string | null;
    cityNameEN: string | null;
  }>>`
    SELECT 
      p.id,
      p."nameCN",
      p."nameEN",
      p."cityId",
      ST_Y(p.location::geometry) as lat,
      ST_X(p.location::geometry) as lng,
      p.metadata,
      c.name as "cityName",
      c."nameCN" as "cityNameCN",
      c."nameEN" as "cityNameEN"
    FROM "Place" p
    LEFT JOIN "City" c ON p."cityId" = c.id
    WHERE (p.address IS NULL OR p.address = '')
    ORDER BY p.id
    LIMIT 10000
  `;

  console.log(`找到 ${placesWithoutAddress.length} 个需要反推 address 的 Place\n`);

  if (placesWithoutAddress.length === 0) {
    console.log('✅ 没有需要反推 address 的 Place\n');
    return { updated: 0, errors: 0 };
  }

  let updated = 0;
  let errors = 0;

  // 批量处理
  const BATCH_SIZE = 100;
  for (let i = 0; i < placesWithoutAddress.length; i += BATCH_SIZE) {
    const batch = placesWithoutAddress.slice(i, i + BATCH_SIZE);
    
    for (const place of batch) {
      try {
        let derivedAddress: string | null = null;

        // 策略 1: 从 metadata.rawTags 提取
        if (!derivedAddress) {
          derivedAddress = extractAddressFromMetadata(place.metadata);
        }

        // 策略 2: 从 cityId 关联的 City 信息构建
        if (!derivedAddress && place.cityId) {
          const city = {
            name: place.cityName || '',
            nameCN: place.cityNameCN,
            nameEN: place.cityNameEN,
          };
          derivedAddress = buildAddressFromCity(city);
        }

        // 策略 3: 从 location 和 City 信息构建（作为后备）
        if (!derivedAddress && place.lat && place.lng) {
          const city = place.cityId ? {
            name: place.cityName || '',
            nameCN: place.cityNameCN,
            nameEN: place.cityNameEN,
          } : null;
          derivedAddress = buildAddressFromLocationAndCity(place.lat, place.lng, city);
        }

        // 如果找到了地址，更新数据库
        if (derivedAddress) {
          await prisma.$executeRaw`
            UPDATE "Place"
            SET address = ${derivedAddress},
                "updatedAt" = NOW()
            WHERE id = ${place.id}
          `;
          updated++;
        }

        if ((updated + errors) % 100 === 0) {
          console.log(`  进度: ${updated + errors}/${placesWithoutAddress.length} (已更新: ${updated})`);
        }
      } catch (error: any) {
        console.error(`  ❌ 更新 Place ${place.id} 失败: ${error.message}`);
        errors++;
      }
    }
  }

  console.log(`\n✅ 反推完成: ${updated} 个已更新, ❌ 错误: ${errors} 个\n`);
  return { updated, errors };
}

/**
 * 生成 embedding
 */
async function generateEmbeddings() {
  console.log('🔢 开始生成 embedding...\n');

  // 创建 NestJS 应用上下文以使用 EmbeddingService
  const app = await NestFactory.createApplicationContext(AppModule);
  const embeddingService = app.get(EmbeddingService);
  const configService = app.get(ConfigService);

  try {
    // 检查 embedding 服务是否可用
    const provider = process.env.EMBEDDING_PROVIDER || configService.get<string>('EMBEDDING_PROVIDER') || 'openai';
    const apiKeyEnvName = provider === 'openai' ? 'OPENAI_API_KEY' : 'HUGGINGFACE_API_KEY';
    let apiKey = process.env[apiKeyEnvName] || configService.get<string>(apiKeyEnvName);

    // 清理 API Key
    if (apiKey && (apiKey.includes('your_api_key') || apiKey.length < 20)) {
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
      return { generated: 0, errors: 0 };
    }

    console.log(`✅ 使用 ${provider.toUpperCase()} 作为 embedding 提供商\n`);

    // 查询所有没有 embedding 的 Place
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
      LIMIT 10000
    `;

    console.log(`找到 ${placesWithoutEmbedding.length} 个需要生成 embedding 的 Place\n`);

    if (placesWithoutEmbedding.length === 0) {
      console.log('✅ 所有 Place 都已生成 embedding\n');
      return { generated: 0, errors: 0 };
    }

    // 批量生成 embedding
    const batchSize = 10; // 每批处理10个
    let generated = 0;
    let errors = 0;

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
          const embeddingStr = `[${embedding.join(',')}]`;
          await prisma.$executeRawUnsafe(
            `UPDATE "Place" SET embedding = $1::vector, "updatedAt" = NOW() WHERE id = $2`,
            embeddingStr,
            place.id
          );

          generated++;
          console.log(`  ✅ Place ${place.id} (${place.nameCN}) - embedding 已生成`);
        } catch (error: any) {
          errors++;
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

    console.log('\n✅ 生成完成！');
    console.log(`  - 成功: ${generated}`);
    console.log(`  - 失败: ${errors}`);
    console.log(`  - 总计: ${placesWithoutEmbedding.length}\n`);

    return { generated, errors };
  } finally {
    await app.close();
  }
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  const shouldDeriveAddress = args.includes('--address') || args.includes('--all');
  const shouldGenerateEmbedding = args.includes('--embedding') || args.includes('--all');

  if (!shouldDeriveAddress && !shouldGenerateEmbedding) {
    console.log('❌ 请指定要执行的操作:\n');
    console.log('使用方法:');
    console.log('  npm run derive:place-fields -- --address      # 只反推 address');
    console.log('  npm run derive:place-fields -- --embedding    # 只生成 embedding');
    console.log('  npm run derive:place-fields -- --all          # 反推 address 和生成 embedding');
    console.log('\n示例:');
    console.log('  npm run derive:place-fields -- --all');
    process.exit(1);
  }

  console.log('🚀 开始反推 Place 表的 address 和 embedding...\n');
  console.log('='.repeat(60) + '\n');

  try {
    if (shouldDeriveAddress) {
      await deriveAddress();
    }

    if (shouldGenerateEmbedding) {
      await generateEmbeddings();
    }

    console.log('✅ 所有操作完成！\n');
  } catch (error: any) {
    console.error('❌ 操作失败:', error.message);
    throw error;
  }
}

main()
  .catch((error) => {
    console.error('❌ 失败:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

