#!/usr/bin/env ts-node

/**
 * 测试打包清单模板前端接口
 * 
 * 根据 PACKING_TEMPLATE_FRONTEND_API.md 文档测试所有接口：
 * 1. POST /api/readiness/trip/:tripId/packing-list/generate - 生成打包清单
 * 2. GET /api/readiness/trip/:tripId/packing-list - 获取打包清单
 * 3. PUT /api/readiness/trip/:tripId/packing-list/items/:itemId - 更新打包清单项
 * 4. GET /api/readiness/packing-order-steps - 获取打包顺序步骤
 * 5. GET /api/readiness/pre-departure-checklist - 获取出发前检查清单
 */

import axios, { AxiosInstance, AxiosError } from 'axios';

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
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
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
  console.log(`\n${colors.cyan}${'='.repeat(70)}${colors.reset}`);
  console.log(`${colors.cyan}${title}${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(70)}${colors.reset}\n`);
}

function logRequest(method: string, url: string, data?: any) {
  console.log(`${colors.gray}→ ${method} ${url}${colors.reset}`);
  if (data) {
    console.log(`${colors.gray}  Body: ${JSON.stringify(data, null, 2).substring(0, 200)}${colors.reset}`);
  }
}

function logResponse(status: number, data: any) {
  const statusColor = status >= 200 && status < 300 ? colors.green : colors.red;
  console.log(`${statusColor}← Status: ${status}${colors.reset}`);
  if (data && typeof data === 'object') {
    const preview = JSON.stringify(data, null, 2).substring(0, 300);
    console.log(`${colors.gray}  Response: ${preview}${preview.length >= 300 ? '...' : ''}${colors.reset}`);
  }
}

// 创建 axios 实例
const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 获取行程ID
async function getTripId(): Promise<string> {
  if (TRIP_ID) {
    return TRIP_ID;
  }

  try {
    logInfo('未提供 TRIP_ID，尝试从数据库获取最近的行程...');
    const response = await api.get('/api/trips', {
      params: { limit: 1 },
    });
    
    if (response.data && response.data.success && response.data.data && response.data.data.length > 0) {
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

// 测试 1: 生成打包清单（模板模式）
async function testGeneratePackingList(tripId: string) {
  logSection('测试 1: 生成打包清单（模板模式）');

  const testCases = [
    {
      name: '夏季 + 首次旅行者 + 南海岸',
      body: {
        season: 'summer',
        route: 'south_coast',
        userType: 'first_timer',
        activities: ['hiking', 'hot_spring'],
        useTemplate: true,
      },
    },
    {
      name: '冬季 + 摄影师 + 环岛公路',
      body: {
        season: 'winter',
        route: 'full_ring_road',
        userType: 'photographer',
        activities: ['photography', 'glacier_trekking'],
        vehicleType: 'suv_4wd',
        useTemplate: true,
      },
    },
    {
      name: '过渡季 + 冒险者 + 黄金圈',
      body: {
        season: 'transition',
        route: 'golden_circle',
        userType: 'adventurer',
        activities: ['hiking', 'camping'],
        useTemplate: true,
      },
    },
  ];

  let generatedItemId: string | null = null;

  for (const testCase of testCases) {
    try {
      const url = `/api/readiness/trip/${tripId}/packing-list/generate`;
      logRequest('POST', url, testCase.body);

      const response = await api.post(url, testCase.body);
      logResponse(response.status, response.data);

      if (response.data && response.data.success) {
        const data = response.data.data;
        logSuccess(`${testCase.name} - 生成成功`);
        console.log(`  行程ID: ${data.tripId}`);
        console.log(`  生成时间: ${data.generatedAt}`);
        console.log(`  物品总数: ${data.summary.totalItems}`);
        console.log(`  已勾选: ${data.summary.checkedItems || 0}`);

        if (data.summary.byCategory) {
          console.log(`  按类别统计:`);
          Object.entries(data.summary.byCategory).forEach(([category, count]) => {
            console.log(`    ${category}: ${count}`);
          });
        }

        if (data.items.length > 0) {
          console.log(`  物品示例（前3项）:`);
          data.items.slice(0, 3).forEach((item: any) => {
            const checked = item.checked ? '✓' : '○';
            console.log(`    ${checked} ${item.name} (${item.category}, ${item.quantity}${item.unit || ''}) [${item.priority}]`);
          });
          // 保存第一个 itemId 用于后续测试
          if (!generatedItemId && data.items[0]) {
            generatedItemId = data.items[0].id;
          }
        }
      } else {
        logError(`${testCase.name} - 生成失败`);
        console.log(`  错误: ${JSON.stringify(response.data?.error)}`);
      }
    } catch (error: any) {
      logError(`${testCase.name} - 请求失败: ${error.message}`);
      if (error.response) {
        logResponse(error.response.status, error.response.data);
      }
    }
    console.log('');
  }

  return generatedItemId;
}

// 测试 2: 获取打包清单
async function testGetPackingList(tripId: string) {
  logSection('测试 2: 获取打包清单');

  try {
    const url = `/api/readiness/trip/${tripId}/packing-list`;
    logRequest('GET', url);

    const response = await api.get(url);
    logResponse(response.status, response.data);

    if (response.data && response.data.success) {
      const data = response.data.data;
      logSuccess('获取打包清单成功');
      console.log(`  行程ID: ${data.tripId}`);
      console.log(`  物品总数: ${data.summary.totalItems}`);
      console.log(`  已勾选: ${data.summary.checkedItems || 0}`);
      
      if (data.lastGeneratedAt) {
        console.log(`  最后生成时间: ${data.lastGeneratedAt}`);
      }

      if (data.items.length > 0) {
        console.log(`  物品列表（前5项）:`);
        data.items.slice(0, 5).forEach((item: any) => {
          const checked = item.checked ? '✓' : '○';
          console.log(`    ${checked} ${item.name} (${item.category}) [${item.priority}]`);
        });
      } else {
        logWarning('打包清单为空，可能需要先生成');
      }

      return data.items.length > 0 ? data.items[0].id : null;
    } else {
      logError('获取打包清单失败');
      console.log(`  错误: ${JSON.stringify(response.data?.error)}`);
      return null;
    }
  } catch (error: any) {
    logError(`获取打包清单失败: ${error.message}`);
    if (error.response) {
      logResponse(error.response.status, error.response.data);
    }
    return null;
  }
}

// 测试 3: 更新打包清单项
async function testUpdatePackingListItem(tripId: string, itemId: string | null) {
  logSection('测试 3: 更新打包清单项');

  if (!itemId) {
    logWarning('没有可用的 itemId，跳过更新测试');
    return;
  }

  const testCases = [
    {
      name: '勾选物品',
      body: {
        checked: true,
      },
    },
    {
      name: '更新数量和备注',
      body: {
        quantity: 2,
        note: '已购买，准备中',
      },
    },
    {
      name: '取消勾选',
      body: {
        checked: false,
      },
    },
  ];

  for (const testCase of testCases) {
    try {
      const url = `/api/readiness/trip/${tripId}/packing-list/items/${itemId}`;
      logRequest('PUT', url, testCase.body);

      const response = await api.put(url, testCase.body);
      logResponse(response.status, response.data);

      if (response.data && response.data.success) {
        logSuccess(`${testCase.name} - 更新成功`);
        const data = response.data.data;
        if (data.updated !== undefined) {
          console.log(`  更新状态: ${data.updated ? '成功' : '失败'}`);
        }
      } else {
        logError(`${testCase.name} - 更新失败`);
        console.log(`  错误: ${JSON.stringify(response.data?.error)}`);
      }
    } catch (error: any) {
      logError(`${testCase.name} - 请求失败: ${error.message}`);
      if (error.response) {
        logResponse(error.response.status, error.response.data);
      }
    }
    console.log('');
  }
}

// 测试 4: 获取打包顺序步骤
async function testGetPackingOrderSteps() {
  logSection('测试 4: 获取打包顺序步骤');

  try {
    const url = '/api/readiness/packing-order-steps';
    logRequest('GET', url);

    const response = await api.get(url);
    logResponse(response.status, response.data);

    if (response.data && response.data.success) {
      const data = response.data.data;
      logSuccess('获取打包顺序步骤成功');
      
      if (data.description) {
        console.log(`  描述: ${data.description}`);
      }

      // 显示步骤
      if (data.steps && Array.isArray(data.steps)) {
        console.log(`\n  步骤数: ${data.steps.length}`);
        data.steps.slice(0, 5).forEach((step: any, index: number) => {
          console.log(`  ${index + 1}. ${step.title || step.name || `步骤 ${step.step}`}`);
          if (step.items && Array.isArray(step.items)) {
            console.log(`     物品: ${step.items.slice(0, 3).join(', ')}${step.items.length > 3 ? '...' : ''}`);
          }
          if (step.tips) {
            console.log(`     提示: ${step.tips}`);
          }
        });
      } else {
        // 兼容旧格式（step_1, step_2 等）
        const steps = Object.keys(data).filter(key => key.startsWith('step_'));
        console.log(`\n  步骤数: ${steps.length}`);
        steps.slice(0, 5).forEach((stepKey, index) => {
          const step = data[stepKey];
          if (step && step.name) {
            console.log(`  ${index + 1}. ${step.name}`);
            if (step.why) {
              console.log(`     原因: ${step.why}`);
            }
          }
        });
      }

      return true;
    } else {
      logError('获取打包顺序步骤失败');
      console.log(`  错误: ${JSON.stringify(response.data?.error)}`);
      return false;
    }
  } catch (error: any) {
    logError(`获取打包顺序步骤失败: ${error.message}`);
    if (error.response) {
      logResponse(error.response.status, error.response.data);
    }
    return false;
  }
}

// 测试 5: 获取出发前检查清单
async function testGetPreDepartureChecklist() {
  logSection('测试 5: 获取出发前检查清单');

  try {
    const url = '/api/readiness/pre-departure-checklist';
    logRequest('GET', url);

    const response = await api.get(url);
    logResponse(response.status, response.data);

    if (response.data && response.data.success) {
      const data = response.data.data;
      logSuccess('获取出发前检查清单成功');
      
      if (data.description) {
        console.log(`  描述: ${data.description}`);
      }

      // 显示1天前检查项
      if (data['1_day_before']) {
        const items = Array.isArray(data['1_day_before']) ? data['1_day_before'] : [];
        console.log(`\n  1天前检查项 (${items.length} 项):`);
        items.slice(0, 5).forEach((item: string) => {
          console.log(`    - ${item}`);
        });
        if (items.length > 5) {
          console.log(`    ... 还有 ${items.length - 5} 项`);
        }
      }

      // 显示3小时前检查项
      if (data['3_hours_before']) {
        const items = Array.isArray(data['3_hours_before']) ? data['3_hours_before'] : [];
        console.log(`\n  3小时前检查项 (${items.length} 项):`);
        items.slice(0, 5).forEach((item: string) => {
          console.log(`    - ${item}`);
        });
      }

      // 显示绝对必须物品
      if (data.critical_items_absolute_must_have) {
        const items = Array.isArray(data.critical_items_absolute_must_have) 
          ? data.critical_items_absolute_must_have 
          : [];
        console.log(`\n  绝对必须物品 (${items.length} 项):`);
        items.slice(0, 5).forEach((item: string) => {
          console.log(`    - ${item}`);
        });
      }

      return true;
    } else {
      logError('获取出发前检查清单失败');
      console.log(`  错误: ${JSON.stringify(response.data?.error)}`);
      return false;
    }
  } catch (error: any) {
    logError(`获取出发前检查清单失败: ${error.message}`);
    if (error.response) {
      logResponse(error.response.status, error.response.data);
    }
    return false;
  }
}

// 测试 6: 测试原有模式（useTemplate: false）
async function testLegacyMode(tripId: string) {
  logSection('测试 6: 使用原有模式生成打包清单（useTemplate: false）');

  try {
    const url = `/api/readiness/trip/${tripId}/packing-list/generate`;
    const body = {
      useTemplate: false,
      includeOptional: false,
    };
    logRequest('POST', url, body);

    const response = await api.post(url, body);
    logResponse(response.status, response.data);

    if (response.data && response.data.success) {
      const data = response.data.data;
      logSuccess('使用原有模式生成打包清单成功');
      console.log(`  物品总数: ${data.summary.totalItems}`);
      console.log(`  说明: 基于 Readiness Pack 规则引擎生成`);
      return true;
    } else {
      logError('使用原有模式生成打包清单失败');
      console.log(`  错误: ${JSON.stringify(response.data?.error)}`);
      return false;
    }
  } catch (error: any) {
    logError(`使用原有模式生成打包清单失败: ${error.message}`);
    if (error.response) {
      logResponse(error.response.status, error.response.data);
    }
    return false;
  }
}

// 主测试函数
async function main() {
  console.log(`${colors.cyan}
╔══════════════════════════════════════════════════════════════════════╗
║           打包清单模板前端接口测试                                    ║
║           根据 PACKING_TEMPLATE_FRONTEND_API.md 文档                 ║
╚══════════════════════════════════════════════════════════════════════╝${colors.reset}\n`);

  logInfo(`API Base URL: ${API_BASE_URL}`);

  const results = {
    generate: false,
    get: false,
    update: false,
    packingOrder: false,
    preDeparture: false,
    legacy: false,
  };

  try {
    // 获取行程ID
    const tripId = await getTripId();
    logInfo(`使用行程ID: ${tripId}\n`);

    // 测试 1: 生成打包清单（模板模式）
    const itemId = await testGeneratePackingList(tripId);
    results.generate = !!itemId;

    // 测试 2: 获取打包清单
    const fetchedItemId = await testGetPackingList(tripId);
    results.get = !!fetchedItemId;
    const finalItemId = fetchedItemId || itemId;

    // 测试 3: 更新打包清单项
    await testUpdatePackingListItem(tripId, finalItemId);
    results.update = !!finalItemId;

    // 测试 4: 获取打包顺序步骤
    results.packingOrder = await testGetPackingOrderSteps();

    // 测试 5: 获取出发前检查清单
    results.preDeparture = await testGetPreDepartureChecklist();

    // 测试 6: 原有模式
    results.legacy = await testLegacyMode(tripId);

    // 测试总结
    logSection('测试总结');
    console.log('测试结果:');
    console.log(`  ${results.generate ? '✅' : '❌'} 生成打包清单（模板模式）`);
    console.log(`  ${results.get ? '✅' : '❌'} 获取打包清单`);
    console.log(`  ${results.update ? '✅' : '❌'} 更新打包清单项`);
    console.log(`  ${results.packingOrder ? '✅' : '❌'} 获取打包顺序步骤`);
    console.log(`  ${results.preDeparture ? '✅' : '❌'} 获取出发前检查清单`);
    console.log(`  ${results.legacy ? '✅' : '❌'} 原有模式生成打包清单`);

    const successCount = Object.values(results).filter(Boolean).length;
    const totalCount = Object.keys(results).length;
    console.log(`\n成功率: ${successCount}/${totalCount} (${Math.round(successCount / totalCount * 100)}%)`);

    if (successCount === totalCount) {
      logSuccess('所有测试通过！');
    } else {
      logWarning('部分测试失败，请检查上述错误信息');
    }

    console.log(`\n${colors.magenta}💡 提示:`);
    console.log(`  - 所有接口都需要 /api 前缀`);
    console.log(`  - 模板模式会根据季节、用户类型、活动等生成个性化清单`);
    console.log(`  - 原有模式基于 Readiness Pack 规则引擎生成`);
    console.log(`  - 可以通过 useTemplate 参数切换模式${colors.reset}\n`);

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
