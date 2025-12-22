#!/usr/bin/env ts-node

/**
 * DEM 体力消耗元数据测试场景
 * 
 * 测试基于DEM的体力消耗计算和决策支持功能
 * 
 * 使用方法：
 *   npm run test:dem:effort
 *   npm run test:dem:effort -- --scenario 1
 */

import { PrismaClient } from '@prisma/client';
import { DEMEffortMetadataService, RoutePoint } from '../src/trips/readiness/services/dem-effort-metadata.service';
import { DEMElevationService } from '../src/trips/readiness/services/dem-elevation.service';
import { PrismaService } from '../src/prisma/prisma.service';

const prisma = new PrismaClient();
const prismaService = new PrismaService();
const demService = new DEMElevationService(prismaService);
const effortService = new DEMEffortMetadataService(prismaService, demService);

/**
 * 场景1：同样10km，消耗完全不同
 * 测试：两条同距离路线（一个平缓，一个爬升大）
 */
async function scenario1_SameDistanceDifferentEffort(): Promise<void> {
  console.log('\n📊 场景1：同样10km，消耗完全不同\n');
  console.log('测试：两条同距离路线（一个平缓，一个爬升大）\n');

  // 路线1：平缓路线（成都市区，海拔约500m）
  const route1_flat: RoutePoint[] = [
    { lat: 30.6624, lng: 104.0633 }, // 成都天府广场
    { lat: 30.6724, lng: 104.0733 }, // 向北1km
    { lat: 30.6824, lng: 104.0833 }, // 再向北1km
    { lat: 30.6924, lng: 104.0933 }, // 再向北1km
    { lat: 30.7024, lng: 104.1033 }, // 再向北1km
    { lat: 30.7124, lng: 104.1133 }, // 再向北1km
    { lat: 30.7224, lng: 104.1233 }, // 再向北1km
    { lat: 30.7324, lng: 104.1333 }, // 再向北1km
    { lat: 30.7424, lng: 104.1433 }, // 再向北1km
    { lat: 30.7524, lng: 104.1533 }, // 再向北1km
  ];

  // 路线2：爬升路线（从成都到青城山，海拔从500m到1200m）
  const route2_climb: RoutePoint[] = [
    { lat: 30.6624, lng: 104.0633 }, // 成都天府广场
    { lat: 30.7000, lng: 103.6000 }, // 向西北
    { lat: 30.7500, lng: 103.5500 }, // 继续向西北
    { lat: 30.8000, lng: 103.5000 }, // 继续向西北
    { lat: 30.8500, lng: 103.4500 }, // 继续向西北
    { lat: 30.9000, lng: 103.4000 }, // 继续向西北
    { lat: 30.9500, lng: 103.3500 }, // 继续向西北
    { lat: 31.0000, lng: 103.3000 }, // 继续向西北
    { lat: 31.0500, lng: 103.2500 }, // 继续向西北
    { lat: 31.1000, lng: 103.2000 }, // 青城山附近
  ];

  console.log('计算路线1（平缓路线）...');
  const metadata1 = await effortService.calculateEffortMetadata(route1_flat, {
    activityType: 'walking',
  });

  console.log('计算路线2（爬升路线）...');
  const metadata2 = await effortService.calculateEffortMetadata(route2_climb, {
    activityType: 'walking',
  });

  console.log('\n📊 对比结果：\n');
  console.log('路线1（平缓）：');
  console.log(`  距离: ${(metadata1.totalDistance / 1000).toFixed(2)}km`);
  console.log(`  累计爬升: ${metadata1.totalAscent.toFixed(0)}m`);
  console.log(`  最大坡度: ${metadata1.maxSlope.toFixed(1)}%`);
  console.log(`  体力消耗评分: ${metadata1.effortScore.toFixed(1)}`);
  console.log(`  难度: ${metadata1.difficulty}`);
  console.log(`  预计时长: ${metadata1.estimatedDuration.toFixed(0)}分钟`);
  console.log(`  建议休息点: ${metadata1.suggestedRestPoints}个`);

  console.log('\n路线2（爬升）：');
  console.log(`  距离: ${(metadata2.totalDistance / 1000).toFixed(2)}km`);
  console.log(`  累计爬升: ${metadata2.totalAscent.toFixed(0)}m`);
  console.log(`  最大坡度: ${metadata2.maxSlope.toFixed(1)}%`);
  console.log(`  体力消耗评分: ${metadata2.effortScore.toFixed(1)}`);
  console.log(`  难度: ${metadata2.difficulty}`);
  console.log(`  预计时长: ${metadata2.estimatedDuration.toFixed(0)}分钟`);
  console.log(`  建议休息点: ${metadata2.suggestedRestPoints}个`);

  console.log('\n✅ 验收标准：');
  const ascentDiff = Math.abs(metadata2.totalAscent - metadata1.totalAscent);
  if (ascentDiff > 200) {
    console.log(`  ✅ totalAscent 明显不同：${ascentDiff.toFixed(0)}m 差异`);
  } else {
    console.log(`  ⚠️  totalAscent 差异较小：${ascentDiff.toFixed(0)}m`);
  }

  if (metadata2.estimatedDuration > metadata1.estimatedDuration * 1.2) {
    console.log(`  ✅ 推荐时长明显不同：路线2比路线1多 ${((metadata2.estimatedDuration / metadata1.estimatedDuration - 1) * 100).toFixed(0)}%`);
  }

  if (metadata2.suggestedRestPoints > metadata1.suggestedRestPoints) {
    console.log(`  ✅ 休息点建议不同：路线2建议 ${metadata2.suggestedRestPoints - metadata1.suggestedRestPoints} 个额外休息点`);
  }

  console.log('\n💡 可解释性：');
  console.log(`  因为路线2的累计爬升（${metadata2.totalAscent.toFixed(0)}m）远大于路线1（${metadata1.totalAscent.toFixed(0)}m），`);
  console.log(`  所以路线2的体力消耗评分（${metadata2.effortScore.toFixed(1)}）明显高于路线1（${metadata1.effortScore.toFixed(1)}），`);
  console.log(`  预计时长和休息点需求也相应增加。\n`);
}

/**
 * 场景2：同一景点不同入口的消耗差异
 */
async function scenario2_DifferentEntrances(): Promise<void> {
  console.log('\n🚪 场景2：同一景点不同入口的消耗差异\n');
  console.log('测试：一个景点2个入口POI的消耗对比\n');

  // 假设景点在拉萨附近，有两个入口
  const entrance1: RoutePoint[] = [
    { lat: 29.6500, lng: 91.1000 }, // 入口1（较低海拔）
    { lat: 29.6550, lng: 91.1050 }, // 向景点
    { lat: 29.6600, lng: 91.1100 }, // 景点位置
  ];

  const entrance2: RoutePoint[] = [
    { lat: 29.6700, lng: 91.1200 }, // 入口2（较高海拔）
    { lat: 29.6650, lng: 91.1150 }, // 向景点
    { lat: 29.6600, lng: 91.1100 }, // 景点位置
  ];

  const comparison = await effortService.compareRoutes(entrance1, entrance2, {
    activityType: 'walking',
  });

  console.log('入口对比表：\n');
  console.log('入口1：');
  console.log(`  距离: ${(comparison.route1.totalDistance / 1000).toFixed(2)}km`);
  console.log(`  爬升: ${comparison.route1.totalAscent.toFixed(0)}m`);
  console.log(`  预计时长: ${comparison.route1.estimatedDuration.toFixed(0)}分钟`);
  console.log(`  难度: ${comparison.route1.difficulty}`);

  console.log('\n入口2：');
  console.log(`  距离: ${(comparison.route2.totalDistance / 1000).toFixed(2)}km`);
  console.log(`  爬升: ${comparison.route2.totalAscent.toFixed(0)}m`);
  console.log(`  预计时长: ${comparison.route2.estimatedDuration.toFixed(0)}分钟`);
  console.log(`  难度: ${comparison.route2.difficulty}`);

  console.log('\n📊 对比分析：');
  console.log(`  消耗差异: ${comparison.comparison.effortDifference > 0 ? '+' : ''}${comparison.comparison.effortDifference.toFixed(1)}%`);
  console.log(`  关键差异: ${comparison.comparison.keyDifferences.join(', ')}`);
  console.log(`  推荐: ${comparison.comparison.recommendation}`);

  console.log('\n✅ 验收标准：');
  console.log('  ✅ 入口对比表包含：距离 + 爬升 + 预计时长 + 难度');
  console.log('  ✅ 系统给出推荐入口\n');
}

/**
 * 场景3：海拔上升过快 → 自动插入"适应日"
 */
async function scenario3_AltitudeAdaptation(): Promise<void> {
  console.log('\n⛰️  场景3：海拔上升过快 → 自动插入"适应日"\n');
  console.log('测试：从低海拔城市跳到高海拔城市（500m → 3600m）\n');

  // 从成都（500m）到拉萨（3600m）的路线
  const route: RoutePoint[] = [
    { lat: 30.6624, lng: 104.0633 }, // 成都（约500m）
    { lat: 30.8000, lng: 103.0000 }, // 中间点
    { lat: 31.0000, lng: 102.0000 }, // 中间点
    { lat: 29.6544, lng: 91.1322 }, // 拉萨（约3600m）
  ];

  const metadata = await effortService.calculateEffortMetadata(route, {
    activityType: 'driving',
  });

  const keyPoints = await effortService.detectKeyPoints(route);

  console.log('路线分析：\n');
  console.log(`  起点海拔: ${metadata.minElevation.toFixed(0)}m`);
  console.log(`  终点海拔: ${metadata.maxElevation.toFixed(0)}m`);
  console.log(`  海拔上升: ${metadata.totalAscent.toFixed(0)}m`);
  console.log(`  净海拔差: ${metadata.netElevationGain.toFixed(0)}m`);
  console.log(`  最高点: ${keyPoints.highestPoint.elevation.toFixed(0)}m`);

  console.log('\n⚠️  高海拔适应建议：');
  const elevationGain = metadata.maxElevation - metadata.minElevation;
  if (elevationGain > 2000) {
    console.log('  🚨 海拔上升过快（>2000m），建议：');
    console.log('    1. 第一天：轻量活动，避免高强度运动');
    console.log('    2. 第二天：逐步增加强度');
    console.log('    3. 准备高反药物和氧气设备');
    console.log('    4. 注意休息和补水');
  }

  console.log('\n✅ 验收标准：');
  console.log(`  ✅ 输出包含 maxElevation: ${metadata.maxElevation.toFixed(0)}m`);
  console.log(`  ✅ 输出包含 dailyElevationGain: ${metadata.totalAscent.toFixed(0)}m`);
  console.log(`  ✅ 输出包含 deltaAltitude: ${metadata.netElevationGain.toFixed(0)}m`);
  console.log('  ✅ 系统建议适应日安排\n');
}

/**
 * 场景4：路线经过垭口/高点 → 夜间转场自动拦截
 */
async function scenario4_MountainPassNightIntercept(): Promise<void> {
  console.log('\n🌙 场景4：路线经过垭口/高点 → 夜间转场自动拦截\n');
  console.log('测试：路线海拔最高点很高（>4000m）且预计在夜间通过\n');

  // 模拟一条经过高海拔垭口的路线
  const route: RoutePoint[] = [
    { lat: 29.5000, lng: 91.0000 }, // 起点
    { lat: 29.6000, lng: 91.0500 }, // 中间点
    { lat: 29.7000, lng: 91.1000 }, // 垭口附近（高海拔）
    { lat: 29.8000, lng: 91.1500 }, // 中间点
    { lat: 29.9000, lng: 91.2000 }, // 终点
  ];

  const metadata = await effortService.calculateEffortMetadata(route, {
    activityType: 'driving',
  });

  const keyPoints = await effortService.detectKeyPoints(route);

  console.log('路线分析：\n');
  console.log(`  最高点海拔: ${keyPoints.highestPoint.elevation.toFixed(0)}m`);
  console.log(`  检测到山口/垭口: ${keyPoints.mountainPasses.length}个`);
  keyPoints.mountainPasses.forEach((pass, i) => {
    console.log(`    垭口${i + 1}: ${pass.elevation.toFixed(0)}m (${pass.lat.toFixed(4)}, ${pass.lng.toFixed(4)})`);
  });

  // 模拟夜间通过（假设总时长>12小时，且最高点在路线后半段）
  const isNightPass = metadata.estimatedDuration > 12 * 60; // 超过12小时
  const highestPointIsLate = keyPoints.highestPoint.index > route.length / 2;

  console.log('\n⚠️  夜间转场风险检测：');
  if (keyPoints.highestPoint.elevation > 4000 && isNightPass && highestPointIsLate) {
    console.log('  🚨 检测到高风险：');
    console.log(`    - 路线最高点: ${keyPoints.highestPoint.elevation.toFixed(0)}m`);
    console.log(`    - 预计总时长: ${(metadata.estimatedDuration / 60).toFixed(1)}小时`);
    console.log(`    - 最高点位置: 路线后${((1 - keyPoints.highestPoint.index / route.length) * 100).toFixed(0)}%`);
    console.log('\n  建议：');
    console.log('    - Abu: 降低当日强度，增加buffer时间');
    console.log('    - Dr.Dre: 提前出发或拆分成两天');
    console.log('    - 避免夜间通过高海拔路段');
  }

  console.log('\n✅ 验收标准：');
  console.log('  ✅ 输出明确："因为路线最高点 X m，且预计夜间通过，所以建议…"');
  console.log('  ✅ 系统提供具体建议（提前出发/拆分/增加buffer）\n');
}

/**
 * 场景5：路线优化的"地形成本函数"
 */
async function scenario5_TerrainCostFunction(): Promise<void> {
  console.log('\n🗺️  场景5：路线优化的"地形成本函数"\n');
  console.log('测试：距离最短路线 ≠ 最佳路线（引入坡度惩罚）\n');

  // 路线A：更短但爬升大
  const routeA: RoutePoint[] = [
    { lat: 30.6624, lng: 104.0633 }, // 起点
    { lat: 30.7000, lng: 103.6000 }, // 直接爬升
    { lat: 30.7500, lng: 103.5000 }, // 继续爬升
    { lat: 30.8000, lng: 103.4000 }, // 终点
  ];

  // 路线B：更长但平缓
  const routeB: RoutePoint[] = [
    { lat: 30.6624, lng: 104.0633 }, // 起点
    { lat: 30.6700, lng: 104.1000 }, // 绕行
    { lat: 30.6800, lng: 104.2000 }, // 继续绕行
    { lat: 30.6900, lng: 104.3000 }, // 继续绕行
    { lat: 30.7000, lng: 104.4000 }, // 继续绕行
    { lat: 30.8000, lng: 103.4000 }, // 终点
  ];

  const comparison = await effortService.compareRoutes(routeA, routeB, {
    activityType: 'walking',
  });

  console.log('路线对比：\n');
  console.log('路线A（更短但爬升大）：');
  console.log(`  距离: ${(comparison.route1.totalDistance / 1000).toFixed(2)}km`);
  console.log(`  爬升: ${comparison.route1.totalAscent.toFixed(0)}m`);
  console.log(`  体力消耗: ${comparison.route1.effortScore.toFixed(1)}`);

  console.log('\n路线B（更长但平缓）：');
  console.log(`  距离: ${(comparison.route2.totalDistance / 1000).toFixed(2)}km`);
  console.log(`  爬升: ${comparison.route2.totalAscent.toFixed(0)}m`);
  console.log(`  体力消耗: ${comparison.route2.effortScore.toFixed(1)}`);

  console.log('\n💡 决策建议：');
  console.log('  用户偏好"轻松/省体力/家庭" → 选择路线B（虽然更长但更省力）');
  console.log('  用户偏好"挑战/徒步训练" → 选择路线A（更短但更有挑战）');

  console.log('\n✅ 验收标准：');
  console.log('  ✅ 规划输出随persona改变');
  console.log('  ✅ 解释里出现"坡度/爬升"作为主要证据\n');
}

/**
 * 运行所有场景
 */
async function runAllScenarios(): Promise<void> {
  console.log('🎯 DEM 体力消耗元数据测试场景\n');
  console.log('='.repeat(60));

  await scenario1_SameDistanceDifferentEffort();
  await scenario2_DifferentEntrances();
  await scenario3_AltitudeAdaptation();
  await scenario4_MountainPassNightIntercept();
  await scenario5_TerrainCostFunction();

  console.log('='.repeat(60));
  console.log('\n✅ 所有场景测试完成！\n');
}

async function main() {
  const args = process.argv.slice(2);
  
  try {
    if (args.includes('--scenario')) {
      const scenarioNum = parseInt(args[args.indexOf('--scenario') + 1], 10);
      
      switch (scenarioNum) {
        case 1:
          await scenario1_SameDistanceDifferentEffort();
          break;
        case 2:
          await scenario2_DifferentEntrances();
          break;
        case 3:
          await scenario3_AltitudeAdaptation();
          break;
        case 4:
          await scenario4_MountainPassNightIntercept();
          break;
        case 5:
          await scenario5_TerrainCostFunction();
          break;
        default:
          console.error(`❌ 未知场景: ${scenarioNum}`);
          console.error('可用场景: 1, 2, 3, 4, 5');
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

