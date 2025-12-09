// 检查数据库表是否存在
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 检查数据库表...\n');

  try {
    // 使用原始 SQL 查询表
    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `;

    console.log('📊 数据库中的表:');
    tables.forEach((t) => {
      console.log(`  - ${t.table_name}`);
    });

    // 检查特定表
    const flightPriceDetailExists = tables.some((t) => t.table_name === 'FlightPriceDetail');
    const dayOfWeekFactorExists = tables.some((t) => t.table_name === 'DayOfWeekFactor');

    console.log('\n✅ 检查结果:');
    console.log(`  FlightPriceDetail: ${flightPriceDetailExists ? '✅ 存在' : '❌ 不存在'}`);
    console.log(`  DayOfWeekFactor: ${dayOfWeekFactorExists ? '✅ 存在' : '❌ 不存在'}`);

    if (flightPriceDetailExists) {
      const count = await prisma.flightPriceDetail.count();
      console.log(`  FlightPriceDetail 记录数: ${count}`);
    }

    if (dayOfWeekFactorExists) {
      const count = await prisma.dayOfWeekFactor.count();
      console.log(`  DayOfWeekFactor 记录数: ${count}`);
    }
  } catch (error: any) {
    console.error('❌ 错误:', error.message);
    if (error.message.includes('FlightPriceDetail')) {
      console.error('\n💡 提示: FlightPriceDetail 表可能不存在，需要运行迁移');
    }
    if (error.message.includes('DayOfWeekFactor')) {
      console.error('\n💡 提示: DayOfWeekFactor 表可能不存在，需要运行迁移');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main();

