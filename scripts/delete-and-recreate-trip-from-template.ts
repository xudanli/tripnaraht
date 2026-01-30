#!/usr/bin/env tsx
/**
 * 删除旧Trip并重新从模板创建，验证修复效果
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function deleteAndRecreateTrip() {
  try {
    const oldTripId = '48f6a6bb-7817-450d-8d0f-47a73dfdf090';
    const templateId = 36;

    console.log('='.repeat(70));
    console.log('🧪 删除旧Trip并重新创建');
    console.log('='.repeat(70));
    console.log('');

    // 1. 检查旧Trip是否存在
    console.log(`📋 步骤1: 检查旧Trip ${oldTripId}...`);
    const oldTrip = await prisma.trip.findUnique({
      where: { id: oldTripId },
      include: {
        TripDay: {
          include: {
            ItineraryItem: true,
          },
        },
      },
    });

    if (oldTrip) {
      console.log(`✅ 找到旧Trip: ${oldTrip.destination}, ${oldTrip.TripDay.length} 天`);
      
      // 先删除关联的ItineraryItem和TripDay
      console.log(`🗑️  删除关联数据...`);
      for (const day of oldTrip.TripDay) {
        await prisma.itineraryItem.deleteMany({
          where: { tripDayId: day.id },
        });
      }
      await prisma.tripDay.deleteMany({
        where: { tripId: oldTripId },
      });
      
      // 删除TripCollaborator
      await prisma.tripCollaborator.deleteMany({
        where: { tripId: oldTripId },
      });
      
      // 最后删除Trip
      console.log(`🗑️  删除Trip...`);
      await prisma.trip.delete({
        where: { id: oldTripId },
      });
      console.log(`✅ 旧Trip已删除`);
    } else {
      console.log(`ℹ️  旧Trip不存在，跳过删除`);
    }

    console.log('');
    console.log(`📋 步骤2: 检查模板 ${templateId}...`);
    const template = await prisma.routeTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      console.error(`❌ 模板 ${templateId} 不存在`);
      return;
    }

    console.log(`✅ 模板: ${template.nameCN || template.name}`);
    console.log(`   天数: ${template.durationDays}`);
    console.log('');

    console.log('='.repeat(70));
    console.log('✅ 准备完成');
    console.log('');
    console.log('📝 下一步：');
    console.log('   1. 重启服务（确保PostGIS查询修复生效）');
    console.log('   2. 使用API创建新Trip：');
    console.log(`      POST /api/route-directions/templates/${templateId}/create-trip`);
    console.log('   3. 使用脚本验证新Trip：');
    console.log('      npx tsx scripts/check-trip-vs-template.ts <new-trip-id>');
    console.log('='.repeat(70));

  } catch (error: any) {
    console.error(`\n❌ 错误:`, error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

deleteAndRecreateTrip();
