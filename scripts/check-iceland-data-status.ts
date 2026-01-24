#!/usr/bin/env tsx
/**
 * 检查冰岛数据导入情况
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('='.repeat(60));
  console.log('冰岛数据导入情况检查');
  console.log('='.repeat(60));
  console.log('');

  try {
    // 1. 检查City表
    console.log('🏙️  检查冰岛城市...');
    const icelandCities = await prisma.city.findMany({
      where: { countryCode: 'IS' },
    });
    console.log(`  找到 ${icelandCities.length} 个冰岛城市:`);
    icelandCities.forEach(city => {
      console.log(`    - ID: ${city.id}, 名称: ${city.nameCN || city.name} (${city.nameEN || city.name})`);
    });
    console.log('');

    if (icelandCities.length === 0) {
      console.log('  ⚠️  未找到冰岛城市，需要先创建\n');
      return;
    }

    // 获取所有冰岛城市的ID
    const icelandCityIds = icelandCities.map(city => city.id);

    // 2. 检查Place表
    console.log('📍 检查冰岛景点...');
    const totalPlaces = await prisma.place.count();
    const icelandPlaces = await prisma.place.count({
      where: { cityId: { in: icelandCityIds } },
    });
    const icelandAttractions = await prisma.place.count({
      where: {
        cityId: { in: icelandCityIds },
        category: 'ATTRACTION',
      },
    });

    console.log(`  数据库总景点数: ${totalPlaces}`);
    console.log(`  冰岛景点总数: ${icelandPlaces}`);
    console.log(`  冰岛景点(ATTRACTION): ${icelandAttractions}`);
    console.log('');

    // 3. 检查核心景点（Tier 1 & Tier 2）
    if (icelandPlaces > 0) {
      console.log('⭐ 检查核心景点...');
      const corePois = await prisma.place.findMany({
        where: {
          cityId: { in: icelandCityIds },
          category: 'ATTRACTION',
        },
        select: {
          id: true,
          nameCN: true,
          nameEN: true,
          metadata: true,
        },
      });

      const coreWithTier = corePois.filter(p => {
        const metadata = p.metadata as any;
        return metadata?.tier;
      });

      console.log(`  找到 ${coreWithTier.length} 个核心景点:`);
      coreWithTier.forEach(poi => {
        const metadata = poi.metadata as any;
        console.log(`    - ${poi.nameCN || poi.nameEN} (Tier: ${metadata?.tier}, Landmark: ${metadata?.is_landmark})`);
      });
      console.log('');
    }

    // 4. 检查RouteDirection表
    console.log('🛣️  检查冰岛路线...');
    const routes = await prisma.routeDirection.findMany({
      where: { countryCode: 'IS' },
    });

    console.log(`  找到 ${routes.length} 条冰岛路线:`);
    routes.forEach(route => {
      console.log(`    - ${route.nameCN || route.name} (${route.nameEN})`);
      console.log(`      ID: ${route.id}, 状态: ${route.status}`);
      const signaturePois = route.signaturePois as any;
      if (signaturePois?.examples?.length > 0) {
        console.log(`      关联景点数: ${signaturePois.examples.length}`);
      }
    });
    console.log('');

    // 5. 检查各类景点分布
    console.log('📊 检查景点分类分布...');
    const categories = await prisma.place.groupBy({
      by: ['category'],
      where: { cityId: { in: icelandCityIds } },
      _count: { id: true },
    });

    categories.forEach(cat => {
      console.log(`  ${cat.category}: ${cat._count.id} 个`);
    });
    console.log('');

    // 6. 检查地理位置数据 (跳过，因为location是Unsupported类型)

    console.log('='.repeat(60));
    console.log('✅ 检查完成！');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ 错误:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
