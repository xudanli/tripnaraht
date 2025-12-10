// scripts/verify-flight-data.ts
// 验证航班数据导入情况

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 验证航班数据导入情况...\n');

  try {
    // 1. 检查记录数
    const flightPriceDetailCount = await prisma.flightPriceDetail.count();
    const dayOfWeekFactorCount = await prisma.dayOfWeekFactor.count();

    console.log('📊 数据统计:');
    console.log(`   FlightPriceDetail: ${flightPriceDetailCount.toLocaleString()} 条记录`);
    console.log(`   DayOfWeekFactor: ${dayOfWeekFactorCount} 条记录\n`);

    if (flightPriceDetailCount === 0) {
      console.log('⚠️  警告: FlightPriceDetail 表为空，请检查数据导入是否成功\n');
      return;
    }

    // 2. 检查新字段的数据完整性
    console.log('📋 检查新字段数据完整性:');
    
    const fieldsCheck = await prisma.flightPriceDetail.findMany({
      take: 1000,
      select: {
        id: true,
        distanceKm: true,
        monthFactor: true,
        airlineCount: true,
        isWeekend: true,
        departureTime: true,
        arrivalTime: true,
        timeOfDayFactor: true,
      },
    });

    const total = fieldsCheck.length;
    const withDistanceKm = fieldsCheck.filter(r => r.distanceKm !== null).length;
    const withMonthFactor = fieldsCheck.filter(r => r.monthFactor !== null).length;
    const withAirlineCount = fieldsCheck.filter(r => r.airlineCount !== null && r.airlineCount > 0).length;
    const withIsWeekend = fieldsCheck.filter(r => r.isWeekend !== null).length;
    const withDepartureTime = fieldsCheck.filter(r => r.departureTime !== null).length;
    const withArrivalTime = fieldsCheck.filter(r => r.arrivalTime !== null).length;
    const withTimeOfDayFactor = fieldsCheck.filter(r => r.timeOfDayFactor !== null).length;

    console.log(`   样本数: ${total}`);
    console.log(`   distanceKm: ${withDistanceKm}/${total} (${((withDistanceKm/total)*100).toFixed(1)}%)`);
    console.log(`   monthFactor: ${withMonthFactor}/${total} (${((withMonthFactor/total)*100).toFixed(1)}%)`);
    console.log(`   airlineCount: ${withAirlineCount}/${total} (${((withAirlineCount/total)*100).toFixed(1)}%)`);
    console.log(`   isWeekend: ${withIsWeekend}/${total} (${((withIsWeekend/total)*100).toFixed(1)}%)`);
    console.log(`   departureTime: ${withDepartureTime}/${total} (${((withDepartureTime/total)*100).toFixed(1)}%)`);
    console.log(`   arrivalTime: ${withArrivalTime}/${total} (${((withArrivalTime/total)*100).toFixed(1)}%)`);
    console.log(`   timeOfDayFactor: ${withTimeOfDayFactor}/${total} (${((withTimeOfDayFactor/total)*100).toFixed(1)}%)\n`);

    // 3. 查看示例数据
    console.log('📝 示例数据（前5条）:');
    const samples = await prisma.flightPriceDetail.findMany({
      take: 5,
      orderBy: { sampleCount: 'desc' },
      select: {
        routeId: true,
        month: true,
        dayOfWeek: true,
        monthlyBasePrice: true,
        dayOfWeekFactor: true,
        distanceKm: true,
        monthFactor: true,
        airlineCount: true,
        isWeekend: true,
        departureTime: true,
        arrivalTime: true,
        timeOfDayFactor: true,
        sampleCount: true,
      },
    });

    samples.forEach((s, i) => {
      console.log(`\n   ${i + 1}. ${s.routeId}`);
      console.log(`      月份: ${s.month}, 星期: ${s.dayOfWeek ?? '全部'}`);
      console.log(`      基准价: ${s.monthlyBasePrice.toFixed(2)}元, 周内因子: ${s.dayOfWeekFactor?.toFixed(4) ?? 'N/A'}`);
      console.log(`      里程: ${s.distanceKm?.toFixed(2) ?? 'N/A'}km, 月度因子: ${s.monthFactor?.toFixed(4) ?? 'N/A'}`);
      console.log(`      航司数: ${s.airlineCount ?? 'N/A'}, 周末: ${s.isWeekend ? '是' : '否'}`);
      console.log(`      起飞: ${s.departureTime ?? 'N/A'}, 降落: ${s.arrivalTime ?? 'N/A'}`);
      console.log(`      时段因子: ${s.timeOfDayFactor?.toFixed(4) ?? 'N/A'}, 样本: ${s.sampleCount}`);
    });

    // 4. 检查周内因子
    console.log('\n📊 周内因子:');
    const factors = await prisma.dayOfWeekFactor.findMany({
      orderBy: { dayOfWeek: 'asc' },
    });

    const dayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    factors.forEach((f) => {
      const dayName = dayNames[f.dayOfWeek] || `星期${f.dayOfWeek + 1}`;
      console.log(`   ${dayName} (${f.dayOfWeek}): ${f.factor.toFixed(4)} (样本: ${f.sampleCount.toLocaleString()})`);
    });

    // 5. 统计信息
    console.log('\n📈 数据质量统计:');
    const routes = await prisma.flightPriceDetail.findMany({
      where: { dayOfWeek: null },
      select: { routeId: true },
      distinct: ['routeId'],
    });
    console.log(`   唯一航线数: ${routes.length}`);

    const months = await prisma.flightPriceDetail.findMany({
      where: { dayOfWeek: null },
      select: { month: true },
      distinct: ['month'],
    });
    console.log(`   覆盖月份: ${months.map(m => m.month).sort((a, b) => a - b).join(', ')}`);

    console.log('\n✅ 数据验证完成！');

  } catch (error: any) {
    console.error('\n❌ 验证失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);

