// 更新数据源标签
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 更新数据源标签...\n');

  // 统计更新前的数据
  const beforeCount = await prisma.flightPriceDetail.count({
    where: {
      source: '2024年历史数据',
    },
  });

  console.log(`📊 更新前：${beforeCount} 条记录标记为"2024年历史数据"`);

  // 执行更新
  const result = await prisma.flightPriceDetail.updateMany({
    where: {
      source: '2024年历史数据',
    },
    data: {
      source: '2023-2024年历史数据',
    },
  });

  console.log(`✅ 已更新 ${result.count} 条记录`);

  // 验证更新结果
  const afterCount = await prisma.flightPriceDetail.count({
    where: {
      source: '2023-2024年历史数据',
    },
  });

  console.log(`📊 更新后：${afterCount} 条记录标记为"2023-2024年历史数据"`);

  // 检查数据源分布
  const sourceStats = await prisma.flightPriceDetail.groupBy({
    by: ['source'],
    _count: true,
  });

  console.log('\n📋 数据源分布:');
  sourceStats.forEach((s) => {
    console.log(`  ${s.source || 'NULL'}: ${s._count} 条记录`);
  });

  console.log('\n✅ 数据源标签更新完成！');
}

main()
  .catch((e) => {
    console.error('❌ 错误:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
