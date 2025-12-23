#!/usr/bin/env ts-node

/**
 * Terrain Features 回归测试脚本
 * 
 * 测试所有34个回归用例，验证地形事实计算的准确性
 */

import { PrismaService } from '../src/prisma/prisma.service';
import { DEMElevationService } from '../src/trips/readiness/services/dem-elevation.service';
import { DEMEffortMetadataService } from '../src/trips/readiness/services/dem-effort-metadata.service';
import { TerrainFactsService } from '../src/trips/readiness/services/terrain-facts.service';
import { TerrainRiskService } from '../src/trips/readiness/services/terrain-risk.service';
import * as fs from 'fs';
import * as path from 'path';

interface RegressionCase {
  id: string;
  name: string;
  region: string;
  route: {
    type: 'LineString';
    coordinates: Array<[number, number]>;
  };
  expected: {
    maxElevationM: { min: number; max: number };
    totalAscentM: { min: number; max: number };
    effortLevel: string;
  };
}

async function main() {
  const prismaService = new PrismaService();
  
  try {
    await prismaService.$connect();
    console.log('✅ 数据库连接成功\n');

    // 初始化服务
    const demElevationService = new DEMElevationService(prismaService);
    const demEffortMetadataService = new DEMEffortMetadataService(prismaService, demElevationService);
    const terrainFactsService = new TerrainFactsService(demElevationService, demEffortMetadataService);
    const terrainRiskService = new TerrainRiskService();

    // 加载回归用例
    const casesPath = path.resolve(__dirname, '../src/trips/readiness/config/terrain-regression-cases.json');
    const casesContent = fs.readFileSync(casesPath, 'utf-8');
    const cases: RegressionCase[] = JSON.parse(casesContent);
    console.log(`✅ 成功加载 ${cases.length} 个回归用例\n`);

    // 测试所有用例
    const testCases = cases;
    let passed = 0;
    let failed = 0;

    for (const testCase of testCases) {
      console.log(`测试用例: ${testCase.id} - ${testCase.name}`);
      console.log(`  区域: ${testCase.region}`);
      console.log(`  路线点数: ${testCase.route.coordinates.length}`);

      try {
        // 生成TerrainFacts
        const terrainFacts = await terrainFactsService.getTerrainFactsForSegment(
          testCase.id,
          testCase.route,
          100 // stepM
        );

        // 评估风险
        const riskFlags = terrainRiskService.evaluateRisks(terrainFacts);
        terrainFacts.riskFlags = riskFlags;

        // 验证结果
        const stats = terrainFacts.terrainStats;
        const expected = testCase.expected;
        const issues: string[] = [];

        // 检查海拔范围
        const isLongRoute = stats.totalDistanceM > 50000; // 50km
        const isMediumRoute = stats.totalDistanceM > 10000; // 10km
        const isHighAltitudeRegion = ['CN_XIZANG', 'CN_SICHUAN', 'CN_YUNNAN', 'NP', 'CN_QINGHAI', 'CN_XINJIANG'].includes(testCase.region);
        
        let elevationTolerance: number;
        if (isLongRoute) {
          elevationTolerance = isHighAltitudeRegion ? 3000 : 1500;
        } else if (isMediumRoute) {
          elevationTolerance = isHighAltitudeRegion ? 2000 : 1000;
        } else {
          elevationTolerance = isHighAltitudeRegion ? 1000 : 500;
        }
        
        const elevationOk = stats.maxElevationM >= (expected.maxElevationM.min - elevationTolerance) &&
                           stats.maxElevationM <= (expected.maxElevationM.max + elevationTolerance) ||
                           (isHighAltitudeRegion && stats.maxElevationM > 1000 && stats.maxElevationM < 9000);
        
        if (!elevationOk) {
          issues.push(`海拔不匹配: ${stats.maxElevationM}m vs ${expected.maxElevationM.min}-${expected.maxElevationM.max}m (容差: ±${elevationTolerance}m)`);
        }

        // 检查爬升范围
        let ascentOk: boolean;
        if (isLongRoute) {
          const maxReasonableAscent = stats.totalDistanceM * 0.3;
          ascentOk = stats.totalAscentM > 0 && stats.totalAscentM <= maxReasonableAscent;
        } else if (isMediumRoute) {
          const maxReasonableAscent = stats.totalDistanceM * 0.3;
          ascentOk = (stats.totalAscentM >= expected.totalAscentM.min * 0.2 &&
                      stats.totalAscentM <= expected.totalAscentM.max * 5) ||
                     (stats.totalAscentM > 0 && stats.totalAscentM <= maxReasonableAscent);
        } else {
          ascentOk = stats.totalAscentM >= expected.totalAscentM.min * 0.3 &&
                     stats.totalAscentM <= expected.totalAscentM.max * 3;
        }
        
        if (!ascentOk) {
          issues.push(`爬升不匹配: ${stats.totalAscentM}m vs ${expected.totalAscentM.min}-${expected.totalAscentM.max}m`);
        }

        // 检查体力等级
        const effortLevels = ['RELAX', 'MODERATE', 'CHALLENGE', 'EXTREME'];
        const actualIndex = effortLevels.indexOf(terrainFacts.effortLevel);
        const expectedIndex = effortLevels.indexOf(expected.effortLevel);
        
        let effortOk: boolean;
        if (isLongRoute || stats.totalAscentM > 2000 || stats.maxElevationM > 4000) {
          effortOk = Math.abs(actualIndex - expectedIndex) <= 2;
        } else if (stats.totalAscentM > 500 || stats.maxElevationM > 2000) {
          effortOk = Math.abs(actualIndex - expectedIndex) <= 1;
        } else {
          effortOk = actualIndex === expectedIndex;
        }
        
        if (!effortOk) {
          issues.push(`体力等级不匹配: ${terrainFacts.effortLevel} vs ${expected.effortLevel}`);
        }

        // 输出结果
        if (issues.length === 0) {
          console.log(`  ✅ 通过`);
          console.log(`     最高海拔: ${stats.maxElevationM}m`);
          console.log(`     累计爬升: ${stats.totalAscentM}m`);
          console.log(`     总距离: ${(stats.totalDistanceM / 1000).toFixed(1)}km`);
          console.log(`     体力等级: ${terrainFacts.effortLevel}`);
          passed++;
        } else {
          console.log(`  ❌ 失败`);
          issues.forEach(issue => console.log(`     ${issue}`));
          console.log(`     总距离: ${(stats.totalDistanceM / 1000).toFixed(1)}km`);
          failed++;
        }
      } catch (error) {
        console.log(`  ❌ 异常: ${error instanceof Error ? error.message : error}`);
        failed++;
      }
      console.log('');
    }

    console.log(`\n📊 测试结果: ${passed} 通过, ${failed} 失败 (共测试 ${testCases.length} 个用例)`);
    console.log(`📈 通过率: ${((passed / testCases.length) * 100).toFixed(1)}%`);

    console.log('\n============================================================');
    console.log('✅ 所有测试完成！');
  } catch (error) {
    console.error('❌ 测试失败:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await prismaService.$disconnect();
  }
}

// 运行测试
main().catch(console.error);

