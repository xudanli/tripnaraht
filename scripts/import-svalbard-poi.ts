#!/usr/bin/env ts-node
/**
 * 导入斯瓦尔巴 POI 数据
 * 
 * 使用 Overpass API 从 OSM 抓取斯瓦尔巴 POI 数据
 * 支持按 profile 分批导入，并计算码头/徒步入口评分
 * 
 * 使用方法:
 *   npm run import:svalbard-poi [--profile <A|B|C|D|E>] [--all] [--score-pickup] [--identify-trailheads]
 * 
 * 示例:
 *   npm run import:svalbard-poi --all                    # 导入所有 profile
 *   npm run import:svalbard-poi --profile A              # 只导入 Profile A (Ports & Marine)
 *   npm run import:svalbard-poi --all --score-pickup     # 导入并计算码头评分
 *   npm run import:svalbard-poi --all --identify-trailheads  # 导入并识别徒步入口
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import {
  SVALBARD_OVERPASS_PROFILES,
  buildOverpassQuery,
  type OverpassProfile,
  LONGYEARBYEN_CENTER,
  DEFAULT_RADIUS_METERS,
} from './svalbard/overpass-profiles';
import { mapOsmTagsToCanonical, isPickupPointCandidate, isTrailheadCandidate } from './svalbard/canonical-mapping';
import { scoreAndRankPickupPoints, type PickupPointCandidate } from './svalbard/pickup-point-scorer';
import { identifyTrailheads, type TrailheadCandidate, type ParkingPoint } from './svalbard/trailhead-identifier';

const prisma = new PrismaClient();

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
      region: 'SVALBARD_LONGYEARBYEN',
    },
  };
}

/**
 * 导入单个 profile
 */
async function importProfile(
  profile: OverpassProfile,
  options?: {
    scorePickup?: boolean;
    identifyTrailheads?: boolean;
  }
): Promise<{ created: number; skipped: number; errors: number }> {
  console.log(`\n📋 Profile: ${profile.name} - ${profile.description}`);
  
  const query = buildOverpassQuery(
    profile,
    LONGYEARBYEN_CENTER.lat,
    LONGYEARBYEN_CENTER.lng,
    DEFAULT_RADIUS_METERS
  );
  
  // 调用 Overpass API
  const elements = await fetchFromOverpass(query);
  console.log(`✅ 获取到 ${elements.length} 个 POI`);
  
  if (elements.length === 0) {
    return { created: 0, skipped: 0, errors: 0 };
  }
  
  // 转换为 Place 数据
  const places = elements.map(el => convertToPlace(el, profile.name));
  
  if (places.length === 0) {
    return { created: 0, skipped: 0, errors: 0 };
  }
  
  // 批量检查已存在的 POI（通过 OSM ID）
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
  
  // 处理码头评分（如果需要）
  if (options?.scorePickup && profile.name === 'Ports & Marine Access') {
    console.log(`\n🔍 计算码头/出海集合点评分...`);
    const pickupCandidates: PickupPointCandidate[] = newPlaces
      .filter(p => isPickupPointCandidate(p.rawTags))
      .map(p => ({
        osmId: p.osmId,
        osmType: p.osmType as 'node' | 'way' | 'relation',
        lat: p.lat,
        lng: p.lng,
        tags: p.rawTags,
        name: p.name,
        nameEN: p.nameEN,
      }));
    
    if (pickupCandidates.length > 0) {
      const scored = scoreAndRankPickupPoints(pickupCandidates, {
        townCenterLat: LONGYEARBYEN_CENTER.lat,
        townCenterLng: LONGYEARBYEN_CENTER.lng,
      });
      
      console.log(`\n📊 Top 3 出海集合点:`);
      scored.slice(0, 3).forEach((point, idx) => {
        console.log(`  ${idx + 1}. ${point.name || 'Unnamed'} (Score: ${point.pickupScore})`);
        console.log(`     原因: ${point.reasons.join('; ')}`);
      });
      
      // 将评分信息添加到 metadata
      const scoredMap = new Map(scored.map(s => [s.osmId, s]));
      newPlaces.forEach(place => {
        const scored = scoredMap.get(place.osmId);
        if (scored) {
          place.rawTags.pickupScore = scored.pickupScore.toString();
          place.rawTags.pickupReasons = scored.reasons.join('; ');
        }
      });
    }
  }
  
  // 处理徒步入口识别（如果需要）
  if (options?.identifyTrailheads && profile.name === 'Trailheads & Information') {
    console.log(`\n🔍 识别徒步入口...`);
    
    // 获取停车点（从 Profile D 或已有的 Place）
    const parkingPlaces = await prisma.$queryRaw<Array<{
      id: number;
      lat: number;
      lng: number;
      metadata: any;
    }>>`
      SELECT 
        id,
        ST_Y(location::geometry) as lat,
        ST_X(location::geometry) as lng,
        metadata
      FROM "Place"
      WHERE metadata->>'canonicalType' = 'PARKING'
        AND metadata->>'region' = 'SVALBARD_LONGYEARBYEN'
    `;
    
    const parkingPoints: ParkingPoint[] = parkingPlaces.map(p => ({
      osmId: p.metadata?.osmId || p.id,
      osmType: (p.metadata?.osmType || 'node') as 'node' | 'way' | 'relation',
      lat: p.lat,
      lng: p.lng,
      tags: p.metadata?.rawTags || {},
      name: p.metadata?.name,
    }));
    
    const trailheadCandidates: TrailheadCandidate[] = newPlaces
      .filter(p => isTrailheadCandidate(p.rawTags))
      .map(p => ({
        osmId: p.osmId,
        osmType: p.osmType as 'node' | 'way' | 'relation',
        lat: p.lat,
        lng: p.lng,
        tags: p.rawTags,
        name: p.name,
        nameEN: p.nameEN,
      }));
    
    if (trailheadCandidates.length > 0) {
      const trailAccessPoints = identifyTrailheads(trailheadCandidates, parkingPoints);
      
      console.log(`\n📊 识别到 ${trailAccessPoints.length} 个徒步入口:`);
      trailAccessPoints.forEach((point, idx) => {
        console.log(`  ${idx + 1}. ${point.trailhead.name || 'Unnamed'} (${point.confidence})`);
        console.log(`     原因: ${point.reasons.join('; ')}`);
        if (point.parking) {
          console.log(`     停车点: ${point.parking.name || 'Unnamed'} (${Math.round(point.distanceToParking!)}m)`);
        }
      });
      
      // 将识别信息添加到 metadata
      const trailheadMap = new Map(trailAccessPoints.map(t => [t.trailhead.osmId, t]));
      newPlaces.forEach(place => {
        const trailhead = trailheadMap.get(place.osmId);
        if (trailhead) {
          place.rawTags.trailheadConfidence = trailhead.confidence;
          place.rawTags.trailheadReasons = trailhead.reasons.join('; ');
          if (trailhead.parking) {
            place.rawTags.associatedParking = trailhead.parking.osmId.toString();
            if (trailhead.distanceToParking !== undefined) {
              place.rawTags.distanceToParking = trailhead.distanceToParking.toString();
            }
          }
        }
      });
    }
  }
  
  // 批量插入（分批处理，每批 50 条）
  const BATCH_SIZE = 50;
  let created = 0;
  let errors = 0;
  
  for (let i = 0; i < newPlaces.length; i += BATCH_SIZE) {
    const batch = newPlaces.slice(i, i + BATCH_SIZE);
    
    try {
      await prisma.$transaction(async (tx) => {
        for (const place of batch) {
          const metadata = {
            osmId: place.osmId,
            osmType: place.osmType,
            canonicalType: place.canonicalType,
            profile: profile.name,
            rawTags: place.rawTags,
            region: 'SVALBARD_LONGYEARBYEN',
            source: 'OSM',
          };
          
          await tx.$executeRaw`
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
        }
      }, {
        timeout: 30000,
      });
      
      created += batch.length;
      
      if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= newPlaces.length) {
        console.log(`  📊 进度: ${Math.min(i + BATCH_SIZE, newPlaces.length)}/${newPlaces.length}`);
      }
    } catch (error: any) {
      console.error(`❌ 批量插入失败 (批次 ${Math.floor(i / BATCH_SIZE) + 1}): ${error.message}`);
      errors += batch.length;
    }
    
    // 批次间稍作延迟
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
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log('使用方法:');
    console.log('  npm run import:svalbard-poi --all                    # 导入所有 profile');
    console.log('  npm run import:svalbard-poi --profile A             # 只导入 Profile A');
    console.log('  npm run import:svalbard-poi --all --score-pickup     # 导入并计算码头评分');
    console.log('  npm run import:svalbard-poi --all --identify-trailheads  # 导入并识别徒步入口');
    process.exit(0);
  }
  
  console.log('🚀 开始导入斯瓦尔巴 POI 数据...\n');
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
    console.error('   4. 数据库服务器地址: pgm-bp11qeau0n455339mo.pg.rds.aliyuncs.com:5432');
    console.error('\n');
    process.exit(1);
  }
  
  const app = await NestFactory.createApplicationContext(AppModule);
  
  try {
    const allFlag = args.includes('--all');
    const profileIndex = args.indexOf('--profile');
    const selectedProfile = profileIndex !== -1 ? args[profileIndex + 1] : null;
    const scorePickup = args.includes('--score-pickup');
    const identifyTrailheads = args.includes('--identify-trailheads');
    
    const profilesToImport = allFlag
      ? SVALBARD_OVERPASS_PROFILES
      : selectedProfile
      ? SVALBARD_OVERPASS_PROFILES.filter((_, idx) => 
          String.fromCharCode(65 + idx) === selectedProfile.toUpperCase()
        )
      : SVALBARD_OVERPASS_PROFILES; // 默认导入所有
    
    if (profilesToImport.length === 0) {
      console.error('❌ 未找到匹配的 profile');
      process.exit(1);
    }
    
    let totalCreated = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    
    for (const profile of profilesToImport) {
      const result = await importProfile(profile, {
        scorePickup,
        identifyTrailheads,
      });
      
      totalCreated += result.created;
      totalSkipped += result.skipped;
      totalErrors += result.errors;
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

