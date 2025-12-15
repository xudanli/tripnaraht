// scripts/batch-calculate-route-difficulty.ts

/**
 * 批量计算 Place 表的路线难度
 * 
 * 使用方法:
 *   npm run batch:calculate:difficulty [选项]
 * 
 * 选项:
 *   --category=ATTRACTION    # 只处理指定类别
 *   --source=alltrails       # 只处理指定来源
 *   --limit=100              # 限制处理数量
 *   --offset=0               # 跳过前N条
 *   --batch=1                # 处理第N批（自动计算offset）
 *   --batch-size=50          # 每批处理的数量（默认50）
 *   --dry-run                # 预览模式，不实际更新
 *   --force                  # 强制重新计算（即使已有数据）
 * 
 * 分批处理示例:
 *   # 处理第1批（前50条）
 *   npm run batch:calculate:difficulty -- --source=alltrails --batch=1 --batch-size=50
 *   
 *   # 处理第2批（51-100条）
 *   npm run batch:calculate:difficulty -- --source=alltrails --batch=2 --batch-size=50
 *   
 *   # 脚本会自动显示下一批的命令
 * 
 * 功能:
 *   1. 查询符合条件的 Place 记录
 *   2. 对于有 AllTrails 数据的 Place，使用已有数据计算难度
 *   3. 对于没有 AllTrails 数据的 Place，如果有 location，可以尝试计算（需要起点和终点）
 *   4. 更新 metadata 中的 difficultyMetadata 或相关字段
 */

import { PrismaClient } from '@prisma/client';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';

const execFileAsync = promisify(execFile);
const prisma = new PrismaClient();

interface ScriptOptions {
  category?: string;
  source?: string;
  limit?: number;
  offset?: number;
  dryRun?: boolean;
  force?: boolean;
  batchSize?: number; // 每批处理的数量
  batchNumber?: number; // 处理第几批（从1开始）
}

/**
 * 从 Place 的 location 获取坐标
 */
async function getPlaceLocation(placeId: number): Promise<{ lat: number; lng: number } | null> {
  try {
    const result = await prisma.$queryRaw<Array<{
      lat: number;
      lng: number;
    }>>`
      SELECT 
        ST_Y(location::geometry) as lat,
        ST_X(location::geometry) as lng
      FROM "Place"
      WHERE id = ${placeId}
        AND location IS NOT NULL
    `;
    
    if (result.length > 0) {
      return { lat: result[0].lat, lng: result[0].lng };
    }
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * 解析字符串格式的距离和爬升
 */
function parseDistanceString(distanceStr: string): number | null {
  if (!distanceStr) return null;
  const cleaned = distanceStr.replace(/,/g, '').trim();
  const match = cleaned.match(/([\d.]+)\s*(km|m|mi|mile)/i);
  if (!match) return null;
  
  const value = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  
  if (unit === 'km') return value;
  if (unit === 'm') return value / 1000;
  if (unit === 'mi' || unit === 'mile') return value * 1.60934;
  return null;
}

function parseElevationGainString(elevationStr: string): number | null {
  if (!elevationStr) return null;
  const cleaned = elevationStr.replace(/,/g, '').trim();
  const match = cleaned.match(/([\d.]+)\s*(m|ft|feet)/i);
  if (!match) return null;
  
  const value = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  
  if (unit === 'm') return value;
  if (unit === 'ft' || unit === 'feet') return value * 0.3048;
  return null;
}

/**
 * 使用 Python 脚本计算难度（从 Place 数据）
 */
async function calculateDifficultyFromPlace(
  place: any,
  options: ScriptOptions
): Promise<any | null> {
  const metadata = place.metadata || {};
  const physicalMetadata = place.physicalMetadata || {};
  
  // 检查是否有必要的数据
  const hasLength = metadata.length || physicalMetadata.totalDistance;
  const hasElevationGain = metadata.elevationGain || physicalMetadata.elevationGain;
  
  if (!hasLength || !hasElevationGain) {
    return null; // 数据不完整，无法计算
  }
  
  // 解析距离和爬升
  let distance_km: number | null = null;
  if (metadata.length) {
    distance_km = parseDistanceString(metadata.length);
  }
  if (!distance_km && physicalMetadata.totalDistance) {
    distance_km = typeof physicalMetadata.totalDistance === 'number'
      ? physicalMetadata.totalDistance
      : null;
  }
  
  let elevation_gain_m: number | null = null;
  if (metadata.elevationGain) {
    elevation_gain_m = parseElevationGainString(metadata.elevationGain);
  }
  if (!elevation_gain_m && physicalMetadata.elevationGain) {
    elevation_gain_m = typeof physicalMetadata.elevationGain === 'number'
      ? physicalMetadata.elevationGain
      : null;
  }
  
  if (!distance_km || !elevation_gain_m) {
    return null;
  }
  
  // 准备 Python 脚本参数
  const pythonScriptPath = path.join(process.cwd(), 'tools', 'end2end_difficulty_with_geojson.py');
  const args: string[] = [
    '--provider', 'google', // 使用 google，但实际不会调用 API（因为使用 placeId）
  ];
  
  // 构建 meta 数据
  const meta: any = {
    category: place.category || 'ATTRACTION',
    accessType: metadata.accessType || 'HIKING',
    visitDuration: metadata.visitDuration,
    typicalStay: metadata.typicalStay,
    elevationMeters: metadata.elevationMeters || physicalMetadata.maxElevation,
    latitude: null, // 可以从 location 获取
    subCategory: metadata.subCategory,
    trailDifficulty: metadata.difficultyMetadata?.level,
  };
  
  // 如果有 location，获取纬度
  const location = await getPlaceLocation(place.id);
  if (location) {
    meta.latitude = location.lat;
  }
  
  // 调用 Python 脚本进行评估（使用内联 Python 代码）
  const pythonCode = `
import sys
import json
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.trail_difficulty import DifficultyEstimator

input_data = ${JSON.stringify(meta).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}
distance_km = ${distance_km}
gain_m = ${elevation_gain_m}
max_elev_m = ${meta.elevationMeters ? meta.elevationMeters : 'None'}
slope_avg = ${distance_km > 0 ? elevation_gain_m / (distance_km * 1000) : 0}

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
 * 处理单个 Place
 */
async function processPlace(place: any, options: ScriptOptions): Promise<boolean> {
  const name = place.nameCN || place.nameEN || `ID: ${place.id}`;
  console.log(`\n📝 处理: ${name} (ID: ${place.id}, Category: ${place.category})`);
  
  try {
    // 检查是否已有 difficultyMetadata 且不需要强制更新
    const metadata = place.metadata || {};
    if (!options.force && metadata.difficultyMetadata?.level) {
      console.log(`  ⏭️  已有难度数据，跳过（使用 --force 强制重新计算）`);
      return false;
    }
    
    // 计算难度
    const result = await calculateDifficultyFromPlace(place, options);
    
    if (!result) {
      console.log(`  ⚠️  数据不完整，无法计算难度`);
      return false;
    }
    
    console.log(`  📊 计算结果:`);
    console.log(`     距离: ${result.distance_km} km`);
    console.log(`     爬升: ${result.elevation_gain_m} m`);
    console.log(`     难度: ${result.label}`);
    console.log(`     等效强度: ${result.S_km} km`);
    
    if (options.dryRun) {
      console.log(`  🔍 [DRY RUN] 将更新 difficultyMetadata`);
      return true;
    }
    
    // 更新 metadata
    const updatedMetadata = {
      ...metadata,
      difficultyMetadata: {
        level: result.label,
        source: 'calculated',
        confidence: 0.8,
        calculatedAt: new Date().toISOString(),
        distance_km: result.distance_km,
        elevation_gain_m: result.elevation_gain_m,
        slope_avg: result.slope_avg,
        S_km: result.S_km,
        notes: result.notes,
      },
    };
    
    await prisma.place.update({
      where: { id: place.id },
      data: {
        metadata: updatedMetadata as any,
        updatedAt: new Date(),
      } as any,
    });
    
    console.log(`  ✅ 已更新 difficultyMetadata`);
    return true;
  } catch (error: any) {
    console.error(`  ❌ 处理失败: ${error?.message || String(error)}`);
    return false;
  }
}

/**
 * 获取符合条件的 Place 总数
 */
async function getTotalCount(options: ScriptOptions): Promise<number> {
  const where: any = {};
  if (options.category) {
    where.category = options.category;
  }
  if (options.source) {
    where.metadata = {
      path: ['source'],
      equals: options.source,
    };
  }
  
  return await prisma.place.count({
    where: where as any,
  });
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  const options: ScriptOptions = {
    limit: 100,
    offset: 0,
    dryRun: args.includes('--dry-run'),
    force: args.includes('--force'),
    batchSize: 50, // 默认每批50条
  };
  
  // 解析参数
  const categoryArg = args.find(arg => arg.startsWith('--category='));
  const sourceArg = args.find(arg => arg.startsWith('--source='));
  const limitArg = args.find(arg => arg.startsWith('--limit='));
  const offsetArg = args.find(arg => arg.startsWith('--offset='));
  const batchSizeArg = args.find(arg => arg.startsWith('--batch-size='));
  const batchNumberArg = args.find(arg => arg.startsWith('--batch='));
  
  if (categoryArg) {
    options.category = categoryArg.split('=')[1].trim();
  }
  if (sourceArg) {
    options.source = sourceArg.split('=')[1].trim();
  }
  if (limitArg) {
    options.limit = parseInt(limitArg.split('=')[1].trim());
  }
  if (offsetArg) {
    options.offset = parseInt(offsetArg.split('=')[1].trim());
  }
  if (batchSizeArg) {
    options.batchSize = parseInt(batchSizeArg.split('=')[1].trim());
  }
  if (batchNumberArg) {
    options.batchNumber = parseInt(batchNumberArg.split('=')[1].trim());
    // 如果指定了批次号，自动计算 offset
    if (options.batchNumber > 0) {
      options.offset = (options.batchNumber - 1) * (options.batchSize || 50);
      options.limit = options.batchSize;
    }
  }
  
  console.log('🔍 查询 Place 记录...\n');
  
  // 获取总数
  const totalCount = await getTotalCount(options);
  console.log(`📊 符合条件的记录总数: ${totalCount}`);
  
  if (options.batchNumber) {
    const totalBatches = Math.ceil(totalCount / (options.batchSize || 50));
    console.log(`📦 批次信息: 第 ${options.batchNumber}/${totalBatches} 批`);
    console.log(`   每批大小: ${options.batchSize}`);
    console.log(`   当前偏移: ${options.offset}`);
  }
  
  console.log(`\n选项:`, {
    category: options.category || '全部',
    source: options.source || '全部',
    limit: options.limit,
    offset: options.offset,
    batchSize: options.batchSize,
    dryRun: options.dryRun,
    force: options.force,
  });
  
  // 构建查询条件
  const where: any = {};
  if (options.category) {
    where.category = options.category;
  }
  if (options.source) {
    where.metadata = {
      path: ['source'],
      equals: options.source,
    };
  }
  
  // 查询 Place 记录
  const places = await prisma.place.findMany({
    where: where as any,
    select: {
      id: true,
      nameCN: true,
      nameEN: true,
      category: true,
      metadata: true,
      physicalMetadata: true,
    },
    take: options.limit,
    skip: options.offset,
    orderBy: { id: 'asc' },
  });
  
  if (places.length === 0) {
    console.log('❌ 未找到符合条件的 Place 记录');
    return;
  }
  
  console.log(`\n📊 找到 ${places.length} 条记录，开始处理...\n`);
  
  if (options.dryRun) {
    console.log('🔍 [DRY RUN 模式] 仅预览，不会实际更新数据库\n');
  }
  
  // 处理每个 Place
  let successCount = 0;
  let failCount = 0;
  let skipCount = 0;
  
  for (const place of places) {
    const result = await processPlace(place, options);
    if (result === true) {
      successCount++;
    } else if (result === false) {
      // 检查是否是跳过（已有数据）
      const metadata = place.metadata || {};
      if (!options.force && metadata.difficultyMetadata?.level) {
        skipCount++;
      } else {
        failCount++;
      }
    }
    
    // 添加延迟，避免过载
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // 输出统计
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 处理统计:`);
  console.log(`   成功: ${successCount}`);
  console.log(`   失败: ${failCount}`);
  console.log(`   跳过: ${skipCount}`);
  console.log(`   总计: ${places.length}`);
  
  // 如果使用批次模式，显示下一批的命令
  if (options.batchNumber) {
    const totalBatches = Math.ceil(totalCount / (options.batchSize || 50));
    const nextBatch = options.batchNumber + 1;
    
    if (nextBatch <= totalBatches) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`📦 批次处理提示:`);
      console.log(`   当前批次: ${options.batchNumber}/${totalBatches}`);
      console.log(`   下一批次: ${nextBatch}/${totalBatches}`);
      console.log(`\n   运行下一批的命令:`);
      
      const nextCommand = [
        'npm run batch:calculate:difficulty',
        options.category ? `--category=${options.category}` : '',
        options.source ? `--source=${options.source}` : '',
        `--batch=${nextBatch}`,
        `--batch-size=${options.batchSize}`,
        options.force ? '--force' : '',
        options.dryRun ? '--dry-run' : '',
      ].filter(Boolean).join(' ');
      
      console.log(`   ${nextCommand}`);
    } else {
      console.log(`\n✅ 所有批次处理完成！`);
    }
  }
  
  if (options.dryRun) {
    console.log(`\n💡 这是 DRY RUN 模式，未实际更新数据库`);
    console.log(`   如需实际更新，请移除 --dry-run 参数`);
  } else if (!options.batchNumber || options.batchNumber >= Math.ceil(totalCount / (options.batchSize || 50))) {
    console.log(`\n✅ 批量处理完成！`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

