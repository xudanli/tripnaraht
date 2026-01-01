// scripts/test-evidence-attention-service.ts
/**
 * 直接测试证据和关注队列 Service（不通过 HTTP，无需认证）
 * 
 * 使用方法：
 * npm run test:evidence-attention:service
 * 或
 * ts-node --project tsconfig.backend.json scripts/test-evidence-attention-service.ts
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { TripsService } from '../src/trips/trips.service';
import { PrismaService } from '../src/prisma/prisma.service';

async function testEvidenceService() {
  console.log('\n=== 测试 Evidence Service ===\n');

  const app = await NestFactory.createApplicationContext(AppModule);
  const tripsService = app.get(TripsService);
  const prisma = app.get(PrismaService);

  try {
    // 查找一个测试行程
    const trip = await prisma.trip.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { id: true, destination: true },
    });

    if (!trip) {
      console.log('❌ 没有找到测试行程，请先创建一个行程');
      return false;
    }

    console.log(`使用行程 ID: ${trip.id}`);
    console.log(`目的地: ${trip.destination}\n`);

    // 测试 1: 获取所有证据
    console.log('1. 获取所有证据（默认参数）');
    const result1 = await tripsService.getEvidence(trip.id, {});
    console.log('✅ 成功');
    console.log(`   总数量: ${result1.total}`);
    console.log(`   返回数量: ${result1.items.length}`);
    if (result1.items.length > 0) {
      console.log(`   第一个证据:`, result1.items[0].title);
      console.log(`   类型:`, result1.items[0].type);
      console.log(`   描述:`, result1.items[0].description.substring(0, 50) + '...');
    } else {
      console.log('   ⚠️  没有证据数据');
    }

    // 测试 2: 按天数过滤
    console.log('\n2. 按天数过滤（day=1）');
    const result2 = await tripsService.getEvidence(trip.id, { day: 1 });
    console.log('✅ 成功');
    console.log(`   第1天的证据数量: ${result2.total}`);
    const allDay1 = result2.items.every(item => item.day === 1);
    console.log(`   所有项都是第1天: ${allDay1 ? '✅' : '❌'}`);

    // 测试 3: 按类型过滤
    console.log('\n3. 按类型过滤（type=opening_hours）');
    const result3 = await tripsService.getEvidence(trip.id, { type: 'opening_hours' as any });
    console.log('✅ 成功');
    console.log(`   营业时间类型证据数量: ${result3.total}`);
    const allOpeningHours = result3.items.every(item => item.type === 'opening_hours');
    console.log(`   所有项都是 opening_hours 类型: ${allOpeningHours ? '✅' : '❌'}`);

    // 测试 4: 分页
    console.log('\n4. 分页测试（limit=5, offset=0）');
    const result4 = await tripsService.getEvidence(trip.id, { limit: 5, offset: 0 });
    console.log('✅ 成功');
    console.log(`   返回数量: ${result4.items.length}`);
    console.log(`   limit: ${result4.limit}`);
    console.log(`   offset: ${result4.offset}`);
    console.log(`   总数: ${result4.total}`);

    // 测试 5: 组合过滤
    console.log('\n5. 组合过滤（day=1&limit=3）');
    const result5 = await tripsService.getEvidence(trip.id, { day: 1, limit: 3 });
    console.log('✅ 成功');
    console.log(`   符合条件的证据数量: ${result5.total}`);
    console.log(`   返回数量: ${result5.items.length}`);

    return true;
  } catch (error: any) {
    console.error('❌ 测试失败:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    return false;
  } finally {
    await app.close();
  }
}

async function testAttentionQueueService() {
  console.log('\n=== 测试 Attention Queue Service ===\n');

  const app = await NestFactory.createApplicationContext(AppModule);
  const tripsService = app.get(TripsService);
  const prisma = app.get(PrismaService);

  try {
    // 查找一个测试行程
    const trip = await prisma.trip.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { id: true, destination: true },
    });

    if (!trip) {
      console.log('❌ 没有找到测试行程，请先创建一个行程');
      return false;
    }

    console.log(`使用行程 ID: ${trip.id}`);
    console.log(`目的地: ${trip.destination}\n`);

    // 测试 1: 全局查询
    console.log('1. 全局查询（所有行程）');
    const result1 = await tripsService.getAttentionQueue({});
    console.log('✅ 成功');
    console.log(`   总数量: ${result1.total}`);
    console.log(`   返回数量: ${result1.items.length}`);
    if (result1.items.length > 0) {
      console.log(`   第一个关注项:`, result1.items[0].title);
      console.log(`   类型:`, result1.items[0].type);
      console.log(`   严重程度:`, result1.items[0].severity);
      console.log(`   行程ID:`, result1.items[0].tripId);
    } else {
      console.log('   ⚠️  没有关注项数据');
    }

    // 测试 2: 按 tripId 过滤
    console.log('\n2. 按 tripId 过滤');
    const result2 = await tripsService.getAttentionQueue({ tripId: trip.id });
    console.log('✅ 成功');
    console.log(`   该行程的关注项数量: ${result2.total}`);
    const allMatchTripId = result2.items.every(item => item.tripId === trip.id);
    console.log(`   所有项都匹配 tripId: ${allMatchTripId ? '✅' : '❌'}`);

    // 测试 3: 按严重程度过滤
    console.log('\n3. 按严重程度过滤（severity=high）');
    const result3 = await tripsService.getAttentionQueue({ severity: 'high' as any });
    console.log('✅ 成功');
    console.log(`   高优先级关注项数量: ${result3.total}`);
    const allHigh = result3.items.every(item => item.severity === 'high');
    console.log(`   所有项都是 high 优先级: ${allHigh ? '✅' : '❌'}`);

    // 测试 4: 按类型过滤
    console.log('\n4. 按类型过滤（type=safety_risk）');
    const result4 = await tripsService.getAttentionQueue({ type: 'safety_risk' as any });
    console.log('✅ 成功');
    console.log(`   安全风险类型数量: ${result4.total}`);
    const allSafetyRisk = result4.items.every(item => item.type === 'safety_risk');
    console.log(`   所有项都是 safety_risk 类型: ${allSafetyRisk ? '✅' : '❌'}`);

    // 测试 5: 分页
    console.log('\n5. 分页测试（limit=5, offset=0）');
    const result5 = await tripsService.getAttentionQueue({ limit: 5, offset: 0 });
    console.log('✅ 成功');
    console.log(`   返回数量: ${result5.items.length}`);
    console.log(`   limit: ${result5.limit}`);
    console.log(`   offset: ${result5.offset}`);
    console.log(`   总数: ${result5.total}`);

    // 测试 6: 组合过滤
    console.log('\n6. 组合过滤（tripId + severity=high）');
    const result6 = await tripsService.getAttentionQueue({ tripId: trip.id, severity: 'high' as any });
    console.log('✅ 成功');
    console.log(`   符合条件的关注项数量: ${result6.total}`);
    console.log(`   返回数量: ${result6.items.length}`);

    // 测试 7: 排序检查
    console.log('\n7. 排序检查（按严重程度和时间）');
    if (result1.items.length > 1) {
      const severities = ['critical', 'high', 'medium', 'low'];
      const severityOrder: Record<string, number> = {
        critical: 4,
        high: 3,
        medium: 2,
        low: 1,
      };
      
      let sorted = true;
      for (let i = 0; i < result1.items.length - 1; i++) {
        const current = result1.items[i];
        const next = result1.items[i + 1];
        const currentOrder = severityOrder[current.severity];
        const nextOrder = severityOrder[next.severity];
        
        if (currentOrder < nextOrder) {
          sorted = false;
          break;
        }
        if (currentOrder === nextOrder) {
          const currentTime = new Date(current.createdAt).getTime();
          const nextTime = new Date(next.createdAt).getTime();
          if (currentTime < nextTime) {
            sorted = false;
            break;
          }
        }
      }
      console.log(`   排序正确: ${sorted ? '✅' : '❌'}`);
    }

    return true;
  } catch (error: any) {
    console.error('❌ 测试失败:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    return false;
  } finally {
    await app.close();
  }
}

async function main() {
  console.log('========================================');
  console.log('证据与关注队列 Service 直接测试');
  console.log('========================================');
  console.log('（直接调用 Service，无需 HTTP 认证）\n');

  try {
    // 测试证据 Service
    const evidenceTestPassed = await testEvidenceService();

    // 测试关注队列 Service
    const attentionTestPassed = await testAttentionQueueService();

    // 总结
    console.log('\n========================================');
    console.log('测试总结');
    console.log('========================================');
    console.log(`证据 Service: ${evidenceTestPassed ? '✅ 通过' : '❌ 失败'}`);
    console.log(`关注队列 Service: ${attentionTestPassed ? '✅ 通过' : '❌ 失败'}`);
    
    if (evidenceTestPassed && attentionTestPassed) {
      console.log('\n🎉 所有测试通过！');
      process.exit(0);
    } else {
      console.log('\n⚠️  部分测试失败，请检查上述错误信息');
      process.exit(1);
    }
  } catch (error: any) {
    console.error('\n❌ 测试执行出错:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// 运行测试
main();

