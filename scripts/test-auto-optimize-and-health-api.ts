/**
 * 测试 Auto综合 API 和健康度接口
 * 
 * 使用方法:
 *   npx ts-node scripts/test-auto-optimize-and-health-api.ts
 * 
 * 环境变量:
 *   API_BASE_URL - API 基础 URL (默认: http://localhost:3000)
 *   TRIP_ID - 行程 ID (必需)
 */

import * as https from 'https';
import * as http from 'http';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const TRIP_ID = process.env.TRIP_ID || '';

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * 发送 HTTP 请求
 */
function httpRequest(
  method: string,
  url: string,
  data?: any
): Promise<ApiResponse> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const client = urlObj.protocol === 'https:' ? https : http;
    const req = client.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve(parsed);
        } catch (e) {
          resolve({ success: false, error: { code: 'PARSE_ERROR', message: body } });
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

/**
 * 测试健康度接口
 */
async function testHealthApi(tripId: string) {
  console.log('\n📊 测试健康度接口');
  console.log('='.repeat(60));
  console.log(`GET ${API_BASE_URL}/api/trip-detail/${tripId}/health`);

  try {
    const response = await httpRequest(
      'GET',
      `${API_BASE_URL}/api/trip-detail/${tripId}/health`
    );

    if (response.success && response.data) {
      console.log('✅ 健康度接口调用成功');
      console.log('\n健康度数据:');
      console.log(JSON.stringify(response.data, null, 2));

      // 显示关键信息
      if (response.data.overall) {
        console.log(`\n总体健康度: ${response.data.overall}`);
      }
      if (response.data.dimensions) {
        console.log('\n各维度健康度:');
        Object.entries(response.data.dimensions).forEach(([key, value]: [string, any]) => {
          console.log(`  - ${key}: ${value.status} (分数: ${value.score})`);
          if (value.issues && value.issues.length > 0) {
            console.log(`    问题: ${value.issues.join(', ')}`);
          }
        });
      }
    } else {
      console.log('❌ 健康度接口调用失败');
      console.log('错误:', response.error);
    }
  } catch (error: any) {
    console.log('❌ 健康度接口调用异常');
    console.log('错误:', error.message);
  }
}

/**
 * 测试 Auto综合 API - 预览模式
 */
async function testAutoOptimizePreview(tripId: string) {
  console.log('\n🔍 测试 Auto综合 API (预览模式)');
  console.log('='.repeat(60));
  console.log(`POST ${API_BASE_URL}/api/planning-workbench/auto-optimize`);

  try {
    const response = await httpRequest(
      'POST',
      `${API_BASE_URL}/api/planning-workbench/auto-optimize`,
      {
        tripId,
        preview: true,
        limit: 10,
      }
    );

    if (response.success && response.data) {
      console.log('✅ Auto综合 API (预览模式) 调用成功');
      console.log('\n预览结果:');
      console.log(JSON.stringify(response.data, null, 2));

      // 显示关键信息
      console.log(`\n将应用的建议数量: ${response.data.appliedCount || 0}`);
      if (response.data.suggestions && response.data.suggestions.length > 0) {
        console.log('\n建议列表:');
        response.data.suggestions.forEach((s: any, index: number) => {
          console.log(`  ${index + 1}. [${s.severity}] ${s.title}`);
        });
      }
      if (response.data.impact) {
        console.log('\n预期影响:');
        if (response.data.impact.metrics) {
          console.log('  指标变化:', response.data.impact.metrics);
        }
        if (response.data.impact.risks) {
          console.log('  风险:', response.data.impact.risks);
        }
      }
    } else {
      console.log('❌ Auto综合 API (预览模式) 调用失败');
      console.log('错误:', response.error);
    }
  } catch (error: any) {
    console.log('❌ Auto综合 API (预览模式) 调用异常');
    console.log('错误:', error.message);
  }
}

/**
 * 测试 Auto综合 API - 实际应用模式（可选）
 */
async function testAutoOptimizeApply(tripId: string, shouldApply: boolean = false) {
  if (!shouldApply) {
    console.log('\n⚠️  跳过实际应用模式测试（避免修改数据）');
    console.log('如需测试实际应用，请设置 shouldApply = true');
    return;
  }

  console.log('\n🚀 测试 Auto综合 API (实际应用模式)');
  console.log('='.repeat(60));
  console.log(`POST ${API_BASE_URL}/api/planning-workbench/auto-optimize`);

  try {
    const response = await httpRequest(
      'POST',
      `${API_BASE_URL}/api/planning-workbench/auto-optimize`,
      {
        tripId,
        preview: false,
        limit: 10,
      }
    );

    if (response.success && response.data) {
      console.log('✅ Auto综合 API (实际应用模式) 调用成功');
      console.log('\n应用结果:');
      console.log(JSON.stringify(response.data, null, 2));

      console.log(`\n成功应用的建议数量: ${response.data.appliedCount || 0}`);
      if (response.data.suggestions && response.data.suggestions.length > 0) {
        console.log('\n应用结果详情:');
        response.data.suggestions.forEach((s: any, index: number) => {
          const status = s.applied ? '✅' : '❌';
          console.log(`  ${index + 1}. ${status} [${s.severity}] ${s.title}`);
          if (s.error) {
            console.log(`     错误: ${s.error}`);
          }
        });
      }
    } else {
      console.log('❌ Auto综合 API (实际应用模式) 调用失败');
      console.log('错误:', response.error);
    }
  } catch (error: any) {
    console.log('❌ Auto综合 API (实际应用模式) 调用异常');
    console.log('错误:', error.message);
  }
}

/**
 * 主测试函数
 */
async function main() {
  console.log('🧪 Auto综合 API 和健康度接口测试');
  console.log('='.repeat(60));
  console.log(`API 基础 URL: ${API_BASE_URL}`);
  console.log(`行程 ID: ${TRIP_ID || '(未设置，请设置 TRIP_ID 环境变量)'}`);

  if (!TRIP_ID) {
    console.error('\n❌ 错误: 请设置 TRIP_ID 环境变量');
    console.log('使用方法:');
    console.log('  export TRIP_ID=your-trip-id');
    console.log('  npx ts-node scripts/test-auto-optimize-and-health-api.ts');
    process.exit(1);
  }

  // 1. 测试健康度接口
  await testHealthApi(TRIP_ID);

  // 2. 测试 Auto综合 API - 预览模式
  await testAutoOptimizePreview(TRIP_ID);

  // 3. 测试 Auto综合 API - 实际应用模式（默认跳过）
  await testAutoOptimizeApply(TRIP_ID, false);

  console.log('\n' + '='.repeat(60));
  console.log('✅ 测试完成');
}

// 运行测试
main().catch((error) => {
  console.error('测试执行失败:', error);
  process.exit(1);
});
