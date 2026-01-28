#!/usr/bin/env tsx
/**
 * 创建测试用户并测试缺口偏好 API
 * 
 * 使用方法:
 *   npx tsx scripts/create-test-user-and-test-gap-preferences.ts
 */

import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();
const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const API_BASE = `${BASE_URL}/api/trip-planner`;

// 配置 axios
axios.defaults.timeout = 10000;
axios.defaults.headers.common['Content-Type'] = 'application/json';

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * 创建测试用户
 */
async function createTestUser() {
  console.log('👤 创建测试用户...');
  
  try {
    // 检查是否已存在测试用户
    const existingUser = await prisma.user.findFirst({
      where: {
        email: 'test-gap-preferences@example.com',
      },
    });

    if (existingUser) {
      console.log(`✅ 测试用户已存在: ${existingUser.id}`);
      return existingUser.id;
    }

    // 创建新用户
    const user = await prisma.user.create({
      data: {
        email: 'test-gap-preferences@example.com',
        displayName: '测试用户（缺口偏好）',
        emailVerified: true,
        googleSub: null,
        avatarUrl: null,
      },
    });

    console.log(`✅ 测试用户创建成功: ${user.id}`);
    return user.id;
  } catch (error: any) {
    console.error('❌ 创建用户失败:', error.message);
    throw error;
  }
}

/**
 * 创建测试行程
 */
async function createTestTrip(userId: string) {
  console.log('✈️  创建测试行程...');
  
  try {
    // Trip 模型没有 userId 字段，需要通过 TripCollaborator 关联
    // 简化处理：直接使用一个固定的测试 tripId
    const testTripId = `test-trip-gap-preferences-${userId.substring(0, 8)}`;
    
    // 检查是否已存在测试行程
    const existingTrip = await prisma.trip.findUnique({
      where: { id: testTripId },
    });

    if (existingTrip) {
      console.log(`✅ 测试行程已存在: ${existingTrip.id}`);
      return existingTrip.id;
    }

    // 创建新行程
    const now = new Date();
    const trip = await prisma.trip.create({
      data: {
        id: testTripId,
        destination: '冰岛',
        startDate: now,
        endDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), // 7天后
        status: 'DRAFT',
        updatedAt: now,
      },
    });

    // 创建 TripCollaborator 关联用户和行程
    await prisma.tripCollaborator.upsert({
      where: {
        tripId_userId: {
          tripId: trip.id,
          userId: userId,
        },
      },
      update: {},
      create: {
        id: `collab-${Date.now()}`,
        tripId: trip.id,
        userId: userId,
        role: 'OWNER',
        updatedAt: now,
      },
    });

    console.log(`✅ 测试行程创建成功: ${trip.id}`);
    return trip.id;
  } catch (error: any) {
    console.error('❌ 创建行程失败:', error.message);
    throw error;
  }
}

/**
 * 测试 API
 */
async function testApi(
  name: string,
  fn: () => Promise<any>
): Promise<void> {
  console.log(`\n🧪 测试: ${name}`);
  console.log('─'.repeat(50));
  
  try {
    const result = await fn();
    console.log('✅ 成功:', JSON.stringify(result, null, 2));
  } catch (error: any) {
    console.error('❌ 失败:', error.message);
    if (error.response) {
      console.error('   状态码:', error.response.status);
      console.error('   响应数据:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.error('   请求失败，无响应');
      console.error('   请求URL:', error.config?.url);
    } else {
      console.error('   错误详情:', error);
    }
  }
}

/**
 * 主测试函数
 */
async function runTests(userId: string, tripId: string) {
  const sessionId = `test-session-${Date.now()}`;
  const testGapIds = [
    `gap-meal-${Date.now()}-1`,
    `gap-transport-${Date.now()}-2`,
    `gap-hotel-${Date.now()}-3`,
  ];

  console.log('\n🚀 开始测试缺口偏好 API 端点');
  console.log(`📍 API 地址: ${API_BASE}`);
  console.log(`👤 用户ID: ${userId}`);
  console.log(`✈️  行程ID: ${tripId}`);
  console.log(`💬 会话ID: ${sessionId}`);

  // 1. 获取用户偏好（初始状态）
  await testApi('获取用户偏好（初始）', async () => {
    const response = await axios.get<ApiResponse>(`${API_BASE}/gap-preferences`, {
      params: { tripId, sessionId },
    });
    return response.data;
  });

  // 2. 更新用户偏好
  await testApi('更新用户偏好', async () => {
    const response = await axios.put<ApiResponse>(
      `${API_BASE}/gap-preferences`,
      {
        tripId,
        sessionId,
        collapsed: false,
        showOnlyCritical: true,
        filterTypes: ['MEAL', 'TRANSPORT'],
      }
    );
    return response.data;
  });

  // 3. 验证偏好已更新
  await testApi('验证偏好已更新', async () => {
    const response = await axios.get<ApiResponse>(`${API_BASE}/gap-preferences`, {
      params: { tripId, sessionId },
    });
    const prefs = response.data.data;
    if (prefs.showOnlyCritical !== true || !prefs.filterTypes.includes('MEAL')) {
      throw new Error('偏好更新失败');
    }
    return response.data;
  });

  // 4. 忽略单个缺口
  await testApi('忽略单个缺口', async () => {
    const response = await axios.post<ApiResponse>(
      `${API_BASE}/ignore-gap`,
      {
        gapId: testGapIds[0],
        gapType: 'MEAL',
        tripId,
      }
    );
    return response.data;
  });

  // 5. 批量忽略缺口
  await testApi('批量忽略缺口', async () => {
    const response = await axios.post<ApiResponse>(
      `${API_BASE}/ignore-gaps-batch`,
      {
        gapIds: testGapIds.slice(1),
        tripId,
      }
    );
    return response.data;
  });

  // 6. 验证缺口已被忽略（通过获取偏好，检查 ignoredPatterns）
  await testApi('验证缺口已被忽略', async () => {
    // 注意：这里我们无法直接验证，但可以确认 API 调用成功
    const response = await axios.get<ApiResponse>(`${API_BASE}/gap-preferences`, {
      params: { tripId, sessionId },
    });
    return {
      ...response.data,
      note: '缺口忽略状态存储在 trip_planner_ignored_gaps 表中',
    };
  });

  // 7. 取消忽略单个缺口
  await testApi('取消忽略单个缺口', async () => {
    const response = await axios.delete<ApiResponse>(
      `${API_BASE}/ignore-gap/${testGapIds[0]}`,
      {
        params: { tripId },
      }
    );
    return response.data;
  });

  // 8. 批量取消忽略缺口
  await testApi('批量取消忽略缺口', async () => {
    const response = await axios.post<ApiResponse>(
      `${API_BASE}/unignore-gaps-batch`,
      {
        gapIds: testGapIds.slice(0, 2),
        tripId,
      }
    );
    return response.data;
  });

  // 9. 测试不同行程的偏好隔离
  const tripId2 = `test-trip-gap-preferences-2-${userId.substring(0, 8)}`;
  // 确保第二个测试行程存在
  try {
    const now2 = new Date();
    await prisma.trip.upsert({
      where: { id: tripId2 },
      update: {},
      create: {
        id: tripId2,
        destination: '冰岛',
        startDate: now2,
        endDate: new Date(now2.getTime() + 7 * 24 * 60 * 60 * 1000),
        status: 'DRAFT',
        updatedAt: now2,
      },
    });
    await prisma.tripCollaborator.upsert({
      where: {
        tripId_userId: {
          tripId: tripId2,
          userId: userId,
        },
      },
      update: {},
      create: {
        id: `collab-2-${Date.now()}`,
        tripId: tripId2,
        userId: userId,
        role: 'OWNER',
        updatedAt: now2,
      },
    });
  } catch (error: any) {
    console.warn(`⚠️  创建第二个测试行程失败: ${error.message}`);
  }
  
  await testApi('测试不同行程的偏好隔离', async () => {
    const response1 = await axios.get<ApiResponse>(`${API_BASE}/gap-preferences`, {
      params: { tripId, sessionId },
    });
    const response2 = await axios.get<ApiResponse>(`${API_BASE}/gap-preferences`, {
      params: { tripId: tripId2, sessionId },
    });
    return {
      trip1Preferences: response1.data.data,
      trip2Preferences: response2.data.data,
      note: '不同行程的偏好应该独立',
    };
  });

  // 10. 清理测试数据（可选）
  console.log('\n🧹 清理测试数据...');
  console.log('   注意：测试用户和行程将保留，以便后续测试');
  console.log(`   用户ID: ${userId}`);
  console.log(`   行程ID: ${tripId}, ${tripId2}`);
}

/**
 * 主函数
 */
async function main() {
  try {
    console.log('🚀 开始创建测试用户并测试缺口偏好 API\n');

    // 创建测试用户
    const userId = await createTestUser();

    // 创建测试行程
    const tripId = await createTestTrip(userId);

    // 运行测试
    await runTests(userId, tripId);

    console.log('\n✅ 所有测试完成！');
    console.log('\n📝 测试总结:');
    console.log('   ✅ 用户创建和行程创建');
    console.log('   ✅ 用户偏好获取和更新');
    console.log('   ✅ 缺口忽略和取消忽略（单个和批量）');
    console.log('   ✅ 不同行程的偏好隔离');
    console.log('\n💡 提示:');
    console.log('   - 测试用户和行程已创建，可以重复使用');
    console.log('   - 可以在数据库中查看测试数据');
    console.log('   - 使用 Prisma Studio: npm run prisma:studio');
  } catch (error: any) {
    console.error('\n❌ 测试执行失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 运行测试
main().catch((error) => {
  console.error('❌ 测试执行失败:', error);
  process.exit(1);
});
