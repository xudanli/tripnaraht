#!/usr/bin/env tsx
/**
 * 导入阿根廷乌斯怀亚POI数据到Place表
 * 数据源：data/argentina/pois.md
 */

import { PrismaClient, PlaceCategory } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

interface PoiData {
  metadata: {
    region: string;
    category: string;
    version: string;
    created_date: string;
    last_updated: string;
    total_pois: number;
  };
  hiking_trails?: Array<any>;
  water_activities?: Array<any>;
  museums_and_cultural?: Array<any>;
  city_landmarks?: Array<any>;
  adventure_activities?: Array<any>;
  seasonal_activities?: Array<any>;
  geographic_landmarks?: Array<any>;
}

// POI类型到PlaceCategory的映射
function mapPoiTypeToCategory(poiType: string, poiData: any): PlaceCategory {
  switch (poiType) {
    case 'museum':
    case 'historical_experience':
      return PlaceCategory.ATTRACTION;
    case 'landmark':
    case 'photo_spot':
    case 'viewpoint':
      return PlaceCategory.ATTRACTION;
    case 'hiking_trail':
      return PlaceCategory.ATTRACTION;
    case 'boat_tour':
    case 'water_activity':
      return PlaceCategory.ATTRACTION;
    case 'wildlife_site':
      return PlaceCategory.ATTRACTION;
    case 'adventure_activity':
      return PlaceCategory.ATTRACTION;
    case 'winter_activity':
      return PlaceCategory.ATTRACTION;
    case 'mountain':
    case 'mountain_range':
    case 'waterway':
      return PlaceCategory.ATTRACTION;
    default:
      return PlaceCategory.ATTRACTION;
  }
}

// 提取POI的位置信息
function extractLocation(poi: any): { lat: number; lng: number; elevation?: number } | null {
  if (poi.location) {
    return {
      lat: poi.location.latitude,
      lng: poi.location.longitude,
      elevation: poi.location.elevation_m,
    };
  }
  if (poi.start_point) {
    return {
      lat: poi.start_point.latitude,
      lng: poi.start_point.longitude,
      elevation: poi.start_point.elevation_m,
    };
  }
  if (poi.end_point) {
    return {
      lat: poi.end_point.latitude,
      lng: poi.end_point.longitude,
      elevation: poi.end_point.elevation_m,
    };
  }
  if (poi.departure_point) {
    return {
      lat: poi.departure_point.latitude,
      lng: poi.departure_point.longitude,
      elevation: poi.departure_point.elevation_m,
    };
  }
  return null;
}

// 构建metadata对象
function buildMetadata(poi: any, poiType: string): any {
  const metadata: any = {
    canonicalType: poiType,
    source: 'argentina_ushuaia_pois',
    importedAt: new Date().toISOString(),
  };

  // 添加原始POI数据中的字段
  if (poi.distance_km) metadata.distance_km = poi.distance_km;
  if (poi.duration_hours) metadata.duration_hours = poi.duration_hours;
  if (poi.difficulty) metadata.difficulty = poi.difficulty;
  if (poi.best_season) metadata.best_season = poi.best_season;
  if (poi.season) metadata.season = poi.season;
  if (poi.cost_usd) metadata.cost_usd = poi.cost_usd;
  if (poi.ticket_price_usd) metadata.ticket_price_usd = poi.ticket_price_usd;
  if (poi.admission_usd) metadata.admission_usd = poi.admission_usd;
  if (poi.visit_duration_hours) metadata.visit_duration_hours = poi.visit_duration_hours;
  if (poi.opening_hours) metadata.openingHours = { osmFormat: poi.opening_hours };
  if (poi.highlights) metadata.highlights = poi.highlights;
  if (poi.warning) metadata.warnings = [poi.warning];
  if (poi.warnings) metadata.warnings = Array.isArray(poi.warnings) ? poi.warnings : [poi.warnings];
  if (poi.access) metadata.access = poi.access;
  if (poi.note) metadata.note = poi.note;
  if (poi.wildlife) metadata.wildlife = poi.wildlife;
  if (poi.routes) metadata.routes = poi.routes;
  if (poi.weather_dependency) metadata.weather_dependency = poi.weather_dependency;
  if (poi.duration_days) metadata.duration_days = poi.duration_days;
  if (poi.distance_from_center_km) metadata.distance_from_center_km = poi.distance_from_center_km;
  if (poi.best_time) metadata.best_time = poi.best_time;
  if (poi.service) metadata.service = poi.service;

  // 徒步路线特殊处理
  if (poiType === 'hiking_trail') {
    if (poi.start_point) {
      metadata.startPoint = {
        nameCN: poi.start_point.name_zh,
        nameEN: poi.start_point.name_en,
        lat: poi.start_point.latitude,
        lng: poi.start_point.longitude,
        elevation: poi.start_point.elevation_m,
      };
    }
    if (poi.end_point) {
      metadata.endPoint = {
        nameCN: poi.end_point.name_zh,
        nameEN: poi.end_point.name_en,
        lat: poi.end_point.latitude,
        lng: poi.end_point.longitude,
        elevation: poi.end_point.elevation_m,
      };
    }
  }

  return metadata;
}

// 构建physicalMetadata
function buildPhysicalMetadata(poi: any): any {
  const physicalMetadata: any = {};
  
  const location = extractLocation(poi);
  if (location?.elevation !== undefined) {
    physicalMetadata.altitude = location.elevation;
  }

  return Object.keys(physicalMetadata).length > 0 ? physicalMetadata : undefined;
}

async function main() {
  console.log('='.repeat(60));
  console.log('导入阿根廷乌斯怀亚POI数据到Place表');
  console.log('='.repeat(60));
  console.log('');

  try {
    // 1. 读取数据文件
    const dataPath = path.join(process.cwd(), 'data/argentina/pois.md');
    console.log(`📖 读取数据文件: ${dataPath}`);

    if (!fs.existsSync(dataPath)) {
      throw new Error(`文件不存在: ${dataPath}`);
    }

    const rawData = fs.readFileSync(dataPath, 'utf-8');
    // 提取JSON部分（去掉markdown代码块标记）
    let jsonData = rawData;
    const jsonMatch = rawData.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonData = jsonMatch[1];
    } else {
      // 如果没有代码块，尝试直接解析
      const jsonStart = rawData.indexOf('{');
      const jsonEnd = rawData.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        jsonData = rawData.substring(jsonStart, jsonEnd + 1);
      }
    }
    const poiData: PoiData = JSON.parse(jsonData);

    console.log(`  找到 ${poiData.metadata.total_pois} 个POI\n`);

    // 2. 查找或创建乌斯怀亚城市
    console.log('🏙️  查找乌斯怀亚城市...');
    let ushuaiaCity = await prisma.city.findFirst({
      where: {
        OR: [
          { nameEN: 'Ushuaia' },
          { nameCN: '乌斯怀亚' },
          { name: 'Ushuaia' },
        ],
        countryCode: 'AR',
      },
    });

    if (!ushuaiaCity) {
      console.log('  未找到乌斯怀亚，创建城市记录...');
      ushuaiaCity = await prisma.city.create({
        data: {
          name: 'Ushuaia',
          nameEN: 'Ushuaia',
          nameCN: '乌斯怀亚',
          countryCode: 'AR',
          timezone: 'America/Argentina/Ushuaia',
        },
      });
      // 设置城市位置（使用原生SQL）
      await prisma.$executeRawUnsafe(
        `UPDATE "City"
         SET location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
         WHERE id = $3`,
        -68.3030, // lng
        -54.8019, // lat
        ushuaiaCity.id
      );
      console.log(`  ✅ 创建城市: ${ushuaiaCity.nameCN} (ID: ${ushuaiaCity.id})`);
    } else {
      console.log(`  ✅ 找到城市: ${ushuaiaCity.nameCN} (ID: ${ushuaiaCity.id})`);
    }
    console.log('');

    // 3. 收集所有POI
    const allPois: Array<{ poi: any; type: string }> = [];

    if (poiData.hiking_trails) {
      poiData.hiking_trails.forEach(poi => {
        // 只导入徒步路线本身，起点和终点信息存储在metadata中
        allPois.push({ poi, type: 'hiking_trail' });
      });
    }

    if (poiData.water_activities) {
      poiData.water_activities.forEach(poi => allPois.push({ poi, type: poi.type || 'water_activity' }));
    }

    if (poiData.museums_and_cultural) {
      poiData.museums_and_cultural.forEach(poi => allPois.push({ poi, type: poi.type || 'museum' }));
    }

    if (poiData.city_landmarks) {
      poiData.city_landmarks.forEach(poi => allPois.push({ poi, type: poi.type || 'landmark' }));
    }

    if (poiData.adventure_activities) {
      poiData.adventure_activities.forEach(poi => allPois.push({ poi, type: poi.type || 'adventure_activity' }));
    }

    if (poiData.seasonal_activities) {
      poiData.seasonal_activities.forEach(poi => allPois.push({ poi, type: poi.type || 'winter_activity' }));
    }

    if (poiData.geographic_landmarks) {
      poiData.geographic_landmarks.forEach(poi => allPois.push({ poi, type: poi.type || 'mountain' }));
    }

    console.log(`📍 找到 ${allPois.length} 个POI需要导入\n`);

    // 4. 导入POI
    console.log('📍 开始导入POI...');
    let imported = 0;
    let updated = 0;
    let skipped = 0;

    for (const { poi, type } of allPois) {
      try {
        const location = extractLocation(poi);
        if (!location) {
          console.log(`  ⚠️  跳过（无位置信息）: ${poi.name_zh || poi.name_en || poi.id}`);
          skipped++;
          continue;
        }

        const nameCN = poi.name_zh || poi.name_en || `POI-${poi.id}`;
        const nameEN = poi.name_en || poi.name_zh || null;
        const address = poi.location?.address || poi.address || null;

        // 检查是否已存在（通过nameCN和cityId判断）
        const existingPlace = await prisma.place.findFirst({
          where: {
            nameCN: nameCN,
            cityId: ushuaiaCity.id,
          },
        });

        const category = mapPoiTypeToCategory(type, poi);
        const metadata = buildMetadata(poi, type);
        const physicalMetadata = buildPhysicalMetadata(poi);

        const placeData = {
          nameCN,
          nameEN,
          category,
          cityId: ushuaiaCity.id,
          address,
          description: poi.description || poi.note || null,
          metadata: metadata as any,
          physicalMetadata: physicalMetadata as any,
          rating: poi.rating || null,
          updatedAt: new Date(),
        };

        if (existingPlace) {
          // 更新现有记录
          await prisma.place.update({
            where: { id: existingPlace.id },
            data: placeData,
          });
          updated++;
          console.log(`  ♻️  更新: ${nameCN}${nameEN ? ` (${nameEN})` : ''}`);
        } else {
          // 创建新记录
          await prisma.place.create({
            data: {
              ...placeData,
              uuid: uuidv4(),
              createdAt: new Date(),
            },
          });
          imported++;
          console.log(`  ✅ 导入: ${nameCN}${nameEN ? ` (${nameEN})` : ''}`);
        }

        // 更新location字段（使用原生SQL，因为Prisma不支持geography类型）
        await prisma.$executeRawUnsafe(
          `UPDATE "Place"
           SET location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
           WHERE "nameCN" = $3 AND "cityId" = $4`,
          location.lng,
          location.lat,
          nameCN,
          ushuaiaCity.id
        );

      } catch (error: any) {
        console.error(`  ❌ 导入失败: ${poi.name_zh || poi.name_en || poi.id}`, error.message);
        skipped++;
      }
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('📊 导入统计:');
    console.log(`  新增: ${imported} 个`);
    console.log(`  更新: ${updated} 个`);
    console.log(`  跳过: ${skipped} 个`);
    console.log(`  总计: ${allPois.length} 个`);
    console.log('='.repeat(60));

  } catch (error: any) {
    console.error('❌ 导入失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
