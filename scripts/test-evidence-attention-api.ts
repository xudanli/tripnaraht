// scripts/test-evidence-attention-api.ts
/**
 * 测试证据和关注队列 API 接口
 * 
 * 使用方法：
 * npm run test:evidence-attention
 * 或
 * ts-node --project tsconfig.backend.json scripts/test-evidence-attention-api.ts
 */

import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

// 配置
const BASE_URL = process.env.API_URL || 'http://localhost:3000/api';
const TRIP_ID = process.env.TRIP_ID || ''; // 如果设置了环境变量，使用指定的 tripId
const ACCESS_TOKEN = process.env.ACCESS_TOKEN || ''; // 可选：认证 token

async function testEvidenceAPI(tripId: string, accessToken?: string) {
  console.log('\n=== 测试 GET /trips/:id/evidence ===\n');

  const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};

  try {
    // 测试 1: 获取所有证据
    console.log('1. 获取所有证据（默认参数）');
    const response1 = await axios.get(`${BASE_URL}/trips/${tripId}/evidence`, { headers });
    console.log('✅ 成功');
    console.log(`   总数量: ${response1.data.data.total}`);
    console.log(`   返回数量: ${response1.data.data.items.length}`);
    console.log(`   第一个证据:`, response1.data.data.items[0]?.title || '无');

    // 测试 2: 按天数过滤
    console.log('\n2. 按天数过滤（day=1）');
    const response2 = await axios.get(`${BASE_URL}/trips/${tripId}/evidence?day=1`, { headers });
    console.log('✅ 成功');
    console.log(`   第1天的证据数量: ${response2.data.data.total}`);

    // 测试 3: 按类型过滤
    console.log('\n3. 按类型过滤（type=opening_hours）');
    const response3 = await axios.get(`${BASE_URL}/trips/${tripId}/evidence?type=opening_hours`, { headers });
    console.log('✅ 成功');
    console.log(`   营业时间类型证据数量: ${response3.data.data.total}`);

    // 测试 4: 分页
    console.log('\n4. 分页测试（limit=5, offset=0）');
    const response4 = await axios.get(`${BASE_URL}/trips/${tripId}/evidence?limit=5&offset=0`, { headers });
    console.log('✅ 成功');
    console.log(`   返回数量: ${response4.data.data.items.length}`);
    console.log(`   limit: ${response4.data.data.limit}`);
    console.log(`   offset: ${response4.data.data.offset}`);

    // 测试 5: 组合过滤
    console.log('\n5. 组合过滤（day=1&type=opening_hours）');
    const response5 = await axios.get(`${BASE_URL}/trips/${tripId}/evidence?day=1&type=opening_hours`, { headers });
    console.log('✅ 成功');
    console.log(`   符合条件的证据数量: ${response5.data.data.total}`);

    return true;
  } catch (error: any) {
    if (error.response) {
      console.error('❌ 请求失败');
      console.error(`   状态码: ${error.response.status}`);
      console.error(`   错误信息: ${error.response.data.error?.message || error.response.data.message}`);
    } else {
      console.error('❌ 网络错误:', error.message);
    }
    return false;
  }
}

async function testAttentionQueueAPI(tripId?: string, accessToken?: string) {
  console.log('\n=== 测试 GET /trips/attention-queue ===\n');

  const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};

  try {
    // 测试 1: 全局查询
    console.log('1. 全局查询（所有行程）');
    const response1 = await axios.get(`${BASE_URL}/trips/attention-queue`, { headers });
    console.log('✅ 成功');
    console.log(`   总数量: ${response1.data.data.total}`);
    console.log(`   返回数量: ${response1.data.data.items.length}`);
    if (response1.data.data.items.length > 0) {
      console.log(`   第一个关注项:`, response1.data.data.items[0]?.title || '无');
      console.log(`   严重程度:`, response1.data.data.items[0]?.severity || '无');
    }

    // 测试 2: 按 tripId 过滤
    if (tripId) {
      console.log('\n2. 按 tripId 过滤');
      const response2 = await axios.get(`${BASE_URL}/trips/attention-queue?tripId=${tripId}`, { headers });
      console.log('✅ 成功');
      console.log(`   该行程的关注项数量: ${response2.data.data.total}`);
      if (response2.data.data.items.length > 0) {
        console.log(`   第一个关注项:`, response2.data.data.items[0]?.title || '无');
      }
    }

    // 测试 3: 按严重程度过滤
    console.log('\n3. 按严重程度过滤（severity=high）');
    const response3 = await axios.get(`${BASE_URL}/trips/attention-queue?severity=high`, { headers });
    console.log('✅ 成功');
    console.log(`   高优先级关注项数量: ${response3.data.data.total}`);
    const allHigh = response3.data.data.items.every((item: any) => item.severity === 'high');
    console.log(`   所有项都是 high 优先级: ${allHigh ? '✅' : '❌'}`);

    // 测试 4: 按类型过滤
    console.log('\n4. 按类型过滤（type=safety_risk）');
    const response4 = await axios.get(`${BASE_URL}/trips/attention-queue?type=safety_risk`, { headers });
    console.log('✅ 成功');
    console.log(`   安全风险类型数量: ${response4.data.data.total}`);

    // 测试 5: 分页
    console.log('\n5. 分页测试（limit=5, offset=0）');
    const response5 = await axios.get(`${BASE_URL}/trips/attention-queue?limit=5&offset=0`, { headers });
    console.log('✅ 成功');
    console.log(`   返回数量: ${response5.data.data.items.length}`);
    console.log(`   limit: ${response5.data.data.limit}`);
    console.log(`   offset: ${response5.data.data.offset}`);

    // 测试 6: 组合过滤
    if (tripId) {
      console.log('\n6. 组合过滤（tripId + severity=high）');
      const response6 = await axios.get(`${BASE_URL}/trips/attention-queue?tripId=${tripId}&severity=high`, { headers });
      console.log('✅ 成功');
      console.log(`   符合条件的关注项数量: ${response6.data.data.total}`);
    }

    return true;
  } catch (error: any) {
    if (error.response) {
      console.error('❌ 请求失败');
      console.error(`   状态码: ${error.response.status}`);
      console.error(`   错误信息: ${error.response.data.error?.message || error.response.data.message}`);
    } else {
      console.error('❌ 网络错误:', error.message);
    }
    return false;
  }
}

async function findOrCreateTestTrip() {
  console.log('\n=== 查找或创建测试行程 ===\n');

  // 如果指定了 TRIP_ID，直接使用
  if (TRIP_ID) {
    const trip = await prisma.trip.findUnique({
      where: { id: TRIP_ID },
    });
    if (trip) {
      console.log(`✅ 使用指定的行程 ID: ${TRIP_ID}`);
      return TRIP_ID;
    } else {
      console.log(`⚠️  指定的行程 ID 不存在: ${TRIP_ID}`);
    }
  }

  // 查找最近的行程
  const recentTrip = await prisma.trip.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { id: true, destination: true, startDate: true },
  });

  if (recentTrip) {
    console.log(`✅ 找到最近的行程: ${recentTrip.id}`);
    console.log(`   目的地: ${recentTrip.destination}`);
    console.log(`   开始日期: ${recentTrip.startDate}`);
    return recentTrip.id;
  }

  console.log('⚠️  没有找到现有行程，需要先创建一个测试行程');
  console.log('   可以使用以下命令创建:');
  console.log('   curl -X POST http://localhost:3000/api/trips \\');
  console.log('     -H "Content-Type: application/json" \\');
  console.log('     -d \'{"destination":"JP","startDate":"2024-06-01","endDate":"2024-06-03","totalBudget":20000,"travelers":[{"type":"ADULT","mobilityTag":"CITY_POTATO"}]}\'');
  
  return null;
}

async function main() {
  console.log('========================================');
  console.log('证据与关注队列 API 接口测试');
  console.log('========================================');

  try {
    // 查找或创建测试行程
    const tripId = await findOrCreateTestTrip();

    if (!tripId) {
      console.log('\n❌ 无法继续测试：需要有效的行程 ID');
      console.log('   请设置 TRIP_ID 环境变量或先创建一个行程');
      process.exit(1);
    }

    // 检查是否需要认证
    if (!ACCESS_TOKEN) {
      console.log('\n⚠️  注意: 未设置 ACCESS_TOKEN 环境变量');
      console.log('   如果接口需要认证，请设置 ACCESS_TOKEN 环境变量');
      console.log('   例如: ACCESS_TOKEN=your-token npm run test:evidence-attention\n');
    }

    // 测试证据 API
    const evidenceTestPassed = await testEvidenceAPI(tripId, ACCESS_TOKEN || undefined);

    // 测试关注队列 API
    const attentionTestPassed = await testAttentionQueueAPI(tripId, ACCESS_TOKEN || undefined);

    // 总结
    console.log('\n========================================');
    console.log('测试总结');
    console.log('========================================');
    console.log(`证据 API: ${evidenceTestPassed ? '✅ 通过' : '❌ 失败'}`);
    console.log(`关注队列 API: ${attentionTestPassed ? '✅ 通过' : '❌ 失败'}`);
    
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
  } finally {
    await prisma.$disconnect();
  }
}

// 运行测试
main();

