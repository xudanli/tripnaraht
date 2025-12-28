#!/usr/bin/env ts-node
/**
 * 导入冰岛 POI 数据
 * 
 * 使用 Overpass API 从 OSM 抓取冰岛 POI 数据
 * 支持按 region 和 profile 分批导入，串行处理避免连接池问题
 * 
 * 使用方法:
 *   npm run import:iceland-poi [--region <region_key>] [--profile <A|B|C|D|E>] [--all] [--phase <1|2>]
 * 
 * 示例:
 *   npm run import:iceland-poi --all                    # 导入所有 region 和 profile
 *   npm run import:iceland-poi --region IS_REYKJAVIK    # 只导入雷克雅未克
 *   npm run import:iceland-poi --profile A             # 只导入 Profile A (Transport)
 *   npm run import:iceland-poi --phase 1                # 只导入 Phase 1 (MVP regions)
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import {
  ICELAND_OVERPASS_PROFILES,
  buildOverpassQuery,
  type OverpassProfile,
} from './iceland/overpass-profiles';
import { mapOsmTagsToCanonical } from './iceland/canonical-mapping';

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
  const seedsPath = path.join(__dirname, '../data/iceland/region-seeds.json');
  const content = fs.readFileSync(seedsPath, 'utf-8');
  const data = JSON.parse(content);
  return data.regions;
}

/**
 * 检查 Overpass API 状态和配额
 */
async function checkOverpassStatus(): Promise<{ availableSlots: number; waitTime: number }> {
  try {
    const response = await axios.get('https://overpass-api.de/api/status');
    const statusText = response.data;
    
    // 解析状态文本，查找可用槽位和等待时间
    const availableMatch = statusText.match(/Available slots: (\d+)/);
    const waitTimeMatch = statusText.match(/Slot available after: (\d+)/);
    
    const availableSlots = availableMatch ? parseInt(availableMatch[1]) : 0;
    const waitTime = waitTimeMatch ? parseInt(waitTimeMatch[1]) : 0;
    
    return { availableSlots, waitTime };
  } catch (error) {
    // 如果无法获取状态，返回默认值
    return { availableSlots: 0, waitTime: 60 };
  }
}

/**
 * 调用 Overpass API（带重试机制和速率限制处理）
 */
async function fetchFromOverpass(query: string, maxRetries: number = 5): Promise<OverpassElement[]> {
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
      const status = error.response?.status;
      const isTimeout = error.code === 'ECONNABORTED' || status === 504;
      const isRateLimited = status === 429;
      
      if (isLastAttempt) {
        console.error(`❌ Overpass API 错误 (已重试 ${maxRetries} 次): ${error.message}`);
        throw error;
      }
      
      if (isRateLimited) {
        // 速率限制：检查状态并等待
        console.log(`⏳ Overpass API 速率限制 (429)，检查配额状态...`);
        const status = await checkOverpassStatus();
        
        if (status.availableSlots > 0) {
          console.log(`  ✅ 有 ${status.availableSlots} 个可用槽位，立即重试`);
          await new Promise(resolve => setTimeout(resolve, 2000)); // 等待 2 秒后重试
        } else if (status.waitTime > 0) {
          const waitTime = Math.min(status.waitTime + 5, 300); // 最多等待 5 分钟
          console.log(`  ⏰ 需要等待 ${waitTime} 秒后重试...`);
          await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
        } else {
          // 无法获取状态，使用递增等待时间
          const waitTime = Math.min(attempt * 30, 300); // 30s, 60s, 90s, 最多 5 分钟
          console.log(`  ⏰ 等待 ${waitTime} 秒后重试...`);
          await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
        }
      } else if (isTimeout) {
        const waitTime = attempt * 10; // 递增等待时间：10s, 20s, 30s
        console.log(`⏳ Overpass API 超时，等待 ${waitTime} 秒后重试...`);
        await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
      } else {
        // 其他错误，短暂等待后重试
        const waitTime = attempt * 5;
        console.log(`⏳ Overpass API 错误 (${status || 'unknown'})，等待 ${waitTime} 秒后重试...`);
        await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
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
  
  // 映射为 canonical type
  const { category, canonicalType } = mapOsmTagsToCanonical(tags);
  
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
      profile: profileName,
      source: 'OSM',
      region: regionKey,
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
  
  // 批量插入（分批处理，每批 50 条，避免事务超时）
  const BATCH_SIZE = 50;
  let created = 0;
  let errors = 0;
  
  for (let i = 0; i < newPlaces.length; i += BATCH_SIZE) {
    const batch = newPlaces.slice(i, i + BATCH_SIZE);
    
    // 直接逐条插入，不使用事务（更稳定，避免事务超时）
    for (const place of batch) {
      try {
        const metadata = {
          osmId: place.osmId,
          osmType: place.osmType,
          canonicalType: place.canonicalType,
          regionKey: region.region_key,
          profile: profile.name,
          rawTags: place.rawTags,
          source: 'OSM',
        };
        
        await prisma.$executeRaw`
          INSERT INTO "Place" (
            uuid, "nameCN", "nameEN", category, location, metadata, "createdAt", "updatedAt"
          )
          VALUES (
            gen_random_uuid()::text,
            ${place.name},
            ${place.nameEN || null},
            ${place.category}::"PlaceCategory",
            ST_SetSRID(ST_MakePoint(${place.lng}, ${place.lat}), 4326),
            ${JSON.stringify(metadata)}::jsonb,
            NOW(),
            NOW()
          )
        `;
        created++;
      } catch (error: any) {
        // 检查是否是重复键错误（已存在）或唯一约束冲突
        const errorMsg = error.message?.toLowerCase() || '';
        if (
          error.code === 'P2002' || 
          errorMsg.includes('unique constraint') || 
          errorMsg.includes('duplicate key') ||
          errorMsg.includes('already exists')
        ) {
          // 已存在，跳过（不计入错误）
          continue;
        }
        errors++;
        // 只记录前几个错误，避免日志过多
        if (errors <= 5) {
          console.error(`  ⚠️  插入失败: ${place.name} (${error.message?.substring(0, 100)})`);
        }
      }
    }
    
    // 显示进度
    if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= newPlaces.length) {
      console.log(`  📊 进度: ${Math.min(i + BATCH_SIZE, newPlaces.length)}/${newPlaces.length} (创建: ${created}, 错误: ${errors})`);
    }
    
    // 批次间稍作延迟，避免连接池耗尽
    if (i + BATCH_SIZE < newPlaces.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
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
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log('使用方法:');
    console.log('  npm run import:iceland-poi --all                    # 导入所有 region 和 profile');
    console.log('  npm run import:iceland-poi --region IS_REYKJAVIK   # 只导入指定 region');
    console.log('  npm run import:iceland-poi --profile A            # 只导入指定 profile');
    console.log('  npm run import:iceland-poi --phase 1               # 只导入 Phase 1 (MVP regions)');
    console.log('\n示例:');
    console.log('  npm run import:iceland-poi --all');
    console.log('  npm run import:iceland-poi --region IS_REYKJAVIK --profile A');
    console.log('  npm run import:iceland-poi --phase 1');
    process.exit(0);
  }
  
  console.log('🚀 开始导入冰岛 POI 数据...\n');
  console.log('='.repeat(60) + '\n');
  
  // 先测试数据库连接
  console.log('🔌 测试数据库连接...');
  try {
    await prisma.$connect();
    console.log('✅ 数据库连接成功\n');
  } catch (dbError: any) {
    console.error('❌ 数据库连接失败！');
    console.error(`   错误: ${dbError.message}`);
    console.error('\n💡 请检查：');
    console.error('   1. 数据库服务器是否运行');
    console.error('   2. DATABASE_URL 环境变量是否正确');
    console.error('   3. 网络连接是否正常（VPN/防火墙）');
    console.error('\n');
    process.exit(1);
  }
  
  const app = await NestFactory.createApplicationContext(AppModule);
  
  try {
    const allFlag = args.includes('--all');
    const regionIndex = args.indexOf('--region');
    const selectedRegion = regionIndex !== -1 ? args[regionIndex + 1] : null;
    const profileIndex = args.indexOf('--profile');
    const selectedProfile = profileIndex !== -1 ? args[profileIndex + 1] : null;
    const phaseIndex = args.indexOf('--phase');
    const selectedPhase = phaseIndex !== -1 ? parseInt(args[phaseIndex + 1]) : null;
    
    // 加载 region seeds
    const allRegions = loadRegionSeeds();
    
    // 过滤 regions
    let regionsToImport: RegionSeed[] = [];
    if (selectedRegion) {
      regionsToImport = allRegions.filter(r => r.region_key === selectedRegion);
    } else if (selectedPhase) {
      // Phase 1: priority <= 1, Phase 2: priority <= 2, Phase 3: priority <= 3
      regionsToImport = allRegions.filter(r => r.priority <= selectedPhase);
    } else if (allFlag) {
      regionsToImport = allRegions;
    } else {
      // 默认只导入 Phase 1
      regionsToImport = allRegions.filter(r => r.priority <= 1);
    }
    
    if (regionsToImport.length === 0) {
      console.error('❌ 未找到匹配的 region');
      process.exit(1);
    }
    
    // 过滤 profiles
    const profilesToImport = selectedProfile
      ? ICELAND_OVERPASS_PROFILES.filter((_, idx) => 
          String.fromCharCode(65 + idx) === selectedProfile.toUpperCase()
        )
      : ICELAND_OVERPASS_PROFILES;
    
    if (profilesToImport.length === 0) {
      console.error('❌ 未找到匹配的 profile');
      process.exit(1);
    }
    
    console.log(`📊 将处理 ${regionsToImport.length} 个 region × ${profilesToImport.length} 个 profile = ${regionsToImport.length * profilesToImport.length} 个任务\n`);
    
    let totalCreated = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    
    // 串行处理每个 region 的每个 profile（避免连接池问题）
    for (const region of regionsToImport) {
      for (const profile of profilesToImport) {
        const result = await importRegionProfile(region, profile);
        
        totalCreated += result.created;
        totalSkipped += result.skipped;
        totalErrors += result.errors;
        
        // region-profile 之间延迟（避免速率限制）
        // 检查 API 状态，如果有可用槽位则短暂延迟，否则等待更长时间
        const status = await checkOverpassStatus();
        if (status.availableSlots > 0) {
          await new Promise(resolve => setTimeout(resolve, 2000)); // 2 秒延迟
        } else if (status.waitTime > 0) {
          const waitTime = Math.min(status.waitTime + 2, 120); // 最多等待 2 分钟
          console.log(`  ⏰ 等待 API 配额恢复 (${waitTime} 秒)...`);
          await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
        } else {
          await new Promise(resolve => setTimeout(resolve, 5000)); // 默认 5 秒延迟
        }
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ 导入完成！');
    console.log(`  - 创建: ${totalCreated}`);
    console.log(`  - 跳过: ${totalSkipped}`);
    console.log(`  - 错误: ${totalErrors}`);
    console.log('='.repeat(60) + '\n');
  } catch (error: any) {
    console.error('❌ 导入失败:', error.message);
    throw error;
  } finally {
    await app.close();
    await prisma.$disconnect();
  }
}

main()
  .catch((error) => {
    console.error('❌ 失败:', error);
    process.exit(1);
  });

