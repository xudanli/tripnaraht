#!/usr/bin/env ts-node

/**
 * 测试增强版打包清单接口
 * 
 * 测试内容：
 * 1. 使用模板数据生成打包清单（夏季、过渡季、冬季）
 * 2. 测试不同用户类型
 * 3. 测试不同活动类型
 * 4. 测试打包顺序步骤接口
 * 5. 测试出发前检查清单接口
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
  magenta: '\x1b[35m',
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
  console.log(`\n${colors.cyan}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.cyan}${title}${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}\n`);
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
    const response = await api.get('/api/trips');
    
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

// 测试 1: 使用模板生成夏季打包清单
async function testGenerateSummerPackingList(tripId: string) {
  logSection('测试 1: 生成夏季打包清单（使用模板）');

  try {
    const response = await api.post(`/api/readiness/trip/${tripId}/packing-list/generate`, {
      season: 'summer',
      userType: 'first_timer',
      activities: ['hiking', 'hot_spring'],
      route: 'south_coast',
      customItems: [
        {
          name: '充电宝',
          category: 'electronics',
          quantity: 1,
          note: '20000mAh',
        },
      ],
    });

    if (response.data && response.data.success) {
      const data = response.data.data;
      logSuccess('生成夏季打包清单成功');
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
        console.log(`\n  物品示例（前5项）:`);
        data.items.slice(0, 5).forEach((item: any) => {
          const checked = item.checked ? '✓' : '○';
          console.log(`    ${checked} ${item.name} (${item.category}, ${item.quantity}${item.unit || ''}) [${item.priority}]`);
        });
      }

      return data;
    } else {
      logError('生成打包清单失败');
      console.log(`  错误: ${JSON.stringify(response.data?.error)}`);
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

// 测试 2: 使用模板生成冬季打包清单
async function testGenerateWinterPackingList(tripId: string) {
  logSection('测试 2: 生成冬季打包清单（使用模板）');

  try {
    const response = await api.post(`/api/readiness/trip/${tripId}/packing-list/generate`, {
      season: 'winter',
      userType: 'photographer',
      activities: ['glacier_trekking', 'photography'],
      route: 'full_ring_road',
    });

    if (response.data && response.data.success) {
      const data = response.data.data;
      logSuccess('生成冬季打包清单成功');
      console.log(`  物品总数: ${data.summary.totalItems}`);
      
      // 检查是否包含冬季特有物品
      const winterItems = data.items.filter((item: any) => 
        item.name.includes('冰爪') || 
        item.name.includes('暖宝宝') || 
        item.name.includes('头灯') ||
        item.name.includes('羽绒')
      );
      
      if (winterItems.length > 0) {
        console.log(`\n  冬季特有物品:`);
        winterItems.forEach((item: any) => {
          console.log(`    - ${item.name} (${item.quantity}${item.unit || ''})`);
        });
      }

      return data;
    } else {
      logError('生成打包清单失败');
      return null;
    }
  } catch (error: any) {
    logError(`生成打包清单失败: ${error.message}`);
    return null;
  }
}

// 测试 3: 测试摄影师用户类型
async function testPhotographerPackingList(tripId: string) {
  logSection('测试 3: 摄影师用户类型打包清单');

  try {
    const response = await api.post(`/api/readiness/trip/${tripId}/packing-list/generate`, {
      season: 'summer',
      userType: 'photographer',
      activities: ['photography'],
    });

    if (response.data && response.data.success) {
      const data = response.data.data;
      logSuccess('生成摄影师打包清单成功');
      
      // 检查是否包含摄影装备
      const photoItems = data.items.filter((item: any) => 
        item.category === 'electronics' ||
        item.name.includes('相机') ||
        item.name.includes('三脚架') ||
        item.name.includes('电池') ||
        item.name.includes('存储卡')
      );
      
      if (photoItems.length > 0) {
        console.log(`\n  摄影装备:`);
        photoItems.forEach((item: any) => {
          console.log(`    - ${item.name} (${item.quantity}${item.unit || ''})`);
        });
      } else {
        logWarning('未找到摄影装备，可能需要检查模板数据');
      }

      return data;
    } else {
      logError('生成打包清单失败');
      return null;
    }
  } catch (error: any) {
    logError(`生成打包清单失败: ${error.message}`);
    return null;
  }
}

// 测试 4: 获取打包顺序步骤
async function testGetPackingOrderSteps() {
  logSection('测试 4: 获取打包顺序步骤');

  try {
    const response = await api.get('/api/readiness/packing-order-steps');

    if (response.data && response.data.success) {
      const data = response.data.data;
      logSuccess('获取打包顺序步骤成功');
      
      if (data.description) {
        console.log(`  描述: ${data.description}`);
      }

      // 显示步骤
      const steps = Object.keys(data).filter(key => key.startsWith('step_'));
      console.log(`\n  步骤数: ${steps.length}`);
      steps.forEach((stepKey, index) => {
        const step = data[stepKey];
        if (step && step.name) {
          console.log(`  ${index + 1}. ${step.name}`);
          if (step.why) {
            console.log(`     原因: ${step.why}`);
          }
        }
      });

      return data;
    } else {
      logError('获取打包顺序步骤失败');
      return null;
    }
  } catch (error: any) {
    logError(`获取打包顺序步骤失败: ${error.message}`);
    if (error.response) {
      console.log(`  状态码: ${error.response.status}`);
      console.log(`  响应: ${JSON.stringify(error.response.data)}`);
    }
    return null;
  }
}

// 测试 5: 获取出发前检查清单
async function testGetPreDepartureChecklist() {
  logSection('测试 5: 获取出发前检查清单');

  try {
    const response = await api.get('/api/readiness/pre-departure-checklist');

    if (response.data && response.data.success) {
      const data = response.data.data;
      logSuccess('获取出发前检查清单成功');
      
      if (data.description) {
        console.log(`  描述: ${data.description}`);
      }

      // 显示1天前检查项
      if (data['1_day_before']) {
        console.log(`\n  1天前检查项 (${data['1_day_before'].length} 项):`);
        data['1_day_before'].slice(0, 3).forEach((item: string) => {
          console.log(`    ${item}`);
        });
        if (data['1_day_before'].length > 3) {
          console.log(`    ... 还有 ${data['1_day_before'].length - 3} 项`);
        }
      }

      // 显示3小时前检查项
      if (data['3_hours_before']) {
        console.log(`\n  3小时前检查项 (${data['3_hours_before'].length} 项):`);
        data['3_hours_before'].slice(0, 3).forEach((item: string) => {
          console.log(`    ${item}`);
        });
      }

      // 显示绝对必须物品
      if (data.critical_items_absolute_must_have) {
        console.log(`\n  绝对必须物品 (${data.critical_items_absolute_must_have.length} 项):`);
        data.critical_items_absolute_must_have.slice(0, 5).forEach((item: string) => {
          console.log(`    ${item}`);
        });
      }

      return data;
    } else {
      logError('获取出发前检查清单失败');
      return null;
    }
  } catch (error: any) {
    logError(`获取出发前检查清单失败: ${error.message}`);
    if (error.response) {
      console.log(`  状态码: ${error.response.status}`);
      console.log(`  响应: ${JSON.stringify(error.response.data)}`);
    }
    return null;
  }
}

// 测试 6: 测试原有逻辑（useTemplate: false）
async function testLegacyPackingList(tripId: string) {
  logSection('测试 6: 使用原有逻辑生成打包清单');

  try {
    const response = await api.post(`/api/readiness/trip/${tripId}/packing-list/generate`, {
      useTemplate: false,
      includeOptional: false,
    });

    if (response.data && response.data.success) {
      const data = response.data.data;
      logSuccess('使用原有逻辑生成打包清单成功');
      console.log(`  物品总数: ${data.summary.totalItems}`);
      console.log(`  说明: 基于 Readiness Pack 规则引擎生成`);
      return data;
    } else {
      logError('生成打包清单失败');
      return null;
    }
  } catch (error: any) {
    logError(`生成打包清单失败: ${error.message}`);
    return null;
  }
}

// 主测试函数
async function main() {
  console.log(`${colors.cyan}
╔══════════════════════════════════════════════════════════════╗
║       增强版打包清单接口测试                                  ║
╚══════════════════════════════════════════════════════════════╝${colors.reset}\n`);

  logInfo(`API Base URL: ${API_BASE_URL}`);

  try {
    // 获取行程ID
    const tripId = await getTripId();
    logInfo(`使用行程ID: ${tripId}\n`);

    // 测试模板模式
    await testGenerateSummerPackingList(tripId);
    await testGenerateWinterPackingList(tripId);
    await testPhotographerPackingList(tripId);

    // 测试辅助接口
    await testGetPackingOrderSteps();
    await testGetPreDepartureChecklist();

    // 测试原有逻辑
    await testLegacyPackingList(tripId);

    // 测试总结
    logSection('测试总结');
    logSuccess('所有测试完成！');
    console.log(`\n${colors.magenta}💡 提示:`);
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
