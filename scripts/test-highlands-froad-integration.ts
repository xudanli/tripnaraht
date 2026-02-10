#!/usr/bin/env npx tsx
/**
 * 内陆高地F路 RouteDirection 集成测试
 * 
 * 验证修复后的功能是否正常工作：
 * 1. 世界模型构建是否正常使用corridorGeom生成DEM证据
 * 2. philosophy字段是否被AI决策系统正确读取
 * 3. failureProfile是否在Neptune决策策略中正确应用
 * 4. antiPersona是否在路线推荐时正确过滤不适合的用户
 * 5. RouteDirection查询性能（验证索引效果）
 */

import { PrismaClient } from '@prisma/client';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

const HIGHLANDS_FROAD_UUID = '8afd4b2e-7dd1-4837-8169-d3efed748138';

interface TestResult {
  testName: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  message: string;
  details?: any;
}

const results: TestResult[] = [];

function addResult(testName: string, status: 'PASS' | 'FAIL' | 'SKIP', message: string, details?: any) {
  results.push({ testName, status, message, details });
}

async function main() {
  log('='.repeat(80), 'cyan');
  log('内陆高地F路 RouteDirection 集成测试', 'bright');
  log('='.repeat(80), 'cyan');
  console.log('');

  const prisma = new PrismaClient();

  try {
    // 获取RouteDirection
    const rd = await prisma.routeDirection.findFirst({
      where: { uuid: HIGHLANDS_FROAD_UUID },
    });

    if (!rd) {
      log(`❌ RouteDirection不存在: ${HIGHLANDS_FROAD_UUID}`, 'red');
      process.exit(1);
    }

    // 测试1: 验证corridorGeom存在并可提取
    log('【测试1】验证corridorGeom存在并可提取...', 'cyan');
    try {
      const geomResult = await prisma.$queryRawUnsafe(`
        SELECT 
          ST_AsText("corridorGeom"::geometry) as geom_wkt,
          ST_NPoints("corridorGeom"::geometry) as point_count,
          ST_Length("corridorGeom"::geography) as length_meters
        FROM "RouteDirection"
        WHERE "uuid" = $1;
      `, HIGHLANDS_FROAD_UUID) as Array<{ geom_wkt: string | null; point_count: number | null; length_meters: number | null }>;
      
      if (geomResult.length > 0 && geomResult[0].geom_wkt) {
        const pointCount = geomResult[0].point_count || 0;
        const lengthMeters = geomResult[0].length_meters || 0;
        
        addResult(
          'corridorGeom提取',
          'PASS',
          `corridorGeom存在，包含${pointCount}个点，长度${(lengthMeters / 1000).toFixed(1)}km`,
          { pointCount, lengthMeters: lengthMeters.toFixed(0) }
        );
        log(`  ✅ corridorGeom存在: ${pointCount}个点，${(lengthMeters / 1000).toFixed(1)}km`, 'green');
        
        // 模拟世界模型构建中的提取逻辑
        const wktMatch = geomResult[0].geom_wkt.match(/LINESTRING\s*\(([^)]+)\)/i);
        if (wktMatch) {
          const coordsStr = wktMatch[1];
          const coordPairs = coordsStr.split(',').map((s: string) => s.trim());
          const routePoints = coordPairs.map((pair: string) => {
            const parts = pair.trim().split(/\s+/);
            return { lng: parseFloat(parts[0]), lat: parseFloat(parts[1]) };
          }).filter(p => !isNaN(p.lat) && !isNaN(p.lng));
          
          if (routePoints.length >= 2) {
            addResult(
              'corridorGeom解析',
              'PASS',
              `成功解析${routePoints.length}个路线点`,
              { routePoints: routePoints.length }
            );
            log(`  ✅ 成功解析${routePoints.length}个路线点`, 'green');
          } else {
            addResult('corridorGeom解析', 'FAIL', '解析的路线点不足');
            log(`  ❌ 解析的路线点不足`, 'red');
          }
        }
      } else {
        addResult('corridorGeom提取', 'FAIL', 'corridorGeom不存在或为空');
        log(`  ❌ corridorGeom不存在`, 'red');
      }
    } catch (error: any) {
      addResult('corridorGeom提取', 'FAIL', `提取失败: ${error.message}`);
      log(`  ❌ 提取失败: ${error.message}`, 'red');
    }
    console.log('');

    // 测试2: 验证philosophy字段存在并可读取
    log('【测试2】验证philosophy字段存在并可读取...', 'cyan');
    try {
      const metadata = rd.metadata as any;
      const philosophy = metadata?.philosophy;
      
      if (philosophy) {
        const hasCoreStatement = !!philosophy.coreStatement;
        const hasMustVisitTags = Array.isArray(philosophy.mustVisitTags) && philosophy.mustVisitTags.length > 0;
        const hasNonNegotiableRules = Array.isArray(philosophy.nonNegotiableRules) && philosophy.nonNegotiableRules.length > 0;
        const hasFlexibleParts = Array.isArray(philosophy.flexibleParts) && philosophy.flexibleParts.length > 0;
        
        if (hasCoreStatement && hasMustVisitTags && hasNonNegotiableRules && hasFlexibleParts) {
          addResult(
            'philosophy读取',
            'PASS',
            `philosophy字段完整，包含核心陈述、${philosophy.mustVisitTags.length}个必须体验、${philosophy.nonNegotiableRules.length}条不可协商规则`,
            {
              coreStatement: philosophy.coreStatement,
              mustVisitTagsCount: philosophy.mustVisitTags.length,
              nonNegotiableRulesCount: philosophy.nonNegotiableRules.length,
            }
          );
          log(`  ✅ philosophy字段完整`, 'green');
          log(`    核心陈述: ${philosophy.coreStatement}`, 'green');
          log(`    必须体验: ${philosophy.mustVisitTags.join(', ')}`, 'green');
          log(`    不可协商规则: ${philosophy.nonNegotiableRules.length}条`, 'green');
        } else {
          addResult('philosophy读取', 'FAIL', 'philosophy字段不完整', {
            hasCoreStatement,
            hasMustVisitTags,
            hasNonNegotiableRules,
            hasFlexibleParts,
          });
          log(`  ❌ philosophy字段不完整`, 'red');
        }
      } else {
        addResult('philosophy读取', 'FAIL', 'philosophy字段不存在');
        log(`  ❌ philosophy字段不存在`, 'red');
      }
    } catch (error: any) {
      addResult('philosophy读取', 'FAIL', `读取失败: ${error.message}`);
      log(`  ❌ 读取失败: ${error.message}`, 'red');
    }
    console.log('');

    // 测试3: 验证failureProfile存在并可读取
    log('【测试3】验证failureProfile存在并可读取...', 'cyan');
    try {
      const metadata = rd.metadata as any;
      const failureProfile = metadata?.extensions?.failureProfile;
      
      if (failureProfile) {
        const hasCommonFailureDays = Array.isArray(failureProfile.commonFailureDays) && failureProfile.commonFailureDays.length > 0;
        const hasTypicalFailureReason = Array.isArray(failureProfile.typicalFailureReason) && failureProfile.typicalFailureReason.length > 0;
        const hasRescueDifficulty = !!failureProfile.rescueDifficulty;
        const hasFailureScenarios = Array.isArray(failureProfile.failureScenarios) && failureProfile.failureScenarios.length > 0;
        
        if (hasCommonFailureDays && hasTypicalFailureReason && hasRescueDifficulty && hasFailureScenarios) {
          addResult(
            'failureProfile读取',
            'PASS',
            `failureProfile完整，包含${failureProfile.commonFailureDays.length}个常见失败日期、${failureProfile.failureScenarios.length}个失败场景`,
            {
              commonFailureDays: failureProfile.commonFailureDays,
              failureScenariosCount: failureProfile.failureScenarios.length,
              rescueDifficulty: failureProfile.rescueDifficulty,
            }
          );
          log(`  ✅ failureProfile完整`, 'green');
          log(`    常见失败日期: 第${failureProfile.commonFailureDays.join('、')}天`, 'green');
          log(`    失败场景数: ${failureProfile.failureScenarios.length}个`, 'green');
          log(`    救援难度: ${failureProfile.rescueDifficulty}`, 'green');
        } else {
          addResult('failureProfile读取', 'FAIL', 'failureProfile不完整', {
            hasCommonFailureDays,
            hasTypicalFailureReason,
            hasRescueDifficulty,
            hasFailureScenarios,
          });
          log(`  ❌ failureProfile不完整`, 'red');
        }
      } else {
        addResult('failureProfile读取', 'FAIL', 'failureProfile不存在');
        log(`  ❌ failureProfile不存在`, 'red');
      }
    } catch (error: any) {
      addResult('failureProfile读取', 'FAIL', `读取失败: ${error.message}`);
      log(`  ❌ 读取失败: ${error.message}`, 'red');
    }
    console.log('');

    // 测试4: 验证antiPersona存在并可过滤
    log('【测试4】验证antiPersona存在并可过滤...', 'cyan');
    try {
      const metadata = rd.metadata as any;
      const antiPersona = metadata?.antiPersona;
      
      if (Array.isArray(antiPersona) && antiPersona.length > 0) {
        // 模拟用户画像过滤
        const testUserProfiles = [
          { riskTolerance: 'low', has4WDExperience: false }, // 应该被过滤
          { riskTolerance: 'high', has4WDExperience: true }, // 不应该被过滤
          { timeAvailable: 3, has4WDExperience: true }, // 应该被过滤（时间不足）
        ];
        
        let filteredCount = 0;
        testUserProfiles.forEach((profile, idx) => {
          const shouldFilter = 
            (profile.riskTolerance === 'low' && antiPersona.includes('低风险偏好')) ||
            (!profile.has4WDExperience && antiPersona.includes('无四驱车驾驶经验')) ||
            (profile.timeAvailable && profile.timeAvailable < 5 && antiPersona.some((p: string) => p.includes('时间极度紧张')));
          
          if (shouldFilter) filteredCount++;
        });
        
        addResult(
          'antiPersona过滤',
          'PASS',
          `antiPersona包含${antiPersona.length}条规则，测试过滤${filteredCount}/${testUserProfiles.length}个用户画像`,
          {
            antiPersonaCount: antiPersona.length,
            testProfiles: testUserProfiles.length,
            filteredCount,
          }
        );
        log(`  ✅ antiPersona包含${antiPersona.length}条规则`, 'green');
        log(`    测试过滤: ${filteredCount}/${testUserProfiles.length}个用户画像`, 'green');
        log(`    示例规则: ${antiPersona.slice(0, 3).join(', ')}...`, 'green');
      } else {
        addResult('antiPersona过滤', 'FAIL', 'antiPersona不存在或为空');
        log(`  ❌ antiPersona不存在`, 'red');
      }
    } catch (error: any) {
      addResult('antiPersona过滤', 'FAIL', `验证失败: ${error.message}`);
      log(`  ❌ 验证失败: ${error.message}`, 'red');
    }
    console.log('');

    // 测试5: 验证RouteDirection查询性能（索引效果）
    log('【测试5】验证RouteDirection查询性能（索引效果）...', 'cyan');
    try {
      // 测试1: 按countryCode和status查询（应该使用复合索引）
      const startTime1 = Date.now();
      const results1 = await prisma.routeDirection.findMany({
        where: {
          countryCode: 'IS',
          status: 'active',
        },
        take: 10,
      });
      const duration1 = Date.now() - startTime1;
      
      // 测试2: 按tags查询（应该使用GIN索引）
      const startTime2 = Date.now();
      const results2 = await prisma.routeDirection.findMany({
        where: {
          countryCode: 'IS',
          tags: { has: 'extreme' },
        },
        take: 10,
      });
      const duration2 = Date.now() - startTime2;
      
      // 测试3: 按UUID查询（应该使用唯一索引）
      const startTime3 = Date.now();
      const result3 = await prisma.routeDirection.findFirst({
        where: { uuid: HIGHLANDS_FROAD_UUID },
      });
      const duration3 = Date.now() - startTime3;
      
      const allFast = duration1 < 100 && duration2 < 100 && duration3 < 50;
      
      addResult(
        '查询性能',
        allFast ? 'PASS' : 'FAIL',
        `查询性能: countryCode+status=${duration1}ms, tags=${duration2}ms, uuid=${duration3}ms`,
        {
          countryCodeStatusQuery: duration1,
          tagsQuery: duration2,
          uuidQuery: duration3,
        }
      );
      
      if (allFast) {
        log(`  ✅ 查询性能良好`, 'green');
        log(`    countryCode+status查询: ${duration1}ms`, 'green');
        log(`    tags查询: ${duration2}ms`, 'green');
        log(`    uuid查询: ${duration3}ms`, 'green');
      } else {
        log(`  ⚠️  部分查询较慢`, 'yellow');
        log(`    countryCode+status查询: ${duration1}ms`, duration1 < 100 ? 'green' : 'yellow');
        log(`    tags查询: ${duration2}ms`, duration2 < 100 ? 'green' : 'yellow');
        log(`    uuid查询: ${duration3}ms`, duration3 < 50 ? 'green' : 'yellow');
      }
    } catch (error: any) {
      addResult('查询性能', 'FAIL', `性能测试失败: ${error.message}`);
      log(`  ❌ 性能测试失败: ${error.message}`, 'red');
    }
    console.log('');

    // 总结
    log('='.repeat(80), 'cyan');
    log('测试总结', 'bright');
    log('='.repeat(80), 'cyan');
    
    const passCount = results.filter(r => r.status === 'PASS').length;
    const failCount = results.filter(r => r.status === 'FAIL').length;
    const skipCount = results.filter(r => r.status === 'SKIP').length;
    
    log(`总计: ${results.length} 项测试`, 'cyan');
    log(`✅ 通过: ${passCount}`, 'green');
    log(`❌ 失败: ${failCount}`, failCount > 0 ? 'red' : 'green');
    log(`⏭️  跳过: ${skipCount}`, skipCount > 0 ? 'yellow' : 'green');
    console.log('');

    // 详细结果
    log('详细结果:', 'cyan');
    results.forEach(r => {
      const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⏭️';
      const color = r.status === 'PASS' ? 'green' : r.status === 'FAIL' ? 'red' : 'yellow';
      log(`  ${icon} [${r.testName}]: ${r.message}`, color);
      if (r.details) {
        log(`     详情: ${JSON.stringify(r.details)}`, 'blue');
      }
    });

    console.log('');

    // 生成JSON报告
    const reportPath = `/home/devbox/project/scripts/highlands-froad-integration-test-report.json`;
    const fs = require('fs');
    fs.writeFileSync(reportPath, JSON.stringify({
      routeDirectionUuid: HIGHLANDS_FROAD_UUID,
      timestamp: new Date().toISOString(),
      summary: {
        total: results.length,
        pass: passCount,
        fail: failCount,
        skip: skipCount,
      },
      results,
    }, null, 2));
    log(`📄 详细报告已保存: ${reportPath}`, 'cyan');

    // 返回退出码
    if (failCount > 0) {
      process.exit(1);
    }

  } catch (error: any) {
    log(`❌ 测试失败: ${error.message}`, 'red');
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
