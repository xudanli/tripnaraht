#!/usr/bin/env npx tsx
/**
 * RouteDirection Schema 优化脚本
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

async function main() {
  log('='.repeat(80), 'cyan');
  log('RouteDirection Schema 优化分析和建议', 'bright');
  log('='.repeat(80), 'cyan');
  console.log('');

  const prisma = new PrismaClient();

  try {
    // 检查corridorGeom索引
    log('【1. CorridorGeom索引分析】', 'cyan');
    const indexes = await prisma.$queryRawUnsafe(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'RouteDirection' AND schemaname = 'public'
        AND indexdef LIKE '%corridorGeom%';
    `) as Array<{ indexname: string; indexdef: string }>;
    
    if (indexes.length > 0) {
      log(`  找到 ${indexes.length} 个corridorGeom相关索引`, 'green');
    } else {
      log(`  ⚠️  未找到corridorGeom空间索引（GIST）`, 'yellow');
      log(`  建议: CREATE INDEX idx_route_direction_corridor_geom ON "RouteDirection" USING GIST("corridorGeom");`, 'yellow');
    }
    console.log('');

    // 分析metadata使用情况
    log('【2. Metadata使用情况分析】', 'cyan');
    const rdSample = await prisma.routeDirection.findFirst({ where: { countryCode: 'IS' } });
    if (rdSample) {
      const metadata = rdSample.metadata as any;
      log(`  示例: ${rdSample.nameCN}`, 'green');
      log(`    philosophy: ${metadata?.philosophy ? '✅' : '❌'}`, metadata?.philosophy ? 'green' : 'yellow');
      log(`    failureProfile: ${metadata?.extensions?.failureProfile ? '✅' : '❌'}`, metadata?.extensions?.failureProfile ? 'green' : 'yellow');
      log(`    narrative: ${metadata?.extensions?.narrative ? '✅' : '❌'}`, metadata?.extensions?.narrative ? 'green' : 'yellow');
    }
    console.log('');

    // 生成优化建议
    log('【3. 优化建议】', 'cyan');
    log('  1. 添加corridorGeom GIST索引', 'yellow');
    log('  2. 考虑将philosophy等字段提升为顶级字段', 'yellow');
    log('  3. 添加corridorGeom验证逻辑', 'yellow');
    log('  4. 添加metadata TypeScript类型定义', 'yellow');

  } catch (error: any) {
    log(`❌ 分析失败: ${error.message}`, 'red');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
