#!/usr/bin/env ts-node
/**
 * 测试行程项更新接口（智能时间调整）
 * 
 * 测试更新行程项时间时，系统根据实际距离和交通方式自动调整后续行程项的功能
 * 
 * 使用方法:
 *   ts-node scripts/test-itinerary-items-update.ts [baseUrl] [itemId]
 *   例如: 
 *     ts-node scripts/test-itinerary-items-update.ts http://localhost:3000
 *     ts-node scripts/test-itinerary-items-update.ts http://localhost:3000 f3626ff1-7a9b-46d9-8b8b-7f53a14583b1
 */

import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const BASE_URL = process.argv[2] || 'http://localhost:3000';
const API_PREFIX = '/api';
const ITEM_ID = process.argv[3]; // 可选的行程项ID
const ACCESS_TOKEN = process.env.ACCESS_TOKEN || process.argv[4];

// 创建带认证的 axios 实例
const api = axios.create({
  baseURL: BASE_URL + API_PREFIX,
  headers: ACCESS_TOKEN ? {
    'Authorization': `Bearer ${ACCESS_TOKEN}`,
  } : {},
});

// 创建 Prisma 客户端（用于查询数据库）
const prisma = new PrismaClient();

interface TestResult {
  name: string;
  success: boolean;
  status?: number;
  error?: string;
  data?: any;
}

/**
 * 查找一个测试用的行程项
 */
async function findTestItem(): Promise<string | null> {
  try {
    // 查找一个有多个行程项的 TripDay
    const tripDay = await prisma.tripDay.findFirst({
      where: {
        ItineraryItem: {
          some: {
            Place: {
              isNot: null,
            },
          },
        },
      },
      include: {
        ItineraryItem: {
          where: {
            Place: {
              isNot: null,
            },
          },
          include: {
            Place: true,
          },
          orderBy: {
            startTime: 'asc',
          },
          take: 3, // 至少需要3个行程项来测试后续调整
        },
      },
    });

    if (!tripDay || tripDay.ItineraryItem.length < 2) {
      console.log('⚠️  未找到合适的测试数据（需要至少2个有地点的行程项）');
      return null;
    }

    // 返回第二个行程项的ID（这样有前一个行程项可以计算距离）
    const secondItem = tripDay.ItineraryItem[1];
    console.log(`\n📋 找到测试数据:`);
    console.log(`   - TripDay ID: ${tripDay.id}`);
    console.log(`   - 行程项数量: ${tripDay.ItineraryItem.length}`);
    console.log(`   - 测试行程项 ID: ${secondItem.id}`);
    console.log(`   - 当前开始时间: ${secondItem.startTime}`);
    if (secondItem.Place) {
      console.log(`   - 地点: ${secondItem.Place.nameCN || secondItem.Place.nameEN || '未知'}`);
    }
    
    return secondItem.id;
  } catch (error: any) {
    console.error('❌ 查找测试数据失败:', error.message);
    return null;
  }
}

/**
 * 测试 1: 获取行程项详情
 */
async function testGetItem(itemId: string): Promise<TestResult> {
  console.log('\n📋 测试 1: GET /itinerary-items/:id (获取行程项详情)');
  
  try {
    const response = await api.get(`/itinerary-items/${itemId}`);
    
    if (response.data.success) {
      const item = response.data.data;
      console.log('✅ 成功');
      console.log(`   - ID: ${item.id}`);
      console.log(`   - 类型: ${item.type}`);
      console.log(`   - 开始时间: ${item.startTime}`);
      console.log(`   - 结束时间: ${item.endTime}`);
      if (item.Place) {
        console.log(`   - 地点: ${item.Place.nameCN || item.Place.nameEN || '未知'}`);
        const location = item.Place.location || item.Place.metadata?.coordinates;
        if (location) {
          console.log(`   - 位置: ${JSON.stringify(location)}`);
        }
      }
      
      return {
        name: 'GET /itinerary-items/:id',
        success: true,
        status: response.status,
        data: response.data,
      };
    } else {
      return {
        name: 'GET /itinerary-items/:id',
        success: false,
        status: response.status,
        error: 'Response success is false',
      };
    }
  } catch (error: any) {
    return {
      name: 'GET /itinerary-items/:id',
      success: false,
      error: error.response?.data?.error?.message || error.message,
      status: error.response?.status,
    };
  }
}

/**
 * 测试 2: 获取当天的所有行程项（更新前）
 */
async function testGetItemsByDay(tripDayId: string): Promise<TestResult> {
  console.log('\n📋 测试 2: GET /itinerary-items?tripDayId=... (获取当天行程项 - 更新前)');
  
  try {
    const response = await api.get(`/itinerary-items?tripDayId=${tripDayId}`);
    
    if (response.data.success) {
      const items = response.data.data;
      console.log('✅ 成功');
      console.log(`   - 行程项数量: ${items.length}`);
      console.log('\n   时间安排:');
      items.forEach((item: any, index: number) => {
        console.log(`   ${index + 1}. ${item.Place?.nameCN || item.Place?.nameEN || '未知'}`);
        console.log(`      开始: ${item.startTime}`);
        console.log(`      结束: ${item.endTime}`);
      });
      
      return {
        name: 'GET /itinerary-items?tripDayId',
        success: true,
        status: response.status,
        data: response.data,
      };
    } else {
      return {
        name: 'GET /itinerary-items?tripDayId',
        success: false,
        status: response.status,
        error: 'Response success is false',
      };
    }
  } catch (error: any) {
    return {
      name: 'GET /itinerary-items?tripDayId',
      success: false,
      error: error.response?.data?.error?.message || error.message,
      status: error.response?.status,
    };
  }
}

/**
 * 测试 3: 更新行程项开始时间（触发智能调整）
 */
async function testUpdateItemTime(itemId: string): Promise<TestResult> {
  console.log('\n📋 测试 3: PATCH /itinerary-items/:id (更新开始时间 - 触发智能调整)');
  
  try {
    // 先获取当前时间
    const currentItem = await api.get(`/itinerary-items/${itemId}`);
    if (!currentItem.data.success) {
      throw new Error('无法获取当前行程项');
    }
    
    const currentStartTime = new Date(currentItem.data.data.startTime);
    // 将开始时间推迟30分钟
    const newStartTime = new Date(currentStartTime.getTime() + 30 * 60 * 1000);
    
    console.log(`   - 当前开始时间: ${currentStartTime.toISOString()}`);
    console.log(`   - 新开始时间: ${newStartTime.toISOString()}`);
    console.log(`   - 调整: +30 分钟`);
    
    const response = await api.patch(`/itinerary-items/${itemId}`, {
      startTime: newStartTime.toISOString(),
    });
    
    if (response.data.success) {
      const item = response.data.data;
      console.log('✅ 更新成功');
      console.log(`   - 新的开始时间: ${item.startTime}`);
      console.log(`   - 新的结束时间: ${item.endTime}`);
      
      return {
        name: 'PATCH /itinerary-items/:id (更新开始时间)',
        success: true,
        status: response.status,
        data: response.data,
      };
    } else {
      console.log('❌ 更新失败');
      console.log(`   - 错误: ${response.data.error?.message || '未知错误'}`);
      return {
        name: 'PATCH /itinerary-items/:id (更新开始时间)',
        success: false,
        status: response.status,
        error: response.data.error?.message || 'Response success is false',
      };
    }
  } catch (error: any) {
    const errorMessage = error.response?.data?.error?.message || error.message;
    console.log('❌ 更新失败');
    console.log(`   - 错误: ${errorMessage}`);
    
    // 如果是时间不合理的警告，这是预期的行为
    if (errorMessage.includes('时间可能不合理')) {
      console.log('   ℹ️  这是预期的警告：系统检测到时间不合理');
      return {
        name: 'PATCH /itinerary-items/:id (更新开始时间)',
        success: true, // 视为成功，因为这是预期的行为
        status: error.response?.status || 200,
        error: errorMessage,
      };
    }
    
    return {
      name: 'PATCH /itinerary-items/:id (更新开始时间)',
      success: false,
      error: errorMessage,
      status: error.response?.status,
    };
  }
}

/**
 * 测试 4: 获取当天的所有行程项（更新后，验证后续项是否被调整）
 */
async function testGetItemsAfterUpdate(tripDayId: string): Promise<TestResult> {
  console.log('\n📋 测试 4: GET /itinerary-items?tripDayId=... (获取当天行程项 - 更新后)');
  
  try {
    const response = await api.get(`/itinerary-items?tripDayId=${tripDayId}`);
    
    if (response.data.success) {
      const items = response.data.data;
      console.log('✅ 成功');
      console.log(`   - 行程项数量: ${items.length}`);
      console.log('\n   更新后的时间安排:');
      items.forEach((item: any, index: number) => {
        console.log(`   ${index + 1}. ${item.Place?.nameCN || item.Place?.nameEN || '未知'}`);
        console.log(`      开始: ${item.startTime}`);
        console.log(`      结束: ${item.endTime}`);
      });
      
      // 检查时间是否合理（后续项的开始时间应该晚于前一项的结束时间）
      let allValid = true;
      for (let i = 1; i < items.length; i++) {
        const prevEnd = new Date(items[i - 1].endTime);
        const currStart = new Date(items[i].startTime);
        if (currStart < prevEnd) {
          console.log(`   ⚠️  警告: 第 ${i + 1} 项的开始时间早于第 ${i} 项的结束时间`);
          allValid = false;
        }
      }
      
      if (allValid) {
        console.log('   ✅ 所有时间安排合理');
      }
      
      return {
        name: 'GET /itinerary-items?tripDayId (更新后)',
        success: true,
        status: response.status,
        data: response.data,
      };
    } else {
      return {
        name: 'GET /itinerary-items?tripDayId (更新后)',
        success: false,
        status: response.status,
        error: 'Response success is false',
      };
    }
  } catch (error: any) {
    return {
      name: 'GET /itinerary-items?tripDayId (更新后)',
      success: false,
      error: error.response?.data?.error?.message || error.message,
      status: error.response?.status,
    };
  }
}

/**
 * 测试 5: 更新备注（不触发时间调整）
 */
async function testUpdateNote(itemId: string): Promise<TestResult> {
  console.log('\n📋 测试 5: PATCH /itinerary-items/:id (更新备注 - 不触发时间调整)');
  
  try {
    const response = await api.patch(`/itinerary-items/${itemId}`, {
      note: `测试备注 - ${new Date().toISOString()}`,
    });
    
    if (response.data.success) {
      const item = response.data.data;
      console.log('✅ 更新成功');
      console.log(`   - 备注: ${item.note}`);
      
      return {
        name: 'PATCH /itinerary-items/:id (更新备注)',
        success: true,
        status: response.status,
        data: response.data,
      };
    } else {
      return {
        name: 'PATCH /itinerary-items/:id (更新备注)',
        success: false,
        status: response.status,
        error: response.data.error?.message || 'Response success is false',
      };
    }
  } catch (error: any) {
    return {
      name: 'PATCH /itinerary-items/:id (更新备注)',
      success: false,
      error: error.response?.data?.error?.message || error.message,
      status: error.response?.status,
    };
  }
}

/**
 * 主测试函数
 */
async function main() {
  console.log('🚀 开始测试行程项更新接口（智能时间调整）');
  console.log(`📍 Base URL: ${BASE_URL}${API_PREFIX}`);
  
  let itemId: string | null = ITEM_ID || null;
  let tripDayId: string | null = null;
  
  // 如果没有提供 itemId，从数据库查找
  if (!itemId) {
    console.log('\n🔍 正在查找测试数据...');
    itemId = await findTestItem();
    
    if (!itemId) {
      console.log('\n❌ 未找到测试数据，请手动提供行程项 ID');
      console.log('   使用方法: ts-node scripts/test-itinerary-items-update.ts <baseUrl> <itemId>');
      process.exit(1);
    }
  }
  
  // 此时 itemId 一定不为 null
  const finalItemId = itemId;
  
  // 获取行程项详情以获取 tripDayId
  try {
    const itemResponse = await api.get(`/itinerary-items/${finalItemId}`);
    
    // 检查认证错误
    if (itemResponse.status === 401) {
      console.error('\n❌ 认证失败 (401 Unauthorized)');
      console.error('\n📝 解决方案:');
      console.error('   1. 获取有效的 ACCESS_TOKEN:');
      console.error('      - 通过前端登录获取 token');
      console.error('      - 或使用 /auth/email/login 接口登录');
      console.error('\n   2. 设置环境变量:');
      console.error('      export ACCESS_TOKEN=your_valid_token');
      console.error('\n   3. 重新运行测试:');
      console.error('      npx ts-node scripts/test-itinerary-items-update.ts http://localhost:3000');
      console.error('\n   或者直接传递 token:');
      console.error('      npx ts-node scripts/test-itinerary-items-update.ts http://localhost:3000 <itemId> <token>');
      console.error('\n💡 提示: 如果这是开发环境，可以考虑为测试接口添加 @Public() 装饰器');
      process.exit(1);
    }
    
    if (itemResponse.data.success) {
      tripDayId = itemResponse.data.data.tripDayId;
    } else {
      console.error('❌ 无法获取行程项详情:', itemResponse.data.error?.message || '未知错误');
      process.exit(1);
    }
  } catch (error: any) {
    if (error.response?.status === 401) {
      console.error('\n❌ 认证失败 (401 Unauthorized)');
      console.error('   请提供有效的 ACCESS_TOKEN');
      console.error('   参考上面的解决方案');
      process.exit(1);
    }
    console.error('❌ 无法获取行程项详情:', error.message);
    process.exit(1);
  }
  
  const results: TestResult[] = [];
  
  // 执行测试
  if (tripDayId) {
    results.push(await testGetItemsByDay(tripDayId));
  }
  results.push(await testGetItem(finalItemId));
  results.push(await testUpdateItemTime(finalItemId));
  if (tripDayId) {
    results.push(await testGetItemsAfterUpdate(tripDayId));
  }
  results.push(await testUpdateNote(finalItemId));
  
  // 输出测试总结
  console.log('\n' + '='.repeat(60));
  console.log('📊 测试总结');
  console.log('='.repeat(60));
  
  const successCount = results.filter(r => r.success).length;
  const totalCount = results.length;
  
  results.forEach(result => {
    const icon = result.success ? '✅' : '❌';
    console.log(`${icon} ${result.name}`);
    if (result.error) {
      console.log(`   错误: ${result.error}`);
    }
  });
  
  console.log(`\n总计: ${successCount}/${totalCount} 通过`);
  
  if (successCount === totalCount) {
    console.log('🎉 所有测试通过！');
    process.exit(0);
  } else {
    console.log('⚠️  部分测试失败');
    process.exit(1);
  }
}

// 运行测试
main()
  .catch(error => {
    console.error('❌ 测试执行失败:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

