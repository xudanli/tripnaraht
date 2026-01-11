// 调试城市API - 对比数据库查询和API返回
import fetch from 'node-fetch';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:3000';

async function debugCitiesAPI() {
  console.log('=== 调试城市API ===\n');

  const testCases = [
    { code: 'CN', name: '中国' },
    { code: 'JP', name: '日本' },
  ];

  for (const testCase of testCases) {
    console.log(`--- ${testCase.name} (${testCase.code}) ---\n`);

    // 1. 直接数据库查询
    console.log('1. 直接数据库查询 (Prisma):');
    const dbCities = await prisma.city.findMany({
      where: { countryCode: testCase.code },
      take: 5,
      orderBy: [{ name: 'asc' }],
    });
    console.log(`   返回 ${dbCities.length} 个城市`);
    dbCities.slice(0, 3).forEach(c => {
      console.log(`   ${c.nameCN || c.name} [${c.countryCode}] (ID: ${c.id})`);
    });
    console.log('');

    // 2. API调用
    console.log('2. API调用:');
    const url = `${BASE_URL}/api/cities?countryCode=${testCase.code}&limit=5`;
    console.log(`   URL: ${url}`);
    
    const response = await fetch(url);
    const apiResult = await response.json();
    
    if (apiResult.success) {
      const apiCities = apiResult.data?.cities || [];
      console.log(`   返回 ${apiCities.length} 个城市`);
      apiCities.slice(0, 3).forEach((c: any) => {
        console.log(`   ${c.nameCN || c.name} [${c.countryCode}] (ID: ${c.id})`);
      });

      // 3. 对比
      console.log('\n3. 对比结果:');
      const dbIds = new Set(dbCities.map(c => c.id));
      const apiIds = new Set(apiCities.map((c: any) => c.id));
      
      const sameIds = [...dbIds].filter(id => apiIds.has(id));
      const differentIds = [...dbIds].filter(id => !apiIds.has(id));
      
      console.log(`   相同的城市ID: ${sameIds.length}/${dbCities.length}`);
      if (sameIds.length === 0) {
        console.log('   ❌ 没有相同的城市ID！');
      } else {
        console.log('   ✅ 有部分相同的城市ID');
      }
      
      if (differentIds.length > 0) {
        console.log(`   ⚠️  数据库有但API没有的城市ID: ${differentIds.slice(0, 3).join(', ')}`);
      }

      // 检查国家代码
      const wrongCountry = apiCities.filter((c: any) => c.countryCode !== testCase.code);
      if (wrongCountry.length > 0) {
        console.log(`   ❌ API返回了 ${wrongCountry.length} 个其他国家的城市`);
        wrongCountry.slice(0, 3).forEach((c: any) => {
          console.log(`      ${c.nameCN || c.name} [${c.countryCode}] (应该是 ${testCase.code})`);
        });
      } else {
        console.log(`   ✅ 所有城市的国家代码都正确`);
      }
    } else {
      console.log(`   ❌ API调用失败: ${apiResult.message || '未知错误'}`);
    }
    
    console.log('\n');
  }

  await prisma.$disconnect();
}

debugCitiesAPI().catch(console.error);
