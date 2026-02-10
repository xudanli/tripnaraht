#!/usr/bin/env npx tsx
/**
 * 世界模型证据 API 简单测试脚本
 * 
 * 使用实际的数据库数据测试API
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
 * 测试API端点是否存在（通过检查代码）
 */
async function test1_CheckApiEndpoints() {
  log('\n【测试1】检查API端点定义', 'cyan');
  
  try {
    const fs = require('fs');
    const path = require('path');
    
    const controllerPath = path.join(__dirname, '../src/skills/world/world-model-evidence.controller.ts');
    const servicePath = path.join(__dirname, '../src/skills/world/services/world-model-evidence.service.ts');
    const dtoPath = path.join(__dirname, '../src/skills/world/dto/world-model-evidence.dto.ts');
    
    const files = [
      { name: 'Controller', path: controllerPath },
      { name: 'Service', path: servicePath },
      { name: 'DTO', path: dtoPath },
    ];
    
    let allExist = true;
    for (const file of files) {
      if (fs.existsSync(file.path)) {
        logSuccess(`${file.name}文件存在: ${file.path}`);
      } else {
        logError(`${file.name}文件不存在: ${file.path}`);
        allExist = false;
      }
    }
    
    if (allExist) {
      // 检查Controller中的端点
      const controllerContent = fs.readFileSync(controllerPath, 'utf-8');
      const endpoints = [
        { name: 'POST /api/world-model-evidence', pattern: '@Post()' },
        { name: 'GET /api/world-model-evidence', pattern: '@Get()' },
        { name: 'GET /api/world-model-evidence/trip/:tripId', pattern: '@Get(\'trip/:tripId\')' },
      ];
      
      for (const endpoint of endpoints) {
        if (controllerContent.includes(endpoint.pattern)) {
          logSuccess(`端点定义存在: ${endpoint.name}`);
        } else {
          logError(`端点定义不存在: ${endpoint.name}`);
          allExist = false;
        }
      }
    }
    
    return allExist;
  } catch (error: any) {
    logError(`检查失败: ${error.message}`);
    return false;
  }
}

/**
 * 测试2: 检查数据库中的RouteDirection数据
 */
async function test2_CheckRouteDirectionData(prisma: PrismaClient) {
  log('\n【测试2】检查数据库中的RouteDirection数据', 'cyan');
  
  try {
    const routeDirections = await prisma.routeDirection.findMany({
      where: {
        countryCode: 'IS',
        isActive: true,
      },
      take: 5,
    });

    if (routeDirections.length > 0) {
      logSuccess(`找到${routeDirections.length}条冰岛RouteDirection`);
      routeDirections.forEach((rd) => {
        log(`  - ${rd.nameCN || rd.name} (UUID: ${rd.uuid})`, 'yellow');
      });
      return true;
    } else {
      logWarning('未找到冰岛RouteDirection数据');
      return false;
    }
  } catch (error: any) {
    logError(`检查失败: ${error.message}`);
    return false;
  }
}

/**
 * 测试3: 检查RouteDirection的philosophy字段
 */
async function test3_CheckPhilosophyField(prisma: PrismaClient) {
  log('\n【测试3】检查RouteDirection的philosophy字段', 'cyan');
  
  try {
    const rd = await prisma.routeDirection.findFirst({
      where: {
        uuid: '8afd4b2e-7dd1-4837-8169-d3efed748138', // 内陆高地F路
      },
    });

    if (!rd) {
      logWarning('未找到内陆高地F路RouteDirection');
      return false;
    }

    logSuccess('找到内陆高地F路RouteDirection');
    const metadata = rd.metadata as any;
    
    if (metadata?.philosophy) {
      logSuccess('philosophy字段存在');
      logInfo(`核心陈述: "${metadata.philosophy.coreStatement || 'N/A'}"`);
      logInfo(`必须体验: ${(metadata.philosophy.mustVisitTags || []).join(', ')}`);
      return true;
    } else {
      logWarning('philosophy字段不存在');
      return false;
    }
  } catch (error: any) {
    logError(`检查失败: ${error.message}`);
    return false;
  }
}

/**
 * 测试4: 检查RouteDirection的failureProfile字段
 */
async function test4_CheckFailureProfileField(prisma: PrismaClient) {
  log('\n【测试4】检查RouteDirection的failureProfile字段', 'cyan');
  
  try {
    const rd = await prisma.routeDirection.findFirst({
      where: {
        uuid: '8afd4b2e-7dd1-4837-8169-d3efed748138', // 内陆高地F路
      },
    });

    if (!rd) {
      logWarning('未找到内陆高地F路RouteDirection');
      return false;
    }

    const metadata = rd.metadata as any;
    
    if (metadata?.extensions?.failureProfile) {
      logSuccess('failureProfile字段存在');
      const fp = metadata.extensions.failureProfile;
      logInfo(`常见失败日期: ${(fp.commonFailureDays || []).join(', ')}`);
      logInfo(`典型失败原因: ${(fp.typicalFailureReason || []).join(', ')}`);
      logInfo(`救援难度: ${fp.rescueDifficulty || 'N/A'}`);
      return true;
    } else {
      logWarning('failureProfile字段不存在');
      return false;
    }
  } catch (error: any) {
    logError(`检查失败: ${error.message}`);
    return false;
  }
}

/**
 * 测试5: 检查corridorGeom字段
 */
async function test5_CheckCorridorGeom(prisma: PrismaClient) {
  log('\n【测试5】检查RouteDirection的corridorGeom字段', 'cyan');
  
  try {
    const rd = await prisma.routeDirection.findFirst({
      where: {
        uuid: '8afd4b2e-7dd1-4837-8169-d3efed748138', // 内陆高地F路
      },
    });

    if (!rd) {
      logWarning('未找到内陆高地F路RouteDirection');
      return false;
    }

    // 使用PostGIS函数检查corridorGeom
    const geomResult = await prisma.$queryRawUnsafe(`
      SELECT 
        ST_AsText("corridorGeom"::geometry) as geom_text,
        ST_NPoints("corridorGeom"::geometry) as point_count,
        ST_Length("corridorGeom"::geography) as length_meters
      FROM "RouteDirection"
      WHERE "uuid" = $1;
    `, '8afd4b2e-7dd1-4837-8169-d3efed748138') as Array<{
      geom_text: string | null;
      point_count: number | null;
      length_meters: number | null;
    }>;

    if (geomResult.length > 0 && geomResult[0].geom_text) {
      logSuccess('corridorGeom字段存在');
      logInfo(`路线点数量: ${geomResult[0].point_count || 'N/A'}`);
      if (geomResult[0].length_meters) {
        logInfo(`路线长度: ${(geomResult[0].length_meters / 1000).toFixed(1)}km`);
      }
      return true;
    } else {
      logWarning('corridorGeom字段不存在或为空');
      return false;
    }
  } catch (error: any) {
    logError(`检查失败: ${error.message}`);
    return false;
  }
}

/**
 * 主测试函数
 */
async function main() {
  log('='.repeat(80), 'cyan');
  log('世界模型证据 API 简单测试', 'bright');
  log('='.repeat(80), 'cyan');
  console.log('');

  const prisma = new PrismaClient();

  try {
    const results: Array<{ name: string; passed: boolean }> = [];

    // 运行所有测试
    results.push({ name: '测试1: 检查API端点定义', passed: await test1_CheckApiEndpoints() });
    results.push({ name: '测试2: 检查RouteDirection数据', passed: await test2_CheckRouteDirectionData(prisma) });
    results.push({ name: '测试3: 检查philosophy字段', passed: await test3_CheckPhilosophyField(prisma) });
    results.push({ name: '测试4: 检查failureProfile字段', passed: await test4_CheckFailureProfileField(prisma) });
    results.push({ name: '测试5: 检查corridorGeom字段', passed: await test5_CheckCorridorGeom(prisma) });

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

    // 输出API使用说明
    log('='.repeat(80), 'cyan');
    log('API使用说明', 'bright');
    log('='.repeat(80), 'cyan');
    console.log('');
    logInfo('API端点:');
    log('  POST /api/world-model-evidence', 'yellow');
    log('  GET  /api/world-model-evidence', 'yellow');
    log('  GET  /api/world-model-evidence/trip/:tripId', 'yellow');
    console.log('');
    logInfo('示例请求:');
    log('  curl -X POST http://localhost:3000/api/world-model-evidence \\', 'yellow');
    log('    -H "Content-Type: application/json" \\', 'yellow');
    log('    -d \'{"countryCode": "IS", "month": 7, "include": "all"}\'', 'yellow');
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
