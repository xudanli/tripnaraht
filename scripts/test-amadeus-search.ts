#!/usr/bin/env node

/**
 * 测试 Amadeus 航班搜索
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { AmadeusService } from '../src/mcp/amadeus.service';

// 加载 .env 文件
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function testSearch() {
  console.log('🧪 测试 Amadeus 航班搜索\n');
  console.log('='.repeat(60));

  const service = new AmadeusService();

  try {
    // 测试搜索：悉尼到曼谷
    console.log('\n搜索航班: 悉尼 (SYD) -> 曼谷 (BKK)');
    console.log('出发日期: 2026-05-02');
    console.log('返程日期: 2026-05-10');
    console.log('成人数: 1');
    console.log('-'.repeat(60));

    const result = await service.searchFlightOffers({
      originLocationCode: 'SYD',
      destinationLocationCode: 'BKK',
      departureDate: '2026-05-02',
      adults: 1,
      returnDate: '2026-05-10',
      travelClass: 'ECONOMY',
    });

    if (result && (result as any).content) {
      const content = (result as any).content[0];
      if (content.type === 'text') {
        try {
          const data = JSON.parse(content.text);
          
          if (data.error) {
            console.log('\n❌ 错误:', data.error);
            console.log('消息:', data.message);
            if (data.details) {
              console.log('详情:', data.details);
            }
            
            if (data.error === 'Configuration required') {
              console.log('\n💡 解决方案:');
              console.log('1. 访问 https://smithery.ai');
              console.log('2. 登录并找到 Amadeus MCP 服务器页面');
              console.log('3. 在服务器设置中配置 Amadeus API 凭证:');
              console.log('   - API Key: pjYQqsUBVbaW4sIsEQbVvWN5e9hwpMKe');
              console.log('   - API Secret: (从 .env 文件中获取)');
              console.log('   - Base URL: test.api.amadeus.com');
              console.log('4. 保存配置后重新运行测试');
            }
          } else {
            console.log('\n✅ 搜索成功！');
            console.log('结果:', JSON.stringify(data, null, 2).substring(0, 2000));
          }
        } catch (parseError) {
          console.log('\n⚠️  无法解析结果');
          console.log('原始内容:', content.text.substring(0, 500));
        }
      }
    } else {
      console.log('\n⚠️  结果格式异常');
      console.log('结果:', JSON.stringify(result, null, 2).substring(0, 500));
    }

  } catch (error: any) {
    console.error('\n❌ 搜索失败:', error.message);
    if (error.stack) {
      console.error('堆栈:', error.stack);
    }
  } finally {
    await service.onModuleDestroy();
  }
}

testSearch().catch((error) => {
  console.error('❌ 未捕获的错误:', error);
  process.exit(1);
});
