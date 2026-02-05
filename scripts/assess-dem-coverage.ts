#!/usr/bin/env tsx
/**
 * DEM数据覆盖评估脚本
 * 
 * 评估指定国家的DEM数据覆盖情况：
 * - 检查PostGIS中是否存在DEM数据
 * - 评估DEM数据覆盖率
 * - 测试DEM查询性能
 * - 识别缺失区域
 * 
 * 使用方法:
 *   npx tsx scripts/assess-dem-coverage.ts [countryCode]
 * 
 * 示例:
 *   npx tsx scripts/assess-dem-coverage.ts CH  # 瑞士
 *   npx tsx scripts/assess-dem-coverage.ts NO  # 挪威
 *   npx tsx scripts/assess-dem-coverage.ts PE  # 秘鲁
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';

const prisma = new PrismaClient();

interface DEMCoverageAssessment {
  countryCode: string;
  coverageRate: number; // 0-1
  resolution: string; // '30m' | '90m' | '300m' | 'unknown'
  querySuccessRate: number; // 0-1
  queryLatency: {
    p50: number;
    p95: number;
    p99: number;
  };
  missingRegions: Array<{ region: string; reason: string }>;
  recommendations: Array<{
    issue: string;
    impact: 'LOW' | 'MEDIUM' | 'HIGH';
    recommendation: string;
    priority: 'P0' | 'P1' | 'P2';
  }>;
}

/**
 * 获取测试坐标点（根据国家代码）
 */
function getTestCoordinatesForCountry(countryCode: string): Array<{ lat: number; lng: number; name: string }> {
  const testPoints: Record<string, Array<{ lat: number; lng: number; name: string }>> = {
    CH: [
      { lat: 46.5197, lng: 6.6323, name: '日内瓦' },
      { lat: 47.3769, lng: 8.5417, name: '苏黎世' },
      { lat: 46.2044, lng: 6.1432, name: '洛桑' },
      { lat: 46.9481, lng: 7.4474, name: '伯尔尼' },
      { lat: 46.2276, lng: 6.1058, name: '蒙特勒' },
    ],
    NO: [
      { lat: 59.9139, lng: 10.7522, name: '奥斯陆' },
      { lat: 60.3913, lng: 5.3221, name: '卑尔根' },
      { lat: 63.4305, lng: 10.3951, name: '特隆赫姆' },
      { lat: 69.6492, lng: 18.9553, name: '特罗姆瑟' },
      { lat: 58.1467, lng: 7.9956, name: '克里斯蒂安桑' },
    ],
    PE: [
      { lat: -12.0464, lng: -77.0428, name: '利马' },
      { lat: -13.1631, lng: -72.5450, name: '库斯科' },
      { lat: -16.4090, lng: -71.5375, name: '阿雷基帕' },
      { lat: -8.1116, lng: -79.0288, name: '特鲁希略' },
      { lat: -3.7491, lng: -73.2532, name: '伊基托斯' },
    ],
  };
  
  return testPoints[countryCode] || [];
}

/**
 * 查询DEM海拔（直接查询PostGIS）
 */
async function queryDEMElevation(lat: number, lng: number): Promise<{ elevation: number | null; latency: number }> {
  const start = Date.now();
  let elevation: number | null = null;
  
  try {
    // 优先查询 geo_dem_cities_merged
    const result: any = await prisma.$queryRawUnsafe(`
      SELECT ST_Value(rast, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)) as elevation
      FROM geo_dem_cities_merged
      WHERE ST_Intersects(rast, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326))
      LIMIT 1;
    `);
    
    if (result?.[0]?.elevation !== null && result?.[0]?.elevation !== undefined) {
      elevation = parseFloat(result[0].elevation);
    } else {
      // 后备：查询 geo_dem_global
      const globalResult: any = await prisma.$queryRawUnsafe(`
        SELECT ST_Value(rast, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)) as elevation
        FROM geo_dem_global
        WHERE ST_Intersects(rast, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326))
        LIMIT 1;
      `);
      
      if (globalResult?.[0]?.elevation !== null && globalResult?.[0]?.elevation !== undefined) {
        elevation = parseFloat(globalResult[0].elevation);
      }
    }
  } catch (error: any) {
    // 表可能不存在，忽略错误
    if (!error.message?.includes('does not exist')) {
      console.warn(`查询DEM失败 (${lat}, ${lng}):`, error.message);
    }
  }
  
  const latency = Date.now() - start;
  return { elevation, latency };
}

/**
 * 从raster scale计算分辨率（米）
 */
function calculateResolutionFromScale(
  scaleX: number,
  scaleY: number,
  lat?: number
): string {
  // WGS84坐标系：1度纬度 ≈ 111,000米（全球基本一致）
  // 1度经度 ≈ 111,000 * cos(纬度)米
  const metersPerDegreeLat = 111000;
  const metersPerDegreeLng = lat
    ? 111000 * Math.cos((lat * Math.PI) / 180)
    : 111000; // 如果没有纬度，使用平均值

  // 计算平均分辨率（米）
  const resolutionMeters = Math.sqrt(
    (scaleX * metersPerDegreeLng) ** 2 + (scaleY * metersPerDegreeLat) ** 2
  );

  // 四舍五入到常见的分辨率值
  const commonResolutions = [10, 30, 90, 300, 1000];
  let closestResolution = commonResolutions[0];
  let minDiff = Math.abs(resolutionMeters - closestResolution);

  for (const res of commonResolutions) {
    const diff = Math.abs(resolutionMeters - res);
    if (diff < minDiff) {
      minDiff = diff;
      closestResolution = res;
    }
  }

  // 如果差异太大（>50%），返回精确值
  if (minDiff / resolutionMeters > 0.5) {
    return `${Math.round(resolutionMeters)}m`;
  }

  return `${closestResolution}m`;
}

/**
 * 获取DEM分辨率
 * 优先从PostGIS raster元数据计算，其次从filename解析
 */
async function getDEMResolution(): Promise<string> {
  try {
    // 尝试从 geo_dem_cities_merged 表获取raster元数据
    const result: any = await prisma.$queryRawUnsafe(`
      SELECT 
        ST_ScaleX(rast) as scalex,
        ST_ScaleY(rast) as scaley,
        ST_UpperLeftY(rast) as lat
      FROM geo_dem_cities_merged 
      LIMIT 1;
    `);
    
    if (result?.[0]?.scalex) {
      const resolution = calculateResolutionFromScale(
        Math.abs(result[0].scalex),
        Math.abs(result[0].scaley),
        result[0].lat
      );
      if (resolution !== 'unknown') {
        return resolution;
      }
    }
  } catch (error) {
    // 忽略错误，继续尝试其他方法
  }
  
  try {
    // 尝试从 geo_dem_global 表获取raster元数据
    const result: any = await prisma.$queryRawUnsafe(`
      SELECT 
        ST_ScaleX(rast) as scalex,
        ST_ScaleY(rast) as scaley,
        ST_UpperLeftY(rast) as lat
      FROM geo_dem_global 
      LIMIT 1;
    `);
    
    if (result?.[0]?.scalex) {
      const resolution = calculateResolutionFromScale(
        Math.abs(result[0].scalex),
        Math.abs(result[0].scaley),
        result[0].lat
      );
      if (resolution !== 'unknown') {
        return resolution;
      }
    }
  } catch (error) {
    // 忽略错误
  }
  
  // 如果无法从raster元数据获取，尝试从filename解析（向后兼容）
  try {
    const result: any = await prisma.$queryRawUnsafe(`
      SELECT filename FROM geo_dem_cities_merged LIMIT 1;
    `);
    
    if (result?.[0]?.filename) {
      const match = result[0].filename.match(/(\d+)m/i);
      if (match) {
        return `${match[1]}m`;
      }
    }
  } catch (error) {
    // 忽略错误
  }
  
  return 'unknown';
}

/**
 * 检查DEM表是否存在
 */
async function checkDEMTableExists(tableName: string): Promise<boolean> {
  try {
    const result: any = await prisma.$queryRawUnsafe(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = '${tableName}'
      ) as exists;
    `);
    return result?.[0]?.exists === true;
  } catch (error) {
    return false;
  }
}

/**
 * 评估DEM数据覆盖情况
 */
async function assessDEMCoverage(countryCode: string): Promise<DEMCoverageAssessment> {
  console.log(`\n🔍 评估 ${countryCode} 的DEM数据覆盖情况...\n`);
  
  // 1. 检查DEM表是否存在
  const citiesMergedExists = await checkDEMTableExists('geo_dem_cities_merged');
  const globalExists = await checkDEMTableExists('geo_dem_global');
  
  const hasDEMData = citiesMergedExists || globalExists;
  
  if (!hasDEMData) {
    return {
      countryCode,
      coverageRate: 0,
      resolution: 'unknown',
      querySuccessRate: 0,
      queryLatency: { p50: 0, p95: 0, p99: 0 },
      missingRegions: [{
        region: countryCode,
        reason: 'DEM数据表不存在',
      }],
      recommendations: [{
        issue: 'DEM数据缺失',
        impact: 'HIGH',
        recommendation: `需要补充 ${countryCode} 的DEM数据（建议使用SRTM或ASTER GDEM）`,
        priority: 'P0',
      }],
    };
  }
  
  // 2. 获取分辨率
  const resolution = await getDEMResolution();
  
  // 3. 测试DEM查询性能
  const testCoordinates = getTestCoordinatesForCountry(countryCode);
  let querySuccessCount = 0;
  const latencies: number[] = [];
  
  console.log(`测试 ${testCoordinates.length} 个坐标点的DEM查询...`);
  
  for (const coord of testCoordinates) {
    const { elevation, latency } = await queryDEMElevation(coord.lat, coord.lng);
    
    if (elevation !== null) {
      querySuccessCount++;
      latencies.push(latency);
      console.log(`  ✅ ${coord.name} (${coord.lat}, ${coord.lng}): ${elevation}m, ${latency}ms`);
    } else {
      console.log(`  ❌ ${coord.name} (${coord.lat}, ${coord.lng}): 查询失败`);
    }
  }
  
  const querySuccessRate = testCoordinates.length > 0 
    ? querySuccessCount / testCoordinates.length 
    : 0;
  
  // 4. 计算查询延迟统计
  latencies.sort((a, b) => a - b);
  const p50 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.5)] : 0;
  const p95 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : 0;
  const p99 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.99)] : 0;
  
  // 5. 计算覆盖率（基于查询成功率）
  const coverageRate = querySuccessRate;
  
  // 6. 识别缺失区域
  const missingRegions: Array<{ region: string; reason: string }> = [];
  if (coverageRate < 0.9) {
    missingRegions.push({
      region: countryCode,
      reason: `DEM数据存在但覆盖率不足 (${(coverageRate * 100).toFixed(1)}%)`,
    });
  }
  
  // 7. 生成建议
  const recommendations: Array<{
    issue: string;
    impact: 'LOW' | 'MEDIUM' | 'HIGH';
    recommendation: string;
    priority: 'P0' | 'P1' | 'P2';
  }> = [];
  
  if (coverageRate < 0.9) {
    recommendations.push({
      issue: 'DEM数据覆盖率不足',
      impact: 'HIGH',
      recommendation: `需要补充缺失区域的DEM数据，当前覆盖率: ${(coverageRate * 100).toFixed(1)}%`,
      priority: 'P0',
    });
  }
  
  if (p95 > 500) {
    recommendations.push({
      issue: 'DEM查询性能较差',
      impact: 'MEDIUM',
      recommendation: `P95查询延迟 ${p95}ms，超过目标500ms，建议优化PostGIS查询或增加缓存`,
      priority: 'P1',
    });
  }
  
  if (resolution === 'unknown') {
    recommendations.push({
      issue: 'DEM分辨率未知',
      impact: 'LOW',
      recommendation: '无法确定DEM数据分辨率，建议在数据导入时记录分辨率信息',
      priority: 'P2',
    });
  }
  
  return {
    countryCode,
    coverageRate,
    resolution,
    querySuccessRate,
    queryLatency: { p50, p95, p99 },
    missingRegions,
    recommendations,
  };
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  const countries = args.length > 0 ? args : ['CH', 'NO', 'PE']; // 默认评估所有核心国家
  
  console.log('🚀 DEM数据覆盖评估开始\n');
  console.log(`评估国家: ${countries.join(', ')}\n`);
  
  const assessments: DEMCoverageAssessment[] = [];
  
  for (const countryCode of countries) {
    try {
      const assessment = await assessDEMCoverage(countryCode);
      assessments.push(assessment);
      
      console.log(`\n📊 ${countryCode} DEM数据评估结果:`);
      console.log(`  覆盖率: ${(assessment.coverageRate * 100).toFixed(1)}%`);
      console.log(`  分辨率: ${assessment.resolution}`);
      console.log(`  查询成功率: ${(assessment.querySuccessRate * 100).toFixed(1)}%`);
      console.log(`  查询延迟: P50=${assessment.queryLatency.p50}ms, P95=${assessment.queryLatency.p95}ms, P99=${assessment.queryLatency.p99}ms`);
      console.log(`  缺失区域: ${assessment.missingRegions.length} 个`);
      console.log(`  建议数量: ${assessment.recommendations.length} 个`);
      
      if (assessment.recommendations.length > 0) {
        console.log(`\n  建议:`);
        assessment.recommendations.forEach((rec, idx) => {
          console.log(`    ${idx + 1}. [${rec.priority}] ${rec.issue}: ${rec.recommendation}`);
        });
      }
    } catch (error: any) {
      console.error(`\n❌ 评估 ${countryCode} 失败:`, error.message);
      console.error(error.stack);
    }
  }
  
  // 保存评估结果
  const outputPath = path.join(process.cwd(), 'scripts', 'dem-coverage-assessment.json');
  await fs.writeFile(
    outputPath,
    JSON.stringify(assessments, null, 2),
    'utf-8'
  );
  
  console.log(`\n✅ 评估完成，结果已保存到: ${outputPath}`);
  
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('❌ 评估失败:', error);
  process.exit(1);
});
