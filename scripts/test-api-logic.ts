// 测试API逻辑
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function simulateEstimateDomesticPrice(
  originCity: string,
  destinationCity: string,
  month: number,
  dayOfWeek?: number
) {
  const routeId = `${originCity}->${destinationCity}`;
  console.log(`\n🔍 模拟API查询: ${routeId}, 月份: ${month}, 星期: ${dayOfWeek}\n`);

  // 如果指定了星期几，直接查询对应的数据
  if (dayOfWeek !== undefined) {
    const dayData = await prisma.flightPriceDetail.findFirst({
      where: {
        routeId,
        month,
        dayOfWeek,
      },
    });

    if (dayData) {
      console.log(`✅ 找到具体星期几的数据:`);
      console.log(`   monthlyBasePrice: ${dayData.monthlyBasePrice}`);
      console.log(`   dayOfWeekFactor: ${dayData.dayOfWeekFactor || 'N/A'}`);
      console.log(`   sampleCount: ${dayData.sampleCount}`);
      
      const dayOfWeekFactor = dayData.dayOfWeekFactor || 1.0;
      const estimatedPrice = Math.round(dayData.monthlyBasePrice * dayOfWeekFactor);
      console.log(`\n   估算价格: ${estimatedPrice} 元`);
      return;
    } else {
      console.log(`⚠️ 未找到具体星期几的数据，降级到月度平均值...\n`);
    }
  }

  // 查找月度基准价（计算该月份所有星期的平均值）
  const monthlyDataList = await prisma.flightPriceDetail.findMany({
    where: {
      routeId,
      month,
    },
  });

  if (monthlyDataList.length === 0) {
    console.log(`❌ 未找到该月份的数据，返回默认值 2000 元`);
    return;
  }

  console.log(`✅ 找到该月份 ${monthlyDataList.length} 条记录:`);
  monthlyDataList.forEach((d, i) => {
    const dayName = d.dayOfWeek !== null 
      ? ['周一', '周二', '周三', '周四', '周五', '周六', '周日'][d.dayOfWeek] 
      : '全部';
    console.log(`   ${i + 1}. ${dayName} (${d.dayOfWeek}): 基准价=${d.monthlyBasePrice.toFixed(2)}, 样本=${d.sampleCount}`);
  });

  // 计算月度平均基准价（加权平均，按样本数）
  const totalSamples = monthlyDataList.reduce((sum, d) => sum + d.sampleCount, 0);
  const weightedPrice = monthlyDataList.reduce(
    (sum, d) => sum + d.monthlyBasePrice * d.sampleCount,
    0
  ) / totalSamples;

  const monthlyBasePrice = Math.round(weightedPrice);
  console.log(`\n   月度加权平均基准价: ${monthlyBasePrice} 元 (总样本: ${totalSamples})`);

  // 如果指定了星期几，使用全局周内因子
  if (dayOfWeek !== undefined) {
    const globalFactor = await prisma.dayOfWeekFactor.findUnique({
      where: { dayOfWeek },
    });
    const dayOfWeekFactor = globalFactor?.factor || 1.0;
    console.log(`   全局周内因子 (${dayOfWeek}): ${dayOfWeekFactor.toFixed(4)}`);
    
    const estimatedPrice = Math.round(monthlyBasePrice * dayOfWeekFactor);
    const lowerBound = Math.round(estimatedPrice * 0.9);
    const upperBound = Math.round(estimatedPrice * 1.1);
    
    console.log(`\n   最终估算价格: ${estimatedPrice} 元`);
    console.log(`   价格范围: ${lowerBound} - ${upperBound} 元`);
  } else {
    console.log(`\n   最终估算价格: ${monthlyBasePrice} 元`);
  }
}

async function main() {
  console.log('🧪 测试API逻辑\n');

  // 测试1: 10月周一（应该降级到月度平均值）
  await simulateEstimateDomesticPrice('成都', '深圳', 10, 0);

  // 测试2: 10月不指定星期几（应该返回月度平均值）
  await simulateEstimateDomesticPrice('成都', '深圳', 10);

  // 测试3: 1月周一（应该有具体数据）
  await simulateEstimateDomesticPrice('成都', '深圳', 1, 0);

  // 测试4: 3月周五（应该有具体数据）
  await simulateEstimateDomesticPrice('成都', '深圳', 3, 4);

  console.log('\n✅ 测试完成！');
}

main()
  .catch((e) => {
    console.error('❌ 错误:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
