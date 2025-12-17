// scripts/test-prophet.ts
/**
 * 测试 Prophet 价格预测脚本
 * 
 * 运行方式: ts-node --project tsconfig.backend.json scripts/test-prophet.ts
 */

import { ProphetService } from '../src/flight-prices/services/prophet-service';

async function testProphet() {
  const prophetService = new ProphetService();

  // 1. 检查可用性
  console.log('检查 Prophet 可用性...');
  const availability = await prophetService.checkAvailability();
  console.log('可用性:', availability);

  if (!availability.available) {
    console.error('Prophet 不可用，请先安装:');
    console.error('  pip install prophet pandas numpy');
    process.exit(1);
  }

  // 2. 准备测试数据
  console.log('\n准备测试数据...');
  const historicalData: Array<{ date: string; price: number }> = [];
  const today = new Date();
  
  // 生成过去2年的模拟数据
  for (let i = 730; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    
    // 模拟价格波动（基础价格 + 季节性 + 随机）
    const basePrice = 1000;
    const month = date.getMonth() + 1;
    const seasonalFactor = 1 + 0.2 * Math.sin((month - 1) * Math.PI / 6);
    const randomFactor = 0.9 + Math.random() * 0.2;
    const price = Math.round(basePrice * seasonalFactor * randomFactor);
    
    historicalData.push({
      date: date.toISOString().split('T')[0],
      price,
    });
  }

  console.log(`历史数据: ${historicalData.length} 条`);

  // 3. 进行预测
  console.log('\n开始预测...');
  const startDate = new Date();
  startDate.setDate(startDate.getDate() + 1);
  
  try {
    const forecast = await prophetService.predict(
      historicalData,
      startDate.toISOString().split('T')[0],
      30
    );

    console.log('\n预测结果:');
    console.log(`预测天数: ${forecast.length}`);
    console.log('\n前5天预测:');
    forecast.slice(0, 5).forEach((f) => {
      console.log(
        `  ${f.date}: ${f.price} (${f.lower_bound}-${f.upper_bound}), 趋势: ${f.trend}, 置信度: ${f.confidence}`
      );
    });

    console.log('\n✅ Prophet 预测测试成功！');
  } catch (error: any) {
    console.error('\n❌ Prophet 预测测试失败:');
    console.error(error.message);
    process.exit(1);
  }
}

testProphet().catch((error) => {
  console.error('测试失败:', error);
  process.exit(1);
});

