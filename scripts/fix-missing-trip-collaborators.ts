#!/usr/bin/env tsx
/**
 * 修复缺少 TripCollaborator 记录的行程
 * 为从模板创建的行程添加 TripCollaborator 记录
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function fixMissingTripCollaborators() {
  const userEmail = '2293028143@qq.com';

  console.log('='.repeat(70));
  console.log(`🔧 修复用户 ${userEmail} 缺少 TripCollaborator 的行程`);
  console.log('='.repeat(70));
  console.log('');

  try {
    // 1. 查找用户
    const user = await prisma.user.findUnique({
      where: { email: userEmail },
      select: {
        id: true,
        email: true,
      },
    });

    if (!user) {
      console.error(`❌ 用户 ${userEmail} 不存在`);
      return;
    }

    console.log(`✅ 找到用户: ${user.email} (ID: ${user.id})`);
    console.log('');

    // 2. 查找从模板创建的行程（通过 metadata）
    const tripsFromTemplate = await prisma.trip.findMany({
      where: {
        metadata: {
          path: ['createdFromTemplate'],
          not: null,
        },
      },
      select: {
        id: true,
        destination: true,
        status: true,
        createdAt: true,
        metadata: true,
        TripCollaborator: {
          where: {
            userId: user.id,
          },
          select: {
            id: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    console.log(`📋 找到 ${tripsFromTemplate.length} 个从模板创建的行程`);
    console.log('');

    // 3. 筛选缺少 TripCollaborator 的行程
    const tripsToFix = tripsFromTemplate.filter(
      trip => trip.TripCollaborator.length === 0
    );

    console.log(`⚠️  其中 ${tripsToFix.length} 个行程缺少 TripCollaborator 记录`);
    console.log('');

    if (tripsToFix.length === 0) {
      console.log('✅ 所有行程都已有关联的 TripCollaborator 记录');
      return;
    }

    // 4. 显示需要修复的行程
    console.log('📋 需要修复的行程:');
    tripsToFix.forEach((trip, index) => {
      const metadata = trip.metadata as any;
      console.log(`  ${index + 1}. Trip ID: ${trip.id}`);
      console.log(`     目的地: ${trip.destination}`);
      console.log(`     状态: ${trip.status || '(空)'}`);
      console.log(`     创建时间: ${trip.createdAt.toISOString()}`);
      if (metadata?.createdFromTemplate) {
        console.log(`     来源模板: ${metadata.createdFromTemplate}`);
      }
      console.log('');
    });

    // 5. 确认修复
    console.log('🔧 开始修复...');
    console.log('');

    let fixed = 0;
    let errors = 0;

    for (const trip of tripsToFix) {
      try {
        // 检查是否已存在其他用户的 TripCollaborator
        const existingCollaborators = await prisma.tripCollaborator.findMany({
          where: {
            tripId: trip.id,
          },
        });

        if (existingCollaborators.length > 0) {
          console.log(`  ⚠️  Trip ${trip.id} 已有其他协作者，跳过`);
          continue;
        }

        // 创建 TripCollaborator 记录
        await prisma.tripCollaborator.create({
          data: {
            id: randomUUID(),
            tripId: trip.id,
            userId: user.id,
            role: 'OWNER',
            updatedAt: new Date(),
          },
        });

        console.log(`  ✅ 已为 Trip ${trip.id} 创建 TripCollaborator 记录`);
        fixed++;
      } catch (error: any) {
        console.error(`  ❌ 修复 Trip ${trip.id} 失败: ${error.message}`);
        errors++;
      }
    }

    console.log('');
    console.log('='.repeat(70));
    console.log('📊 修复统计:');
    console.log(`  ✅ 已修复: ${fixed} 个`);
    console.log(`  ❌ 失败: ${errors} 个`);
    console.log('='.repeat(70));
    console.log('');

    // 6. 验证修复结果
    const finalCount = await prisma.tripCollaborator.count({
      where: {
        userId: user.id,
        role: 'OWNER',
      },
    });

    console.log(`✅ 用户现在共有 ${finalCount} 个行程（作为 OWNER）`);

  } catch (error: any) {
    console.error('❌ 修复失败:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

fixMissingTripCollaborators().catch(console.error);
