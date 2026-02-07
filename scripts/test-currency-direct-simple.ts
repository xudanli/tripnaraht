/**
 * Currency Exchange Direct API 简单测试脚本
 * 
 * 测试 ExchangeRate API 集成和基本功能
 */

import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

// 加载 .env 文件
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const BASE_URL = 'https://api.exchangerate-api.com/v4';

async function testCurrencyExchange() {
  console.log('🔍 测试 Currency Exchange Direct API...\n');

  try {
    // 测试 1: 获取最新汇率（USD 为基础）
    console.log('1️⃣  测试获取最新汇率（USD）...');
    const latestResponse = await axios.get(`${BASE_URL}/latest/USD`);

    if (latestResponse.data && latestResponse.data.rates) {
      console.log(`✅ 获取最新汇率成功`);
      console.log(`   基础货币: ${latestResponse.data.base}`);
      console.log(`   日期: ${latestResponse.data.date}`);
      console.log(`   支持的货币数量: ${Object.keys(latestResponse.data.rates).length}`);
      
      // 显示几个常见货币的汇率
      const commonCurrencies = ['EUR', 'GBP', 'JPY', 'CNY', 'AUD', 'CAD'];
      console.log(`   常见货币汇率:`);
      for (const currency of commonCurrencies) {
        if (latestResponse.data.rates[currency]) {
          console.log(`     ${currency}: ${latestResponse.data.rates[currency]}`);
        }
      }
    } else {
      console.error(`❌ 获取最新汇率失败: 响应格式不正确`);
    }

    console.log('\n');

    // 测试 2: 货币转换
    console.log('2️⃣  测试货币转换（100 USD -> EUR）...');
    const usdToEurRate = latestResponse.data.rates['EUR'];
    if (usdToEurRate) {
      const amount = 100;
      const converted = amount * usdToEurRate;
      console.log(`✅ 货币转换成功`);
      console.log(`   ${amount} USD = ${converted.toFixed(2)} EUR`);
      console.log(`   汇率: 1 USD = ${usdToEurRate} EUR`);
    } else {
      console.error(`❌ 货币转换失败: EUR 汇率不可用`);
    }

    console.log('\n');

    // 测试 3: 获取历史汇率（7天前）
    console.log('3️⃣  测试获取历史汇率（7天前）...');
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const dateStr = sevenDaysAgo.toISOString().split('T')[0];
    
    try {
      const historicalResponse = await axios.get(`${BASE_URL}/history/USD/${dateStr}`);
      
      if (historicalResponse.data && historicalResponse.data.rates) {
        console.log(`✅ 获取历史汇率成功`);
        console.log(`   日期: ${historicalResponse.data.date}`);
        console.log(`   EUR 汇率（${dateStr}）: ${historicalResponse.data.rates['EUR'] || 'N/A'}`);
        
        // 对比当前汇率
        if (latestResponse.data.rates['EUR'] && historicalResponse.data.rates['EUR']) {
          const currentRate = latestResponse.data.rates['EUR'];
          const historicalRate = historicalResponse.data.rates['EUR'];
          const change = ((currentRate - historicalRate) / historicalRate * 100).toFixed(2);
          console.log(`   汇率变化: ${change}%`);
        }
      } else {
        console.error(`❌ 获取历史汇率失败: 响应格式不正确`);
      }
    } catch (error: any) {
      if (error.response && error.response.status === 404) {
        console.log(`⚠️  历史汇率不可用（日期: ${dateStr}）`);
      } else {
        console.error(`❌ 获取历史汇率失败: ${error.message}`);
      }
    }

    console.log('\n✅ 所有测试完成！');
  } catch (error: any) {
    console.error('❌ 测试失败:', error.message);
    if (error.response) {
      console.error('   响应状态:', error.response.status);
      console.error('   响应数据:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.error('   请求错误:', error.request);
    } else {
      console.error('   错误详情:', error);
    }
    process.exit(1);
  }
}

// 运行测试
testCurrencyExchange().catch((error) => {
  console.error('未捕获的错误:', error);
  process.exit(1);
});
