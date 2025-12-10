// 检查API数据完整性
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 检查API数据完整性...\n');

  // 1. 检查FlightPriceDetail数据统计
  console.log('📊 FlightPriceDetail 数据统计:');
  const totalRecords = await prisma.flightPriceDetail.count();
  const uniqueRoutes = await prisma.flightPriceDetail.groupBy({
    by: ['routeId'],
    _count: true,
  });
  
  const monthStats = await prisma.flightPriceDetail.groupBy({
    by: ['month'],
    _count: true,
    _sum: {
      sampleCount: true,
    },
  });

  console.log(`  总记录数: ${totalRecords}`);
  console.log(`  唯一航线数: ${uniqueRoutes.length}`);
  console.log(`  覆盖月份: ${monthStats.length} 个月`);
  console.log(`  月份范围: ${Math.min(...monthStats.map(m => m.month))} - ${Math.max(...monthStats.map(m => m.month))}`);
  
  const totalSamples = monthStats.reduce((sum, m) => sum + (m._sum.sampleCount || 0), 0);
  console.log(`  总样本数: ${totalSamples.toLocaleString()}\n`);

  // 2. 检查成都->深圳航线数据
  console.log('🔍 检查成都->深圳航线数据:');
  const chengduShenzhen = await prisma.flightPriceDetail.findMany({
    where: {
      routeId: '成都->深圳',
    },
    orderBy: [
      { month: 'asc' },
      { dayOfWeek: 'asc' },
    ],
    take: 10,
  });

  if (chengduShenzhen.length > 0) {
    console.log(`  找到 ${chengduShenzhen.length} 条记录（前10条）:`);
    chengduShenzhen.forEach((r, i) => {
      const dayName = r.dayOfWeek !== null 
        ? ['周一', '周二', '周三', '周四', '周五', '周六', '周日'][r.dayOfWeek] 
        : '全部';
      console.log(`    ${i + 1}. 月份: ${r.month}, 星期: ${r.dayOfWeek !== null ? r.dayOfWeek : '全部'}(${dayName}), 基准价: ${r.monthlyBasePrice.toFixed(2)}, 样本: ${r.sampleCount}`);
    });
  } else {
    console.log('  ❌ 未找到成都->深圳的数据');
    
    // 查找包含成都或深圳的航线
    const relatedRoutes = await prisma.flightPriceDetail.findMany({
      where: {
        OR: [
          { originCity: { contains: '成都' } },
          { destinationCity: { contains: '成都' } },
          { originCity: { contains: '深圳' } },
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
    
    if (relatedRoutes.length > 0) {
      console.log('\n  找到相关航线:');
      relatedRoutes.forEach((r, i) => {
        console.log(`    ${i + 1}. ${r.routeId}`);
      });
    }
  }
  console.log('');

  // 3. 检查周内因子
  console.log('📊 周内因子数据:');
  const factors = await prisma.dayOfWeekFactor.findMany({
    orderBy: { dayOfWeek: 'asc' },
  });
  
  if (factors.length > 0) {
    const dayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    factors.forEach((f) => {
      const dayName = dayNames[f.dayOfWeek] || `星期${f.dayOfWeek + 1}`;
      console.log(`  ${dayName} (${f.dayOfWeek}): 因子=${f.factor.toFixed(4)}, 样本=${f.sampleCount.toLocaleString()}`);
    });
  } else {
    console.log('  ❌ 未找到周内因子数据');
  }
  console.log('');

  // 4. 检查国际航线价格参考数据
  console.log('🌍 国际航线价格参考数据:');
  const flightRefs = await prisma.flightPriceReference.findMany({
    take: 5,
  });
  console.log(`  记录数: ${await prisma.flightPriceReference.count()}`);
  if (flightRefs.length > 0) {
    console.log('  示例数据（前5条）:');
    flightRefs.forEach((r, i) => {
      console.log(`    ${i + 1}. ${r.countryCode}${r.originCity ? ` (${r.originCity})` : ''}: 淡季=${r.lowSeasonPrice}, 旺季=${r.highSeasonPrice}, 平均=${r.averagePrice}`);
    });
  }
  console.log('');

  // 5. 数据源统计
  console.log('📋 数据源统计:');
  const sourceStats = await prisma.flightPriceDetail.groupBy({
    by: ['source'],
    _count: true,
  });
  sourceStats.forEach((s) => {
    console.log(`  ${s.source || 'NULL'}: ${s._count} 条记录`);
  });

  console.log('\n✅ 数据检查完成！');
}

main()
  .catch((e) => {
    console.error('❌ 错误:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
