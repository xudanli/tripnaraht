#!/usr/bin/env ts-node
/**
 * 导入尼泊尔 POI 数据
 * 
 * 使用 Overpass API 从 OSM 抓取尼泊尔 POI 数据
 * 支持按 region 和 profile 分批导入
 * 
 * 使用方法:
 *   npm run import:nepal-poi [--region <region_key>] [--profile <A|B|C|D>] [--all]
 * 
 * 示例:
 *   npm run import:nepal-poi --all                    # 导入所有 region 和 profile
 *   npm run import:nepal-poi --region NP_KTM          # 只导入加德满都
 *   npm run import:nepal-poi --region NP_KTM --profile A  # 只导入加德满都的 Profile A
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import {
  NEPAL_OVERPASS_PROFILES,
  buildOverpassQuery,
  type OverpassProfile,
} from './nepal/overpass-profiles';
import { mapOsmTagsToCanonical } from './nepal/canonical-mapping';

const prisma = new PrismaClient();

interface RegionSeed {
  region_key: string;
  name: string;
  name_en: string;
  description: string;
  seed: { lat: number; lng: number };
  radius_km: number;
  scenario: string;
  priority: number;
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

/**
 * 读取 region seeds 配置
 */
function loadRegionSeeds(): RegionSeed[] {
  const seedsPath = path.join(__dirname, '../data/nepal/region-seeds.json');
  const content = fs.readFileSync(seedsPath, 'utf-8');
  const data = JSON.parse(content);
  return data.regions;
}

/**
 * 调用 Overpass API（带重试机制）
 */
async function fetchFromOverpass(query: string, maxRetries: number = 3): Promise<OverpassElement[]> {
  const overpassUrl = 'https://overpass-api.de/api/interpreter';
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`📡 发送 Overpass 查询... (尝试 ${attempt}/${maxRetries})`);
      const response = await axios.post<OverpassResponse>(
        overpassUrl,
        `data=${encodeURIComponent(query)}`,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 200000, // 200 秒超时
        }
      );
      
      return response.data.elements || [];
    } catch (error: any) {
      const isLastAttempt = attempt === maxRetries;
      const isTimeout = error.code === 'ECONNABORTED' || error.response?.status === 504;
      
      if (isLastAttempt) {
        console.error(`❌ Overpass API 错误 (已重试 ${maxRetries} 次): ${error.message}`);
        throw error;
      }
      
      if (isTimeout) {
        const waitTime = attempt * 10; // 递增等待时间：10s, 20s, 30s
        console.log(`⏳ Overpass API 超时，等待 ${waitTime} 秒后重试...`);
        await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
      } else {
        throw error; // 非超时错误直接抛出
      }
    }
  }
  
  return [];
}

/**
 * 将 Overpass 元素转换为 Place 数据
 */
function convertToPlace(
  element: OverpassElement,
  regionKey: string,
  profileName: string
): {
  osmId: number;
  osmType: string;
  name: string;
  nameEN?: string;
  lat: number;
  lng: number;
  category: string;
  canonicalType?: string;
  rawTags: Record<string, string>;
} {
  const isArea = !!element.center;
  const lat = isArea ? element.center!.lat : element.lat!;
  const lng = isArea ? element.center!.lon : element.lon!;
  
  const tags = element.tags || {};
  const name = tags.name || tags['name:en'] || 'Unnamed place';
  const nameEN = tags['name:en'] || tags.name;
  
  // 确定 category（优先使用 tourism，其次 amenity）
  const category = tags.tourism || tags.amenity || tags.shop || 'other';
  
  // 映射为 canonical type
  const canonicalType = mapOsmTagsToCanonical(tags);
  
  return {
    osmId: element.id,
    osmType: element.type,
    name,
    nameEN,
    lat,
    lng,
    category,
    canonicalType,
    rawTags: {
      ...tags,
      region_key: regionKey,
      profile: profileName,
    },
  };
}

/**
 * 导入单个 region 的单个 profile
 */
async function importRegionProfile(
  region: RegionSeed,
  profile: OverpassProfile
): Promise<{ created: number; skipped: number; errors: number }> {
  console.log(`\n📍 处理 Region: ${region.region_key} (${region.name})`);
  console.log(`📋 Profile: ${profile.name} - ${profile.description}`);
  
  const radiusMeters = region.radius_km * 1000;
  const query = buildOverpassQuery(profile, region.seed.lat, region.seed.lng, radiusMeters);
  
  // 调用 Overpass API
  const elements = await fetchFromOverpass(query);
  console.log(`✅ 获取到 ${elements.length} 个 POI`);
  
  if (elements.length === 0) {
    return { created: 0, skipped: 0, errors: 0 };
  }
  
  // 转换为 Place 数据
  const places = elements.map(el => convertToPlace(el, region.region_key, profile.name));
  
  if (places.length === 0) {
    return { created: 0, skipped: 0, errors: 0 };
  }
  
  // 批量检查已存在的 POI（通过 OSM ID，分批检查避免查询过大）
  const CHECK_BATCH_SIZE = 1000;
  const existingOsmIdSet = new Set<string>();
  
  for (let i = 0; i < places.length; i += CHECK_BATCH_SIZE) {
    const batch = places.slice(i, i + CHECK_BATCH_SIZE);
    const osmIds = batch.map(p => p.osmId.toString());
    
    const existingOsmIds = await prisma.$queryRaw<Array<{ osmId: string }>>`
      SELECT DISTINCT metadata->>'osmId' as "osmId"
      FROM "Place"
      WHERE metadata->>'osmId' = ANY(${osmIds})
    `;
    
    existingOsmIds.forEach(e => existingOsmIdSet.add(e.osmId));
  }
  
  const newPlaces = places.filter(p => !existingOsmIdSet.has(p.osmId.toString()));
  const skipped = places.length - newPlaces.length;
  
  if (newPlaces.length === 0) {
    console.log(`  ✅ 创建: 0, ⏭️  跳过: ${skipped}, ❌ 错误: 0`);
    return { created: 0, skipped, errors: 0 };
  }
  
  // 批量插入（分批处理，每批 50 条，减少连接池压力）
  const BATCH_SIZE = 50;
  let created = 0;
  let errors = 0;
  
  for (let i = 0; i < newPlaces.length; i += BATCH_SIZE) {
    const batch = newPlaces.slice(i, i + BATCH_SIZE);
    
    try {
      // 构建批量插入的 VALUES
      const values = batch.map(place => {
        // 确定 category（映射到 PlaceCategory enum）
        let placeCategory = 'ATTRACTION'; // 默认
        if (place.canonicalType === 'TEAHOUSE_LODGE' || place.category === 'hotel' || place.category === 'guest_house') {
          placeCategory = 'HOTEL';
        } else if (place.canonicalType === 'SUPPLY' || place.category === 'supermarket' || place.category === 'convenience') {
          placeCategory = 'SHOPPING';
        } else if (place.canonicalType === 'AIRPORT' || place.canonicalType === 'TRANSIT') {
          placeCategory = 'TRANSIT_HUB';
        }
        
        const metadata = {
          osmId: place.osmId,
          osmType: place.osmType,
          canonicalType: place.canonicalType,
          regionKey: region.region_key,
          profile: profile.name,
          rawTags: place.rawTags,
        };
        
        return {
          nameCN: place.name,
          nameEN: place.nameEN || null,
          category: placeCategory,
          lat: place.lat,
          lng: place.lng,
          metadata: JSON.stringify(metadata),
        };
      });
      
      // 使用事务批量插入（使用参数化查询）
      await prisma.$transaction(async (tx) => {
        // 逐条插入但使用事务（更可靠，避免 SQL 注入）
        for (const place of batch) {
          let placeCategory = 'ATTRACTION';
          if (place.canonicalType === 'TEAHOUSE_LODGE' || place.category === 'hotel' || place.category === 'guest_house') {
            placeCategory = 'HOTEL';
          } else if (place.canonicalType === 'SUPPLY' || place.category === 'supermarket' || place.category === 'convenience') {
            placeCategory = 'SHOPPING';
          } else if (place.canonicalType === 'AIRPORT' || place.canonicalType === 'TRANSIT') {
            placeCategory = 'TRANSIT_HUB';
          }
          
          await tx.$executeRaw`
            INSERT INTO "Place" (
              uuid, "nameCN", "nameEN", category, location, metadata, "createdAt", "updatedAt"
            )
            VALUES (
              gen_random_uuid()::text,
              ${place.name},
              ${place.nameEN || null},
              ${placeCategory}::"PlaceCategory",
              ST_SetSRID(ST_MakePoint(${place.lng}, ${place.lat}), 4326),
              ${JSON.stringify({
                osmId: place.osmId,
                osmType: place.osmType,
                canonicalType: place.canonicalType,
                regionKey: region.region_key,
                profile: profile.name,
                rawTags: place.rawTags,
              })}::jsonb,
              NOW(),
              NOW()
            )
          `;
        }
      }, {
        timeout: 30000, // 30 秒超时
      });
      
      created += batch.length;
      
      // 显示进度
      if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= newPlaces.length) {
        console.log(`  📊 进度: ${Math.min(i + BATCH_SIZE, newPlaces.length)}/${newPlaces.length}`);
      }
    } catch (error: any) {
      console.error(`❌ 批量插入失败 (批次 ${Math.floor(i / BATCH_SIZE) + 1}): ${error.message}`);
      errors += batch.length;
      
      // 如果批量插入失败，尝试逐条插入（作为降级方案）
      console.log(`  ⚠️  尝试逐条插入该批次...`);
      for (const place of batch) {
        try {
          let placeCategory = 'ATTRACTION';
          if (place.canonicalType === 'TEAHOUSE_LODGE' || place.category === 'hotel' || place.category === 'guest_house') {
            placeCategory = 'HOTEL';
          } else if (place.canonicalType === 'SUPPLY' || place.category === 'supermarket' || place.category === 'convenience') {
            placeCategory = 'SHOPPING';
          } else if (place.canonicalType === 'AIRPORT' || place.canonicalType === 'TRANSIT') {
            placeCategory = 'TRANSIT_HUB';
          }
          
          await prisma.$executeRaw`
            INSERT INTO "Place" (
              uuid, "nameCN", "nameEN", category, location, metadata, "createdAt", "updatedAt"
            )
            VALUES (
              gen_random_uuid()::text,
              ${place.name},
              ${place.nameEN || null},
              ${placeCategory}::"PlaceCategory",
              ST_SetSRID(ST_MakePoint(${place.lng}, ${place.lat}), 4326),
              ${JSON.stringify({
                osmId: place.osmId,
                osmType: place.osmType,
                canonicalType: place.canonicalType,
                regionKey: region.region_key,
                profile: profile.name,
                rawTags: place.rawTags,
              })}::jsonb,
              NOW(),
              NOW()
            )
          `;
          created++;
          errors--;
        } catch (singleError: any) {
          // 忽略单个错误，继续处理下一个
        }
      }
    }
    
    // 批次间稍作延迟，避免连接池耗尽
    if (i + BATCH_SIZE < newPlaces.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  console.log(`  ✅ 创建: ${created}, ⏭️  跳过: ${skipped}, ❌ 错误: ${errors}`);
  
  return { created, skipped, errors };
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  const regionIndex = args.indexOf('--region');
  const profileIndex = args.indexOf('--profile');
  const allFlag = args.includes('--all');
  
  // 解析参数
  const targetRegion = regionIndex !== -1 ? args[regionIndex + 1] : null;
  const targetProfile = profileIndex !== -1 ? args[profileIndex + 1] : null;
  
  // 加载 region seeds
  const regions = loadRegionSeeds();
  
  // 确定要处理的 regions
  const regionsToProcess = targetRegion
    ? regions.filter(r => r.region_key === targetRegion)
    : regions.filter(r => r.priority === 1); // 默认只处理 priority 1 的 regions
  
  if (regionsToProcess.length === 0) {
    console.error(`❌ 未找到匹配的 region: ${targetRegion}`);
    process.exit(1);
  }
  
  // 确定要处理的 profiles
  const profilesToProcess = targetProfile
    ? NEPAL_OVERPASS_PROFILES.filter((_, i) => ['A', 'B', 'C', 'D'][i] === targetProfile.toUpperCase())
    : NEPAL_OVERPASS_PROFILES;
  
  if (profilesToProcess.length === 0) {
    console.error(`❌ 无效的 profile: ${targetProfile}`);
    process.exit(1);
  }
  
  console.log('🇳🇵 开始导入尼泊尔 POI 数据\n');
  console.log(`📊 将处理 ${regionsToProcess.length} 个 regions`);
  console.log(`📋 将处理 ${profilesToProcess.length} 个 profiles\n`);
  
  const startTime = Date.now();
  let totalCreated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  
  // 依次处理每个 region 的每个 profile
  for (const region of regionsToProcess) {
    for (const profile of profilesToProcess) {
      try {
        const result = await importRegionProfile(region, profile);
        totalCreated += result.created;
        totalSkipped += result.skipped;
        totalErrors += result.errors;
        
        // 避免请求过快，稍作延迟（region 之间延迟更长）
        const delay = profileIndex === profilesToProcess.length - 1 ? 5000 : 3000; // 最后一个 profile 后延迟更长
        await new Promise(resolve => setTimeout(resolve, delay));
      } catch (error: any) {
        console.error(`❌ 处理失败: ${error.message}`);
        totalErrors++;
      }
    }
  }
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  
  console.log('\n✅ 导入完成！');
  console.log(`⏱️  总耗时: ${duration} 秒`);
  console.log(`\n📊 总计:`);
  console.log(`  ✅ 创建: ${totalCreated}`);
  console.log(`  ⏭️  跳过: ${totalSkipped}`);
  console.log(`  ❌ 错误: ${totalErrors}`);
}

// 运行主函数
main()
  .catch((error) => {
    console.error('❌ 导入失败:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

