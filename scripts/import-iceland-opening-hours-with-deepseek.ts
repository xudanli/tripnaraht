#!/usr/bin/env tsx
/**
 * 使用DeepSeek API导入冰岛POI的开放时间数据
 * 
 * 通过DeepSeek LLM分析POI信息并提取开放时间
 * 
 * 使用方法:
 *   npm run script:import-iceland-opening-hours:deepseek
 *   或
 *   BATCH_SIZE=5 DELAY_MS=2000 MAX_PLACES=10 npm run script:import-iceland-opening-hours:deepseek
 */

import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '5', 10);
const DELAY_MS = parseInt(process.env.DELAY_MS || '2000', 10);
const MAX_PLACES = parseInt(process.env.MAX_PLACES || '0', 10); // 0表示不限制

interface OpeningHoursResult {
  openingHours?: string;
  openingHoursStructured?: {
    [day: string]: Array<{ open: string; close: string }>;
  };
  isOpenNow?: boolean;
  timezone?: string;
  notes?: string;
}

/**
 * 检查Place是否有开放时间数据
 */
function hasOpeningHours(metadata: any): boolean {
  if (!metadata) return false;
  
  // 检查新格式
  if (metadata.basic?.openingHours || metadata.basic?.openingHoursStructured) {
    return true;
  }
  
  // 检查旧格式
  if (metadata.openingHours) {
    return true;
  }
  
  return false;
}

/**
 * 使用DeepSeek API获取POI开放时间
 */
async function getOpeningHoursFromDeepSeek(
  placeName: string,
  placeNameCN: string | null,
  category: string,
  lat: number,
  lng: number
): Promise<OpeningHoursResult | null> {
  if (!DEEPSEEK_API_KEY) {
    throw new Error('DEEPSEEK_API_KEY 未配置');
  }

  const prompt = `你是一个专业的冰岛旅游信息专家。请根据以下POI信息，提供准确的开放时间信息。

POI信息:
- 名称（英文）: ${placeName}
- 名称（中文）: ${placeNameCN || 'N/A'}
- 类别: ${category}
- 坐标: ${lat}, ${lng}
- 国家: 冰岛 (Iceland)

请以JSON格式返回开放时间信息，格式如下:
{
  "openingHours": "营业时间字符串（如：09:00-18:00 或 24小时开放）",
  "openingHoursStructured": {
    "mon": [{"open": "09:00", "close": "18:00"}],
    "tue": [{"open": "09:00", "close": "18:00"}],
    "wed": [{"open": "09:00", "close": "18:00"}],
    "thu": [{"open": "09:00", "close": "18:00"}],
    "fri": [{"open": "09:00", "close": "18:00"}],
    "sat": [{"open": "10:00", "close": "16:00"}],
    "sun": [{"open": "10:00", "close": "16:00"}]
  },
  "isOpenNow": false,
  "timezone": "Atlantic/Reykjavik",
  "notes": "特殊说明（如：季节性开放、需要预约等）"
}

注意:
1. 如果是自然景点（如瀑布、火山、冰川），通常24小时开放，设置 openingHours 为 "24小时开放"
2. 如果是博物馆、游客中心等，提供具体的开放时间
3. 如果不确定，在 notes 中说明
4. 如果完全没有开放时间限制，openingHoursStructured 可以为空对象
5. 时区统一使用 "Atlantic/Reykjavik"

只返回JSON，不要包含其他文本。`;

  try {
    const response = await axios.post(
      `${DEEPSEEK_BASE_URL}/chat/completions`,
      {
        model: DEEPSEEK_MODEL,
        messages: [
          {
            role: 'system',
            content: '你是一个专业的冰岛旅游信息专家。始终以有效的 JSON 格式返回结果，不要包含任何其他文本。',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 1000,
        response_format: { type: 'json_object' },
      },
      {
        headers: {
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
        proxy: false,
      }
    );

    const content = response.data.choices?.[0]?.message?.content;
    if (!content) {
      return null;
    }

    // 解析JSON响应
    let result: OpeningHoursResult;
    try {
      result = JSON.parse(content);
    } catch (parseError) {
      // 尝试提取JSON（如果响应包含其他文本）
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        console.warn(`无法解析DeepSeek响应: ${content.substring(0, 100)}`);
        return null;
      }
    }

    return result;
  } catch (error: any) {
    if (error.response) {
      throw new Error(`DeepSeek API错误 (${error.response.status}): ${error.response.data?.error?.message || error.message}`);
    }
    throw error;
  }
}

/**
 * 提取坐标（使用SQL查询PostGIS）
 */
async function extractCoordinates(
  prisma: PrismaClient,
  placeId: number
): Promise<{ lat: number; lng: number } | null> {
  try {
    const locationResult = await prisma.$queryRaw<Array<{ lat: number; lng: number }>>`
      SELECT 
        ST_Y(location::geometry) as lat,
        ST_X(location::geometry) as lng
      FROM "Place"
      WHERE id = ${placeId} AND location IS NOT NULL
    `;
    
    if (locationResult.length > 0) {
      return {
        lat: Number(locationResult[0].lat),
        lng: Number(locationResult[0].lng),
      };
    }
  } catch (error: any) {
    console.warn(`SQL查询坐标失败: ${error.message}`);
  }

  return null;
}

/**
 * 更新Place的开放时间数据
 */
async function updatePlaceOpeningHours(
  placeId: number,
  openingHours: OpeningHoursResult
): Promise<void> {
  const place = await prisma.place.findUnique({
    where: { id: placeId },
  });

  if (!place) {
    throw new Error(`Place ${placeId} 不存在`);
  }

  const currentMetadata = (place.metadata as any) || {};
  const updatedMetadata: any = {
    ...currentMetadata,
    // 新格式（结构化）
    basic: {
      ...currentMetadata.basic,
      openingHours: openingHours.openingHours || '24小时开放',
      openingHoursStructured: openingHours.openingHoursStructured || {},
    },
    // 向后兼容格式
    openingHours: {
      isOpenNow: openingHours.isOpenNow || false,
      weekday: openingHours.openingHoursStructured || {},
      osmFormat: openingHours.openingHours || '24小时开放',
      notes: openingHours.notes,
    },
    timezone: openingHours.timezone || 'Atlantic/Reykjavik',
    lastEnrichedAt: new Date().toISOString(),
    openingHoursSource: 'deepseek_api',
    openingHoursUpdatedAt: new Date().toISOString(),
  };

  await prisma.place.update({
    where: { id: placeId },
    data: {
      metadata: updatedMetadata as any,
      updatedAt: new Date(),
    },
  });
}

async function main() {
  console.log('='.repeat(60));
  console.log('使用DeepSeek API导入冰岛POI开放时间数据');
  console.log('='.repeat(60));
  console.log('');

  if (!DEEPSEEK_API_KEY) {
    console.error('❌ 错误: DEEPSEEK_API_KEY 未配置');
    console.error('   请在 .env 文件中设置 DEEPSEEK_API_KEY');
    process.exit(1);
  }

  try {
    // 1. 查询没有开放时间的冰岛POI
    console.log('📋 查询没有开放时间的冰岛POI...');
    
    const allPlaces = await prisma.place.findMany({
      where: {
        City: {
          countryCode: 'IS',
        },
        category: 'ATTRACTION',
      },
      include: {
        City: true,
      },
    });

    console.log(`   找到 ${allPlaces.length} 个冰岛POI，检查开放时间...`);

    // 过滤出没有开放时间的POI
    const places = allPlaces
      .filter(place => !hasOpeningHours(place.metadata))
      .slice(0, MAX_PLACES || allPlaces.length);

    console.log(`   找到 ${places.length} 个需要更新开放时间的POI\n`);

    if (places.length === 0) {
      console.log('✅ 所有POI都已包含开放时间数据');
      return;
    }

    // 2. 分批处理
    const results: Array<{
      placeId: number;
      name: string;
      status: 'success' | 'failed' | 'skipped';
      error?: string;
    }> = [];

    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < places.length; i += BATCH_SIZE) {
      const batch = places.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(places.length / BATCH_SIZE);

      console.log(`\n📦 处理批次 ${batchNum}/${totalBatches} (${batch.length} 个POI)`);

      for (const place of batch) {
        const placeName = place.nameEN || place.nameCN || `Place ${place.id}`;
        console.log(`  🔍 处理: ${placeName} (ID: ${place.id})`);

        try {
          // 提取坐标
          const coords = await extractCoordinates(prisma, place.id);
          if (!coords) {
            console.log(`    ⚠️  跳过: 缺少坐标信息`);
            results.push({
              placeId: place.id,
              name: placeName,
              status: 'skipped',
              error: '缺少坐标信息',
            });
            skippedCount++;
            continue;
          }

          // 检查是否已有开放时间（双重检查）
          if (hasOpeningHours(place.metadata)) {
            console.log(`    ⚠️  跳过: 已有开放时间数据`);
            results.push({
              placeId: place.id,
              name: placeName,
              status: 'skipped',
              error: '已有开放时间数据',
            });
            skippedCount++;
            continue;
          }

          // 从DeepSeek API获取开放时间
          const openingHours = await getOpeningHoursFromDeepSeek(
            place.nameEN || placeName,
            place.nameCN,
            place.category,
            coords.lat,
            coords.lng
          );

          if (!openingHours || !openingHours.openingHours) {
            console.log(`    ⚠️  DeepSeek未返回开放时间数据`);
            results.push({
              placeId: place.id,
              name: placeName,
              status: 'skipped',
              error: 'DeepSeek未返回开放时间数据',
            });
            skippedCount++;
            continue;
          }

          // 更新开放时间
          await updatePlaceOpeningHours(place.id, openingHours);

          console.log(`    ✅ 成功更新开放时间: ${openingHours.openingHours}`);
          if (openingHours.notes) {
            console.log(`       备注: ${openingHours.notes}`);
          }

          results.push({
            placeId: place.id,
            name: placeName,
            status: 'success',
          });
          successCount++;

          // 延迟以避免API限流
          await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        } catch (error: any) {
          console.error(`    ❌ 错误: ${error.message}`);
          results.push({
            placeId: place.id,
            name: placeName,
            status: 'failed',
            error: error.message,
          });
          failedCount++;
        }
      }

      // 批次间延迟
      if (i + BATCH_SIZE < places.length) {
        console.log(`    ⏳ 等待 ${DELAY_MS}ms 后处理下一批次...`);
        await new Promise(resolve => setTimeout(resolve, DELAY_MS));
      }
    }

    // 3. 输出结果汇总
    console.log('\n' + '='.repeat(60));
    console.log('📊 导入结果汇总');
    console.log('='.repeat(60));
    console.log(`✅ 成功: ${successCount}`);
    console.log(`❌ 失败: ${failedCount}`);
    console.log(`⚠️  跳过: ${skippedCount}`);
    console.log(`📊 总计: ${results.length}`);

    // 输出失败详情
    const failedResults = results.filter(r => r.status === 'failed');
    if (failedResults.length > 0) {
      console.log('\n❌ 失败详情:');
      failedResults.forEach(r => {
        console.log(`  - ${r.name} (ID: ${r.placeId}): ${r.error}`);
      });
    }

    // 输出跳过详情（前10个）
    const skippedResults = results.filter(r => r.status === 'skipped');
    if (skippedResults.length > 0) {
      console.log(`\n⚠️  跳过详情（前10个）:`);
      skippedResults.slice(0, 10).forEach(r => {
        console.log(`  - ${r.name} (ID: ${r.placeId}): ${r.error}`);
      });
      if (skippedResults.length > 10) {
        console.log(`  ... 还有 ${skippedResults.length - 10} 个被跳过`);
      }
    }

    console.log('\n✅ 导入完成！');
  } catch (error: any) {
    console.error('\n❌ 程序执行失败:', error);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(error => {
  console.error('❌ 未捕获的错误:', error);
  process.exit(1);
});
