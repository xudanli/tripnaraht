#!/usr/bin/env ts-node

/**
 * DEM 海拔查询服务测试脚本
 * 
 * 测试场景：
 * 1. 基础功能测试 - 单个坐标点查询
 * 2. 城市DEM优先级测试 - 验证城市数据优先于区域数据
 * 3. 批量查询测试 - 多个坐标点同时查询
 * 4. 边界情况测试 - 无数据、坐标超出范围等
 * 5. 性能测试 - 查询速度评估
 * 
 * 使用方法：
 *   npm run test:dem
 *   npm run test:dem -- --city "拉萨市"
 *   npm run test:dem -- --all
 */

import { PrismaClient } from '@prisma/client';
import { DEMElevationService } from '../src/trips/readiness/services/dem-elevation.service';
import { PrismaService } from '../src/prisma/prisma.service';

const prisma = new PrismaClient();
const prismaService = new PrismaService();
const demService = new DEMElevationService(prismaService);

/**
 * 测试用例数据
 * 包含不同城市的代表性坐标点
 */
const TEST_CASES = {
  // 西藏地区（使用区域DEM）
  xizang: [
    { name: '拉萨市布达拉宫', lat: 29.6544, lng: 91.1322, expectedRange: [3600, 3700] as [number, number] },
    { name: '日喀则市', lat: 29.2675, lng: 88.8801, expectedRange: [3800, 3900] as [number, number] },
    { name: '林芝市', lat: 29.6544, lng: 94.3614, expectedRange: [2900, 3100] as [number, number] },
  ],
  
  // 主要城市（使用城市DEM）
  majorCities: [
    { name: '北京市天安门', lat: 39.9042, lng: 116.4074, expectedRange: [40, 60] as [number, number] },
    { name: '上海市外滩', lat: 31.2304, lng: 121.4737, expectedRange: [0, 20] as [number, number] },
    { name: '成都市天府广场', lat: 30.6624, lng: 104.0633, expectedRange: [480, 520] as [number, number] },
    { name: '杭州市西湖', lat: 30.2741, lng: 120.1551, expectedRange: [0, 50] as [number, number] },
    { name: '广州市', lat: 23.1291, lng: 113.2644, expectedRange: [0, 50] as [number, number] },
    { name: '西安市', lat: 34.3416, lng: 108.9398, expectedRange: [400, 450] as [number, number] },
  ],
  
  // 高海拔城市
  highAltitude: [
    { name: '拉萨市', lat: 29.6544, lng: 91.1322, expectedRange: [3600, 3700] as [number, number] },
    { name: '西宁市', lat: 36.6171, lng: 101.7782, expectedRange: [2200, 2300] as [number, number] },
    { name: '昆明市', lat: 25.0389, lng: 102.7183, expectedRange: [1800, 2000] as [number, number] },
  ],
  
  // 边界情况
  edgeCases: [
    { name: '超出范围-太平洋', lat: 0, lng: 180, expectedRange: null as null },
    { name: '超出范围-北极', lat: 90, lng: 0, expectedRange: null as null },
    { name: '无DEM数据区域', lat: 20, lng: 100, expectedRange: null as null },
  ],
};

/**
 * 测试结果接口
 */
interface TestResult {
  name: string;
  lat: number;
  lng: number;
  elevation: number | null;
  expectedRange: [number, number] | null;
  passed: boolean;
  message: string;
  queryTime: number;
  dataSource?: string;
}

/**
 * 测试单个坐标点
 */
async function testSinglePoint(
  name: string,
  lat: number,
  lng: number,
  expectedRange: [number, number] | null
): Promise<TestResult> {
  const startTime = Date.now();
  
  try {
    const elevation = await demService.getElevation(lat, lng);
    const queryTime = Date.now() - startTime;
    
    let passed = false;
    let message = '';
    let dataSource = '';
    
    if (expectedRange === null) {
      // 期望无数据
      passed = elevation === null;
      message = passed 
        ? '✅ 正确返回 null（无数据）' 
        : `❌ 期望 null，但返回 ${elevation}m`;
    } else {
      // 期望有数据且在范围内
      if (elevation === null) {
        passed = false;
        message = `❌ 查询失败，返回 null（期望 ${expectedRange[0]}-${expectedRange[1]}m）`;
      } else {
        const [min, max] = expectedRange;
        passed = elevation >= min && elevation <= max;
        message = passed
          ? `✅ 海拔 ${elevation}m（期望 ${min}-${max}m）`
          : `❌ 海拔 ${elevation}m 超出期望范围 ${min}-${max}m`;
      }
    }
    
    // 尝试确定数据源
    try {
      const cityTables = await (demService as any).findCityDEMTables(lat, lng);
      if (cityTables.length > 0) {
        dataSource = `城市DEM: ${cityTables[0]}`;
      } else {
        dataSource = '区域DEM: geo_dem_xizang';
      }
    } catch {
      dataSource = '未知';
    }
    
    return {
      name,
      lat,
      lng,
      elevation,
      expectedRange,
      passed,
      message,
      queryTime,
      dataSource,
    };
  } catch (error) {
    return {
      name,
      lat,
      lng,
      elevation: null,
      expectedRange,
      passed: false,
      message: `❌ 查询异常: ${error instanceof Error ? error.message : error}`,
      queryTime: Date.now() - startTime,
    };
  }
}

/**
 * 测试批量查询
 */
async function testBatchQuery(): Promise<{
  total: number;
  success: number;
  failed: number;
  avgTime: number;
}> {
  console.log('\n📊 批量查询测试（10个坐标点）\n');
  
  const testPoints = [
    ...TEST_CASES.majorCities.slice(0, 5),
    ...TEST_CASES.xizang.slice(0, 3),
    ...TEST_CASES.highAltitude.slice(0, 2),
  ];
  
  const startTime = Date.now();
  const elevations = await demService.getElevations(
    testPoints.map(p => ({ lat: p.lat, lng: p.lng }))
  );
  const totalTime = Date.now() - startTime;
  const avgTime = totalTime / testPoints.length;
  
  let success = 0;
  let failed = 0;
  
  testPoints.forEach((point, index) => {
    const elevation = elevations[index];
    if (elevation !== null) {
      success++;
      console.log(`   ✅ ${point.name}: ${elevation}m`);
    } else {
      failed++;
      console.log(`   ❌ ${point.name}: 无数据`);
    }
  });
  
  console.log(`\n   总计: ${testPoints.length} 个点`);
  console.log(`   成功: ${success}`);
  console.log(`   失败: ${failed}`);
  console.log(`   总耗时: ${totalTime}ms`);
  console.log(`   平均耗时: ${avgTime.toFixed(2)}ms/点\n`);
  
  return {
    total: testPoints.length,
    success,
    failed,
    avgTime,
  };
}

/**
 * 测试城市DEM优先级
 */
async function testCityDEMPriority(): Promise<void> {
  console.log('\n🏙️  城市DEM优先级测试\n');
  console.log('验证：当坐标同时属于城市DEM和区域DEM时，优先使用城市DEM\n');
  
  // 选择一个有城市DEM的城市（如拉萨）
  const testPoint = { name: '拉萨市', lat: 29.6544, lng: 91.1322 };
  
  console.log(`测试点: ${testPoint.name} (${testPoint.lat}, ${testPoint.lng})\n`);
  
  // 1. 测试自动查找城市DEM
  const cityTables = await (demService as any).findCityDEMTables(testPoint.lat, testPoint.lng);
  console.log(`找到的城市DEM表: ${cityTables.length > 0 ? cityTables.join(', ') : '无'}`);
  
  // 2. 测试完整查询流程
  const elevation = await demService.getElevation(testPoint.lat, testPoint.lng);
  console.log(`查询结果: ${elevation !== null ? `${elevation}m` : '无数据'}`);
  
  // 3. 如果城市DEM存在，验证其优先级
  if (cityTables.length > 0) {
    const cityElevation = await (demService as any).queryElevationFromTable(
      testPoint.lat,
      testPoint.lng,
      cityTables[0]
    );
    const regionElevation = await (demService as any).queryElevationFromTable(
      testPoint.lat,
      testPoint.lng,
      'geo_dem_xizang'
    );
    
    console.log(`\n数据源对比:`);
    console.log(`  城市DEM (${cityTables[0]}): ${cityElevation !== null ? `${cityElevation}m` : '无数据'}`);
    console.log(`  区域DEM (geo_dem_xizang): ${regionElevation !== null ? `${regionElevation}m` : '无数据'}`);
    
    if (elevation === cityElevation && cityElevation !== null) {
      console.log(`\n✅ 优先级测试通过：使用了城市DEM数据`);
    } else {
      console.log(`\n⚠️  优先级测试：使用了区域DEM数据（可能城市DEM无数据）`);
    }
  } else {
    console.log(`\n⚠️  未找到城市DEM表，使用区域DEM`);
  }
  
  console.log('');
}

/**
 * 测试DEM表状态
 */
async function testDEMTableStatus(): Promise<void> {
  console.log('\n📋 DEM表状态检查\n');
  
  // 检查区域DEM
  const xizangExists = await demService.checkDEMTableExists('geo_dem_xizang');
  console.log(`区域DEM (geo_dem_xizang): ${xizangExists ? '✅ 存在' : '❌ 不存在'}`);
  
  if (xizangExists) {
    const xizangBounds = await demService.getDEMBounds('geo_dem_xizang');
    if (xizangBounds) {
      console.log(`  覆盖范围: (${xizangBounds.minLat.toFixed(4)}, ${xizangBounds.minLng.toFixed(4)}) 到 (${xizangBounds.maxLat.toFixed(4)}, ${xizangBounds.maxLng.toFixed(4)})`);
    }
  }
  
  // 检查城市DEM表数量
  const cityTables = await (prisma as any).$queryRawUnsafe(`
    SELECT COUNT(*) as count
    FROM information_schema.tables
    WHERE table_name LIKE 'geo_dem_city_%';
  `) as Array<{ count: bigint }>;
  
  const cityCount = Number(cityTables[0]?.count || 0);
  console.log(`城市DEM表数量: ${cityCount}`);
  
  if (cityCount > 0) {
    // 列出前10个城市DEM表
    const sampleTables = await (prisma as any).$queryRawUnsafe(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_name LIKE 'geo_dem_city_%'
      ORDER BY table_name
      LIMIT 10;
    `) as Array<{ table_name: string }>;
    
    console.log(`示例城市DEM表:`);
    sampleTables.forEach(table => {
      console.log(`  - ${table.table_name}`);
    });
  }
  
  console.log('');
}

/**
 * 运行所有测试
 */
async function runAllTests(): Promise<void> {
  console.log('🧪 DEM 海拔查询服务测试\n');
  console.log('='.repeat(60));
  
  // 1. DEM表状态检查
  await testDEMTableStatus();
  
  // 2. 基础功能测试
  console.log('📌 基础功能测试\n');
  const allResults: TestResult[] = [];
  
  // 测试主要城市
  console.log('主要城市测试:');
  for (const testCase of TEST_CASES.majorCities) {
    const result = await testSinglePoint(
      testCase.name,
      testCase.lat,
      testCase.lng,
      testCase.expectedRange
    );
    allResults.push(result);
    console.log(`  ${result.message} (${result.queryTime}ms) ${result.dataSource ? `[${result.dataSource}]` : ''}`);
  }
  
  // 测试西藏地区
  console.log('\n西藏地区测试:');
  for (const testCase of TEST_CASES.xizang) {
    const result = await testSinglePoint(
      testCase.name,
      testCase.lat,
      testCase.lng,
      testCase.expectedRange
    );
    allResults.push(result);
    console.log(`  ${result.message} (${result.queryTime}ms) ${result.dataSource ? `[${result.dataSource}]` : ''}`);
  }
  
  // 测试边界情况
  console.log('\n边界情况测试:');
  for (const testCase of TEST_CASES.edgeCases) {
    const result = await testSinglePoint(
      testCase.name,
      testCase.lat,
      testCase.lng,
      testCase.expectedRange
    );
    allResults.push(result);
    console.log(`  ${result.message} (${result.queryTime}ms)`);
  }
  
  // 3. 城市DEM优先级测试
  await testCityDEMPriority();
  
  // 4. 批量查询测试
  await testBatchQuery();
  
  // 5. 统计结果
  console.log('='.repeat(60));
  console.log('\n📊 测试统计\n');
  
  const total = allResults.length;
  const passed = allResults.filter(r => r.passed).length;
  const failed = total - passed;
  const avgTime = allResults.reduce((sum, r) => sum + r.queryTime, 0) / total;
  
  console.log(`总测试数: ${total}`);
  console.log(`通过: ${passed} ✅`);
  console.log(`失败: ${failed} ${failed > 0 ? '❌' : ''}`);
  console.log(`平均查询时间: ${avgTime.toFixed(2)}ms`);
  
  if (failed > 0) {
    console.log('\n失败的测试:');
    allResults
      .filter(r => !r.passed)
      .forEach(r => {
        console.log(`  - ${r.name}: ${r.message}`);
      });
  }
  
  console.log('\n');
}

/**
 * 运行指定城市测试
 */
async function runCityTest(cityName: string): Promise<void> {
  console.log(`\n🏙️  测试城市: ${cityName}\n`);
  
  // 查找该城市的测试用例
  const testCase = [
    ...TEST_CASES.majorCities,
    ...TEST_CASES.xizang,
    ...TEST_CASES.highAltitude,
  ].find(tc => tc.name.includes(cityName));
  
  if (!testCase) {
    console.log(`❌ 未找到城市 "${cityName}" 的测试用例`);
    console.log('\n可用测试城市:');
    [
      ...TEST_CASES.majorCities,
      ...TEST_CASES.xizang,
      ...TEST_CASES.highAltitude,
    ].forEach(tc => console.log(`  - ${tc.name}`));
    return;
  }
  
  const result = await testSinglePoint(
    testCase.name,
    testCase.lat,
    testCase.lng,
    testCase.expectedRange
  );
  
  console.log(`坐标: (${result.lat}, ${result.lng})`);
  console.log(`海拔: ${result.elevation !== null ? `${result.elevation}m` : '无数据'}`);
  console.log(`结果: ${result.message}`);
  console.log(`查询时间: ${result.queryTime}ms`);
  if (result.dataSource) {
    console.log(`数据源: ${result.dataSource}`);
  }
  console.log('');
}

async function main() {
  const args = process.argv.slice(2);
  
  try {
    if (args.includes('--all')) {
      await runAllTests();
    } else if (args.includes('--city') && args[args.indexOf('--city') + 1]) {
      const cityName = args[args.indexOf('--city') + 1];
      await runCityTest(cityName);
    } else {
      // 默认运行基础测试
      await testDEMTableStatus();
      console.log('💡 提示:');
      console.log('  - 运行完整测试: npm run test:dem -- --all');
      console.log('  - 测试指定城市: npm run test:dem -- --city "拉萨市"\n');
    }
  } catch (error) {
    console.error('❌ 测试执行失败:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main();
}

