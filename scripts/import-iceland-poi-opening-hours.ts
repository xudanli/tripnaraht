#!/usr/bin/env tsx
/**
 * 导入冰岛POI的开放时间数据
 * 
 * 针对没有开放时间数据的POI，从Google Places API获取并更新
 * 
 * 使用方法:
 *   npm run import:iceland-opening-hours
 *   或
 *   BATCH_SIZE=10 DELAY_MS=500 npm run import:iceland-opening-hours
 */

import { PrismaClient } from '@prisma/client';
import type { PrismaClient as PrismaClientType } from '@prisma/client';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

// 从环境变量获取配置
const GOOGLE_PLACES_API_KEY = 
  process.env.GOOGLE_PLACES_API_KEY || 
  process.env.GOOGLE_MAPS_API_KEY || 
  '';

const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '10', 10);
const DELAY_MS = parseInt(process.env.DELAY_MS || '500', 10);
const MAX_PLACES = parseInt(process.env.MAX_PLACES || '0', 10); // 0表示不限制

interface GooglePlaceDetails {
  place_id: string;
  name: string;
  opening_hours?: {
    open_now?: boolean;
    weekday_text?: string[];
    periods?: Array<{
      open: { day: number; time: string };
      close?: { day: number; time: string };
    }>;
  };
  formatted_address?: string;
  geometry?: {
    location: { lat: number; lng: number };
  };
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
 * 从Google Places API获取Place详情（包含开放时间）
 */
async function fetchPlaceDetailsFromGoogle(
  placeName: string,
  lat: number,
  lng: number
): Promise<GooglePlaceDetails | null> {
  if (!GOOGLE_PLACES_API_KEY) {
    throw new Error('GOOGLE_PLACES_API_KEY 未配置');
  }

  try {
    // 步骤1: 使用Text Search找到place_id
    const searchResponse = await axios.get(
      'https://maps.googleapis.com/maps/api/place/textsearch/json',
      {
        params: {
          query: `${placeName} Iceland`,
          location: `${lat},${lng}`,
          radius: 5000, // 5km范围内搜索
          key: GOOGLE_PLACES_API_KEY,
          language: 'en',
        },
        timeout: 30000, // 增加到30秒
        proxy: false, // 禁用代理
      }
    );

    if (searchResponse.data.status !== 'OK' || !searchResponse.data.results?.length) {
      return null;
    }

    // 选择最匹配的结果（距离最近的）
    const results = searchResponse.data.results;
    const bestMatch = results[0];
    const placeId = bestMatch.place_id;

    // 步骤2: 使用Place Details API获取详细信息（包含opening_hours）
    const detailsResponse = await axios.get(
      'https://maps.googleapis.com/maps/api/place/details/json',
      {
        params: {
          place_id: placeId,
          fields: 'place_id,name,opening_hours,formatted_address,geometry',
          key: GOOGLE_PLACES_API_KEY,
          language: 'en',
        },
        timeout: 30000, // 增加到30秒
        proxy: false, // 禁用代理
      }
    );

    if (detailsResponse.data.status !== 'OK' || !detailsResponse.data.result) {
      return null;
    }

    return detailsResponse.data.result as GooglePlaceDetails;
  } catch (error: any) {
    console.error(`获取 ${placeName} 的Google Places数据失败: ${error.message}`);
    return null;
  }
}

/**
 * 将Google Places的开放时间格式转换为我们的格式
 */
function convertOpeningHours(googleOpeningHours: GooglePlaceDetails['opening_hours']): any {
  if (!googleOpeningHours) {
    return null;
  }

  const result: any = {
    isOpenNow: googleOpeningHours.open_now || false,
  };

  // 转换weekday_text格式
  if (googleOpeningHours.weekday_text && googleOpeningHours.weekday_text.length > 0) {
    const weekdayMap: Record<string, string> = {};
    googleOpeningHours.weekday_text.forEach((text) => {
      // 格式: "Monday: 9:00 AM – 6:00 PM"
      const match = text.match(/^(\w+):\s*(.+)$/);
      if (match) {
        const day = match[1].toLowerCase().substring(0, 3); // Mon, Tue, etc.
        weekdayMap[day] = match[2];
      }
    });

    result.weekday = weekdayMap;
    result.osmFormat = googleOpeningHours.weekday_text.join('; ');
  }

  // 转换periods格式为结构化数据
  if (googleOpeningHours.periods && googleOpeningHours.periods.length > 0) {
    const structured: Record<string, Array<{ open: string; close: string }>> = {};
    const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

    googleOpeningHours.periods.forEach((period) => {
      const dayName = dayNames[period.open.day];
      if (!structured[dayName]) {
        structured[dayName] = [];
      }

      const timeSlot = {
        open: formatTime(period.open.time),
        close: period.close ? formatTime(period.close.time) : '24:00',
      };

      structured[dayName].push(timeSlot);
    });

    result.structured = structured;
  }

  return result;
}

/**
 * 格式化时间（从HHMM格式转为HH:MM）
 */
function formatTime(timeStr: string): string {
  if (timeStr.length === 4) {
    return `${timeStr.substring(0, 2)}:${timeStr.substring(2)}`;
  }
  return timeStr;
}

/**
 * 更新Place的开放时间数据
 */
async function updatePlaceOpeningHours(
  placeId: number,
  openingHours: any
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
      openingHours: openingHours.osmFormat || openingHours.weekday,
      openingHoursStructured: openingHours.structured,
    },
    // 向后兼容格式
    openingHours: openingHours,
    lastEnrichedAt: new Date().toISOString(),
    openingHoursSource: 'google_places_api',
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

/**
 * 提取坐标（从PostGIS POINT格式）
 * 优先使用SQL查询，降级使用字符串解析
 */
async function extractCoordinates(
  prisma: PrismaClientType,
  placeId: number,
  location: any
): Promise<{ lat: number; lng: number } | null> {
  // 方法1: 使用SQL查询PostGIS geography类型（最可靠）
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
    console.warn(`SQL查询坐标失败，尝试其他方法: ${error.message}`);
  }

  // 方法2: 从metadata中获取坐标
  if (location) {
    const metadata = (location as any).metadata;
    if (metadata) {
      if (metadata.lat && metadata.lng) {
        return { lat: metadata.lat, lng: metadata.lng };
      }
      if (metadata.coordinates && Array.isArray(metadata.coordinates)) {
        return { lat: metadata.coordinates[1], lng: metadata.coordinates[0] };
      }
    }
  }

  // 方法3: 解析PostGIS POINT字符串格式: "POINT(lng lat)"
  if (typeof location === 'string') {
    const match = location.match(/POINT\(([^)]+)\)/);
    if (match) {
      const [lng, lat] = match[1].split(/\s+/).map(parseFloat);
      return { lat, lng };
    }
  }

  // 方法4: 如果是对象格式
  if (typeof location === 'object') {
    if (location.coordinates && Array.isArray(location.coordinates)) {
      return {
        lng: location.coordinates[0],
        lat: location.coordinates[1],
      };
    }
    if (location.lat && location.lng) {
      return {
        lat: location.lat,
        lng: location.lng,
      };
    }
  }

  return null;
}

async function main() {
  console.log('='.repeat(60));
  console.log('导入冰岛POI开放时间数据');
  console.log('='.repeat(60));
  console.log('');

  if (!GOOGLE_PLACES_API_KEY) {
    console.error('❌ 错误: GOOGLE_PLACES_API_KEY 未配置');
    console.error('   请在 .env 文件中设置 GOOGLE_PLACES_API_KEY 或 GOOGLE_MAPS_API_KEY');
    process.exit(1);
  }

  try {
    // 1. 查询所有冰岛POI，然后过滤出没有开放时间的
    console.log('📋 查询冰岛POI...');
    
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
          // 提取坐标（使用SQL查询）
          const coords = await extractCoordinates(prisma, place.id, (place as any).location);
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

          // 从Google Places API获取开放时间
          const googleData = await fetchPlaceDetailsFromGoogle(
            placeName,
            coords.lat,
            coords.lng
          );

          if (!googleData) {
            console.log(`    ❌ 未找到Google Places数据`);
            results.push({
              placeId: place.id,
              name: placeName,
              status: 'failed',
              error: '未找到Google Places数据',
            });
            failedCount++;
            continue;
          }

          if (!googleData.opening_hours) {
            console.log(`    ⚠️  Google Places数据中没有开放时间`);
            results.push({
              placeId: place.id,
              name: placeName,
              status: 'skipped',
              error: 'Google Places数据中没有开放时间',
            });
            skippedCount++;
            continue;
          }

          // 转换并更新开放时间
          const openingHours = convertOpeningHours(googleData.opening_hours);
          await updatePlaceOpeningHours(place.id, openingHours);

          console.log(`    ✅ 成功更新开放时间`);
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
