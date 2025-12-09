// scripts/clear-flight-prices.ts
// 清空 FlightPriceReference 表的测试数据

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('🗑️  开始清空 FlightPriceReference 表数据...\n');

  try {
    // 查询当前数据量
    const count = await prisma.flightPriceReference.count();
    console.log(`📊 当前表中有 ${count} 条记录`);

    if (count === 0) {
      console.log('✅ 表已经是空的，无需清理');
      return;
    }

    // 确认删除
    console.log('⚠️  即将删除所有数据...');

    // 删除所有记录
    const result = await prisma.flightPriceReference.deleteMany({});

    console.log(`✅ 成功删除 ${result.count} 条记录`);
    console.log('✅ FlightPriceReference 表已清空');
  } catch (error) {
    console.error('❌ 清空数据失败:', error);
    throw error;
  }
}

main()
  .catch((error) => {
    console.error('❌ 执行失败:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

