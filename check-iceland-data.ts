import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkIcelandData() {
  try {
    // 查询所有 source 为 alltrails 的 Place
    const places = await prisma.$queryRaw`
      SELECT 
        id,
        "nameCN",
        "nameEN",
        category,
        address,
        rating,
        metadata->>'sourceUrl' as source_url,
        metadata->>'source' as source,
        "createdAt"
      FROM "Place"
      WHERE metadata->>'source' = 'alltrails'
      ORDER BY "createdAt" DESC
      LIMIT 20;
    `;
    
    console.log(`\n📊 找到 ${Array.isArray(places) ? places.length : 0} 条 AllTrails 数据\n`);
    
    if (Array.isArray(places) && places.length > 0) {
      places.forEach((place: any, i: number) => {
        console.log(`${i + 1}. ${place.nameCN || place.nameEN || 'Unknown'}`);
        console.log(`   - ID: ${place.id}`);
        console.log(`   - URL: ${place.source_url}`);
        console.log(`   - 评分: ${place.rating || 'N/A'}`);
        console.log(`   - 创建时间: ${place.createdAt}`);
        console.log('');
      });
    } else {
      console.log('❌ 未找到 AllTrails 数据');
    }
  } catch (error: any) {
    console.error('❌ 查询失败:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkIcelandData();
