import { PrismaClient } from '@prisma/client';

async function verifyAttractions() {
  const prisma = new PrismaClient();

  try {
    console.log('🔍 验证景点导入结果...\n');

    // 查找雷克雅未克城市
    const reykjavik = await prisma.city.findFirst({
      where: {
        nameEN: 'Reykjavík',
        countryCode: 'IS',
      },
    });

    if (!reykjavik) {
      console.log('❌ 未找到冰岛城市');
      return;
    }

    console.log(`✅ 找到城市: ${reykjavik.nameCN} (ID: ${reykjavik.id})\n`);

    // 查询所有景点
    const attractions = await prisma.place.findMany({
      where: {
        category: 'ATTRACTION',
        cityId: reykjavik.id,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    console.log(`📍 景点总数: ${attractions.length}\n`);
    console.log('景点列表:');
    console.log('='.repeat(80));

    attractions.forEach((attr, i) => {
      const metadata = attr.metadata as any;
      const poiId = metadata?.poi_id || '未知';
      console.log(`${i + 1}. [${poiId}] ${attr.nameCN} (${attr.nameEN})`);
      console.log(`   分类: ${attr.category} | 评分: ${attr.rating}`);
      if (metadata?.region) {
        console.log(`   地区: ${metadata.region}`);
      }
      if (attr.location) {
        console.log(`   坐标: ✅ 已设置`);
      }
      console.log('');
    });

    // 统计
    const stats = await prisma.place.groupBy({
      by: ['category'],
      where: {
        cityId: reykjavik.id,
      },
      _count: {
        id: true,
      },
    });

    console.log('='.repeat(80));
    console.log('\n📊 POI分类统计:');
    stats.forEach(stat => {
      console.log(`  ${stat.category}: ${stat._count.id} 个`);
    });

    const totalPois = stats.reduce((sum, stat) => sum + stat._count.id, 0);
    console.log(`\n总计: ${totalPois} 个POI`);

  } catch (error: any) {
    console.error('❌ 错误:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

verifyAttractions();
