// 测试查询
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  // 测试查询：成都->深圳，1月，周一
  const routeId = '成都->深圳';
  const month = 1;
  const dayOfWeek = 0;

  console.log(`查询: ${routeId}, 月份: ${month}, 星期: ${dayOfWeek}\n`);

  // 1. 查询具体星期几的数据
  const dayData = await prisma.flightPriceDetail.findFirst({
    where: {
      routeId,
      month,
      dayOfWeek,
    },
  });

  console.log('具体星期几的数据:');
  console.log(dayData ? JSON.stringify(dayData, null, 2) : '未找到');

  console.log('\n');

  // 2. 查询该月份所有数据
  const allMonthData = await prisma.flightPriceDetail.findMany({
    where: {
      routeId,
      month,
    },
    take: 10,
  });

  console.log(`该月份所有数据（前10条）:`);
  allMonthData.forEach((d, i) => {
    console.log(`  ${i + 1}. 星期: ${d.dayOfWeek}, 基准价: ${d.monthlyBasePrice.toFixed(2)}, 样本: ${d.sampleCount}`);
  });

  console.log('\n');

  // 3. 测试不同的 routeId 格式
  console.log('测试不同的 routeId 格式:');
  const testRoutes = [
    '成都->深圳',
    '成都 -> 深圳',
    '成都→深圳',
  ];

  for (const testRoute of testRoutes) {
    const count = await prisma.flightPriceDetail.count({
      where: { routeId: testRoute },
    });
    console.log(`  "${testRoute}": ${count} 条记录`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);

