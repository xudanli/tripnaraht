#!/usr/bin/env ts-node
/**
 * Embedding 数据查询 API 测试脚本
 * 
 * 测试以下接口：
 * - GET /api/places/search/semantic - 地点语义搜索
 * - POST /api/places/search/batch - 批量语义搜索
 * - GET /api/places/search - 标准地点搜索（混合搜索）
 * - GET /api/rag/retrieve - RAG 文档检索
 * - POST /api/rag/search - RAG 搜索（POST版本）
 * - GET /api/rag/stats - RAG 统计
 * - GET /api/rag/documents - 文档列表
 * - POST /api/rag/index - 索引文档
 */

import axios from 'axios';

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

// 创建带超时的 axios 实例（30秒超时）
const axiosInstance = axios.create({
  timeout: 30000, // 30秒超时
  validateStatus: (status) => status < 500, // 接受所有状态码，让测试脚本处理错误
});

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
      const preview = JSON.stringify(data, null, 2).substring(0, 300);
      console.log(`   响应预览: ${preview}${preview.length >= 300 ? '...' : ''}`);
    }
  } catch (error: any) {
    const duration = Date.now() - startTime;
    let errorMessage = '未知错误';
    
    if (error.code === 'ECONNREFUSED') {
      errorMessage = `连接被拒绝：无法连接到服务器 ${BASE_URL}。请确保服务器正在运行。`;
    } else if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
      errorMessage = `请求超时：服务器在30秒内没有响应。`;
    } else if (error.response?.data?.error?.message) {
      errorMessage = error.response.data.error.message;
    } else if (error.response?.data?.message) {
      errorMessage = error.response.data.message;
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    results.push({ name, success: false, error: errorMessage, duration });
    console.log(`❌ 失败 (${duration}ms)`);
    console.log(`   错误: ${errorMessage}`);
    if (error.response?.data) {
      const errorPreview = JSON.stringify(error.response.data, null, 2).substring(0, 200);
      console.log(`   响应: ${errorPreview}...`);
    } else if (error.code) {
      console.log(`   错误代码: ${error.code}`);
    }
  }
}

/**
 * 测试 1: 地点语义搜索
 */
async function testPlaceSemanticSearch(): Promise<any> {
  const response = await axiosInstance.get(`${BASE_URL}/api/places/search/semantic`, {
    params: {
      q: '冰岛景点',
      countryCode: 'IS',
      limit: 5,
    },
  });

  if (!response.data.success) {
    throw new Error('响应 success 为 false');
  }

  const results = response.data.data?.results || [];
  if (results.length === 0) {
    console.log('   ⚠️  警告: 没有返回结果（可能数据库中没有 embedding 数据）');
  } else {
    console.log(`   📍 找到 ${results.length} 个地点`);
    const firstResult = results[0];
    if (firstResult.vectorScore !== undefined) {
      console.log(`   📊 向量相似度分数: ${firstResult.vectorScore.toFixed(3)}`);
    }
  }

  return response.data.data;
}

/**
 * 测试 2: 地点语义搜索（带地理位置过滤）
 */
async function testPlaceSemanticSearchWithLocation(): Promise<any> {
  const response = await axiosInstance.get(`${BASE_URL}/api/places/search/semantic`, {
    params: {
      q: '附近餐厅',
      lat: 64.1265,  // 雷克雅未克
      lng: -21.8174,
      radius: 5000,  // 5公里
      type: 'RESTAURANT',
      limit: 5,
    },
  });

  if (!response.data.success) {
    throw new Error('响应 success 为 false');
  }

  return response.data.data;
}

/**
 * 测试 3: 批量语义搜索
 */
async function testBatchSemanticSearch(): Promise<any> {
  const response = await axiosInstance.post(`${BASE_URL}/api/places/search/batch`, {
    queries: ['冰岛景点', '附近餐厅'],
    countryCode: 'IS',
    limit: 3,
  });

  if (!response.data.success) {
    throw new Error('响应 success 为 false');
  }

  const batchResults = response.data.data || [];
  console.log(`   📦 批量查询结果数: ${batchResults.length}`);
  batchResults.forEach((item: any, index: number) => {
    console.log(`   ${index + 1}. "${item.query}": ${item.results?.length || 0} 个结果`);
  });

  return response.data.data;
}

/**
 * 测试 4: 标准地点搜索（混合搜索）
 */
async function testPlaceSearch(): Promise<any> {
  const response = await axiosInstance.get(`${BASE_URL}/api/places/search`, {
    params: {
      q: '蓝湖',
      countryCode: 'IS',
      limit: 5,
    },
  });

  if (!response.data.success) {
    throw new Error('响应 success 为 false');
  }

  return response.data.data;
}

/**
 * 测试 5: RAG 检索（GET）
 */
async function testRAGRetrieve(): Promise<any> {
  const response = await axiosInstance.get(`${BASE_URL}/api/rag/retrieve`, {
    params: {
      query: '冰岛旅游攻略',
      collection: 'travel_guides',
      countryCode: 'IS',
      limit: 5,
    },
  });

  if (!response.data.success) {
    throw new Error('响应 success 为 false');
  }

  const documents = response.data.data || [];
  if (documents.length === 0) {
    console.log('   ⚠️  警告: 没有返回文档（可能 RAG 知识库中没有数据）');
  } else {
    console.log(`   📚 找到 ${documents.length} 个相关文档`);
    const firstDoc = documents[0];
    if (firstDoc.score !== undefined) {
      console.log(`   📊 相似度分数: ${firstDoc.score.toFixed(3)}`);
    }
  }

  return response.data.data;
}

/**
 * 测试 6: RAG 搜索（POST）
 */
async function testRAGSearch(): Promise<any> {
  const response = await axiosInstance.post(`${BASE_URL}/api/rag/search`, {
    query: '冰岛旅游攻略',
    collection: 'travel_guides',
    countryCode: 'IS',
    tags: ['attractions', 'tips'],
    limit: 5,
    minScore: 0.5,
  });

  if (!response.data.success) {
    throw new Error('响应 success 为 false');
  }

  return response.data.data;
}

/**
 * 测试 7: RAG 统计（所有集合）
 */
async function testRAGStatsAll(): Promise<any> {
  const response = await axiosInstance.get(`${BASE_URL}/api/rag/stats`);

  if (!response.data.success) {
    throw new Error('响应 success 为 false');
  }

  const stats = response.data.data || {};
  console.log(`   📊 总文档数: ${stats.total || 0}`);
  if (stats.byCollection) {
    console.log(`   📁 集合统计: ${JSON.stringify(stats.byCollection)}`);
  }

  return response.data.data;
}

/**
 * 测试 8: RAG 统计（指定集合）
 */
async function testRAGStatsCollection(): Promise<any> {
  const response = await axiosInstance.get(`${BASE_URL}/api/rag/stats`, {
    params: {
      collection: 'travel_guides',
    },
  });

  if (!response.data.success) {
    throw new Error('响应 success 为 false');
  }

  return response.data.data;
}

/**
 * 测试 9: 获取文档列表
 */
async function testRAGDocuments(): Promise<any> {
  const response = await axiosInstance.get(`${BASE_URL}/api/rag/documents`, {
    params: {
      collection: 'travel_guides',
      page: 1,
      pageSize: 5,
    },
  });

  if (!response.data.success) {
    throw new Error('响应 success 为 false');
  }

  const result = response.data.data || {};
  const documents = result.documents || [];
  console.log(`   📚 文档列表: ${documents.length} 个（共 ${result.pagination?.total || 0} 个）`);

  return response.data.data;
}

/**
 * 测试 10: 索引文档（测试用）
 */
async function testRAGIndexDocument(): Promise<any> {
  const testDocument = {
    collection: 'travel_guides',
    title: '测试文档 - ' + new Date().toISOString(),
    content: '这是一个测试文档，用于测试 RAG 索引功能。内容包含冰岛旅游相关信息。',
    countryCode: 'IS',
    tags: ['test', 'iceland'],
    source: 'test-script',
    metadata: {
      test: true,
      createdAt: new Date().toISOString(),
    },
  };

  const response = await axiosInstance.post(`${BASE_URL}/api/rag/index`, testDocument);

  if (!response.data.id) {
    throw new Error('索引失败：未返回文档 ID');
  }

  console.log(`   📝 文档已索引，ID: ${response.data.id}`);
  return response.data;
}

/**
 * 主函数
 */
async function main() {
  console.log('🚀 开始测试 Embedding 数据查询 API');
  console.log(`📍 目标服务器: ${BASE_URL}`);
  console.log('=' .repeat(60));

  // 地点搜索接口测试
  console.log('\n📍 地点搜索接口测试');
  console.log('-'.repeat(60));
  await runTest('地点语义搜索', testPlaceSemanticSearch);
  await runTest('地点语义搜索（带地理位置）', testPlaceSemanticSearchWithLocation);
  await runTest('批量语义搜索', testBatchSemanticSearch);
  await runTest('标准地点搜索', testPlaceSearch);

  // RAG 检索接口测试
  console.log('\n📚 RAG 检索接口测试');
  console.log('-'.repeat(60));
  await runTest('RAG 检索（GET）', testRAGRetrieve);
  await runTest('RAG 搜索（POST）', testRAGSearch);
  await runTest('RAG 统计（所有集合）', testRAGStatsAll);
  await runTest('RAG 统计（指定集合）', testRAGStatsCollection);
  await runTest('获取文档列表', testRAGDocuments);

  // 文档管理接口测试（可选）
  console.log('\n📝 文档管理接口测试（可选）');
  console.log('-'.repeat(60));
  await runTest('索引文档', testRAGIndexDocument);

  // 输出测试总结
  console.log('\n' + '='.repeat(60));
  console.log('📊 测试总结');
  console.log('='.repeat(60));

  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const totalDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0);

  console.log(`✅ 通过: ${passed}`);
  console.log(`❌ 失败: ${failed}`);
  console.log(`⏱️  总耗时: ${totalDuration}ms`);
  console.log(`📈 平均耗时: ${Math.round(totalDuration / results.length)}ms`);

  if (failed > 0) {
    console.log('\n❌ 失败的测试:');
    results
      .filter(r => !r.success)
      .forEach(r => {
        console.log(`   - ${r.name}: ${r.error}`);
      });
  }

  console.log('\n' + '='.repeat(60));

  // 返回退出码
  process.exit(failed > 0 ? 1 : 0);
}

// 运行测试
main().catch(error => {
  console.error('❌ 测试执行失败:', error);
  process.exit(1);
});
