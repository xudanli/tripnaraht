#!/usr/bin/env npx tsx
/**
 * 世界模型证据 API 直接测试脚本
 * 
 * 直接测试Service层的实现，不依赖HTTP服务器
 */

import { PrismaClient } from '@prisma/client';
import { WorldModelEvidenceService } from '../src/skills/world/services/world-model-evidence.service';
import { WorldBuildContextSkill } from '../src/skills/world/world-build-context.skill';
import { WorldModelEvidenceRequestDto } from '../src/skills/world/dto/world-model-evidence.dto';

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

function logSuccess(message: string) {
  log(`✅ ${message}`, 'green');
}

function logError(message: string) {
  log(`❌ ${message}`, 'red');
}

function logInfo(message: string) {
  log(`ℹ️  ${message}`, 'cyan');
}

function logWarning(message: string) {
  log(`⚠️  ${message}`, 'yellow');
}

/**
 * 测试1: 使用countryCode获取证据
 */
async function test1_GetEvidenceWithCountryCode(service: WorldModelEvidenceService) {
  log('\n【测试1】使用countryCode获取世界模型证据', 'cyan');
  
  try {
    const request: WorldModelEvidenceRequestDto = {
      countryCode: 'IS',
      month: 7,
      include: 'all',
    };

    const result = await service.getEvidence(request);

    logSuccess('请求成功');
    logInfo(`国家代码: ${result.countryCode}`);
    logInfo(`路线方向: ${result.routeDirectionName || 'N/A'}`);
    logInfo(`构建时间: ${result.buildTimestamp}`);

    if (result.demEvidence) {
      logInfo(`DEM证据: 总距离${result.demEvidence.totalDistanceKm}km, 累计爬升${result.demEvidence.cumulativeAscentM}m`);
    } else {
      logWarning('未返回DEM证据');
    }

    if (result.roadStates && result.roadStates.length > 0) {
      logInfo(`道路状态: ${result.roadStates.length}条道路`);
      result.roadStates.slice(0, 3).forEach((road) => {
        log(`  - ${road.name}: ${road.status}`, 'yellow');
      });
    }

    if (result.weatherWindow) {
      logInfo(`天气窗口: 最佳月份${result.weatherWindow.bestMonths.join(', ')}, 可达性${result.weatherWindow.accessibilityScore}`);
    }

    if (result.philosophy) {
      logInfo(`路线哲学: "${result.philosophy.coreStatement}"`);
      logInfo(`  必须体验: ${result.philosophy.mustVisitTags.join(', ')}`);
    }

    if (result.failureProfile) {
      logInfo(`失败画像: ${result.failureProfile.commonFailureDays.length}个常见失败日期`);
    }

    if (result.userCapabilityMatch) {
      logInfo(`用户能力匹配: 风险${result.userCapabilityMatch.riskTolerance.match ? '匹配' : '不匹配'}`);
    }

    return true;
  } catch (error: any) {
    logError(`测试失败: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    return false;
  }
}

/**
 * 测试2: 只获取DEM证据
 */
async function test2_GetDemEvidenceOnly(service: WorldModelEvidenceService) {
  log('\n【测试2】只获取DEM证据', 'cyan');
  
  try {
    const request: WorldModelEvidenceRequestDto = {
      countryCode: 'IS',
      include: 'dem',
    };

    const result = await service.getEvidence(request);

    logSuccess('请求成功');

    if (result.demEvidence) {
      logInfo(`DEM证据:`);
      log(`  总距离: ${result.demEvidence.totalDistanceKm}km`, 'yellow');
      log(`  累计爬升: ${result.demEvidence.cumulativeAscentM}m`, 'yellow');
      log(`  最大坡度: ${result.demEvidence.maxSlopePct}%`, 'yellow');
      log(`  疲劳指数: ${result.demEvidence.fatigueIndex}`, 'yellow');
      log(`  3天滚动爬升: ${result.demEvidence.threeDayRollingAscentM}m`, 'yellow');
      log(`  路线点数量: ${result.demEvidence.pointCount}`, 'yellow');
    } else {
      logWarning('未返回DEM证据');
      return false;
    }

    // 验证其他证据类型不应该存在
    if (result.roadStates || result.weatherWindow || result.philosophy) {
      logWarning('警告: 请求只包含DEM证据，但返回了其他证据类型');
    }

    return true;
  } catch (error: any) {
    logError(`测试失败: ${error.message}`);
    return false;
  }
}

/**
 * 测试3: 获取路线哲学
 */
async function test3_GetPhilosophy(service: WorldModelEvidenceService) {
  log('\n【测试3】获取路线哲学', 'cyan');
  
  try {
    const request: WorldModelEvidenceRequestDto = {
      countryCode: 'IS',
      routeDirectionId: '8afd4b2e-7dd1-4837-8169-d3efed748138', // 内陆高地F路
      include: 'philosophy',
    };

    const result = await service.getEvidence(request);

    logSuccess('请求成功');

    if (result.philosophy) {
      logInfo(`路线哲学:`);
      log(`  核心陈述: "${result.philosophy.coreStatement}"`, 'yellow');
      log(`  必须体验: ${result.philosophy.mustVisitTags.join(', ')}`, 'yellow');
      log(`  路线红线: ${result.philosophy.nonNegotiableRules.length}条`, 'yellow');
      log(`  灵活部分: ${result.philosophy.flexibleParts.length}项`, 'yellow');
      
      if (result.philosophy.nonNegotiableRules.length > 0) {
        log(`  红线示例: ${result.philosophy.nonNegotiableRules[0]}`, 'yellow');
      }
    } else {
      logWarning('未返回路线哲学');
      return false;
    }

    return true;
  } catch (error: any) {
    logError(`测试失败: ${error.message}`);
    return false;
  }
}

/**
 * 测试4: 获取失败画像
 */
async function test4_GetFailureProfile(service: WorldModelEvidenceService) {
  log('\n【测试4】获取失败画像', 'cyan');
  
  try {
    const request: WorldModelEvidenceRequestDto = {
      countryCode: 'IS',
      routeDirectionId: '8afd4b2e-7dd1-4837-8169-d3efed748138', // 内陆高地F路
      include: 'failure',
    };

    const result = await service.getEvidence(request);

    logSuccess('请求成功');

    if (result.failureProfile) {
      logInfo(`失败画像:`);
      log(`  常见失败日期: ${result.failureProfile.commonFailureDays.join(', ')}`, 'yellow');
      log(`  典型失败原因: ${result.failureProfile.typicalFailureReasons.join(', ')}`, 'yellow');
      log(`  救援难度: ${result.failureProfile.rescueDifficulty}`, 'yellow');
      log(`  失败场景数: ${result.failureProfile.failureScenarios.length}`, 'yellow');
      
      if (result.failureProfile.failureScenarios.length > 0) {
        const scenario = result.failureProfile.failureScenarios[0];
        log(`  场景示例: 第${scenario.day}天 - ${scenario.reason}`, 'yellow');
        log(`  缓解措施: ${scenario.mitigation}`, 'yellow');
      }
    } else {
      logWarning('未返回失败画像');
      return false;
    }

    return true;
  } catch (error: any) {
    logError(`测试失败: ${error.message}`);
    return false;
  }
}

/**
 * 测试5: 错误处理 - 缺少必需参数
 */
async function test5_ErrorHandling(service: WorldModelEvidenceService) {
  log('\n【测试5】错误处理 - 缺少必需参数', 'cyan');
  
  try {
    const request: WorldModelEvidenceRequestDto = {
      // 不提供tripId或countryCode
      include: 'all',
    };

    await service.getEvidence(request);

    logError('应该抛出错误，但请求成功了');
    return false;
  } catch (error: any) {
    if (error.message && error.message.includes('必须提供')) {
      logSuccess('正确抛出错误');
      logInfo(`错误信息: ${error.message}`);
      return true;
    } else {
      logError(`意外的错误: ${error.message}`);
      return false;
    }
  }
}

/**
 * 测试6: 获取天气窗口
 */
async function test6_GetWeatherWindow(service: WorldModelEvidenceService) {
  log('\n【测试6】获取天气窗口', 'cyan');
  
  try {
    const request: WorldModelEvidenceRequestDto = {
      countryCode: 'IS',
      month: 7,
      include: 'weather',
    };

    const result = await service.getEvidence(request);

    logSuccess('请求成功');

    if (result.weatherWindow) {
      logInfo(`天气窗口:`);
      log(`  最佳月份: ${result.weatherWindow.bestMonths.join(', ')}`, 'yellow');
      log(`  避免月份: ${result.weatherWindow.avoidMonths.join(', ')}`, 'yellow');
      log(`  可达性评分: ${result.weatherWindow.accessibilityScore}`, 'yellow');
      log(`  选择月份: ${result.weatherWindow.selectedMonth || 'N/A'}`, 'yellow');
      
      if (result.weatherWindow.weatherDetails) {
        log(`  天气详情:`, 'yellow');
        if (result.weatherWindow.weatherDetails.temperature) {
          log(`    温度: ${result.weatherWindow.weatherDetails.temperature}°C`, 'yellow');
        }
        if (result.weatherWindow.weatherDetails.windSpeed) {
          log(`    风速: ${result.weatherWindow.weatherDetails.windSpeed}m/s`, 'yellow');
        }
        if (result.weatherWindow.weatherDetails.snowRisk) {
          log(`    降雪风险: ${result.weatherWindow.weatherDetails.snowRisk}`, 'yellow');
        }
      }
    } else {
      logWarning('未返回天气窗口');
    }

    return true;
  } catch (error: any) {
    logError(`测试失败: ${error.message}`);
    return false;
  }
}

/**
 * 主测试函数
 */
async function main() {
  log('='.repeat(80), 'cyan');
  log('世界模型证据 API 直接测试', 'bright');
  log('='.repeat(80), 'cyan');
  console.log('');

  const prisma = new PrismaClient();

  try {
    // 创建Service实例
    const worldBuildContextSkill = new WorldBuildContextSkill(
      prisma,
      undefined, // routeDirectionsService
      undefined, // exaIntegration
      undefined, // demEffortMetadataService
      undefined, // cacheService
      undefined, // countryConfigService
    );

    const service = new WorldModelEvidenceService(
      prisma,
      worldBuildContextSkill,
    );

    const results: Array<{ name: string; passed: boolean }> = [];

    // 运行所有测试
    results.push({ name: '测试1: 使用countryCode获取证据', passed: await test1_GetEvidenceWithCountryCode(service) });
    results.push({ name: '测试2: 只获取DEM证据', passed: await test2_GetDemEvidenceOnly(service) });
    results.push({ name: '测试3: 获取路线哲学', passed: await test3_GetPhilosophy(service) });
    results.push({ name: '测试4: 获取失败画像', passed: await test4_GetFailureProfile(service) });
    results.push({ name: '测试5: 错误处理', passed: await test5_ErrorHandling(service) });
    results.push({ name: '测试6: 获取天气窗口', passed: await test6_GetWeatherWindow(service) });

    // 输出测试结果
    console.log('');
    log('='.repeat(80), 'cyan');
    log('测试结果汇总', 'bright');
    log('='.repeat(80), 'cyan');
    console.log('');

    let passedCount = 0;
    let failedCount = 0;

    results.forEach((result) => {
      if (result.passed) {
        logSuccess(`${result.name}`);
        passedCount++;
      } else {
        logError(`${result.name}`);
        failedCount++;
      }
    });

    console.log('');
    log(`总计: ${results.length}个测试`, 'cyan');
    logSuccess(`通过: ${passedCount}`);
    logError(`失败: ${failedCount}`);
    
    const successRate = ((passedCount / results.length) * 100).toFixed(1);
    log(`成功率: ${successRate}%`, passedCount === results.length ? 'green' : 'yellow');
    console.log('');

    process.exit(failedCount > 0 ? 1 : 0);
  } catch (error: any) {
    logError(`测试执行失败: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
