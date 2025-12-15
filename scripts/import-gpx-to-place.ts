// scripts/import-gpx-to-place.ts

/**
 * 从 GPX 文件导入数据到 Place 表
 * 
 * 使用方法:
 *   npm run import:gpx -- docs/武功山.gpx [--place-id=123] [--name=武功山]
 * 
 * 功能:
 *   1. 解析 GPX 文件，提取轨迹点、距离、爬升、高程等信息
 *   2. 查找或指定 Place 记录
 *   3. 更新 Place 的 metadata 和 physicalMetadata
 *   4. 计算路线难度
 */

import { PrismaClient } from '@prisma/client';
import { GPXParser } from '../src/places/utils/gpx-parser.util';
import { GPXFatigueCalculator } from '../src/places/utils/gpx-fatigue-calculator.util';
import { PhysicalMetadataGenerator } from '../src/places/utils/physical-metadata-generator.util';
import { PlaceCategory } from '@prisma/client';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const prisma = new PrismaClient();

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
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  const gpxFilePath = args[0];
  const placeIdArg = args.find(arg => arg.startsWith('--place-id='));
  const nameArg = args.find(arg => arg.startsWith('--name='));
  const dryRun = args.includes('--dry-run');
  
  if (!gpxFilePath) {
    console.error('❌ 请提供 GPX 文件路径');
    console.log('\n使用方法:');
    console.log('  npm run import:gpx -- <gpx文件路径> [选项]');
    console.log('\n选项:');
    console.log('  --place-id=123     # 指定 Place ID');
    console.log('  --name=武功山      # 通过名称查找 Place');
    console.log('  --dry-run          # 预览模式，不实际更新');
    return;
  }
  
  const placeId = placeIdArg ? parseInt(placeIdArg.split('=')[1].trim()) : undefined;
  const name = nameArg ? nameArg.split('=')[1].trim() : undefined;
  
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
    }
    
    // 解析 GPX 轨迹点
    console.log(`\n📊 解析 GPX 轨迹点...`);
    const points = GPXParser.parse(gpxXml);
    console.log(`   轨迹点数: ${points.length}`);
    
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
    
    // 查找或创建 Place
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

