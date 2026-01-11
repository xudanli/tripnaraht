// 直接测试 Prisma 查询，不通过 API
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testPrismaDirect() {
  console.log('=== 直接测试 Prisma 查询 ===\n');

  const testCases = [
    { code: 'CN', name: '中国' },
    { code: 'JP', name: '日本' },
    { code: 'IS', name: '冰岛' },
  ];

  for (const testCase of testCases) {
    console.log(`--- 测试: ${testCase.name} (${testCase.code}) ---`);
    
    try {
      const cities = await prisma.city.findMany({
        where: {
          countryCode: testCase.code,
        },
        take: 5,
        orderBy: [
          { countryCode: 'asc' },
          { name: 'asc' },
        ],
      });

      console.log(`结果: ${cities.length} 个城市`);
      if (cities.length > 0) {
        cities.forEach(c => {
          console.log(`  ${c.id}: ${c.nameCN || c.nameEN || c.name} [${c.countryCode}]`);
        });
        
        const wrong = cities.filter(c => c.countryCode !== testCase.code);
        if (wrong.length > 0) {
          console.log(`❌ 错误：返回了 ${wrong.length} 个其他国家的城市`);
        } else {
          console.log(`✅ 正确：所有城市都属于 ${testCase.code}`);
        }
      } else {
        console.log(`⚠️  未找到 ${testCase.code} 的城市`);
      }
    } catch (error: any) {
      console.log(`❌ 错误: ${error.message}`);
    }
    console.log('');
  }

  await prisma.$disconnect();
}

testPrismaDirect().catch(console.error);
