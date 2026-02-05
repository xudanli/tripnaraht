// scripts/test-constraint-dsl-apis.ts
/**
 * 测试约束DSL和冲突检测API
 * 
 * 使用方法:
 *   npm run ts-node scripts/test-constraint-dsl-apis.ts
 *   或
 *   npx ts-node scripts/test-constraint-dsl-apis.ts
 */

import axios from 'axios';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const API_BASE = `${BASE_URL}/decision`;

interface TestResult {
  name: string;
  success: boolean;
  statusCode?: number;
  response?: any;
  error?: string;
}

const results: TestResult[] = [];

async function testAPI(name: string, endpoint: string, data: any): Promise<void> {
  console.log(`\n==========================================`);
  console.log(`测试: ${name}`);
  console.log(`Endpoint: POST ${endpoint}`);
  console.log(`==========================================\n`);

  try {
    const response = await axios.post(`${API_BASE}${endpoint}`, data, {
      headers: {
        'Content-Type': 'application/json',
      },
      validateStatus: () => true, // 不抛出错误，让我们自己处理
    });

    if (response.status === 200 && response.data.success) {
      console.log(`✓ 成功 (HTTP ${response.status})`);
      console.log('响应:', JSON.stringify(response.data, null, 2));
      results.push({
        name,
        success: true,
        statusCode: response.status,
        response: response.data,
      });
    } else {
      console.log(`✗ 失败 (HTTP ${response.status})`);
      console.log('响应:', JSON.stringify(response.data, null, 2));
      results.push({
        name,
        success: false,
        statusCode: response.status,
        response: response.data,
        error: response.data.error?.message || 'Unknown error',
      });
    }
  } catch (error: any) {
    console.log(`✗ 错误: ${error.message}`);
    results.push({
      name,
      success: false,
      error: error.message,
    });
  }

  console.log('\n----------------------------------------\n');
}

async function main() {
  console.log('==========================================');
  console.log('测试约束DSL和冲突检测API');
  console.log('==========================================');
  console.log(`API Base URL: ${API_BASE}\n`);

  // 测试1: 检测预算与住宿品质冲突
  await testAPI(
    '检测预算与住宿品质冲突',
    '/detect-conflicts',
    {
      constraints: {
        hard_constraints: {
          budget: {
            max: 12000,
            currency: 'USD',
            flexible: false,
          },
        },
        soft_constraints: {
          comfort_level: {
            hotel_quality: 'high',
            weight: 0.9,
          },
        },
      },
    }
  );

  // 测试2: 检测节奏与体力限制冲突
  await testAPI(
    '检测节奏与体力限制冲突',
    '/detect-conflicts',
    {
      constraints: {
        soft_constraints: {
          pace: {
            preference: 'intense',
            weight: 0.8,
          },
        },
        hard_constraints: {
          physical_limitations: {
            daily_activity_hours_max: 6,
          },
        },
      },
    }
  );

  // 测试3: 检测交通方式与时间窗口冲突
  await testAPI(
    '检测交通方式与时间窗口冲突',
    '/detect-conflicts',
    {
      constraints: {
        hard_constraints: {
          travel_mode: {
            no_early_morning: true,
            no_late_night: true,
          },
        },
      },
      plan: {
        days: [
          {
            day: 1,
            date: '2026-06-10',
            timeSlots: [
              {
                id: 'slot1',
                time: '06:00',
                title: '早起活动',
                type: 'sightseeing',
              },
              {
                id: 'slot2',
                time: '23:00',
                title: '夜车活动',
                type: 'sightseeing',
              },
            ],
          },
        ],
      },
    }
  );

  // 测试4: 检查约束并获取不可行性解释
  await testAPI(
    '检查约束并获取不可行性解释',
    '/check-constraints-with-explanation',
    {
      state: {
        context: {
          destination: 'IS',
          startDate: '2026-06-10',
          durationDays: 7,
          preferences: {
            pace: 'moderate',
          },
          budget: {
            amount: 10000,
            currency: 'USD',
          },
        },
        candidatesByDate: {},
        signals: {},
      },
      plan: {
        version: '1.0.0',
        createdAt: '2026-02-02T10:00:00Z',
        days: [
          {
            day: 1,
            date: '2026-06-10',
            timeSlots: [],
          },
        ],
        metrics: {
          estTotalCost: 15000,
        },
      },
    }
  );

  // 测试5: 生成多个方案（简化版）
  console.log('\n==========================================');
  console.log('测试5: 生成多个方案');
  console.log('==========================================');
  console.log('注意: 此测试需要完整的世界状态，可能会失败\n');

  await testAPI(
    '生成多个方案',
    '/generate-multiple-plans',
    {
      state: {
        context: {
          destination: 'IS',
          startDate: '2026-06-10',
          durationDays: 7,
          preferences: {
            pace: 'moderate',
            intents: {
              nature: 0.8,
            },
          },
          budget: {
            amount: 12000,
            currency: 'USD',
          },
        },
        candidatesByDate: {},
        signals: {},
        policies: {
          constraintDSL: {
            hard_constraints: {
              budget: {
                max: 12000,
                currency: 'USD',
                flexible: false,
              },
            },
            soft_constraints: {
              pace: {
                preference: 'moderate',
                weight: 0.8,
              },
            },
          },
        },
      },
      constraints: {
        hard_constraints: {
          budget: {
            max: 12000,
            currency: 'USD',
            flexible: false,
          },
        },
        soft_constraints: {
          pace: {
            preference: 'moderate',
            weight: 0.8,
          },
        },
      },
    }
  );

  // 输出测试总结
  console.log('\n==========================================');
  console.log('测试总结');
  console.log('==========================================\n');

  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  console.log(`总计: ${results.length} 个测试`);
  console.log(`成功: ${successCount}`);
  console.log(`失败: ${failCount}\n`);

  if (failCount > 0) {
    console.log('失败的测试:');
    results
      .filter(r => !r.success)
      .forEach(r => {
        console.log(`  - ${r.name}: ${r.error || 'Unknown error'}`);
      });
  }

  console.log('\n==========================================\n');
}

main().catch(error => {
  console.error('测试执行失败:', error);
  process.exit(1);
});
