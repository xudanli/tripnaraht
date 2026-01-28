#!/usr/bin/env tsx
/**
 * 测试缺口偏好 API 端点
 * 
 * 使用方法:
 *   npx tsx scripts/test-gap-preferences-api.ts
 */

import axios from 'axios';

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const API_BASE = `${BASE_URL}/api/trip-planner`;

// 配置 axios 默认超时
axios.defaults.timeout = 10000; // 10秒超时
axios.defaults.headers.common['Content-Type'] = 'application/json';

// 测试用的用户ID和行程ID（实际使用时应该从认证获取）
const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';
const TEST_TRIP_ID = 'test-trip-001';
const TEST_SESSION_ID = 'test-session-001';

// 测试用的缺口数据
const TEST_GAP_IDS = [
  'gap-meal-001',
  'gap-transport-001',
  'gap-hotel-001',
];

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * 测试 API 调用
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
 * 1. 获取用户偏好
 */
async function testGetPreferences() {
  return testApi('获取用户偏好', async () => {
    const response = await axios.get<ApiResponse>(`${API_BASE}/gap-preferences`, {
      params: {
        tripId: TEST_TRIP_ID,
        sessionId: TEST_SESSION_ID,
      },
      headers: {
        // 注意：实际使用时需要添加认证 token
        // 'Authorization': `Bearer ${token}`,
      },
    });
    return response.data;
  });
}

/**
 * 2. 更新用户偏好
 */
async function testUpdatePreferences() {
  return testApi('更新用户偏好', async () => {
    const response = await axios.put<ApiResponse>(
      `${API_BASE}/gap-preferences`,
      {
        tripId: TEST_TRIP_ID,
        sessionId: TEST_SESSION_ID,
        collapsed: false,
        showOnlyCritical: true,
        filterTypes: ['MEAL', 'TRANSPORT'],
      },
      {
        headers: {
          // 'Authorization': `Bearer ${token}`,
        },
      }
    );
    return response.data;
  });
}

/**
 * 3. 忽略单个缺口
 */
async function testIgnoreGap() {
  return testApi('忽略单个缺口', async () => {
    const response = await axios.post<ApiResponse>(
      `${API_BASE}/ignore-gap`,
      {
        gapId: TEST_GAP_IDS[0],
        gapType: 'MEAL',
        tripId: TEST_TRIP_ID,
      },
      {
        headers: {
          // 'Authorization': `Bearer ${token}`,
        },
      }
    );
    return response.data;
  });
}

/**
 * 4. 批量忽略缺口
 */
async function testIgnoreGapsBatch() {
  return testApi('批量忽略缺口', async () => {
    const response = await axios.post<ApiResponse>(
      `${API_BASE}/ignore-gaps-batch`,
      {
        gapIds: TEST_GAP_IDS,
        tripId: TEST_TRIP_ID,
      },
      {
        headers: {
          // 'Authorization': `Bearer ${token}`,
        },
      }
    );
    return response.data;
  });
}

/**
 * 5. 取消忽略单个缺口
 */
async function testUnignoreGap() {
  return testApi('取消忽略单个缺口', async () => {
    const response = await axios.delete<ApiResponse>(
      `${API_BASE}/ignore-gap/${TEST_GAP_IDS[0]}`,
      {
        params: {
          tripId: TEST_TRIP_ID,
        },
        headers: {
          // 'Authorization': `Bearer ${token}`,
        },
      }
    );
    return response.data;
  });
}

/**
 * 6. 批量取消忽略缺口
 */
async function testUnignoreGapsBatch() {
  return testApi('批量取消忽略缺口', async () => {
    const response = await axios.post<ApiResponse>(
      `${API_BASE}/unignore-gaps-batch`,
      {
        gapIds: TEST_GAP_IDS.slice(0, 2), // 只取消前两个
        tripId: TEST_TRIP_ID,
      },
      {
        headers: {
          // 'Authorization': `Bearer ${token}`,
        },
      }
    );
    return response.data;
  });
}

/**
 * 主函数
 */
async function main() {
  console.log('🚀 开始测试缺口偏好 API 端点');
  console.log(`📍 API 地址: ${API_BASE}`);
  console.log(`👤 测试用户ID: ${TEST_USER_ID}`);
  console.log(`✈️  测试行程ID: ${TEST_TRIP_ID}`);
  console.log(`💬 测试会话ID: ${TEST_SESSION_ID}`);
  
  // 检查服务是否可用
  try {
    // 尝试多个健康检查端点
    try {
      await axios.get(`${BASE_URL}/health`, { timeout: 5000 });
      console.log('✅ 服务连接正常 (/health)');
    } catch {
      try {
        await axios.get(`${BASE_URL}/api`, { timeout: 5000 });
        console.log('✅ 服务连接正常 (/api)');
      } catch {
        // 如果都失败，尝试直接测试 API 端点
        console.log('⚠️  健康检查失败，但继续测试...');
      }
    }
  } catch (error: any) {
    console.warn('⚠️  服务健康检查失败，但继续测试...');
    console.warn(`   错误: ${error.message}`);
  }

  // 执行测试
  await testGetPreferences();
  await testUpdatePreferences();
  await testIgnoreGap();
  await testIgnoreGapsBatch();
  await testUnignoreGap();
  await testUnignoreGapsBatch();
  
  // 再次获取偏好，验证更新
  await testGetPreferences();

  console.log('\n✅ 所有测试完成！');
  console.log('\n📝 注意事项:');
  console.log('   1. 这些测试使用的是匿名用户（anonymous）');
  console.log('   2. 实际使用时需要添加认证 token');
  console.log('   3. 某些操作可能需要真实的用户ID和行程ID');
}

// 运行测试
main().catch((error) => {
  console.error('❌ 测试执行失败:', error);
  process.exit(1);
});
