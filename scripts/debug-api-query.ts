// 调试API查询问题
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 调试API查询问题...\n');

  const originCity = '成都';
  const destinationCity = '深圳';
  const month = 10;
  const dayOfWeek = 0;

  // 1. 检查routeId格式
  const routeId = `${originCity}->${destinationCity}`;
  console.log(`📝 查询参数:`);
  console.log(`  originCity: "${originCity}"`);
  console.log(`  destinationCity: "${destinationCity}"`);
  console.log(`  routeId: "${routeId}"`);
  console.log(`  routeId 长度: ${routeId.length}`);
  console.log(`  routeId 编码: ${Buffer.from(routeId).toString('hex')}`);
  console.log(`  month: ${month}`);
  console.log(`  dayOfWeek: ${dayOfWeek}\n`);

  // 2. 查询精确匹配的数据
  console.log('🔍 查询精确匹配的数据:');
  const exactMatch = await prisma.flightPriceDetail.findFirst({
    where: {
      routeId,
      month,
      dayOfWeek,
    },
  });

  if (exactMatch) {
    console.log(`  ✅ 找到数据:`);
    console.log(`    ID: ${exactMatch.id}`);
    console.log(`    routeId: "${exactMatch.routeId}"`);
    console.log(`    monthlyBasePrice: ${exactMatch.monthlyBasePrice}`);
    console.log(`    sampleCount: ${exactMatch.sampleCount}`);
  } else {
    console.log(`  ❌ 未找到精确匹配的数据\n`);

    // 3. 查询该月份的所有数据
    console.log('🔍 查询该月份的所有数据:');
    const monthData = await prisma.flightPriceDetail.findMany({
      where: {
        routeId,
        month,
      },
    });

    console.log(`  找到 ${monthData.length} 条记录:`);
    if (monthData.length > 0) {
      monthData.forEach((d, i) => {
        const dayName = d.dayOfWeek !== null 
          ? ['周一', '周二', '周三', '周四', '周五', '周六', '周日'][d.dayOfWeek] 
          : '全部';
        console.log(`    ${i + 1}. dayOfWeek: ${d.dayOfWeek} (${dayName}), 基准价: ${d.monthlyBasePrice.toFixed(2)}, 样本: ${d.sampleCount}`);
      });
    } else {
      console.log(`  ❌ 该月份没有数据\n`);

      // 4. 检查routeId是否存在
      console.log('🔍 检查routeId是否存在:');
      const routeExists = await prisma.flightPriceDetail.findFirst({
        where: {
          routeId,
        },
      });

      if (routeExists) {
        console.log(`  ✅ routeId存在，但月份 ${month} 没有数据`);
        console.log(`  示例数据: month=${routeExists.month}, dayOfWeek=${routeExists.dayOfWeek}`);
      } else {
        console.log(`  ❌ routeId不存在\n`);

        // 5. 检查数据库中实际的routeId格式
        console.log('🔍 检查数据库中实际的routeId格式:');
        const similarRoutes = await prisma.flightPriceDetail.findMany({
          where: {
            OR: [
              { originCity: { contains: '成都' } },
              { destinationCity: { contains: '深圳' } },
            ],
          },
          select: {
            routeId: true,
            originCity: true,
            destinationCity: true,
          },
          distinct: ['routeId'],
          take: 5,
        });

        console.log(`  找到 ${similarRoutes.length} 条相关航线:`);
        similarRoutes.forEach((r, i) => {
          console.log(`    ${i + 1}. "${r.routeId}" (origin: ${r.originCity}, dest: ${r.destinationCity})`);
          console.log(`       长度: ${r.routeId.length}, 编码: ${Buffer.from(r.routeId).toString('hex')}`);
        });
      }
    }
  }

  // 6. 测试1月周一的数据（应该存在）
  console.log('\n🔍 测试1月周一的数据（应该存在）:');
  const testMatch = await prisma.flightPriceDetail.findFirst({
    where: {
      routeId: '成都->深圳',
      month: 1,
      dayOfWeek: 0,
    },
  });

  if (testMatch) {
    console.log(`  ✅ 找到数据:`);
    console.log(`    monthlyBasePrice: ${testMatch.monthlyBasePrice}`);
    console.log(`    sampleCount: ${testMatch.sampleCount}`);
    console.log(`    routeId: "${testMatch.routeId}"`);
    console.log(`    routeId 长度: ${testMatch.routeId.length}`);
    console.log(`    routeId 编码: ${Buffer.from(testMatch.routeId).toString('hex')}`);
  } else {
    console.log(`  ❌ 未找到数据`);
  }

  console.log('\n✅ 调试完成！');
}

main()
  .catch((e) => {
    console.error('❌ 错误:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
