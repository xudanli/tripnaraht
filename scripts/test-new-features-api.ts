#!/usr/bin/env tsx
/**
 * 测试新功能 API 接口
 * 
 * 测试内容：
 * 1. 迭代部署工作流 API
 * 2. 模型版本 A/B 测试 API
 * 3. RAG 检索质量评估 API
 * 4. query-document 对收集 API
 * 
 * 使用方法：
 *   tsx scripts/test-new-features-api.ts
 *   tsx scripts/test-new-features-api.ts --base-url=http://localhost:3000
 *   tsx scripts/test-new-features-api.ts --skip-workflow  # 跳过工作流测试（耗时较长）
 */

import axios, { AxiosInstance } from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const API_BASE = `${BASE_URL}/api`;

interface TestResult {
  name: string;
  success: boolean;
  duration: number;
  error?: string;
  data?: any;
}

class APITester {
  private http: AxiosInstance;
  private results: TestResult[] = [];
  private skipWorkflow: boolean;

  constructor(baseUrl: string, skipWorkflow: boolean = false) {
    this.http = axios.create({
      baseURL: baseUrl,
      timeout: 300000, // 5 分钟超时（工作流可能需要较长时间）
      headers: {
        'Content-Type': 'application/json',
      },
    });
    this.skipWorkflow = skipWorkflow;
  }

  async test(name: string, testFn: () => Promise<any>): Promise<void> {
    const startTime = Date.now();
    console.log(`\n🧪 测试: ${name}`);
    
    try {
      const data = await testFn();
      const duration = Date.now() - startTime;
      this.results.push({ name, success: true, duration, data });
      console.log(`✅ 通过 (${duration}ms)`);
      if (data && typeof data === 'object') {
        const preview = JSON.stringify(data, null, 2).substring(0, 300);
        console.log(`   响应: ${preview}${preview.length >= 300 ? '...' : ''}`);
      }
    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      // 详细的错误信息提取
      let errorMsg = '未知错误';
      if (error.code === 'ECONNREFUSED') {
        errorMsg = `连接被拒绝：无法连接到服务器。请确保服务器正在运行在 ${this.http.defaults.baseURL}`;
      } else if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
        errorMsg = `请求超时：服务器在 ${this.http.defaults.timeout}ms 内没有响应`;
      } else if (error.response) {
        // HTTP 错误响应
        errorMsg = `HTTP ${error.response.status}: ${error.response.statusText}`;
        if (error.response.data?.error?.message) {
          errorMsg += ` - ${error.response.data.error.message}`;
        } else if (error.response.data?.message) {
          errorMsg += ` - ${error.response.data.message}`;
        } else if (error.response.data) {
          errorMsg += ` - ${JSON.stringify(error.response.data).substring(0, 200)}`;
        }
      } else if (error.message) {
        errorMsg = error.message;
      } else {
        errorMsg = String(error);
      }
      
      this.results.push({ name, success: false, duration, error: errorMsg });
      console.log(`❌ 失败 (${duration}ms)`);
      console.log(`   错误: ${errorMsg}`);
      
      // 输出更多调试信息
      if (error.response) {
        console.log(`   HTTP 状态: ${error.response.status}`);
        console.log(`   请求 URL: ${error.config?.url || 'N/A'}`);
        if (error.response.data) {
          const errorPreview = JSON.stringify(error.response.data, null, 2).substring(0, 400);
          console.log(`   响应数据: ${errorPreview}${errorPreview.length >= 400 ? '...' : ''}`);
        }
      } else if (error.code) {
        console.log(`   错误代码: ${error.code}`);
        console.log(`   错误堆栈: ${error.stack?.split('\n').slice(0, 3).join('\n')}`);
      }
    }
  }

  async checkServerHealth(): Promise<boolean> {
    try {
      // 尝试访问一个简单的端点来检查服务器是否运行
      await this.http.get('/rag/stats', { timeout: 5000 });
      return true;
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED') {
        console.log('\n⚠️  警告: 无法连接到服务器');
        console.log(`   请确保服务器正在运行在 ${this.http.defaults.baseURL}`);
        console.log(`   可以运行: npm run start:dev`);
        return false;
      }
      // 其他错误（如 404）说明服务器在运行，只是端点不存在
      return true;
    }
  }

  async runAllTests(): Promise<void> {
    console.log('='.repeat(80));
    console.log('新功能 API 接口测试');
    console.log('='.repeat(80));
    console.log(`基础 URL: ${API_BASE}`);
    console.log(`跳过工作流测试: ${this.skipWorkflow ? '是' : '否'}`);

    // 检查服务器健康状态
    console.log('\n🔍 检查服务器连接...');
    const serverHealthy = await this.checkServerHealth();
    if (!serverHealthy) {
      console.log('\n❌ 服务器不可用，终止测试');
      process.exit(1);
    }
    console.log('✅ 服务器连接正常\n');

    // ==================== 后端管理系统接口测试 ====================

    // 1. 迭代部署工作流（如果未跳过）
    if (!this.skipWorkflow) {
      await this.test('执行迭代部署工作流', async () => {
        const response = await this.http.post('/training/workflows/execute', {
          minScore: 0.8,
          minReward: 0,
          batchSize: 10, // 小批次用于测试
          autoDeploy: false,
        });
        return response.data;
      });

      await this.test('获取工作流状态（模拟）', async () => {
        // 注意：实际测试需要先执行工作流获取 workflowId
        // 这里只是测试接口是否存在
        try {
          await this.http.get('/training/workflows/test_workflow_id');
        } catch (error: any) {
          // 404 是预期的（工作流不存在），但说明接口存在
          if (error?.response?.status === 404) {
            return { message: '接口存在，但工作流不存在（预期）' };
          }
          throw error;
        }
      });
    } else {
      console.log('\n⏭️  跳过工作流测试（使用 --skip-workflow 参数）');
    }

    // 2. 模型版本 A/B 测试
    let experimentId: string | null = null;

    await this.test('创建模型版本对比实验', async () => {
      const response = await this.http.post('/training/models/ab-test/create', {
        name: '测试实验 v1.0 vs v1.1',
        description: '测试模型版本对比实验',
        controlVersion: 'v1.0.0',
        treatmentVersion: 'v1.1.0',
        trafficSplit: {
          control: 50,
          treatment: 50,
        },
        successMetrics: ['accuracy', 'user_satisfaction'],
      });
      experimentId = response.data?.data?.experimentId || null;
      return response.data;
    });

    if (experimentId) {
      await this.test('分析模型版本对比结果', async () => {
        const response = await this.http.post('/training/models/ab-test/analyze', {
          experimentId,
          controlVersion: 'v1.0.0',
          treatmentVersion: 'v1.1.0',
        });
        return response.data;
      });

      // 注意：promote 测试可能会失败（如果 A/B 测试未通过），这是正常的
      await this.test('推广模型版本（可能失败）', async () => {
        try {
          const response = await this.http.post('/training/models/ab-test/promote', {
            experimentId,
            treatmentVersion: 'v1.1.0',
          });
          return response.data;
        } catch (error: any) {
          // 如果 A/B 测试未通过，这是预期的错误
          if (error?.response?.data?.error?.message?.includes('未通过 A/B 测试')) {
            return { message: 'A/B 测试未通过，无法推广（预期行为）' };
          }
          throw error;
        }
      });
    }

    // 3. RAG 检索质量评估
    await this.test('评估单次检索质量', async () => {
      const response = await this.http.post('/rag/evaluation/evaluate', {
        query: '冰岛 F-road 需要什么车辆？',
        params: {
          query: '冰岛 F-road 需要什么车辆？',
          collection: 'compliance',
          countryCode: 'IS',
          limit: 10,
          minScore: 0.5,
        },
        groundTruthDocumentIds: ['doc-test-1', 'doc-test-2'], // 测试用的文档 ID
      });
      return response.data;
    });

    await this.test('批量评估检索质量', async () => {
      const response = await this.http.post('/rag/evaluation/evaluate-batch', {
        testCases: [
          {
            query: '冰岛 F-road 需要什么车辆？',
            params: {
              query: '冰岛 F-road 需要什么车辆？',
              collection: 'compliance',
              countryCode: 'IS',
              limit: 10,
            },
            groundTruthDocumentIds: ['doc-test-1'],
          },
        ],
      });
      return response.data;
    });

    // 4. query-document 对收集
    let pairId: string | null = null;

    await this.test('手动收集 query-document 对', async () => {
      const response = await this.http.post('/rag/query-pairs/collect', {
        query: '冰岛 F-road 需要什么车辆？',
        correctDocumentIds: ['doc-test-1', 'doc-test-2'],
        metadata: {
          source: 'MANUAL_ANNOTATION',
          collection: 'compliance',
          countryCode: 'IS',
        },
      });
      pairId = response.data?.data?.pairId || null;
      return response.data;
    });

    await this.test('从用户查询自动收集', async () => {
      const response = await this.http.post('/rag/query-pairs/collect-from-query', {
        query: '冰岛 F-road 需要什么车辆？',
        retrievedResults: [
          { id: 'doc-test-1', score: 0.85 },
          { id: 'doc-test-2', score: 0.72 },
        ],
        userFeedback: {
          clickedDocumentIds: ['doc-test-1'],
          relevantDocumentIds: ['doc-test-1', 'doc-test-2'],
        },
      });
      return response.data;
    });

    await this.test('批量收集 query-document 对', async () => {
      const response = await this.http.post('/rag/query-pairs/collect-batch', {
        pairs: [
          {
            query: '冰岛 F-road 需要什么车辆？',
            correctDocumentIds: ['doc-test-1'],
            metadata: {
              source: 'MANUAL_ANNOTATION',
              collection: 'compliance',
            },
          },
        ],
      });
      return response.data;
    });

    await this.test('获取收集的 query-document 对', async () => {
      const response = await this.http.get('/rag/query-pairs', {
        params: {
          collection: 'compliance',
          limit: 10,
        },
      });
      return response.data;
    });

    await this.test('导出为评估数据集格式', async () => {
      const response = await this.http.post('/rag/query-pairs/export-for-evaluation', {
        pairs: [
          {
            query: '冰岛 F-road 需要什么车辆？',
            correctDocumentIds: ['doc-test-1', 'doc-test-2'],
          },
        ],
      });
      return response.data;
    });

    // ==================== 前端用户系统接口测试 ====================

    await this.test('前端：收集用户查询反馈', async () => {
      const response = await this.http.post('/rag/query-pairs/collect-from-query', {
        query: '冰岛 F-road 需要什么车辆？',
        retrievedResults: [
          { id: 'doc-test-1', score: 0.85 },
        ],
        userFeedback: {
          clickedDocumentIds: ['doc-test-1'],
        },
      });
      return response.data;
    });

    // ==================== 打印测试结果 ====================

    this.printResults();
  }

  printResults(): void {
    console.log('\n' + '='.repeat(80));
    console.log('测试结果汇总');
    console.log('='.repeat(80));

    const successCount = this.results.filter((r) => r.success).length;
    const failCount = this.results.filter((r) => !r.success).length;
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);

    console.log(`\n总计: ${this.results.length} 个测试`);
    console.log(`✅ 通过: ${successCount}`);
    console.log(`❌ 失败: ${failCount}`);
    console.log(`⏱️  总耗时: ${totalDuration}ms`);

    if (failCount > 0) {
      console.log('\n失败的测试:');
      this.results
        .filter((r) => !r.success)
        .forEach((r) => {
          console.log(`  ❌ ${r.name}`);
          console.log(`     错误: ${r.error}`);
        });
    }

    console.log('\n' + '='.repeat(80));
  }
}

function parseArgs(): { baseUrl: string; skipWorkflow: boolean } {
  const args = process.argv.slice(2);
  let baseUrl = BASE_URL;
  let skipWorkflow = false;

  for (const arg of args) {
    if (arg.startsWith('--base-url=')) {
      baseUrl = arg.split('=')[1];
    } else if (arg === '--skip-workflow') {
      skipWorkflow = true;
    }
  }

  return { baseUrl, skipWorkflow };
}

async function main() {
  const { baseUrl, skipWorkflow } = parseArgs();
  const tester = new APITester(`${baseUrl}/api`, skipWorkflow);

  try {
    await tester.runAllTests();
  } catch (error: any) {
    console.error('\n❌ 测试执行失败:', error.message);
    process.exit(1);
  }
}

main();
