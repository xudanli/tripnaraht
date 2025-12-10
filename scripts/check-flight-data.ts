// 检查航班数据
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 检查航班数据...\n');

  // 1. 查看前10条航线
  console.log('📊 前10条航线数据:');
  const samples = await prisma.flightPriceDetail.findMany({
    take: 10,
    orderBy: { sampleCount: 'desc' },
    select: {
      routeId: true,
      originCity: true,
      destinationCity: true,
      month: true,
      dayOfWeek: true,
      monthlyBasePrice: true,
      dayOfWeekFactor: true,
      sampleCount: true,
    },
  });

  samples.forEach((s, i) => {
    console.log(`  ${i + 1}. ${s.routeId}, 月份: ${s.month}, 星期: ${s.dayOfWeek ?? '全部'}, 基准价: ${s.monthlyBasePrice.toFixed(2)}, 样本: ${s.sampleCount}`);
  });

  console.log('\n');

  // 2. 查看有哪些航线
  console.log('📊 航线列表（前20条）:');
  const routes = await prisma.flightPriceDetail.findMany({
    where: { dayOfWeek: null }, // 只取汇总数据
    take: 20,
    orderBy: { sampleCount: 'desc' },
    select: {
      routeId: true,
      originCity: true,
      destinationCity: true,
      sampleCount: true,
    },
    distinct: ['routeId'],
  });

  routes.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.routeId} (样本: ${r.sampleCount})`);
  });

  console.log('\n');

  // 3. 测试查询：成都->深圳
  console.log('🔍 测试查询：成都 -> 深圳');
  const chengduShenzhen = await prisma.flightPriceDetail.findMany({
    where: {
      routeId: '成都->深圳',
    },
    take: 5,
  });

  if (chengduShenzhen.length > 0) {
    console.log(`  找到 ${chengduShenzhen.length} 条记录:`);
    chengduShenzhen.forEach((r) => {
      console.log(`    - 月份: ${r.month}, 星期: ${r.dayOfWeek ?? '全部'}, 基准价: ${r.monthlyBasePrice.toFixed(2)}`);
    });
  } else {
    console.log('  ❌ 未找到数据');
  }

  console.log('\n');

  // 4. 查看周内因子
  console.log('📊 周内因子:');
  const factors = await prisma.dayOfWeekFactor.findMany({
    orderBy: { dayOfWeek: 'asc' },
  });

  const dayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  factors.forEach((f) => {
    const dayName = dayNames[f.dayOfWeek] || `星期${f.dayOfWeek + 1}`;
    console.log(`  ${dayName} (${f.dayOfWeek}): ${f.factor.toFixed(4)} (样本: ${f.sampleCount})`);
  });

  await prisma.$disconnect();
}

main().catch(console.error);

