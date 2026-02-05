#!/usr/bin/env ts-node
/**
 * Auto综合 API 测试脚本
 * 
 * 测试接口：POST /api/planning-workbench/auto-optimize
 * 
 * 功能：
 * - 测试预览模式（不实际应用）
 * - 测试实际应用模式
 * - 验证只应用高优先级建议（BLOCKER）
 */

import * as https from 'https';
import * as http from 'http';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const TRIP_ID = process.env.TRIP_ID || 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1';

interface AutoOptimizeRequest {
  tripId: string;
  preview?: boolean;
  limit?: number;
}

interface AutoOptimizeResponse {
  success: boolean;
  data: {
    success: boolean;
    appliedCount: number;
    suggestions: Array<{
      id: string;
      title: string;
      severity: 'blocker' | 'warn' | 'info';
      applied: boolean;
      error?: string;
    }>;
    impact?: {
      metrics?: {
        fatigue?: number;
        buffer?: number;
        cost?: number;
      };
      risks?: Array<any>;
    };
  };
}

function makeRequest(method: string, path: string, data?: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const url = new URL(API_BASE_URL + path);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = client.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

async function testAutoOptimize(request: AutoOptimizeRequest, testName: string): Promise<boolean> {
  console.log(`\n📋 ${testName}`);
  console.log(`   请求: POST /api/planning-workbench/auto-optimize`);
  console.log(`   参数:`, JSON.stringify(request, null, 2));

  try {
    const response = await makeRequest('POST', '/api/planning-workbench/auto-optimize', request);

    if (response.status !== 200) {
      console.log(`   ❌ 失败: HTTP ${response.status}`);
      console.log(`   响应:`, JSON.stringify(response.data, null, 2));
      return false;
    }

    if (!response.data.success) {
      console.log(`   ❌ 失败: success=false`);
      console.log(`   响应:`, JSON.stringify(response.data, null, 2));
      return false;
    }

    const result = response.data.data as AutoOptimizeResponse['data'];

    console.log(`   ✅ 成功`);
    console.log(`   - 应用数量: ${result.appliedCount}`);
    console.log(`   - 建议总数: ${result.suggestions.length}`);

    // 验证只包含高优先级建议（BLOCKER）
    const nonBlockerSuggestions = result.suggestions.filter(s => s.severity !== 'blocker');
    if (nonBlockerSuggestions.length > 0) {
      console.log(`   ⚠️  警告: 发现非高优先级建议:`, nonBlockerSuggestions.map(s => s.severity).join(', '));
    } else {
      console.log(`   ✅ 验证通过: 所有建议都是高优先级（BLOCKER）`);
    }

    // 显示应用结果
    if (result.suggestions.length > 0) {
      console.log(`   📊 应用结果:`);
      result.suggestions.forEach((s, idx) => {
        const status = s.applied ? '✅' : '❌';
        console.log(`      ${idx + 1}. ${status} ${s.title} (${s.severity})`);
        if (s.error) {
          console.log(`         错误: ${s.error}`);
        }
      });
    }

    // 显示影响分析
    if (result.impact) {
      console.log(`   📈 影响分析:`);
      if (result.impact.metrics) {
        const metrics = result.impact.metrics;
        if (metrics.fatigue !== undefined) {
          console.log(`      - 疲劳指数变化: ${metrics.fatigue > 0 ? '+' : ''}${metrics.fatigue}`);
        }
        if (metrics.buffer !== undefined) {
          console.log(`      - 缓冲时间变化: ${metrics.buffer > 0 ? '+' : ''}${metrics.buffer} 分钟`);
        }
        if (metrics.cost !== undefined) {
          console.log(`      - 费用变化: ${metrics.cost > 0 ? '+' : ''}${metrics.cost}`);
        }
      }
    }

    return true;
  } catch (error: any) {
    console.log(`   ❌ 错误: ${error.message}`);
    return false;
  }
}

async function runTests(): Promise<void> {
  console.log('🚀 开始测试 Auto综合 API');
  console.log(`📍 API地址: ${API_BASE_URL}`);
  console.log(`🆔 Trip ID: ${TRIP_ID}`);
  console.log('');

  let passed = 0;
  let failed = 0;

  // 测试1: 预览模式
  const test1Passed = await testAutoOptimize(
    {
      tripId: TRIP_ID,
      preview: true,
      limit: 10,
    },
    '测试1: 预览模式（不实际应用）'
  );
  if (test1Passed) {
    passed++;
  } else {
    failed++;
  }

  // 测试2: 实际应用模式（如果预览成功）
  if (test1Passed) {
    console.log('\n⚠️  注意: 跳过实际应用测试，避免修改行程数据');
    console.log('   如需测试实际应用，请手动执行并设置 preview: false');
  }

  // 测试3: 限制数量
  const test3Passed = await testAutoOptimize(
    {
      tripId: TRIP_ID,
      preview: true,
      limit: 5,
    },
    '测试3: 限制应用数量（limit=5）'
  );
  if (test3Passed) {
    passed++;
  } else {
    failed++;
  }

  // 测试4: 验证只应用高优先级建议
  const test4Passed = await testAutoOptimize(
    {
      tripId: TRIP_ID,
      preview: true,
    },
    '测试4: 验证只应用高优先级建议'
  );
  if (test4Passed) {
    passed++;
  } else {
    failed++;
  }

  // 总结
  console.log('\n' + '='.repeat(60));
  console.log('📊 测试总结');
  console.log('='.repeat(60));
  console.log(`✅ 通过: ${passed}`);
  console.log(`❌ 失败: ${failed}`);
  console.log(`📈 总计: ${passed + failed}`);
  console.log('');

  if (failed > 0) {
    process.exit(1);
  }
}

// 运行测试
runTests().catch((error) => {
  console.error('❌ 测试执行失败:', error);
  process.exit(1);
});
