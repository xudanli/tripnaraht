// scripts/test-itinerary-optimization.ts
/**
 * 测试路线优化 API
 * 
 * 使用方法：
 * ts-node --project tsconfig.backend.json scripts/test-itinerary-optimization.ts
 * 
 * 或者使用 curl：
 * curl -X POST http://localhost:3000/itinerary-optimization/optimize \
 *   -H "Content-Type: application/json" \
 *   -d @test-optimize-request.json
 */

import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

interface TestResult {
  name: string;
  success: boolean;
  error?: string;
  data?: any;
}

/**
 * 从数据库获取一些地点 ID 用于测试
 */
async function getTestPlaceIds(count: number = 5): Promise<number[]> {
  try {
    const places = await prisma.place.findMany({
      take: count,
      where: {
        category: {
          in: ['ATTRACTION', 'RESTAURANT'],
        },
      },
      select: {
        id: true,
        nameCN: true,
        category: true,
      },
      orderBy: {
        id: 'asc',
      },
    });

    if (places.length === 0) {
      console.log('⚠️  数据库中没有找到地点，使用示例 ID');
      return [1, 2, 3, 4, 5]; // 示例 ID
    }

    console.log(`✓ 找到 ${places.length} 个地点用于测试:`);
    places.forEach((p) => {
      console.log(`  - ID: ${p.id}, 名称: ${p.nameCN}, 类别: ${p.category}`);
    });

    return places.map((p) => p.id);
  } catch (error: any) {
    console.error(`❌ 查询数据库失败: ${error.message}`);
    console.log('⚠️  使用示例 ID');
    return [1, 2, 3, 4, 5];
  }
}

/**
 * 测试标准行程优化
 */
async function testStandardOptimization(): Promise<TestResult> {
  const name = '标准行程优化';
  try {
    const placeIds = await getTestPlaceIds(5);

    const request = {
      placeIds,
      config: {
        date: '2024-05-01',
        startTime: '2024-05-01T09:00:00.000Z',
        endTime: '2024-05-01T18:00:00.000Z',
        pacingFactor: 1.0,
        hasChildren: false,
        hasElderly: false,
        lunchWindow: {
          start: '12:00',
          end: '13:30',
        },
      },
    };

    console.log(`\n📤 发送请求: ${name}`);
    console.log(JSON.stringify(request, null, 2));

    const response = await axios.post(
      `${API_BASE_URL}/itinerary-optimization/optimize`,
      request,
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 60000, // 60 秒超时
      }
    );

    console.log(`\n✅ ${name} 成功`);
    console.log(`📊 快乐值: ${response.data.happinessScore}`);
    console.log(`📍 优化后路线包含 ${response.data.nodes?.length || 0} 个地点`);
    console.log(`⏰ 时间安排包含 ${response.data.schedule?.length || 0} 个时间段`);
    console.log(`🗺️  聚类结果: ${response.data.zones?.length || 0} 个 Zone`);

    if (response.data.scoreBreakdown) {
      console.log('\n📈 分数详情:');
      console.log(`  兴趣匹配: ${response.data.scoreBreakdown.interestScore || 0}`);
      console.log(`  距离惩罚: ${response.data.scoreBreakdown.distancePenalty || 0}`);
      console.log(`  疲劳惩罚: ${response.data.scoreBreakdown.tiredPenalty || 0}`);
      console.log(`  聚类奖励: ${response.data.scoreBreakdown.clusteringBonus || 0}`);
    }

    return {
      name,
      success: true,
      data: response.data,
    };
  } catch (error: any) {
    const errorMessage =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message;
    console.error(`\n❌ ${name} 失败: ${errorMessage}`);
    if (error.response?.data) {
      console.error('响应详情:', JSON.stringify(error.response.data, null, 2));
    }
    return {
      name,
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * 测试带老人/小孩的行程优化
 */
async function testWithElderlyAndChildren(): Promise<TestResult> {
  const name = '带老人/小孩的行程优化';
  try {
    const placeIds = await getTestPlaceIds(4);

    const request = {
      placeIds,
      config: {
        date: '2024-05-01',
        startTime: '2024-05-01T09:00:00.000Z',
        endTime: '2024-05-01T18:00:00.000Z',
        pacingFactor: 1.5, // 慢节奏
        hasChildren: true,
        hasElderly: true,
        lunchWindow: {
          start: '12:00',
          end: '13:30',
        },
        dinnerWindow: {
          start: '18:00',
          end: '20:00',
        },
      },
    };

    console.log(`\n📤 发送请求: ${name}`);

    const response = await axios.post(
      `${API_BASE_URL}/itinerary-optimization/optimize`,
      request,
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      }
    );

    console.log(`\n✅ ${name} 成功`);
    console.log(`📊 快乐值: ${response.data.happinessScore}`);

    return {
      name,
      success: true,
      data: response.data,
    };
  } catch (error: any) {
    const errorMessage =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message;
    console.error(`\n❌ ${name} 失败: ${errorMessage}`);
    return {
      name,
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * 测试特种兵模式（快节奏）
 */
async function testFastPaceOptimization(): Promise<TestResult> {
  const name = '特种兵模式（快节奏）';
  try {
    const placeIds = await getTestPlaceIds(8);

    const request = {
      placeIds,
      config: {
        date: '2024-05-01',
        startTime: '2024-05-01T08:00:00.000Z',
        endTime: '2024-05-01T22:00:00.000Z',
        pacingFactor: 0.7, // 快节奏
        lunchWindow: {
          start: '12:00',
          end: '13:00',
        },
      },
    };

    console.log(`\n📤 发送请求: ${name}`);

    const response = await axios.post(
      `${API_BASE_URL}/itinerary-optimization/optimize`,
      request,
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      }
    );

    console.log(`\n✅ ${name} 成功`);
    console.log(`📊 快乐值: ${response.data.happinessScore}`);
    console.log(`📍 优化后路线包含 ${response.data.nodes?.length || 0} 个地点`);

    return {
      name,
      success: true,
      data: response.data,
    };
  } catch (error: any) {
    const errorMessage =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message;
    console.error(`\n❌ ${name} 失败: ${errorMessage}`);
    return {
      name,
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * 测试错误情况：无效的地点 ID
 */
async function testInvalidPlaceIds(): Promise<TestResult> {
  const name = '错误测试：无效的地点 ID';
  try {
    const request = {
      placeIds: [999999, 999998, 999997], // 不存在的 ID
      config: {
        date: '2024-05-01',
        startTime: '2024-05-01T09:00:00.000Z',
        endTime: '2024-05-01T18:00:00.000Z',
      },
    };

    console.log(`\n📤 发送请求: ${name}`);

    await axios.post(
      `${API_BASE_URL}/itinerary-optimization/optimize`,
      request,
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    // 如果成功，说明测试失败（应该返回错误）
    return {
      name,
      success: false,
      error: '应该返回 404 错误，但请求成功了',
    };
  } catch (error: any) {
    if (error.response?.status === 404) {
      console.log(`\n✅ ${name} 成功（正确返回 404 错误）`);
      return {
        name,
        success: true,
        data: { status: 404, message: error.response.data?.message },
      };
    }
    const errorMessage =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message;
    console.error(`\n❌ ${name} 失败: ${errorMessage}`);
    return {
      name,
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('='.repeat(60));
  console.log('路线优化 API 测试');
  console.log('='.repeat(60));
  console.log(`API 地址: ${API_BASE_URL}/itinerary-optimization/optimize`);
  console.log('');

  const results: TestResult[] = [];

  // 测试 1: 标准行程优化
  results.push(await testStandardOptimization());

  // 等待一下，避免请求过快
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // 测试 2: 带老人/小孩的行程优化
  results.push(await testWithElderlyAndChildren());

  // 等待一下
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // 测试 3: 特种兵模式
  results.push(await testFastPaceOptimization());

  // 等待一下
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // 测试 4: 错误情况
  results.push(await testInvalidPlaceIds());

  // 打印总结
  console.log('\n' + '='.repeat(60));
  console.log('测试总结');
  console.log('='.repeat(60));

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;

  results.forEach((result) => {
    const icon = result.success ? '✅' : '❌';
    console.log(`${icon} ${result.name}`);
    if (!result.success && result.error) {
      console.log(`   错误: ${result.error}`);
    }
  });

  console.log('');
  console.log(`总计: ${results.length} 个测试`);
  console.log(`成功: ${successCount} 个`);
  console.log(`失败: ${failCount} 个`);

  // 清理
  await prisma.$disconnect();

  // 退出码
  process.exit(failCount > 0 ? 1 : 0);
}

// 运行
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ 测试过程中发生错误:', error);
    process.exit(1);
  });
}
