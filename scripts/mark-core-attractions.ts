import { PrismaClient } from '@prisma/client';

async function markCoreAttractions() {
  const prisma = new PrismaClient();

  try {
    // 8个必看景点的nameEN（使用完整英文名称）
    const coreAttractions = [
      'Þingvellir National Park',           // attr_001 - UNESCO世界遗产
      'Skógafoss',                           // attr_002 - 南海岸标志瀑布
      'Reynisfjara Black Sand Beach',       // attr_006 - 黑沙滩（有安全风险但必看）
      'Geysir',                              // attr_007 - 间歇泉
      'Gullfoss',                            // attr_008 - 黄金瀑布
      'Kirkjufell',                          // attr_010 - 教会山
      'Jökulsárlón Glacier Lagoon',         // attr_015 - 冰河湖
      'Diamond Beach'                        // attr_016 - 钻石沙滩
    ];

    console.log('🎯 标记核心必看景点...');
    console.log('='.repeat(80));

    let updated = 0;

    for (const nameEN of coreAttractions) {
      const place = await prisma.place.findFirst({
        where: {
          nameEN: nameEN,
          category: 'ATTRACTION'
        }
      });

      if (!place) {
        console.log(`  ⚠️  未找到: ${nameEN}`);
        continue;
      }

      // 获取现有metadata
      const metadata = (place.metadata as any) || {};

      // 更新metadata
      const updatedMetadata = {
        ...metadata,
        tier: 'Tier 1',
        isCoreAttraction: true,
        mustSee: true,
        priority: 'high'
      };

      // 更新数据库
      await prisma.place.update({
        where: { id: place.id },
        data: {
          metadata: updatedMetadata
        }
      });

      console.log(`  ✅ 已标记: ${place.nameCN} (${nameEN})`);
      updated++;
    }

    console.log('');
    console.log(`✅ 完成！共标记 ${updated} 个核心景点`);

    // 验证
    console.log('');
    console.log('🔍 验证核心景点...');
    console.log('='.repeat(80));

    const verifyResult = await prisma.place.findMany({
      where: {
        category: 'ATTRACTION',
        metadata: {
          path: ['isCoreAttraction'],
          equals: true
        }
      },
      select: {
        id: true,
        nameCN: true,
        nameEN: true,
        metadata: true
      },
      orderBy: {
        nameCN: 'asc'
      }
    });

    console.log(`核心景点列表 (${verifyResult.length} 个):`);
    verifyResult.forEach((place, idx) => {
      const meta = place.metadata as any;
      console.log(`  ${idx + 1}. ${place.nameCN} (${place.nameEN})`);
      console.log(`     Tier: ${meta.tier}, Priority: ${meta.priority}`);
    });

  } catch (error: any) {
    console.error('❌ 错误:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

markCoreAttractions();
