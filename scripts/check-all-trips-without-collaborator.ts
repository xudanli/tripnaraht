#!/usr/bin/env tsx
/**
 * 检查所有缺少 TripCollaborator 的行程
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function checkAllTripsWithoutCollaborator() {
  console.log('='.repeat(70));
  console.log('🔍 检查所有缺少 TripCollaborator 的行程');
  console.log('='.repeat(70));
  console.log('');

  try {
    // 查找所有没有 TripCollaborator 的行程
    const tripsWithoutCollaborator = await prisma.trip.findMany({
      where: {
        TripCollaborator: {
          none: {},
        },
      },
      select: {
        id: true,
        destination: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        metadata: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    console.log(`📋 找到 ${tripsWithoutCollaborator.length} 个没有 TripCollaborator 的行程`);
    console.log('');

    if (tripsWithoutCollaborator.length > 0) {
      console.log('📋 行程详情:');
      tripsWithoutCollaborator.forEach((trip, index) => {
        const metadata = trip.metadata as any;
        console.log(`  ${index + 1}. Trip ID: ${trip.id}`);
        console.log(`     目的地: ${trip.destination}`);
        console.log(`     状态: ${trip.status || '(空)'}`);
        console.log(`     创建时间: ${trip.createdAt.toISOString()}`);
        console.log(`     更新时间: ${trip.updatedAt.toISOString()}`);
        
        if (metadata) {
          if (metadata.createdFromTemplate) {
            console.log(`     ⚠️  来源模板: ${metadata.createdFromTemplate}`);
          }
          if (metadata.templateName) {
            console.log(`     模板名称: ${metadata.templateName}`);
          }
        }
        
        console.log('');
      });

      // 检查哪些是从模板创建的
      const fromTemplate = tripsWithoutCollaborator.filter(trip => {
        const metadata = trip.metadata as any;
        return metadata?.createdFromTemplate;
      });

      console.log(`⚠️  其中 ${fromTemplate.length} 个是从模板创建的（需要修复）`);
      console.log('');

      if (fromTemplate.length > 0) {
        console.log('📋 从模板创建的行程（需要修复）:');
        fromTemplate.forEach((trip, index) => {
          const metadata = trip.metadata as any;
          console.log(`  ${index + 1}. Trip ID: ${trip.id}`);
          console.log(`     目的地: ${trip.destination}`);
          console.log(`     来源模板: ${metadata.createdFromTemplate}`);
          console.log(`     创建时间: ${trip.createdAt.toISOString()}`);
          console.log('');
        });
      }
    } else {
      console.log('✅ 所有行程都有 TripCollaborator 记录');
    }

    // 检查特定用户的行程
    const userEmail = '2293028143@qq.com';
    const user = await prisma.user.findUnique({
      where: { email: userEmail },
      select: {
        id: true,
        email: true,
      },
    });

    if (user) {
      console.log('');
      console.log('='.repeat(70));
      console.log(`🔍 检查用户 ${userEmail} 的行程`);
      console.log('='.repeat(70));
      console.log('');

      // 查找用户的所有行程（包括没有 TripCollaborator 的）
      const userTrips = await prisma.trip.findMany({
        where: {
          OR: [
            {
              TripCollaborator: {
                some: {
                  userId: user.id,
                },
              },
            },
            {
              // 检查 metadata 中是否有用户信息（如果有的话）
              metadata: {
                path: ['createdFromTemplate'],
                not: null,
              },
            },
          ],
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
              role: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      console.log(`📋 找到 ${userTrips.length} 个可能相关的行程`);
      console.log('');

      const withCollaborator = userTrips.filter(t => t.TripCollaborator.length > 0);
      const withoutCollaborator = userTrips.filter(t => t.TripCollaborator.length === 0);

      console.log(`  ✅ 有 TripCollaborator: ${withCollaborator.length} 个`);
      console.log(`  ⚠️  无 TripCollaborator: ${withoutCollaborator.length} 个`);
      console.log('');

      if (withoutCollaborator.length > 0) {
        console.log('⚠️  缺少 TripCollaborator 的行程:');
        withoutCollaborator.forEach((trip, index) => {
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
      }
    }

  } catch (error: any) {
    console.error('❌ 查询失败:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAllTripsWithoutCollaborator().catch(console.error);
