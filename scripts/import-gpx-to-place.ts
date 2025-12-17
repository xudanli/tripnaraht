// scripts/import-gpx-to-place.ts

/**
 * 从 GPX 文件导入数据到 Place 表或 Trail 表
 * 
 * 使用方法:
 *   # 创建Trail（推荐）
 *   npm run import:gpx -- docs/武功山.gpx --create-trail [--start-place-id=123] [--end-place-id=456]
 *   
 *   # 更新Place（旧方式，向后兼容）
 *   npm run import:gpx -- docs/武功山.gpx --place-id=123 [--name=武功山]
 * 
 * 功能:
 *   1. 解析 GPX 文件，提取轨迹点、距离、爬升、高程等信息
 *   2. 创建 Trail 记录（推荐）或更新 Place 记录（向后兼容）
 *   3. 计算路线难度
 */

import { PrismaClient } from '@prisma/client';
import { GPXParser } from '../src/places/utils/gpx-parser.util';
import { GPXFatigueCalculator } from '../src/places/utils/gpx-fatigue-calculator.util';
import { PhysicalMetadataGenerator } from '../src/places/utils/physical-metadata-generator.util';
import { PlaceCategory } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const prisma = new PrismaClient();

/**
 * 计算两点之间的距离（公里）
 * 使用 Haversine 公式
 */
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // 地球半径（公里）
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * 从 GPX 文件提取元数据（名称、描述等）
 */
function extractGPXMetadata(gpxXml: string): {
  name?: string;
  description?: string;
  bounds?: { minlat: number; minlon: number; maxlat: number; maxlon: number };
} {
  const metadata: any = {};
  
  // 提取名称
  const nameMatch = gpxXml.match(/<name><!\[CDATA\[([^\]]+)\]\]><\/name>/i) || 
                    gpxXml.match(/<name>([^<]+)<\/name>/i);
  if (nameMatch) {
    metadata.name = nameMatch[1].trim();
  }
  
  // 提取描述
  const descMatch = gpxXml.match(/<desc><!\[CDATA\[([^\]]*)\]\]><\/desc>/i) ||
                    gpxXml.match(/<desc>([^<]*)<\/desc>/i);
  if (descMatch && descMatch[1]) {
    metadata.description = descMatch[1].trim();
  }
  
  // 提取边界
  const boundsMatch = gpxXml.match(/<bounds\s+minlat="([^"]+)"\s+minlon="([^"]+)"\s+maxlat="([^"]+)"\s+maxlon="([^"]+)"/i);
  if (boundsMatch) {
    metadata.bounds = {
      minlat: parseFloat(boundsMatch[1]),
      minlon: parseFloat(boundsMatch[2]),
      maxlat: parseFloat(boundsMatch[3]),
      maxlon: parseFloat(boundsMatch[4]),
    };
  }
  
  return metadata;
}

/**
 * 使用 Python 脚本计算难度
 */
async function calculateDifficulty(
  distance_km: number,
  elevation_gain_m: number,
  max_elevation_m: number,
  slope_avg: number,
  metadata: any
): Promise<any> {
  // 使用绝对路径，避免 __file__ 在 -c 模式下不可用的问题
  const projectRoot = process.cwd();
  const pythonCode = `
import sys
import json
import os
sys.path.insert(0, ${JSON.stringify(projectRoot)})

from models.trail_difficulty import DifficultyEstimator

input_data = ${JSON.stringify(metadata).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}
distance_km = ${distance_km}
gain_m = ${elevation_gain_m}
max_elev_m = ${max_elevation_m}
slope_avg = ${slope_avg}

label, S_km, notes = DifficultyEstimator.estimate_difficulty(
    input_data,
    distance_km=distance_km,
    gain_m=gain_m,
    max_elev_m=max_elev_m,
    slope_avg=slope_avg,
)

result = {
    "distance_km": round(distance_km, 3),
    "elevation_gain_m": round(gain_m, 1),
    "slope_avg": round(slope_avg, 4),
    "label": label.value,
    "S_km": S_km,
    "notes": notes,
}

print(json.dumps(result, ensure_ascii=False))
`;

  try {
    const { stdout } = await execFileAsync(
      'python3',
      ['-c', pythonCode],
      {
        cwd: process.cwd(),
        timeout: 10000,
        maxBuffer: 1024 * 1024,
      },
    );
    
    return JSON.parse(stdout.trim());
  } catch (error: any) {
    console.error(`  ⚠️  Python 脚本执行失败: ${error?.message || String(error)}`);
    return null;
  }
}

/**
 * 查找或创建 Place 记录
 */
async function findOrCreatePlace(
  placeId?: number,
  name?: string,
  gpxMetadata?: any
): Promise<{ id: number; nameCN: string; nameEN: string | null; category: string } | null> {
  // 如果指定了 placeId，直接查找
  if (placeId) {
    const place = await prisma.place.findUnique({
      where: { id: placeId },
      select: {
        id: true,
        nameCN: true,
        nameEN: true,
        category: true,
      },
    });
    
    if (place) {
      return place as any;
    }
    
    console.error(`❌ 未找到 ID 为 ${placeId} 的 Place 记录`);
    return null;
  }
  
  // 通过名称查找
  const searchName = name || gpxMetadata?.name || '武功山';
  console.log(`🔍 查找 Place: ${searchName}...`);
  
  const places = await prisma.$queryRaw<Array<{
    id: number;
    nameCN: string;
    nameEN: string | null;
    category: string;
  }>>`
    SELECT id, "nameCN", "nameEN", category
    FROM "Place"
    WHERE "nameCN" ILIKE ${`%${searchName}%`}
       OR "nameEN" ILIKE ${`%${searchName}%`}
    LIMIT 10
  `;
  
  if (places.length === 0) {
    console.error(`❌ 未找到名称包含 "${searchName}" 的 Place 记录`);
    console.log(`💡 提示：可以使用 --place-id=123 指定 Place ID`);
    return null;
  }
  
  if (places.length > 1) {
    console.log(`⚠️  找到 ${places.length} 条匹配记录:`);
    places.forEach((p, i) => {
      console.log(`   ${i + 1}. ID: ${p.id}, 名称: ${p.nameCN || p.nameEN}, 类别: ${p.category}`);
    });
    console.log(`\n💡 提示：使用 --place-id=${places[0].id} 指定要更新的 Place`);
    return places[0];
  }
  
  return places[0];
}

/**
 * 更新 Place 记录
 */
async function updatePlaceFromGPX(
  placeId: number,
  gpxAnalysis: any,
  gpxMetadata: any,
  dryRun: boolean = false
): Promise<boolean> {
  try {
    const place = await prisma.place.findUnique({
      where: { id: placeId },
      select: {
        id: true,
        nameCN: true,
        nameEN: true,
        category: true,
        metadata: true,
        physicalMetadata: true,
      },
    });
    
    if (!place) {
      console.error(`❌ Place ID ${placeId} 不存在`);
      return false;
    }
    
    const name = place.nameCN || place.nameEN || `ID: ${place.id}`;
    console.log(`\n📝 处理: ${name} (ID: ${place.id}, Category: ${place.category})`);
    
    // 计算难度
    const difficultyMeta = {
      category: place.category || 'ATTRACTION',
      accessType: 'HIKING',
      elevationMeters: gpxAnalysis.maxElevation,
      latitude: (gpxMetadata.bounds?.minlat + gpxMetadata.bounds?.maxlat) / 2,
    };
    
    const difficultyResult = await calculateDifficulty(
      gpxAnalysis.totalDistance,
      gpxAnalysis.elevationGain,
      gpxAnalysis.maxElevation,
      gpxAnalysis.averageSlope / 100, // 转换为小数
      difficultyMeta
    );
    
    if (difficultyResult) {
      console.log(`  📊 难度计算结果:`);
      console.log(`     距离: ${difficultyResult.distance_km} km`);
      console.log(`     爬升: ${difficultyResult.elevation_gain_m} m`);
      console.log(`     难度: ${difficultyResult.label}`);
      console.log(`     等效强度: ${difficultyResult.S_km} km`);
    }
    
    // 准备更新的 metadata
    const currentMetadata = (place.metadata as any) || {};
    const updatedMetadata: any = {
      ...currentMetadata,
      source: 'gpx',
      sourceUrl: gpxMetadata.name ? `gpx:${gpxMetadata.name}` : undefined,
      name: gpxMetadata.name || currentMetadata.name,
      description: gpxMetadata.description || currentMetadata.description,
      length: `${gpxAnalysis.totalDistance.toFixed(1)} km`,
      elevationGain: `${Math.round(gpxAnalysis.elevationGain)} m`,
      accessType: 'HIKING',
      elevationMeters: gpxAnalysis.maxElevation,
      difficultyMetadata: difficultyResult ? {
        level: difficultyResult.label,
        source: 'calculated',
        confidence: 0.9,
        calculatedAt: new Date().toISOString(),
        distance_km: difficultyResult.distance_km,
        elevation_gain_m: difficultyResult.elevation_gain_m,
        slope_avg: difficultyResult.slope_avg,
        S_km: difficultyResult.S_km,
        notes: difficultyResult.notes,
      } : undefined,
    };
    
    // 准备更新的 physicalMetadata
    const currentPhysicalMetadata = (place.physicalMetadata as any) || {};
    const updatedPhysicalMetadata: any = {
      ...currentPhysicalMetadata,
      totalDistance: gpxAnalysis.totalDistance,
      elevationGain: gpxAnalysis.elevationGain,
      maxElevation: gpxAnalysis.maxElevation,
      minElevation: gpxAnalysis.minElevation,
      source: 'gpx',
    };
    
    // 使用 PhysicalMetadataGenerator 生成完整的 physicalMetadata
    try {
      const generated = PhysicalMetadataGenerator.generateByCategory(
        place.category as PlaceCategory,
        updatedMetadata
      );
      Object.assign(updatedPhysicalMetadata, generated);
    } catch (e: any) {
      console.warn(`  ⚠️  生成 physicalMetadata 失败: ${e?.message || String(e)}`);
    }
    
    if (dryRun) {
      console.log(`  🔍 [DRY RUN] 将更新以下数据:`);
      console.log(`     metadata:`, JSON.stringify(updatedMetadata, null, 2));
      console.log(`     physicalMetadata:`, JSON.stringify(updatedPhysicalMetadata, null, 2));
      return true;
    }
    
    // 更新数据库
    await prisma.place.update({
      where: { id: placeId },
      data: {
        metadata: updatedMetadata as any,
        physicalMetadata: updatedPhysicalMetadata as any,
        updatedAt: new Date(),
      } as any,
    });
    
    console.log(`  ✅ 已更新 Place 数据`);
    return true;
  } catch (error: any) {
    console.error(`  ❌ 更新失败: ${error?.message || String(error)}`);
    return false;
  }
}

/**
 * 创建Trail记录
 */
async function createTrailFromGPX(
  gpxAnalysis: any,
  gpxMetadata: any,
  points: any[],
  startPlaceId?: number,
  endPlaceId?: number,
  dryRun: boolean = false
): Promise<boolean> {
  try {
    // 计算难度
    const difficultyMeta = {
      category: 'ATTRACTION',
      accessType: 'HIKING',
      elevationMeters: gpxAnalysis.maxElevation,
      latitude: gpxMetadata.bounds 
        ? (gpxMetadata.bounds.minlat + gpxMetadata.bounds.maxlat) / 2
        : undefined,
    };
    
    const difficultyResult = await calculateDifficulty(
      gpxAnalysis.totalDistance,
      gpxAnalysis.elevationGain,
      gpxAnalysis.maxElevation,
      gpxAnalysis.averageSlope / 100,
      difficultyMeta
    );
    
    if (difficultyResult) {
      console.log(`  📊 难度计算结果:`);
      console.log(`     距离: ${difficultyResult.distance_km} km`);
      console.log(`     爬升: ${difficultyResult.elevation_gain_m} m`);
      console.log(`     难度: ${difficultyResult.label}`);
      console.log(`     等效强度: ${difficultyResult.S_km} km`);
    }
    
    // 准备Trail数据
    const trailData: any = {
      uuid: randomUUID(),
      nameCN: gpxMetadata.name || '未命名路线',
      nameEN: gpxMetadata.name || undefined,
      description: gpxMetadata.description,
      distanceKm: gpxAnalysis.totalDistance,
      elevationGainM: gpxAnalysis.elevationGain,
      elevationLossM: gpxAnalysis.elevationLoss,
      maxElevationM: gpxAnalysis.maxElevation,
      minElevationM: gpxAnalysis.minElevation,
      averageSlope: gpxAnalysis.averageSlope,
      difficultyLevel: difficultyResult?.label,
      equivalentDistanceKm: difficultyResult?.S_km,
      fatigueScore: gpxAnalysis.fatigueScore,
      gpxData: points.map(p => ({
        lat: p.lat,
        lng: p.lng,
        elevation: p.elevation,
        time: p.time,
      })),
      bounds: gpxMetadata.bounds,
      startPlaceId: startPlaceId,
      endPlaceId: endPlaceId,
      metadata: {
        source: 'gpx',
        sourceUrl: gpxMetadata.name ? `gpx:${gpxMetadata.name}` : undefined,
        calculatedAt: new Date().toISOString(),
        difficultyMetadata: difficultyResult ? {
          level: difficultyResult.label,
          source: 'calculated',
          confidence: 0.9,
          calculatedAt: new Date().toISOString(),
          distance_km: difficultyResult.distance_km,
          elevation_gain_m: difficultyResult.elevation_gain_m,
          slope_avg: difficultyResult.slope_avg,
          S_km: difficultyResult.S_km,
          notes: difficultyResult.notes,
        } : undefined,
      },
      source: 'gpx',
      estimatedDurationHours: gpxAnalysis.totalDistance > 0 
        ? gpxAnalysis.totalDistance / 3.0 // 假设平均速度3km/h
        : undefined,
    };
    
    if (dryRun) {
      console.log(`  🔍 [DRY RUN] 将创建以下Trail:`);
      console.log(JSON.stringify(trailData, null, 2));
      return true;
    }
    
    // 创建Trail
    const trail = await prisma.trail.create({
      data: trailData as any,
    });
    
    console.log(`  ✅ 已创建 Trail: ${trail.nameCN} (ID: ${trail.id})`);
    return true;
  } catch (error: any) {
    console.error(`  ❌ 创建Trail失败: ${error?.message || String(error)}`);
    return false;
  }
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  const gpxFilePath = args[0];
  const placeIdArg = args.find(arg => arg.startsWith('--place-id='));
  const nameArg = args.find(arg => arg.startsWith('--name='));
  const createTrail = args.includes('--create-trail');
  const startPlaceIdArg = args.find(arg => arg.startsWith('--start-place-id='));
  const endPlaceIdArg = args.find(arg => arg.startsWith('--end-place-id='));
  const dryRun = args.includes('--dry-run');
  
  if (!gpxFilePath) {
    console.error('❌ 请提供 GPX 文件路径');
    console.log('\n使用方法:');
    console.log('  # 创建Trail（推荐）');
    console.log('  npm run import:gpx -- <gpx文件路径> --create-trail [--start-place-id=123] [--end-place-id=456]');
    console.log('\n  # 更新Place（向后兼容）');
    console.log('  npm run import:gpx -- <gpx文件路径> --place-id=123 [--name=武功山]');
    console.log('\n选项:');
    console.log('  --create-trail          # 创建Trail记录（推荐）');
    console.log('  --start-place-id=123    # 起点Place ID');
    console.log('  --end-place-id=456      # 终点Place ID');
    console.log('  --place-id=123          # 指定 Place ID（更新Place模式）');
    console.log('  --name=武功山           # 通过名称查找 Place（更新Place模式）');
    console.log('  --dry-run               # 预览模式，不实际更新');
    return;
  }
  
  const placeId = placeIdArg ? parseInt(placeIdArg.split('=')[1].trim()) : undefined;
  const name = nameArg ? nameArg.split('=')[1].trim() : undefined;
  const startPlaceId = startPlaceIdArg ? parseInt(startPlaceIdArg.split('=')[1].trim()) : undefined;
  const endPlaceId = endPlaceIdArg ? parseInt(endPlaceIdArg.split('=')[1].trim()) : undefined;
  
  console.log('📂 读取 GPX 文件...\n');
  console.log(`   文件路径: ${gpxFilePath}`);
  
  try {
    // 读取 GPX 文件
    const fs = await import('fs/promises');
    const gpxXml = await fs.readFile(gpxFilePath, 'utf-8');
    
    // 提取 GPX 元数据
    const gpxMetadata = extractGPXMetadata(gpxXml);
    console.log(`   路线名称: ${gpxMetadata.name || '未命名'}`);
    if (gpxMetadata.bounds) {
      console.log(`   边界: ${gpxMetadata.bounds.minlat},${gpxMetadata.bounds.minlon} 到 ${gpxMetadata.bounds.maxlat},${gpxMetadata.bounds.maxlon}`);
      // 验证边界坐标是否合理（中国境内大致范围：纬度18-54，经度73-135）
      if (gpxMetadata.bounds.minlat < 18 || gpxMetadata.bounds.maxlat > 54 || 
          gpxMetadata.bounds.minlon < 73 || gpxMetadata.bounds.maxlon > 135) {
        console.warn(`   ⚠️  警告：边界坐标超出中国境内范围，可能经纬度顺序错误！`);
        console.warn(`      如果这是中国境内的路线，请检查GPX文件中的lat和lon属性是否被交换了`);
      }
    }
    
    // 解析 GPX 轨迹点
    console.log(`\n📊 解析 GPX 轨迹点...`);
    const points = GPXParser.parse(gpxXml);
    console.log(`   轨迹点数: ${points.length}`);
    
    // 验证第一个和最后一个点的坐标
    if (points.length > 0) {
      const firstPoint = points[0];
      const lastPoint = points[points.length - 1];
      console.log(`   起点坐标: 纬度 ${firstPoint.lat.toFixed(6)}, 经度 ${firstPoint.lng.toFixed(6)}`);
      console.log(`   终点坐标: 纬度 ${lastPoint.lat.toFixed(6)}, 经度 ${lastPoint.lng.toFixed(6)}`);
      
      // 验证坐标是否合理（中国境内大致范围）
      const isFirstPointValid = firstPoint.lat >= 18 && firstPoint.lat <= 54 && 
                                firstPoint.lng >= 73 && firstPoint.lng <= 135;
      const isLastPointValid = lastPoint.lat >= 18 && lastPoint.lat <= 54 && 
                               lastPoint.lng >= 73 && lastPoint.lng <= 135;
      
      if (!isFirstPointValid || !isLastPointValid) {
        console.warn(`   ⚠️  警告：起点或终点坐标超出中国境内范围！`);
        console.warn(`      起点: 纬度 ${firstPoint.lat.toFixed(6)}, 经度 ${firstPoint.lng.toFixed(6)}`);
        console.warn(`      终点: 纬度 ${lastPoint.lat.toFixed(6)}, 经度 ${lastPoint.lng.toFixed(6)}`);
        console.warn(`      如果这是中国境内的路线，可能GPX文件中的lat和lon属性被交换了`);
        console.warn(`      或者坐标系统不是WGS84（EPSG:4326）`);
      }
    }
    
    if (points.length < 2) {
      console.error('❌ GPX 文件至少需要 2 个轨迹点');
      return;
    }
    
    // 分析 GPX 数据
    console.log(`\n📈 分析路线数据...`);
    const gpxAnalysis = GPXFatigueCalculator.analyzeGPX(points);
    console.log(`   总距离: ${gpxAnalysis.totalDistance.toFixed(2)} km`);
    console.log(`   累计爬升: ${Math.round(gpxAnalysis.elevationGain)} m`);
    console.log(`   累计下降: ${Math.round(gpxAnalysis.elevationLoss)} m`);
    console.log(`   最高海拔: ${Math.round(gpxAnalysis.maxElevation)} m`);
    console.log(`   最低海拔: ${Math.round(gpxAnalysis.minElevation)} m`);
    console.log(`   平均坡度: ${gpxAnalysis.averageSlope.toFixed(2)}%`);
    console.log(`   等效距离: ${gpxAnalysis.equivalentDistance.toFixed(2)} km`);
    
    // 根据模式选择创建Trail或更新Place
    if (createTrail) {
      // 创建Trail模式
      console.log(`\n🏔️  创建 Trail 记录...`);
      
      if (startPlaceId) {
        const startPlace = await prisma.place.findUnique({
          where: { id: startPlaceId },
          select: { id: true, nameCN: true, nameEN: true },
        });
        if (startPlace) {
          // 获取起点坐标用于验证
          const startLocation = await prisma.$queryRaw<Array<{
            lat: number;
            lng: number;
          }>>`
            SELECT 
              ST_Y(location::geometry) as lat,
              ST_X(location::geometry) as lng
            FROM "Place"
            WHERE id = ${startPlaceId}
          `;
          
          if (startLocation[0]) {
            console.log(`   起点: ${startPlace.nameCN || startPlace.nameEN} (ID: ${startPlace.id})`);
            console.log(`   起点坐标: 纬度 ${startLocation[0].lat.toFixed(6)}, 经度 ${startLocation[0].lng.toFixed(6)}`);
            
            // 验证起点坐标是否与GPX起点接近
            if (points.length > 0) {
              const gpxStart = points[0];
              const distance = calculateDistance(
                gpxStart.lat, gpxStart.lng,
                startLocation[0].lat, startLocation[0].lng
              );
              console.log(`   GPX起点与Place起点距离: ${distance.toFixed(2)} 公里`);
              if (distance > 10) {
                console.warn(`   ⚠️  警告：GPX起点与Place起点距离较远（${distance.toFixed(2)}公里），请确认是否正确`);
              }
            }
          } else {
            console.log(`   起点: ${startPlace.nameCN || startPlace.nameEN} (ID: ${startPlace.id})`);
            console.warn(`   ⚠️  起点Place没有坐标信息`);
          }
        } else {
          console.warn(`   ⚠️  起点Place ID ${startPlaceId} 不存在，将跳过`);
        }
      }
      
      if (endPlaceId) {
        const endPlace = await prisma.place.findUnique({
          where: { id: endPlaceId },
          select: { id: true, nameCN: true, nameEN: true },
        });
        if (endPlace) {
          // 获取终点坐标用于验证
          const endLocation = await prisma.$queryRaw<Array<{
            lat: number;
            lng: number;
          }>>`
            SELECT 
              ST_Y(location::geometry) as lat,
              ST_X(location::geometry) as lng
            FROM "Place"
            WHERE id = ${endPlaceId}
          `;
          
          if (endLocation[0]) {
            console.log(`   终点: ${endPlace.nameCN || endPlace.nameEN} (ID: ${endPlace.id})`);
            console.log(`   终点坐标: 纬度 ${endLocation[0].lat.toFixed(6)}, 经度 ${endLocation[0].lng.toFixed(6)}`);
            
            // 验证终点坐标是否与GPX终点接近
            if (points.length > 0) {
              const gpxEnd = points[points.length - 1];
              const distance = calculateDistance(
                gpxEnd.lat, gpxEnd.lng,
                endLocation[0].lat, endLocation[0].lng
              );
              console.log(`   GPX终点与Place终点距离: ${distance.toFixed(2)} 公里`);
              if (distance > 10) {
                console.warn(`   ⚠️  警告：GPX终点与Place终点距离较远（${distance.toFixed(2)}公里），请确认是否正确`);
              }
            }
          } else {
            console.log(`   终点: ${endPlace.nameCN || endPlace.nameEN} (ID: ${endPlace.id})`);
            console.warn(`   ⚠️  终点Place没有坐标信息`);
          }
        } else {
          console.warn(`   ⚠️  终点Place ID ${endPlaceId} 不存在，将跳过`);
        }
      }
      
      if (dryRun) {
        console.log(`\n🔍 [DRY RUN 模式] 仅预览，不会实际创建数据库\n`);
      }
      
      const success = await createTrailFromGPX(
        gpxAnalysis,
        gpxMetadata,
        points,
        startPlaceId,
        endPlaceId,
        dryRun
      );
      
      if (success) {
        console.log(`\n${'='.repeat(60)}`);
        if (dryRun) {
          console.log(`💡 这是 DRY RUN 模式，未实际创建数据库`);
          console.log(`   如需实际创建，请移除 --dry-run 参数`);
        } else {
          console.log(`✅ GPX 数据已成功创建为 Trail 记录`);
        }
      }
    } else {
      // 更新Place模式（向后兼容）
      console.log(`\n🔍 查找 Place 记录...`);
      const place = await findOrCreatePlace(placeId, name, gpxMetadata);
      
      if (!place) {
        return;
      }
      
      console.log(`   ✅ 找到 Place: ${place.nameCN || place.nameEN} (ID: ${place.id})`);
      
      if (dryRun) {
        console.log(`\n🔍 [DRY RUN 模式] 仅预览，不会实际更新数据库\n`);
      }
      
      // 更新 Place
      const success = await updatePlaceFromGPX(place.id, gpxAnalysis, gpxMetadata, dryRun);
      
      if (success) {
        console.log(`\n${'='.repeat(60)}`);
        if (dryRun) {
          console.log(`💡 这是 DRY RUN 模式，未实际更新数据库`);
          console.log(`   如需实际更新，请移除 --dry-run 参数`);
        } else {
          console.log(`✅ GPX 数据已成功更新到 Place ID ${place.id}`);
        }
      }
    }
  } catch (error: any) {
    console.error(`\n❌ 处理失败: ${error?.message || String(error)}`);
    if (error.stack) {
      console.error(error.stack);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

