/**
 * RouteDirection 数据同步状态检查脚本
 * 
 * 检查 fixture 数据与数据库的同步状态
 * 
 * 使用方法：
 *   npx tsx scripts/check-route-directions-sync.ts
 */

import { PrismaClient } from '@prisma/client';
import {
  ALL_ROUTE_DIRECTION_FIXTURES,
  ROUTE_FIXTURES_BY_COUNTRY,
} from '../src/route-directions/fixtures';

const prisma = new PrismaClient();

interface SyncStatus {
  total: number;
  inDb: number;
  notInDb: number;
  onlyInDb: number;
  details: {
    synced: string[];
    missing: string[];
    orphaned: string[];
  };
}

async function checkSyncStatus(): Promise<SyncStatus> {
  // 获取数据库中的所有 RouteDirection
  const dbRoutes = await prisma.routeDirection.findMany({
    select: { id: true, name: true, nameCN: true, countryCode: true, updatedAt: true },
  });

  const dbNames = new Set(dbRoutes.map(r => r.name));
  const fixtureNames = new Set(ALL_ROUTE_DIRECTION_FIXTURES.map(f => f.name));

  const status: SyncStatus = {
    total: ALL_ROUTE_DIRECTION_FIXTURES.length,
    inDb: 0,
    notInDb: 0,
    onlyInDb: 0,
    details: {
      synced: [],
      missing: [],
      orphaned: [],
    },
  };

  // 检查 fixture 是否在数据库中
  for (const fixture of ALL_ROUTE_DIRECTION_FIXTURES) {
    if (dbNames.has(fixture.name)) {
      status.inDb++;
      status.details.synced.push(fixture.name);
    } else {
      status.notInDb++;
      status.details.missing.push(fixture.name);
    }
  }

  // 检查数据库中是否有 fixture 中不存在的路线
  for (const route of dbRoutes) {
    if (!fixtureNames.has(route.name)) {
      status.onlyInDb++;
      status.details.orphaned.push(`${route.name} (id: ${route.id})`);
    }
  }

  return status;
}

async function main(): Promise<void> {
  console.log('\n🔍 RouteDirection Sync Status Check');
  console.log('=====================================\n');

  try {
    await prisma.$connect();

    const status = await checkSyncStatus();

    // 按国家统计
    console.log('📊 Fixture Statistics by Country:');
    for (const [code, fixtures] of Object.entries(ROUTE_FIXTURES_BY_COUNTRY)) {
      console.log(`   ${code}: ${fixtures.length} routes`);
    }
    console.log(`   Total: ${status.total} routes\n`);

    // 同步状态
    console.log('🔄 Sync Status:');
    console.log(`   ✅ In DB (synced):     ${status.inDb}`);
    console.log(`   ❌ Not in DB (missing): ${status.notInDb}`);
    console.log(`   ⚠️  Only in DB (orphan): ${status.onlyInDb}\n`);

    // 详细信息
    if (status.notInDb > 0) {
      console.log('❌ Missing from database (need to sync):');
      for (const name of status.details.missing) {
        console.log(`   - ${name}`);
      }
      console.log('');
    }

    if (status.onlyInDb > 0) {
      console.log('⚠️  Only in database (no fixture):');
      for (const name of status.details.orphaned) {
        console.log(`   - ${name}`);
      }
      console.log('');
    }

    // 建议
    console.log('📝 Recommendations:');
    if (status.notInDb > 0) {
      console.log(`   Run: npx tsx scripts/seed-route-directions.ts`);
      console.log(`   (or add --dry-run to preview changes first)`);
    } else if (status.onlyInDb > 0) {
      console.log(`   Some routes in DB have no fixture. Consider:`);
      console.log(`   - Creating fixtures for them, or`);
      console.log(`   - Marking them as deprecated in the database`);
    } else {
      console.log(`   ✅ All fixtures are synced to database!`);
    }

    process.exit(status.notInDb > 0 ? 1 : 0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
