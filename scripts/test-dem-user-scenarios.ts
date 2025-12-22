#!/usr/bin/env ts-node

/**
 * DEM 用户场景测试脚本
 * 
 * 测试真实用户场景：
 * 1. 旅行路线规划 - 查询沿途海拔
 * 2. POI海拔信息补充 - 为POI添加海拔数据
 * 3. 批量地点查询 - 多个目的地海拔查询
 * 
 * 使用方法：
 *   npm run test:dem:scenarios
 *   npm run test:dem:scenarios -- --scenario route
 */

import { PrismaClient } from '@prisma/client';
import { DEMElevationService } from '../src/trips/readiness/services/dem-elevation.service';
import { PrismaService } from '../src/prisma/prisma.service';

const prisma = new PrismaClient();
const prismaService = new PrismaService();
const demService = new DEMElevationService(prismaService);

/**
 * 场景1：旅行路线规划
 * 从成都到拉萨的自驾路线海拔分析
 */
async function scenarioRoutePlanning(): Promise<void> {
  console.log('\n🗺️  场景1：旅行路线规划\n');
  console.log('路线：成都 → 雅安 → 康定 → 新都桥 → 理塘 → 巴塘 → 芒康 → 左贡 → 八宿 → 波密 → 林芝 → 拉萨\n');
  
  const routePoints = [
    { name: '成都市', lat: 30.6624, lng: 104.0633 },
    { name: '雅安市', lat: 29.9805, lng: 103.0133 },
    { name: '康定市', lat: 30.0554, lng: 101.9631 },
    { name: '新都桥', lat: 30.0500, lng: 101.5000 },
    { name: '理塘县', lat: 30.0000, lng: 100.2700 },
    { name: '巴塘县', lat: 30.0000, lng: 99.1000 },
    { name: '芒康县', lat: 29.6800, lng: 98.6000 },
    { name: '左贡县', lat: 29.6700, lng: 97.8400 },
    { name: '八宿县', lat: 30.0500, lng: 96.9200 },
    { name: '波密县', lat: 29.8600, lng: 95.7700 },
    { name: '林芝市', lat: 29.6544, lng: 94.3614 },
    { name: '拉萨市', lat: 29.6544, lng: 91.1322 },
  ];
  
  const elevations: Array<{ name: string; elevation: number | null }> = [];
  let totalTime = 0;
  
  for (const point of routePoints) {
    const startTime = Date.now();
    const elevation = await demService.getElevation(point.lat, point.lng);
    const queryTime = Date.now() - startTime;
    totalTime += queryTime;
    
    elevations.push({ name: point.name, elevation });
    
    const elevationStr = elevation !== null ? `${elevation}m` : '无数据';
    console.log(`  ${point.name.padEnd(8)}: ${elevationStr.padStart(8)} (${queryTime}ms)`);
  }
  
  // 分析海拔变化
  console.log('\n📊 海拔变化分析:');
  const validElevations = elevations.filter(e => e.elevation !== null).map(e => e.elevation!);
  
  if (validElevations.length > 0) {
    const minElevation = Math.min(...validElevations);
    const maxElevation = Math.max(...validElevations);
    const avgElevation = validElevations.reduce((sum, e) => sum + e, 0) / validElevations.length;
    
    console.log(`  最低海拔: ${minElevation}m`);
    console.log(`  最高海拔: ${maxElevation}m`);
    console.log(`  平均海拔: ${Math.round(avgElevation)}m`);
    console.log(`  海拔差: ${maxElevation - minElevation}m`);
    
    // 识别高海拔路段
    const highAltitudePoints = elevations.filter(e => e.elevation !== null && e.elevation! > 4000);
    if (highAltitudePoints.length > 0) {
      console.log(`\n⚠️  高海拔路段 (>4000m):`);
      highAltitudePoints.forEach(e => {
        console.log(`    - ${e.name}: ${e.elevation}m`);
      });
    }
  }
  
  console.log(`\n总查询时间: ${totalTime}ms`);
  console.log(`平均查询时间: ${(totalTime / routePoints.length).toFixed(2)}ms/点\n`);
}

/**
 * 场景2：POI海拔信息补充
 * 为西藏地区的POI补充海拔信息
 */
async function scenarioPOIAltitudeEnrichment(): Promise<void> {
  console.log('\n📍 场景2：POI海拔信息补充\n');
  console.log('为西藏地区的POI补充海拔信息\n');
  
  // 查询一些西藏的POI
  const pois = await prisma.$queryRawUnsafe(`
    SELECT 
      poi_id,
      name_default,
      lat,
      lng,
      altitude_hint
    FROM poi_canonical
    WHERE region_key LIKE 'CN_XZ%'
      AND lat IS NOT NULL
      AND lng IS NOT NULL
    LIMIT 10;
  `) as Array<{
    poi_id: string;
    name_default: string;
    lat: number;
    lng: number;
    altitude_hint: number | null;
  }>;
  
  if (pois.length === 0) {
    console.log('⚠️  未找到西藏地区的POI数据\n');
    return;
  }
  
  console.log(`找到 ${pois.length} 个POI，开始补充海拔信息...\n`);
  
  let updatedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  
  for (const poi of pois) {
    try {
      // 如果已有海拔提示，跳过
      if (poi.altitude_hint !== null) {
        console.log(`  ⏭️  ${poi.name_default}: 已有海拔 ${poi.altitude_hint}m`);
        skippedCount++;
        continue;
      }
      
      // 从DEM获取海拔
      const elevation = await demService.getElevation(poi.lat, poi.lng);
      
      if (elevation !== null) {
        // 更新POI的海拔提示
        await prisma.$executeRawUnsafe(`
          UPDATE poi_canonical
          SET altitude_hint = ${elevation}
          WHERE poi_id = '${poi.poi_id}';
        `);
        
        console.log(`  ✅ ${poi.name_default}: 补充海拔 ${elevation}m`);
        updatedCount++;
      } else {
        console.log(`  ⚠️  ${poi.name_default}: 无法获取海拔数据`);
        errorCount++;
      }
    } catch (error) {
      console.error(`  ❌ ${poi.name_default}: 更新失败 - ${error instanceof Error ? error.message : error}`);
      errorCount++;
    }
  }
  
  console.log('\n📊 统计:');
  console.log(`  更新: ${updatedCount}`);
  console.log(`  跳过: ${skippedCount}`);
  console.log(`  失败: ${errorCount}\n`);
}

/**
 * 场景3：批量地点查询
 * 查询多个目的地的海拔，用于旅行准备
 */
async function scenarioBatchLocationQuery(): Promise<void> {
  console.log('\n🌍 场景3：批量地点查询\n');
  console.log('查询多个目的地的海拔，用于旅行准备\n');
  
  const destinations = [
    { name: '北京', lat: 39.9042, lng: 116.4074 },
    { name: '上海', lat: 31.2304, lng: 121.4737 },
    { name: '成都', lat: 30.6624, lng: 104.0633 },
    { name: '拉萨', lat: 29.6544, lng: 91.1322 },
    { name: '昆明', lat: 25.0389, lng: 102.7183 },
    { name: '西宁', lat: 36.6171, lng: 101.7782 },
    { name: '乌鲁木齐', lat: 43.8256, lng: 87.6168 },
    { name: '哈尔滨', lat: 45.7736, lng: 126.2028 },
    { name: '广州', lat: 23.1291, lng: 113.2644 },
    { name: '杭州', lat: 30.2741, lng: 120.1551 },
  ];
  
  console.log('使用批量查询接口...\n');
  const startTime = Date.now();
  
  const elevations = await demService.getElevations(
    destinations.map(d => ({ lat: d.lat, lng: d.lng }))
  );
  
  const totalTime = Date.now() - startTime;
  
  // 显示结果
  console.log('查询结果:\n');
  destinations.forEach((dest, index) => {
    const elevation = elevations[index];
    const elevationStr = elevation !== null ? `${elevation}m` : '无数据';
    const status = elevation !== null ? '✅' : '❌';
    console.log(`  ${status} ${dest.name.padEnd(8)}: ${elevationStr.padStart(8)}`);
  });
  
  // 分类统计
  const highAltitude = destinations.filter((_, i) => {
    const e = elevations[i];
    return e !== null && e > 3000;
  });
  
  const mediumAltitude = destinations.filter((_, i) => {
    const e = elevations[i];
    return e !== null && e >= 1000 && e <= 3000;
  });
  
  const lowAltitude = destinations.filter((_, i) => {
    const e = elevations[i];
    return e !== null && e < 1000;
  });
  
  console.log('\n📊 海拔分类:');
  console.log(`  高海拔 (>3000m): ${highAltitude.length} 个`);
  if (highAltitude.length > 0) {
    highAltitude.forEach((dest, i) => {
      const idx = destinations.indexOf(dest);
      console.log(`    - ${dest.name}: ${elevations[idx]}m`);
    });
  }
  
  console.log(`  中海拔 (1000-3000m): ${mediumAltitude.length} 个`);
  if (mediumAltitude.length > 0) {
    mediumAltitude.forEach((dest, i) => {
      const idx = destinations.indexOf(dest);
      console.log(`    - ${dest.name}: ${elevations[idx]}m`);
    });
  }
  
  console.log(`  低海拔 (<1000m): ${lowAltitude.length} 个`);
  if (lowAltitude.length > 0) {
    lowAltitude.forEach((dest, i) => {
      const idx = destinations.indexOf(dest);
      console.log(`    - ${dest.name}: ${elevations[idx]}m`);
    });
  }
  
  console.log(`\n总查询时间: ${totalTime}ms`);
  console.log(`平均查询时间: ${(totalTime / destinations.length).toFixed(2)}ms/点\n`);
}

/**
 * 运行所有场景
 */
async function runAllScenarios(): Promise<void> {
  console.log('🎭 DEM 用户场景测试\n');
  console.log('='.repeat(60));
  
  await scenarioRoutePlanning();
  await scenarioPOIAltitudeEnrichment();
  await scenarioBatchLocationQuery();
  
  console.log('='.repeat(60));
  console.log('\n✅ 所有场景测试完成！\n');
}

async function main() {
  const args = process.argv.slice(2);
  
  try {
    if (args.includes('--scenario')) {
      const scenarioName = args[args.indexOf('--scenario') + 1];
      
      switch (scenarioName) {
        case 'route':
          await scenarioRoutePlanning();
          break;
        case 'poi':
          await scenarioPOIAltitudeEnrichment();
          break;
        case 'batch':
          await scenarioBatchLocationQuery();
          break;
        default:
          console.error(`❌ 未知场景: ${scenarioName}`);
          console.error('可用场景: route, poi, batch');
          process.exit(1);
      }
    } else {
      await runAllScenarios();
    }
  } catch (error) {
    console.error('❌ 场景测试失败:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main();
}

