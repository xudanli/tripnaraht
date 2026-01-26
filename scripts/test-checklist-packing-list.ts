#!/usr/bin/env ts-node

/**
 * 准备清单与打包清单 API 测试脚本
 * 
 * 测试接口：
 * 1. GET /readiness/personalized-checklist - 获取个性化准备清单
 * 2. GET /readiness/trip/:tripId/checklist/status - 获取检查清单勾选状态
 * 3. PUT /readiness/trip/:tripId/checklist/status - 更新检查清单勾选状态
 * 4. POST /readiness/trip/:tripId/packing-list/generate - 生成打包清单
 * 5. GET /readiness/trip/:tripId/packing-list - 获取打包清单
 * 6. PUT /readiness/trip/:tripId/packing-list/items/:itemId - 更新打包清单项状态
 */

import axios, { AxiosInstance } from 'axios';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const TRIP_ID = process.env.TRIP_ID;

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function logSuccess(message: string) {
  console.log(`${colors.green}✅ ${message}${colors.reset}`);
}

function logError(message: string) {
  console.log(`${colors.red}❌ ${message}${colors.reset}`);
}

function logInfo(message: string) {
  console.log(`${colors.blue}ℹ️  ${message}${colors.reset}`);
}

function logWarning(message: string) {
  console.log(`${colors.yellow}⚠️  ${message}${colors.reset}`);
}

function logSection(title: string) {
  console.log(`\n${colors.cyan}${'='.repeat(50)}${colors.reset}`);
  console.log(`${colors.cyan}${title}${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(50)}${colors.reset}\n`);
}

// 创建 axios 实例
const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 获取行程ID（如果没有提供）
async function getTripId(): Promise<string> {
  if (TRIP_ID) {
    return TRIP_ID;
  }

  try {
    logInfo('未提供 TRIP_ID，尝试从数据库获取最近的行程...');
    const response = await api.get('/api/trips');
    
    if (response.data.success && response.data.data && response.data.data.length > 0) {
      const tripId = response.data.data[0].id;
      logInfo(`使用行程ID: ${tripId}`);
      return tripId;
    }
    
    throw new Error('未找到任何行程');
  } catch (error: any) {
    logError(`无法获取行程ID: ${error.message}`);
    throw error;
  }
}

// 测试 1: 获取个性化准备清单
async function testGetPersonalizedChecklist(tripId: string) {
  logSection('测试 1: 获取个性化准备清单');
  
  try {
    const response = await api.get('/api/readiness/personalized-checklist', {
      params: {
        tripId,
        lang: 'zh',
      },
    });

    if (response.data && response.data.success) {
      const data = response.data.data;
      logSuccess('获取个性化准备清单成功');
      console.log(`  行程ID: ${data.tripId}`);
      console.log(`  阻塞项: ${data.summary.totalBlockers}`);
      console.log(`  必须项: ${data.summary.totalMust}`);
      console.log(`  建议项: ${data.summary.totalShould}`);
      console.log(`  可选项: ${data.summary.totalOptional}`);
      
      if (data.checklist.blocker.length > 0) {
        console.log(`\n  阻塞项示例:`);
        console.log(`    - ${data.checklist.blocker[0].message}`);
      }
      if (data.checklist.must.length > 0) {
        console.log(`\n  必须项示例:`);
        console.log(`    - ${data.checklist.must[0].message}`);
      }
      
      return data;
    } else {
      logError('获取个性化准备清单失败');
      console.log(`  错误: ${JSON.stringify(response.data.error)}`);
      return null;
    }
  } catch (error: any) {
    logError(`获取个性化准备清单失败: ${error.message}`);
    if (error.response) {
      console.log(`  状态码: ${error.response.status}`);
      console.log(`  响应: ${JSON.stringify(error.response.data)}`);
    }
    return null;
  }
}

// 测试 2: 获取检查清单勾选状态
async function testGetChecklistStatus(tripId: string) {
  logSection('测试 2: 获取检查清单勾选状态');
  
  try {
    const response = await api.get(`/readiness/trip/${tripId}/checklist/status`);

    if (response.data.success) {
      const data = response.data.data;
      logSuccess('获取检查清单勾选状态成功');
      console.log(`  已勾选项数: ${data.checkedItems.length}`);
      console.log(`  最后更新: ${data.lastUpdated}`);
      if (data.checkedItems.length > 0) {
        console.log(`  已勾选项: ${data.checkedItems.slice(0, 3).join(', ')}${data.checkedItems.length > 3 ? '...' : ''}`);
      }
      return data;
    } else {
      logError('获取检查清单勾选状态失败');
      console.log(`  错误: ${JSON.stringify(response.data.error)}`);
      return null;
    }
  } catch (error: any) {
    if (error.response?.status === 404) {
      logWarning('检查清单状态不存在（可能还未勾选任何项）');
      return null;
    }
    logError(`获取检查清单勾选状态失败: ${error.message}`);
    if (error.response) {
      console.log(`  状态码: ${error.response.status}`);
      console.log(`  响应: ${JSON.stringify(error.response.data)}`);
    }
    return null;
  }
}

// 测试 3: 更新检查清单勾选状态
async function testUpdateChecklistStatus(tripId: string) {
  logSection('测试 3: 更新检查清单勾选状态');
  
  try {
    const testCheckedItems = ['must-item-1', 'must-item-2'];
    const response = await api.put(`/api/readiness/trip/${tripId}/checklist/status`, {
      checkedItems: testCheckedItems,
    });

    if (response.data && response.data.success) {
      const data = response.data.data;
      logSuccess('更新检查清单勾选状态成功');
      console.log(`  更新项数: ${data.updated}`);
      console.log(`  已勾选项: ${data.checkedItems.join(', ')}`);
      return data;
    } else {
      logError('更新检查清单勾选状态失败');
      console.log(`  错误: ${JSON.stringify(response.data.error)}`);
      return null;
    }
  } catch (error: any) {
    logError(`更新检查清单勾选状态失败: ${error.message}`);
    if (error.response) {
      console.log(`  状态码: ${error.response.status}`);
      console.log(`  响应: ${JSON.stringify(error.response.data)}`);
    }
    return null;
  }
}

// 测试 4: 生成打包清单
async function testGeneratePackingList(tripId: string) {
  logSection('测试 4: 生成打包清单');
  
  try {
    const requestBody = {
      includeOptional: false,
      season: 'summer',
      userType: 'first_timer',
      activities: ['hiking'],
      customItems: [
        {
          name: '充电宝',
          category: 'electronics',
          quantity: 1,
          note: '20000mAh',
        },
      ],
    };
    
    const response = await api.post(`/api/readiness/trip/${tripId}/packing-list/generate`, requestBody);

    if (response.data.success) {
      const data = response.data.data;
      logSuccess('生成打包清单成功');
      console.log(`  行程ID: ${data.tripId}`);
      console.log(`  生成时间: ${data.generatedAt}`);
      console.log(`  物品总数: ${data.summary.totalItems}`);
      console.log(`  已勾选: ${data.summary.checkedItems || 0}`);
      
      if (data.summary.byCategory) {
        console.log(`\n  按类别统计:`);
        Object.entries(data.summary.byCategory).forEach(([category, count]) => {
          console.log(`    ${category}: ${count}`);
        });
      }
      
      if (data.items.length > 0) {
        console.log(`\n  物品示例:`);
        data.items.slice(0, 3).forEach((item: any) => {
          console.log(`    - ${item.name} (${item.category}, ${item.quantity}${item.unit || ''}) [${item.priority}]`);
        });
      }
      
      return data;
    } else {
      logError('生成打包清单失败');
      console.log(`  错误: ${JSON.stringify(response.data.error)}`);
      return null;
    }
  } catch (error: any) {
    logError(`生成打包清单失败: ${error.message}`);
    if (error.response) {
      console.log(`  状态码: ${error.response.status}`);
      console.log(`  响应: ${JSON.stringify(error.response.data)}`);
    }
    return null;
  }
}

// 测试 5: 获取打包清单
async function testGetPackingList(tripId: string) {
  logSection('测试 5: 获取打包清单');
  
  try {
    const response = await api.get(`/api/readiness/trip/${tripId}/packing-list`);

    if (response.data.success) {
      const data = response.data.data;
      logSuccess('获取打包清单成功');
      console.log(`  行程ID: ${data.tripId}`);
      console.log(`  物品总数: ${data.summary.totalItems}`);
      console.log(`  已勾选: ${data.summary.checkedItems || 0}`);
      if (data.lastGeneratedAt) {
        console.log(`  最后生成: ${data.lastGeneratedAt}`);
      }
      
      if (data.items.length > 0) {
        console.log(`\n  物品列表:`);
        data.items.slice(0, 5).forEach((item: any) => {
          const checked = item.checked ? '✓' : '○';
          console.log(`    ${checked} ${item.name} (${item.category}, ${item.quantity}${item.unit || ''})`);
        });
        if (data.items.length > 5) {
          console.log(`    ... 还有 ${data.items.length - 5} 项`);
        }
      }
      
      return data;
    } else {
      logError('获取打包清单失败');
      console.log(`  错误: ${JSON.stringify(response.data.error)}`);
      return null;
    }
  } catch (error: any) {
    if (error.response?.status === 404) {
      logWarning('打包清单不存在（需要先调用生成接口）');
      return null;
    }
    logError(`获取打包清单失败: ${error.message}`);
    if (error.response) {
      console.log(`  状态码: ${error.response.status}`);
      console.log(`  响应: ${JSON.stringify(error.response.data)}`);
    }
    return null;
  }
}

// 测试 6: 更新打包清单项状态
async function testUpdatePackingListItem(tripId: string, itemId: string) {
  logSection('测试 6: 更新打包清单项状态');
  
  try {
    const requestBody = {
      checked: true,
      quantity: 2,
      note: '已准备',
    };
    
    const response = await api.put(`/api/readiness/trip/${tripId}/packing-list/items/${itemId}`, requestBody);

    if (response.data && response.data.success) {
      const data = response.data.data;
      logSuccess('更新打包清单项状态成功');
      console.log(`  物品ID: ${data.itemId}`);
      console.log(`  已更新: ${data.updated}`);
      return data;
    } else {
      logError('更新打包清单项状态失败');
      console.log(`  错误: ${JSON.stringify(response.data.error)}`);
      return null;
    }
  } catch (error: any) {
    if (error.response?.status === 404) {
      logWarning('打包清单项不存在');
      return null;
    }
    logError(`更新打包清单项状态失败: ${error.message}`);
    if (error.response) {
      console.log(`  状态码: ${error.response.status}`);
      console.log(`  响应: ${JSON.stringify(error.response.data)}`);
    }
    return null;
  }
}

// 主测试函数
async function main() {
  console.log(`${colors.cyan}
╔══════════════════════════════════════════════════════════╗
║    准备清单与打包清单 API 测试                           ║
╚══════════════════════════════════════════════════════════╝${colors.reset}\n`);

  logInfo(`API Base URL: ${API_BASE_URL}`);
  
  try {
    // 获取行程ID
    const tripId = await getTripId();
    logInfo(`使用行程ID: ${tripId}\n`);

    // 测试准备清单接口
    const checklistData = await testGetPersonalizedChecklist(tripId);
    await testGetChecklistStatus(tripId);
    await testUpdateChecklistStatus(tripId);
    
    // 验证更新后的状态
    await testGetChecklistStatus(tripId);

    // 测试打包清单接口
    const packingListData = await testGeneratePackingList(tripId);
    const packingList = await testGetPackingList(tripId);
    
    // 如果有打包清单项，测试更新
    if (packingList && packingList.items && packingList.items.length > 0) {
      const firstItemId = packingList.items[0].id;
      await testUpdatePackingListItem(tripId, firstItemId);
    }

    // 测试总结
    logSection('测试总结');
    const results = {
      '获取个性化准备清单': checklistData ? '✅' : '❌',
      '生成打包清单': packingListData ? '✅' : '❌',
      '获取打包清单': packingList ? '✅' : '❌',
    };
    
    Object.entries(results).forEach(([test, result]) => {
      console.log(`${result} ${test}`);
    });

    const allPassed = Object.values(results).every(r => r === '✅');
    if (allPassed) {
      console.log(`\n${colors.green}🎉 所有测试通过！${colors.reset}\n`);
    } else {
      console.log(`\n${colors.yellow}⚠️  部分测试失败，请检查错误信息${colors.reset}\n`);
    }

  } catch (error: any) {
    logError(`测试失败: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// 运行测试
if (require.main === module) {
  main().catch((error) => {
    console.error('未捕获的错误:', error);
    process.exit(1);
  });
}

export { main };
