// scripts/clear-test-data.ts
// 清空测试数据（支持选择性清理）

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

interface TableStats {
  name: string;
  count: number;
}

async function getTableStats(): Promise<TableStats[]> {
  const stats: TableStats[] = [];

  // 获取各个表的记录数
  const [
    tripCount,
    tripDayCount,
    itineraryItemCount,
    placeCount,
    cityCount,
    countryProfileCount,
    flightPriceCount,
  ] = await Promise.all([
    prisma.trip.count(),
    prisma.tripDay.count(),
    prisma.itineraryItem.count(),
    prisma.place.count(),
    prisma.city.count(),
    prisma.countryProfile.count(),
    prisma.flightPriceReference.count(),
  ]);

  stats.push({ name: 'Trip', count: tripCount });
  stats.push({ name: 'TripDay', count: tripDayCount });
  stats.push({ name: 'ItineraryItem', count: itineraryItemCount });
  stats.push({ name: 'Place', count: placeCount });
  stats.push({ name: 'City', count: cityCount });
  stats.push({ name: 'CountryProfile', count: countryProfileCount });
  stats.push({ name: 'FlightPriceReference', count: flightPriceCount });

  return stats;
}

async function clearTable(tableName: string): Promise<number> {
  switch (tableName) {
    case 'Trip':
      return (await prisma.trip.deleteMany({})).count;
    case 'TripDay':
      return (await prisma.tripDay.deleteMany({})).count;
    case 'ItineraryItem':
      return (await prisma.itineraryItem.deleteMany({})).count;
    case 'Place':
      return (await prisma.place.deleteMany({})).count;
    case 'City':
      return (await prisma.city.deleteMany({})).count;
    case 'CountryProfile':
      return (await prisma.countryProfile.deleteMany({})).count;
    case 'FlightPriceReference':
      return (await prisma.flightPriceReference.deleteMany({})).count;
    default:
      throw new Error(`未知的表名: ${tableName}`);
  }
}

async function main() {
  const args = process.argv.slice(2);

  // 如果没有指定表名，显示当前数据统计
  if (args.length === 0) {
    console.log('📊 当前数据库数据统计：\n');
    const stats = await getTableStats();
    stats.forEach((stat) => {
      console.log(`  ${stat.name.padEnd(20)} : ${stat.count} 条记录`);
    });
    console.log('\n💡 使用方法：');
    console.log('  npm run clear:test-data -- Trip TripDay ItineraryItem');
    console.log('  npm run clear:test-data -- Place');
    console.log('  npm run clear:test-data -- all  # 清理所有表（谨慎使用）');
    return;
  }

  // 处理 "all" 参数
  if (args.includes('all')) {
    console.log('⚠️  警告：即将删除所有表的数据！\n');
    const stats = await getTableStats();
    const tablesToClear = stats
      .filter((stat) => stat.count > 0)
      .map((stat) => stat.name);

    if (tablesToClear.length === 0) {
      console.log('✅ 所有表都是空的，无需清理');
      return;
    }

    console.log('📋 将清理以下表：');
    tablesToClear.forEach((table) => {
      const stat = stats.find((s) => s.name === table);
      console.log(`  - ${table} (${stat?.count} 条记录)`);
    });
    console.log('');

    for (const table of tablesToClear) {
      const deleted = await clearTable(table);
      console.log(`✅ ${table}: 已删除 ${deleted} 条记录`);
    }

    console.log('\n✅ 所有表数据已清空');
    return;
  }

  // 清理指定的表
  console.log('🗑️  开始清理指定表的数据...\n');

  const stats = await getTableStats();
  const validTables = ['Trip', 'TripDay', 'ItineraryItem', 'Place', 'City', 'CountryProfile', 'FlightPriceReference'];

  for (const tableName of args) {
    if (!validTables.includes(tableName)) {
      console.error(`❌ 无效的表名: ${tableName}`);
      console.log(`   有效的表名: ${validTables.join(', ')}`);
      continue;
    }

    const stat = stats.find((s) => s.name === tableName);
    if (!stat || stat.count === 0) {
      console.log(`⏭️  ${tableName}: 表为空，跳过`);
      continue;
    }

    try {
      // 注意：由于外键约束，需要按顺序删除
      // Trip -> TripDay -> ItineraryItem
      if (tableName === 'Trip') {
        // 先删除关联的 TripDay 和 ItineraryItem
        await prisma.itineraryItem.deleteMany({});
        await prisma.tripDay.deleteMany({});
      }

      const deleted = await clearTable(tableName);
      console.log(`✅ ${tableName}: 已删除 ${deleted} 条记录`);
    } catch (error) {
      console.error(`❌ ${tableName}: 删除失败`, error);
    }
  }

  console.log('\n✅ 清理完成');
}

main()
  .catch((error) => {
    console.error('❌ 执行失败:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

