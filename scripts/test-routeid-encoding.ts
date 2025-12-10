// 测试routeId编码问题
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testRouteId(originCity: string, destinationCity: string) {
  const routeId = `${originCity}->${destinationCity}`;
  
  console.log(`\n🔍 测试routeId: "${routeId}"`);
  console.log(`   长度: ${routeId.length}`);
  console.log(`   UTF-8编码: ${Buffer.from(routeId).toString('hex')}`);
  
  // 测试直接查询
  const directQuery = await prisma.flightPriceDetail.findFirst({
    where: {
      routeId: routeId,
    },
  });
  
  console.log(`   直接查询: ${directQuery ? '✅ 找到' : '❌ 未找到'}`);
  
  // 测试从数据库查询实际的routeId
  const actualRoute = await prisma.flightPriceDetail.findFirst({
    where: {
      originCity: originCity,
      destinationCity: destinationCity,
    },
    select: {
      routeId: true,
    },
  });
  
  if (actualRoute) {
    console.log(`   数据库中的routeId: "${actualRoute.routeId}"`);
    console.log(`   长度: ${actualRoute.routeId.length}`);
    console.log(`   UTF-8编码: ${Buffer.from(actualRoute.routeId).toString('hex')}`);
    console.log(`   是否匹配: ${routeId === actualRoute.routeId ? '✅ 是' : '❌ 否'}`);
    
    if (routeId !== actualRoute.routeId) {
      console.log(`   ⚠️ routeId不匹配！`);
      console.log(`   字符对比:`);
      for (let i = 0; i < Math.max(routeId.length, actualRoute.routeId.length); i++) {
        const char1 = routeId[i] || ' ';
        const char2 = actualRoute.routeId[i] || ' ';
        const code1 = char1.charCodeAt(0);
        const code2 = char2.charCodeAt(0);
        if (char1 !== char2) {
          console.log(`     位置 ${i}: "${char1}" (${code1}) vs "${char2}" (${code2})`);
        }
      }
    }
  }
}

async function main() {
  console.log('🧪 测试routeId编码问题\n');
  
  await testRouteId('成都', '深圳');
  
  // 测试URL编码后的情况
  console.log('\n🔍 测试URL编码:');
  const encoded = encodeURIComponent('成都->深圳');
  console.log(`   URL编码: "${encoded}"`);
  const decoded = decodeURIComponent(encoded);
  console.log(`   解码后: "${decoded}"`);
  
  await testRouteId(decoded.split('->')[0], decoded.split('->')[1]);
  
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
