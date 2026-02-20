#!/usr/bin/env node

/**
 * 测试 Amadeus Direct API（绕过 MCP，直接调用 Amadeus REST API）
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function test() {
  console.log('🧪 测试 Amadeus Direct API\n');
  console.log('='.repeat(60));

  const { AmadeusDirectService } = await import('../src/mcp/amadeus-direct.service');
  const service = new AmadeusDirectService();

  if (!service.isAvailable) {
    console.log('❌ Amadeus 凭证未配置');
    console.log('请在 .env 中设置 AMADEUS_CLIENT_ID 和 AMADEUS_CLIENT_SECRET');
    process.exit(1);
  }

  console.log('✅ 凭证已配置');
  console.log('\n搜索: 悉尼 (SYD) -> 曼谷 (BKK), 2026-05-02');
  console.log('-'.repeat(60));

  try {
    const result = await service.searchFlightOffers({
      originLocationCode: 'SYD',
      destinationLocationCode: 'BKK',
      departureDate: '2026-05-02',
      adults: 1,
      max: 5,
    });

    const flights = result?.data || [];
    console.log(`\n✅ 找到 ${flights.length} 个航班`);
    if (flights.length > 0) {
      const f = flights[0];
      console.log('\n第一个航班示例:');
      console.log(`  价格: ${f.price?.currency} ${f.price?.total}`);
      console.log(`  行程: ${f.itineraries?.[0]?.segments?.[0]?.departure?.iataCode} -> ${f.itineraries?.[0]?.segments?.[0]?.arrival?.iataCode}`);
    }
  } catch (err: any) {
    console.error('\n❌ 搜索失败:', err.message);
    process.exit(1);
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ 测试完成');
}

test().catch(console.error);
