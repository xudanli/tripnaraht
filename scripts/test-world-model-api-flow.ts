#!/usr/bin/env npx tsx
/**
 * 测试世界模型构建完整流程（通过API）
 * 
 * 使用指定的行程ID测试所有改进功能
 */

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function main() {
  const tripId = '69cb2600-20e4-46e9-9256-413cdd2fa017';
  const baseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
  
  log('='.repeat(80), 'cyan');
  log('世界模型构建完整流程测试（通过API）', 'bright');
  log('='.repeat(80), 'cyan');
  log(`行程ID: ${tripId}`, 'yellow');
  log(`API地址: ${baseUrl}`, 'yellow');
  console.log('');

  try {
    // 测试1: 首次构建（应该从数据库查询）
    log('步骤 1: 测试首次构建（无缓存）...', 'cyan');
    const startTime1 = Date.now();
    
    const response1 = await fetch(`${baseUrl}/api/world/buildContext`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tripId,
      }),
    });

    if (!response1.ok) {
      const errorText = await response1.text();
      throw new Error(`API请求失败: ${response1.status} ${response1.statusText}\n${errorText}`);
    }

    const result1 = await response1.json();
    const duration1 = Date.now() - startTime1;
    
    log(`✅ 首次构建完成 (耗时: ${duration1}ms)`, 'green');
    log(`   DEM证据数量: ${result1.world?.physical?.demEvidence?.length || 0}`, 'green');
    
    if (result1.world?.physical?.demEvidence?.length > 0) {
      const demEvidence = result1.world.physical.demEvidence[0];
      log(`   DEM证据详情:`, 'cyan');
      log(`     Segment ID: ${demEvidence.segmentId}`, 'green');
      log(`     累计爬升: ${demEvidence.cumulativeAscent?.toFixed(1) || 0}m`, 'green');
      log(`     最大坡度: ${demEvidence.maxSlopePct?.toFixed(2) || 0}%`, 'green');
      log(`     疲劳指数: ${demEvidence.fatigueIndex?.toFixed(1) || 0}`, 'green');
      log(`     说明: ${demEvidence.explanation || '无'}`, 'green');
    }
    
    log(`   缺失数据: ${Object.keys(result1.missingPieces || {}).length > 0 ? Object.keys(result1.missingPieces).join(', ') : '无'}`, 'green');
    console.log('');

    // 测试2: 第二次构建（应该从缓存获取）
    log('步骤 2: 测试第二次构建（缓存命中）...', 'cyan');
    const startTime2 = Date.now();
    
    const response2 = await fetch(`${baseUrl}/api/world/buildContext`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tripId,
      }),
    });

    if (!response2.ok) {
      const errorText = await response2.text();
      throw new Error(`API请求失败: ${response2.status} ${response2.statusText}\n${errorText}`);
    }

    const result2 = await response2.json();
    const duration2 = Date.now() - startTime2;
    
    log(`✅ 第二次构建完成 (耗时: ${duration2}ms)`, 'green');
    
    if (duration2 < duration1 * 0.5) {
      log(`   ⚡ 性能提升: ${((1 - duration2 / duration1) * 100).toFixed(1)}% (缓存生效)`, 'green');
    } else {
      log(`   ⚠️  缓存可能未生效或性能提升不明显`, 'yellow');
    }
    console.log('');

    // 测试3: 验证数据完整性
    log('步骤 3: 验证数据完整性...', 'cyan');
    
    if (result1.world?.physical) {
      const physical = result1.world.physical;
      log(`✅ PhysicalRealityModel 存在`, 'green');
      log(`   国家代码: ${physical.countryCode}`, 'green');
      log(`   月份: ${physical.month}`, 'green');
      log(`   DEM证据: ${physical.demEvidence?.length || 0} 条`, 'green');
      log(`   道路状态: ${physical.roadStates?.length || 0} 条`, 'green');
      log(`   危险区域: ${physical.hazardZones?.length || 0} 条`, 'green');
      log(`   渡轮状态: ${physical.ferryStates?.length || 0} 条`, 'green');
    } else {
      log(`⚠️  PhysicalRealityModel 缺失`, 'yellow');
    }

    if (result1.world?.human) {
      log(`✅ HumanCapabilityModel 存在`, 'green');
      log(`   最大日爬升: ${result1.world.human.maxDailyAscentM}m`, 'green');
      log(`   偏好节奏: ${result1.world.human.preferredPace}`, 'green');
    } else {
      log(`⚠️  HumanCapabilityModel 缺失`, 'yellow');
    }

    if (result1.world?.routeDirection) {
      log(`✅ RouteDirection 存在`, 'green');
      log(`   路线名称: ${result1.world.routeDirection.nameCN || result1.world.routeDirection.name}`, 'green');
      log(`   国家代码: ${result1.world.routeDirection.countryCode}`, 'green');
    } else {
      log(`⚠️  RouteDirection 缺失`, 'yellow');
    }
    console.log('');

    // 测试4: 测试错误处理
    log('步骤 4: 测试错误处理...', 'cyan');
    
    try {
      const errorResponse = await fetch(`${baseUrl}/api/world/buildContext`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          countryCode: 'XX', // 无效的国家代码
          season: 1,
        }),
      });

      if (errorResponse.ok) {
        log('⚠️  应该返回错误但没有', 'yellow');
      } else {
        const errorData = await errorResponse.json();
        log(`✅ 错误处理正确 (状态码: ${errorResponse.status})`, 'green');
        log(`   错误消息: ${errorData.message || errorData.error || '未知错误'}`, 'green');
      }
    } catch (error: any) {
      log(`✅ 错误处理正确（抛出异常）`, 'green');
      log(`   错误消息: ${error.message}`, 'green');
    }
    console.log('');

    // 总结
    log('='.repeat(80), 'cyan');
    log('测试总结', 'bright');
    log('='.repeat(80), 'cyan');
    log('✅ 所有测试完成', 'green');
    log(`   首次构建耗时: ${duration1}ms`, 'green');
    log(`   第二次构建耗时: ${duration2}ms`, 'green');
    log(`   DEM证据: ${result1.world?.physical?.demEvidence?.length || 0} 条`, 'green');
    log(`   数据完整性: ${result1.world?.physical && result1.world?.human && result1.world?.routeDirection ? '完整' : '部分缺失'}`, 
        result1.world?.physical && result1.world?.human && result1.world?.routeDirection ? 'green' : 'yellow');
    console.log('');

  } catch (error: any) {
    log(`❌ 测试失败: ${error.message}`, 'red');
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main().catch(console.error);
