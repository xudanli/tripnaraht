/**
 * RouteDirection 种子数据同步脚本
 * 
 * 将 fixture 文件中的路线方向数据同步到数据库
 * 
 * 使用方法：
 *   npx tsx scripts/seed-route-directions.ts
 *   npx tsx scripts/seed-route-directions.ts --dry-run    # 只预览，不写入
 *   npx tsx scripts/seed-route-directions.ts --country IS  # 只同步特定国家
 * 
 * 同步策略：
 *   - 根据 `name` 字段匹配（name 是唯一标识）
 *   - 已存在：更新（保留 id 和 uuid）
 *   - 不存在：创建（生成新 uuid）
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  ALL_ROUTE_DIRECTION_FIXTURES,
  ROUTE_FIXTURES_BY_COUNTRY,
  RouteDirectionData,
} from '../src/route-directions/fixtures';

const prisma = new PrismaClient();

interface SyncOptions {
  dryRun: boolean;
  countryCode?: string;
  verbose: boolean;
}

interface SyncResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

/**
 * 将 fixture 数据转换为数据库记录格式
 */
function fixtureToDbRecord(fixture: RouteDirectionData): Omit<any, 'id' | 'uuid' | 'createdAt'> {
  return {
    countryCode: fixture.countryCode,
    name: fixture.name,
    nameCN: fixture.nameCN,
    nameEN: fixture.nameEN || null,
    description: fixture.description || null,
    tags: fixture.tags || [],
    regions: fixture.regions || [],
    entryHubs: fixture.entryHubs || [],
    seasonality: fixture.seasonality as Prisma.InputJsonValue || null,
    constraints: fixture.constraints as Prisma.InputJsonValue || null,
    riskProfile: fixture.riskProfile as Prisma.InputJsonValue || null,
    signaturePois: fixture.signaturePois as Prisma.InputJsonValue || null,
    itinerarySkeleton: fixture.itinerarySkeleton as Prisma.InputJsonValue || null,
    metadata: {
      ...fixture.metadata,
      // 将 philosophy, failureProfile, narrative, antiPersona 存入 metadata
      philosophy: fixture.philosophy as unknown,
      failureProfile: fixture.failureProfile as unknown,
      narrative: fixture.narrative as unknown,
      antiPersona: fixture.antiPersona as unknown,
    } as unknown as Prisma.InputJsonValue,
    isActive: true,
    status: fixture.status || 'active',
    version: fixture.version || '1.0.0',
    rolloutPercent: 100,
    updatedAt: new Date(),
  };
}

/**
 * 同步单个 fixture 到数据库
 */
async function syncFixture(
  fixture: RouteDirectionData,
  options: SyncOptions,
): Promise<'created' | 'updated' | 'skipped' | 'error'> {
  const { dryRun, verbose } = options;

  try {
    // 检查是否已存在（优先按 name 匹配，其次按 nameCN 匹配）
    const existing = await prisma.routeDirection.findFirst({
      where: {
        OR: [
          { name: fixture.name },
          { nameCN: fixture.nameCN },
        ],
      },
    });

    const dbRecord = fixtureToDbRecord(fixture);

    if (existing) {
      // 更新已存在的记录
      if (dryRun) {
        if (verbose) {
          console.log(`  [DRY-RUN] Would UPDATE: ${fixture.name} (id: ${existing.id})`);
        }
        return 'updated';
      }

      await prisma.routeDirection.update({
        where: { id: existing.id },
        data: dbRecord,
      });

      if (verbose) {
        console.log(`  ✅ UPDATED: ${fixture.name} (id: ${existing.id})`);
      }
      return 'updated';
    } else {
      // 创建新记录
      if (dryRun) {
        if (verbose) {
          console.log(`  [DRY-RUN] Would CREATE: ${fixture.name}`);
        }
        return 'created';
      }

      await prisma.routeDirection.create({
        data: {
          ...dbRecord,
          uuid: randomUUID(),
        } as any,
      });

      if (verbose) {
        console.log(`  ✅ CREATED: ${fixture.name}`);
      }
      return 'created';
    }
  } catch (error) {
    console.error(`  ❌ ERROR: ${fixture.name} - ${error instanceof Error ? error.message : error}`);
    return 'error';
  }
}

/**
 * 同步所有 fixtures 到数据库
 */
async function syncAllFixtures(options: SyncOptions): Promise<SyncResult> {
  const { countryCode, dryRun } = options;

  // 选择要同步的 fixtures
  let fixtures: RouteDirectionData[];
  if (countryCode) {
    fixtures = ROUTE_FIXTURES_BY_COUNTRY[countryCode] || [];
    if (fixtures.length === 0) {
      console.log(`⚠️  No fixtures found for country: ${countryCode}`);
      console.log(`   Available countries: ${Object.keys(ROUTE_FIXTURES_BY_COUNTRY).join(', ')}`);
      return { created: 0, updated: 0, skipped: 0, errors: [] };
    }
  } else {
    fixtures = ALL_ROUTE_DIRECTION_FIXTURES;
  }

  console.log('\n🚀 RouteDirection Seed Script');
  console.log('================================');
  console.log(`Mode: ${dryRun ? '🔍 DRY-RUN (no changes)' : '✏️  WRITE'}`);
  console.log(`Fixtures to sync: ${fixtures.length}`);
  if (countryCode) {
    console.log(`Country filter: ${countryCode}`);
  }
  console.log('');

  const result: SyncResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  // 按国家分组处理
  const byCountry = new Map<string, RouteDirectionData[]>();
  for (const fixture of fixtures) {
    const code = fixture.countryCode;
    if (!byCountry.has(code)) {
      byCountry.set(code, []);
    }
    byCountry.get(code)!.push(fixture);
  }

  for (const [code, countryFixtures] of byCountry) {
    console.log(`\n📍 ${code} (${countryFixtures.length} routes)`);

    for (const fixture of countryFixtures) {
      const status = await syncFixture(fixture, options);
      switch (status) {
        case 'created':
          result.created++;
          break;
        case 'updated':
          result.updated++;
          break;
        case 'skipped':
          result.skipped++;
          break;
        case 'error':
          result.errors.push(fixture.name);
          break;
      }
    }
  }

  return result;
}

/**
 * 打印同步结果
 */
function printResult(result: SyncResult, dryRun: boolean): void {
  console.log('\n================================');
  console.log('📊 Sync Result');
  console.log('================================');
  console.log(`Created: ${result.created}`);
  console.log(`Updated: ${result.updated}`);
  console.log(`Skipped: ${result.skipped}`);
  console.log(`Errors:  ${result.errors.length}`);

  if (result.errors.length > 0) {
    console.log('\n❌ Failed fixtures:');
    for (const name of result.errors) {
      console.log(`   - ${name}`);
    }
  }

  if (dryRun) {
    console.log('\n⚠️  This was a DRY-RUN. No changes were made.');
    console.log('   Run without --dry-run to apply changes.');
  }
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  // 解析命令行参数
  const args = process.argv.slice(2);
  const options: SyncOptions = {
    dryRun: args.includes('--dry-run'),
    verbose: !args.includes('--quiet'),
    countryCode: undefined,
  };

  // 检查 --country 参数
  const countryIndex = args.indexOf('--country');
  if (countryIndex !== -1 && args[countryIndex + 1]) {
    options.countryCode = args[countryIndex + 1].toUpperCase();
  }

  try {
    // 连接数据库
    await prisma.$connect();
    console.log('✅ Database connected');

    // 执行同步
    const result = await syncAllFixtures(options);

    // 打印结果
    printResult(result, options.dryRun);

    // 根据结果退出
    process.exit(result.errors.length > 0 ? 1 : 0);
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 运行
main();
