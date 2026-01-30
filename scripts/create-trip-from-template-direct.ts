#!/usr/bin/env tsx
/**
 * 直接从数据库创建Trip，验证修复效果
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function createTripDirectly() {
  try {
    const templateId = 36;
    
    console.log('='.repeat(70));
    console.log('🧪 直接从数据库创建Trip（验证修复效果）');
    console.log('='.repeat(70));
    console.log('');

    // 1. 获取模板
    console.log(`📋 步骤1: 获取模板 ${templateId}...`);
    const template = await prisma.routeTemplate.findUnique({
      where: { id: templateId },
      include: {
        routeDirection: true,
      },
    });

    if (!template) {
      console.error(`❌ 模板 ${templateId} 不存在`);
      return;
    }

    console.log(`✅ 模板: ${template.nameCN || template.name}`);
    console.log(`   天数: ${template.durationDays}`);
    console.log('');

    // 2. 解析dayPlans
    const dayPlans = template.dayPlans as any;
    if (!Array.isArray(dayPlans)) {
      console.error(`❌ dayPlans格式错误`);
      return;
    }

    console.log(`📋 步骤2: 解析dayPlans...`);
    let totalPois = 0;
    dayPlans.forEach((plan: any) => {
      const pois = plan.pois || [];
      totalPois += pois.length;
      console.log(`   第${plan.day}天: ${pois.length}个POI, 主题: ${plan.theme || '(无)'}`);
    });
    console.log(`✅ 总POI数: ${totalPois}`);
    console.log('');

    // 3. 模拟createTripFromTemplate的逻辑
    console.log(`📋 步骤3: 创建Trip...`);
    const startDate = new Date('2026-02-01');
    const endDate = new Date('2026-02-05');
    const countryCode = 'IS';

    // 创建Trip
    const trip = await prisma.trip.create({
      data: {
        id: randomUUID(),
        destination: countryCode,
        startDate: startDate,
        endDate: endDate,
        status: 'PLANNING',
        budgetConfig: {
          totalBudget: 50000,
          currency: 'CNY',
        } as any,
        pacingConfig: {
          pacePreference: template.defaultPacePreference || 'BALANCED',
          intensity: 'balanced',
          transport: 'car',
        } as any,
        metadata: {
          createdFromTemplate: templateId,
          templateName: template.nameCN || template.name,
          dayThemes: dayPlans.reduce((acc: any, plan: any) => {
            if (plan.theme) {
              acc[plan.day] = plan.theme;
            }
            return acc;
          }, {}),
        } as any,
        updatedAt: new Date(),
      } as any,
    });

    console.log(`✅ Trip创建成功: ${trip.id}`);
    console.log('');

    // 4. 创建TripDay并保存主题
    console.log(`📋 步骤4: 创建TripDay...`);
    const tripDays = [];
    const dayThemes: Record<number, string> = {};

    for (let i = 0; i < template.durationDays; i++) {
      const dayDate = new Date(startDate);
      dayDate.setDate(dayDate.getDate() + i);
      const dayPlan = dayPlans[i];
      const theme = dayPlan?.theme || '';

      if (theme) {
        dayThemes[i + 1] = theme;
      }

      const tripDay = await prisma.tripDay.create({
        data: {
          id: randomUUID(),
          tripId: trip.id,
          date: dayDate,
        } as any,
      });
      tripDays.push(tripDay);
      console.log(`   第${i + 1}天: ${theme || '(无主题)'}`);
    }

    // 更新Trip的metadata，保存主题
    if (Object.keys(dayThemes).length > 0) {
      const updatedMetadata = {
        ...(trip.metadata as any || {}),
        dayThemes: dayThemes,
      };
      await prisma.trip.update({
        where: { id: trip.id },
        data: { metadata: updatedMetadata as any },
      });
      console.log(`✅ 主题已保存到metadata`);
    }
    console.log('');

    // 5. 查询POI并创建ItineraryItem
    console.log(`📋 步骤5: 查询POI并创建ItineraryItem...`);
    
    // 收集所有POI ID
    const allPoiIds: number[] = [];
    dayPlans.forEach((plan: any) => {
      if (plan.pois && Array.isArray(plan.pois)) {
        plan.pois.forEach((poi: any) => {
          if (poi.id && !allPoiIds.includes(poi.id)) {
            allPoiIds.push(poi.id);
          }
        });
      }
    });

    console.log(`   查询 ${allPoiIds.length} 个POI...`);
    
    // 使用PostGIS查询POI
    const places = await prisma.$queryRaw<Array<{
      id: number;
      uuid: string;
      nameCN: string;
      nameEN: string | null;
      category: string;
      lat: number;
      lng: number;
    }>>`
      SELECT 
        p.id,
        p.uuid,
        p."nameCN",
        p."nameEN",
        p.category,
        ST_Y(p.location::geometry) as lat,
        ST_X(p.location::geometry) as lng
      FROM "Place" p
      INNER JOIN "City" c ON p."cityId" = c.id
      WHERE c."countryCode" = ${countryCode}
        AND p.location IS NOT NULL
        AND p.id = ANY(${allPoiIds}::int[])
    `;

    console.log(`   ✅ 找到 ${places.length} 个POI`);
    console.log('');

    // 6. 创建ItineraryItem
    console.log(`📋 步骤6: 创建ItineraryItem...`);
    const itemsToCreate = [];
    let placesMatched = 0;
    let placesMissing = 0;

    for (let i = 0; i < dayPlans.length; i++) {
      const dayPlan = dayPlans[i];
      const tripDay = tripDays[i];
      const pois = dayPlan.pois || [];

      // 按order排序
      const sortedPois = [...pois].sort((a: any, b: any) => (a.order || 0) - (b.order || 0));

      for (const poi of sortedPois) {
        const place = places.find(p => p.id === poi.id || p.uuid === poi.uuid);
        
        if (!place) {
          placesMissing++;
          console.log(`   ⚠️  第${i + 1}天: POI ${poi.id} 未找到`);
          continue;
        }

        placesMatched++;
        
        // 计算时间（简化：每个POI分配2小时）
        const startTime = new Date(tripDay.date);
        startTime.setHours(9 + itemsToCreate.filter(item => item.tripDayId === tripDay.id).length * 2, 0, 0, 0);
        const endTime = new Date(startTime);
        endTime.setHours(startTime.getHours() + 2);

        let note = `模板${poi.required ? '要求' : '推荐'}的${place.category === 'ATTRACTION' ? '景点' : '餐厅'}: ${place.nameCN}`;
        if (poi.required) {
          note += ' [必游]';
        }

        itemsToCreate.push({
          id: randomUUID(),
          tripDayId: tripDay.id,
          placeId: place.id,
          type: place.category === 'RESTAURANT' ? 'MEAL' : 'ACTIVITY',
          startTime: startTime,
          endTime: endTime,
          note: note,
        });
      }
    }

    if (itemsToCreate.length > 0) {
      await prisma.itineraryItem.createMany({
        data: itemsToCreate as any,
      });
      console.log(`   ✅ 创建了 ${itemsToCreate.length} 个ItineraryItem`);
    }

    console.log('');
    console.log('='.repeat(70));
    console.log('✅ Trip创建完成!');
    console.log('='.repeat(70));
    console.log(`Trip ID: ${trip.id}`);
    console.log(`天数: ${template.durationDays}`);
    console.log(`行程项: ${itemsToCreate.length}`);
    console.log(`匹配的POI: ${placesMatched}`);
    console.log(`缺失的POI: ${placesMissing}`);
    console.log('');
    console.log(`📋 验证命令:`);
    console.log(`   npx tsx scripts/check-trip-vs-template.ts ${trip.id}`);
    console.log('='.repeat(70));

  } catch (error: any) {
    console.error(`\n❌ 错误:`, error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

createTripDirectly();
