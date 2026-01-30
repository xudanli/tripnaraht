#!/usr/bin/env tsx
/**
 * 直接检查数据库中的模板POI数据（不依赖API）
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function checkTemplatePois() {
  console.log('='.repeat(70));
  console.log('🔍 直接检查数据库中的模板POI数据');
  console.log('='.repeat(70));
  console.log('');

  try {
    // 1. 获取所有路线模板
    const templates = await prisma.routeTemplate.findMany({
      select: {
        id: true,
        nameCN: true,
        name: true,
        durationDays: true,
        dayPlans: true,
      },
      orderBy: {
        id: 'asc',
      },
    });

    console.log(`📋 找到 ${templates.length} 个路线模板`);
    console.log('');

    // 2. 检查每个模板的POI数据
    let templatesWithPois = 0;
    let totalPois = 0;

    for (const template of templates) {
      const dayPlans = template.dayPlans as any[] | null;
      
      if (!dayPlans || !Array.isArray(dayPlans)) {
        continue;
      }

      let templatePoiCount = 0;
      let hasPois = false;

      for (const plan of dayPlans) {
        if (plan.pois && Array.isArray(plan.pois) && plan.pois.length > 0) {
          hasPois = true;
          templatePoiCount += plan.pois.length;
        }
      }

      if (hasPois) {
        templatesWithPois++;
        totalPois += templatePoiCount;
        
        console.log(`✅ 模板 ${template.id}: ${template.nameCN || template.name}`);
        console.log(`   天数: ${template.durationDays}`);
        console.log(`   POI总数: ${templatePoiCount}`);
        
        // 显示每天的POI
        dayPlans.forEach((plan: any, index: number) => {
          const pois = plan.pois || [];
          if (pois.length > 0) {
            console.log(`   第${plan.day || index + 1}天 (${plan.theme || '无主题'}): ${pois.length} 个POI`);
            pois.forEach((poi: any, poiIndex: number) => {
              console.log(`     ${poiIndex + 1}. ${poi.nameCN || poi.nameEN || 'N/A'} (ID: ${poi.id || 'N/A'}, Required: ${poi.required || false})`);
            });
          }
        });
        console.log('');
      }
    }

    console.log('='.repeat(70));
    console.log('📊 统计信息');
    console.log('='.repeat(70));
    console.log(`总模板数: ${templates.length}`);
    console.log(`包含POI的模板数: ${templatesWithPois}`);
    console.log(`总POI数: ${totalPois}`);
    console.log('');

    // 3. 检查没有POI的模板
    const templatesWithoutPois = templates.filter(template => {
      const dayPlans = template.dayPlans as any[] | null;
      if (!dayPlans || !Array.isArray(dayPlans)) {
        return true;
      }
      return !dayPlans.some((plan: any) => plan.pois && Array.isArray(plan.pois) && plan.pois.length > 0);
    });

    if (templatesWithoutPois.length > 0) {
      console.log(`⚠️  没有POI数据的模板 (${templatesWithoutPois.length} 个):`);
      templatesWithoutPois.forEach(template => {
        console.log(`   - ${template.id}: ${template.nameCN || template.name}`);
      });
      console.log('');
    }

    // 4. 检查POI是否在数据库中存在
    if (totalPois > 0) {
      console.log('='.repeat(70));
      console.log('🔍 检查POI在数据库中的存在性');
      console.log('='.repeat(70));
      console.log('');

      const allPoiIds = new Set<number>();
      const allPoiUuids = new Set<string>();

      for (const template of templates) {
        const dayPlans = template.dayPlans as any[] | null;
        if (!dayPlans || !Array.isArray(dayPlans)) {
          continue;
        }

        for (const plan of dayPlans) {
          const pois = plan.pois || [];
          for (const poi of pois) {
            if (poi.id) {
              allPoiIds.add(poi.id);
            }
            if (poi.uuid) {
              allPoiUuids.add(poi.uuid);
            }
          }
        }
      }

      console.log(`收集到的POI标识符: ${allPoiIds.size} 个ID, ${allPoiUuids.size} 个UUID`);
      console.log('');

      if (allPoiIds.size > 0 || allPoiUuids.size > 0) {
        const places = await prisma.place.findMany({
          where: {
            OR: [
              ...(allPoiIds.size > 0 ? [{ id: { in: Array.from(allPoiIds) } }] : []),
              ...(allPoiUuids.size > 0 ? [{ uuid: { in: Array.from(allPoiUuids) } }] : []),
            ],
          },
          select: {
            id: true,
            uuid: true,
            nameCN: true,
          },
        });

        const foundIds = new Set(places.map(p => p.id));
        const foundUuids = new Set(places.map(p => p.uuid));

        const missingIds = Array.from(allPoiIds).filter(id => !foundIds.has(id));
        const missingUuids = Array.from(allPoiUuids).filter(uuid => !foundUuids.has(uuid));

        console.log(`✅ 在数据库中找到: ${places.length} 个POI`);
        console.log(`❌ 在数据库中缺失: ${missingIds.length} 个ID, ${missingUuids.length} 个UUID`);

        if (missingIds.length > 0) {
          console.log(`   缺失的ID: ${missingIds.join(', ')}`);
        }
        if (missingUuids.length > 0) {
          console.log(`   缺失的UUID: ${missingUuids.slice(0, 10).join(', ')}${missingUuids.length > 10 ? '...' : ''}`);
        }
        console.log('');
      }
    }

  } catch (error: any) {
    console.error('❌ 检查失败:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

checkTemplatePois().catch(console.error);
