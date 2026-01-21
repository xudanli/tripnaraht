#!/usr/bin/env ts-node
/**
 * RAG 和 LLM 管理 API 测试脚本
 * 
 * 测试以下接口：
 * - POST /api/rag/search - RAG 搜索
 * - GET /api/rag/stats - RAG 统计
 * - GET /api/llm/models - 获取可用模型列表
 * - GET /api/llm/usage - Token 使用统计
 * - GET /api/llm/cost - 成本统计
 */

import axios from 'axios';

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

interface TestResult {
  name: string;
  success: boolean;
  error?: string;
  data?: any;
  duration?: number;
}

const results: TestResult[] = [];

/**
 * 执行测试
 */
async function runTest(name: string, testFn: () => Promise<any>): Promise<void> {
  const startTime = Date.now();
  try {
    console.log(`\n🧪 测试: ${name}`);
    const data = await testFn();
    const duration = Date.now() - startTime;
    results.push({ name, success: true, data, duration });
    console.log(`✅ 通过 (${duration}ms)`);
    if (data && typeof data === 'object') {
      console.log(`   响应: ${JSON.stringify(data, null, 2).substring(0, 200)}...`);
    }
  } catch (error: any) {
    const duration = Date.now() - startTime;
    const errorMessage = error.response?.data?.error?.message || error.message || '未知错误';
    results.push({ name, success: false, error: errorMessage, duration });
    console.log(`❌ 失败 (${duration}ms)`);
    console.log(`   错误: ${errorMessage}`);
    if (error.response?.data) {
      console.log(`   响应: ${JSON.stringify(error.response.data, null, 2)}`);
    }
  }
}

/**
 * 测试 1: RAG 搜索
 */
async function testRAGSearch(): Promise<any> {
  const response = await axios.post(`${BASE_URL}/api/rag/search`, {
    query: '冰岛旅游攻略',
    collection: 'travel_guides',
    countryCode: 'IS',
    limit: 5,
    minScore: 0.5,
  });
  
  if (!response.data.success) {
    throw new Error('响应 success 为 false');
  }
  
  return response.data.data;
}

/**
 * 测试 2: RAG 统计（所有集合）
 */
async function testRAGStatsAll(): Promise<any> {
  const response = await axios.get(`${BASE_URL}/api/rag/stats`);
  
  if (!response.data.success) {
    throw new Error('响应 success 为 false');
  }
  
  return response.data.data;
}

/**
 * 测试 3: RAG 统计（指定集合）
 */
async function testRAGStatsCollection(): Promise<any> {
  const response = await axios.get(`${BASE_URL}/api/rag/stats?collection=travel_guides`);
  
  if (!response.data.success) {
    throw new Error('响应 success 为 false');
  }
  
  return response.data.data;
}

/**
 * 测试 4: 获取可用模型列表
 */
async function testGetModels(): Promise<any> {
  const response = await axios.get(`${BASE_URL}/api/llm/models`);
  
  if (!response.data.success) {
    throw new Error('响应 success 为 false');
  }
  
  const data = response.data.data;
  
  // 验证响应结构
  if (!data.models || !Array.isArray(data.models)) {
    throw new Error('响应缺少 models 字段或格式错误');
  }
  
  if (typeof data.totalModels !== 'number') {
    throw new Error('响应缺少 totalModels 字段或格式错误');
  }
  
  return data;
}

/**
 * 测试 5: Token 使用统计（总体）
 */
async function testTokenUsageOverall(): Promise<any> {
  const response = await axios.get(`${BASE_URL}/api/llm/usage`);
  
  if (!response.data.success) {
    throw new Error('响应 success 为 false');
  }
  
  return response.data.data;
}

/**
 * 测试 6: Token 使用统计（按时间范围）
 */
async function testTokenUsageTimeRange(): Promise<any> {
  const endTime = new Date().toISOString();
  const startTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(); // 7天前
  
  const response = await axios.get(`${BASE_URL}/api/llm/usage`, {
    params: {
      startTime,
      endTime,
    },
  });
  
  if (!response.data.success) {
    throw new Error('响应 success 为 false');
  }
  
  return response.data.data;
}

/**
 * 测试 7: Token 使用统计（按 Sub-Agent）
 */
async function testTokenUsageSubAgent(): Promise<any> {
  const response = await axios.get(`${BASE_URL}/api/llm/usage`, {
    params: {
      subAgent: 'PlannerAgent',
    },
  });
  
  if (!response.data.success) {
    throw new Error('响应 success 为 false');
  }
  
  return response.data.data;
}

/**
 * 测试 8: Token 使用统计（按 Provider）
 */
async function testTokenUsageProvider(): Promise<any> {
  const response = await axios.get(`${BASE_URL}/api/llm/usage`, {
    params: {
      provider: 'deepseek',
    },
  });
  
  if (!response.data.success) {
    throw new Error('响应 success 为 false');
  }
  
  return response.data.data;
}

/**
 * 测试 9: 成本统计（总体）
 */
async function testCostOverall(): Promise<any> {
  const response = await axios.get(`${BASE_URL}/api/llm/cost`);
  
  if (!response.data.success) {
    throw new Error('响应 success 为 false');
  }
  
  const data = response.data.data;
  
  // 验证响应结构
  if (typeof data.totalCost !== 'number') {
    throw new Error('响应缺少 totalCost 字段或格式错误');
  }
  
  if (data.currency !== 'USD') {
    throw new Error('货币单位应为 USD');
  }
  
  return data;
}

/**
 * 测试 10: 成本统计（按时间范围）
 */
async function testCostTimeRange(): Promise<any> {
  const endTime = new Date().toISOString();
  const startTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(); // 7天前
  
  const response = await axios.get(`${BASE_URL}/api/llm/cost`, {
    params: {
      startTime,
      endTime,
    },
  });
  
  if (!response.data.success) {
    throw new Error('响应 success 为 false');
  }
  
  return response.data.data;
}

/**
 * 测试 11: 成本统计（按 Provider）
 */
async function testCostProvider(): Promise<any> {
  const response = await axios.get(`${BASE_URL}/api/llm/cost`, {
    params: {
      provider: 'deepseek',
    },
  });
  
  if (!response.data.success) {
    throw new Error('响应 success 为 false');
  }
  
  return response.data.data;
}

/**
 * 测试 12: 成本统计（按 Sub-Agent）
 */
async function testCostSubAgent(): Promise<any> {
  const response = await axios.get(`${BASE_URL}/api/llm/cost`, {
    params: {
      subAgent: 'PlannerAgent',
    },
  });
  
  if (!response.data.success) {
    throw new Error('响应 success 为 false');
  }
  
  return response.data.data;
}

/**
 * 测试 12: 获取文档列表
 */
async function testGetDocuments(): Promise<any> {
  const response = await axios.get(`${BASE_URL}/api/rag/documents`, {
    params: {
      page: 1,
      pageSize: 10,
    },
  });
  
  if (!response.data.success) {
    throw new Error('响应 success 为 false');
  }
  
  const data = response.data.data;
  
  // 验证响应结构
  if (!data.documents || !Array.isArray(data.documents)) {
    throw new Error('响应缺少 documents 字段或格式错误');
  }
  
  if (!data.pagination || typeof data.pagination.total !== 'number') {
    throw new Error('响应缺少 pagination 字段或格式错误');
  }
  
  return data;
}

/**
 * 测试 13: 获取文档列表（分页）
 */
async function testGetDocumentsPaged(): Promise<any> {
  const response = await axios.get(`${BASE_URL}/api/rag/documents`, {
    params: {
      page: 2,
      pageSize: 5,
    },
  });
  
  if (!response.data.success) {
    throw new Error('响应 success 为 false');
  }
  
  return response.data.data;
}

/**
 * 测试 14: 获取文档列表（筛选）
 */
async function testGetDocumentsFiltered(): Promise<any> {
  const response = await axios.get(`${BASE_URL}/api/rag/documents`, {
    params: {
      collection: 'travel_guides',
      countryCode: 'IS',
      page: 1,
      pageSize: 10,
    },
  });
  
  if (!response.data.success) {
    throw new Error('响应 success 为 false');
  }
  
  return response.data.data;
}

/**
 * 主函数
 */
async function main() {
  console.log('🚀 开始测试 RAG 和 LLM 管理 API');
  console.log(`📍 目标服务器: ${BASE_URL}`);
  
  // RAG 接口测试
  await runTest('RAG 搜索', testRAGSearch);
  await runTest('RAG 统计（所有集合）', testRAGStatsAll);
  await runTest('RAG 统计（指定集合）', testRAGStatsCollection);
  
  // RAG 文档管理接口测试
  await runTest('获取文档列表', testGetDocuments);
  await runTest('获取文档列表（分页）', testGetDocumentsPaged);
  await runTest('获取文档列表（筛选）', testGetDocumentsFiltered);
  
  // LLM 接口测试
  await runTest('获取可用模型列表', testGetModels);
  await runTest('Token 使用统计（总体）', testTokenUsageOverall);
  await runTest('Token 使用统计（按时间范围）', testTokenUsageTimeRange);
  await runTest('Token 使用统计（按 Sub-Agent）', testTokenUsageSubAgent);
  await runTest('Token 使用统计（按 Provider）', testTokenUsageProvider);
  await runTest('成本统计（总体）', testCostOverall);
  await runTest('成本统计（按时间范围）', testCostTimeRange);
  await runTest('成本统计（按 Provider）', testCostProvider);
  await runTest('成本统计（按 Sub-Agent）', testCostSubAgent);
  
  // 输出测试结果摘要
  console.log('\n' + '='.repeat(60));
  console.log('📊 测试结果摘要');
  console.log('='.repeat(60));
  
  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;
  const totalDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0);
  
  console.log(`\n总计: ${results.length} 个测试`);
  console.log(`✅ 通过: ${successCount}`);
  console.log(`❌ 失败: ${failCount}`);
  console.log(`⏱️  总耗时: ${totalDuration}ms`);
  console.log(`📈 平均耗时: ${Math.round(totalDuration / results.length)}ms`);
  
  if (failCount > 0) {
    console.log('\n❌ 失败的测试:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`   - ${r.name}: ${r.error}`);
    });
  }
  
  console.log('\n' + '='.repeat(60));
  
  // 详细结果
  console.log('\n📋 详细结果:');
  results.forEach((r, index) => {
    const icon = r.success ? '✅' : '❌';
    const duration = r.duration ? ` (${r.duration}ms)` : '';
    console.log(`${icon} ${index + 1}. ${r.name}${duration}`);
    if (!r.success && r.error) {
      console.log(`   错误: ${r.error}`);
    }
  });
  
  // 退出码
  process.exit(failCount > 0 ? 1 : 0);
}

// 运行测试
main().catch(error => {
  console.error('❌ 测试执行失败:', error);
  process.exit(1);
});
