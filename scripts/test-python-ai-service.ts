#!/usr/bin/env ts-node
/**
 * Python AI Service 连接测试脚本
 * 
 * 用法:
 *   npm run test:python-ai
 *   或
 *   ts-node scripts/test-python-ai-service.ts
 */

import axios from 'axios';
import https from 'https';

const PYTHON_AI_SERVICE_URL = process.env.PYTHON_AI_SERVICE_URL || 'http://101.37.210.241:8001';
const TIMEOUT = parseInt(process.env.PYTHON_AI_SERVICE_HEALTH_TIMEOUT || '15000', 10);

// 创建 HTTP 客户端（禁用代理）
const httpClient = axios.create({
  baseURL: PYTHON_AI_SERVICE_URL,
  timeout: TIMEOUT,
  proxy: false,
  httpsAgent: new https.Agent({
    keepAlive: true,
    family: 4,
  }),
});

async function testHealthCheck() {
  console.log(`\n🔍 测试健康检查端点: ${PYTHON_AI_SERVICE_URL}/health`);
  console.log(`⏱️  超时设置: ${TIMEOUT}ms\n`);

  try {
    const startTime = Date.now();
    const response = await httpClient.get('/health');
    const duration = Date.now() - startTime;

    console.log('✅ 健康检查成功！');
    console.log(`⏱️  响应时间: ${duration}ms`);
    console.log(`📊 响应数据:`, JSON.stringify(response.data, null, 2));
    return true;
  } catch (error: any) {
    console.error('❌ 健康检查失败！');
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      console.error(`⏱️  错误: 请求超时 (${TIMEOUT}ms)`);
      console.error(`💡 建议: 增加 PYTHON_AI_SERVICE_HEALTH_TIMEOUT 环境变量`);
    } else if (error.code === 'ECONNREFUSED') {
      console.error(`🔌 错误: 连接被拒绝`);
      console.error(`💡 建议: 检查服务是否在 ${PYTHON_AI_SERVICE_URL} 运行`);
    } else if (error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN') {
      console.error(`🌐 错误: DNS 解析失败`);
      console.error(`💡 建议: 检查网络连接和域名解析`);
    } else {
      console.error(`❌ 错误: ${error.message || error.code || 'Unknown error'}`);
    }
    if (error.response) {
      console.error(`📡 HTTP 状态码: ${error.response.status}`);
      console.error(`📄 响应数据:`, error.response.data);
    }
    return false;
  }
}

async function testEmbedding() {
  console.log(`\n🔍 测试 Embedding API: ${PYTHON_AI_SERVICE_URL}/api/v1/embeddings\n`);

  try {
    const startTime = Date.now();
    const response = await httpClient.post('/api/v1/embeddings', {
      texts: ['测试文本', 'Hello World'],
      model: 'bge-m3',
      return_sparse: false,
    });
    const duration = Date.now() - startTime;

    console.log('✅ Embedding 生成成功！');
    console.log(`⏱️  响应时间: ${duration}ms`);
    console.log(`📊 结果:`);
    console.log(`   - 文本数量: ${response.data.embeddings.length}`);
    console.log(`   - 向量维度: ${response.data.embeddings[0]?.dense?.length || 'unknown'}`);
    console.log(`   - Token 数: ${response.data.usage.total_tokens}`);
    console.log(`   - 模型: ${response.data.model}`);
    return true;
  } catch (error: any) {
    console.error('❌ Embedding 生成失败！');
    console.error(`❌ 错误: ${error.message || error.code || 'Unknown error'}`);
    if (error.response) {
      console.error(`📡 HTTP 状态码: ${error.response.status}`);
      console.error(`📄 响应数据:`, error.response.data);
    }
    return false;
  }
}

async function testRerank() {
  console.log(`\n🔍 测试 Rerank API: ${PYTHON_AI_SERVICE_URL}/api/v1/rerank\n`);

  try {
    const startTime = Date.now();
    const response = await httpClient.post('/api/v1/rerank', {
      query: '测试查询',
      documents: [
        { id: '1', text: '这是第一个文档' },
        { id: '2', text: '这是第二个文档' },
        { id: '3', text: '这是第三个文档' },
      ],
      top_k: 2,
    });
    const duration = Date.now() - startTime;

    console.log('✅ Rerank 成功！');
    console.log(`⏱️  响应时间: ${duration}ms`);
    console.log(`📊 结果:`);
    response.data.results.forEach((result: any) => {
      console.log(`   - 排名 ${result.rank}: ID=${result.id}, 分数=${result.score.toFixed(4)}`);
    });
    return true;
  } catch (error: any) {
    console.error('❌ Rerank 失败！');
    console.error(`❌ 错误: ${error.message || error.code || 'Unknown error'}`);
    if (error.response) {
      console.error(`📡 HTTP 状态码: ${error.response.status}`);
      console.error(`📄 响应数据:`, error.response.data);
    }
    return false;
  }
}

async function main() {
  console.log('🚀 Python AI Service 连接测试');
  console.log('='.repeat(50));
  console.log(`📍 服务地址: ${PYTHON_AI_SERVICE_URL}`);
  console.log(`⏱️  超时设置: ${TIMEOUT}ms`);

  const results = {
    healthCheck: false,
    embedding: false,
    rerank: false,
  };

  // 测试健康检查
  results.healthCheck = await testHealthCheck();

  // 如果健康检查失败，不继续测试其他接口
  if (!results.healthCheck) {
    console.log('\n⚠️  健康检查失败，跳过其他测试');
    console.log('\n💡 故障排查建议:');
    console.log('   1. 检查服务地址是否正确');
    console.log('   2. 检查网络连接: curl ' + PYTHON_AI_SERVICE_URL + '/health');
    console.log('   3. 检查防火墙/安全组设置');
    console.log('   4. 如果网络延迟高，增加 PYTHON_AI_SERVICE_HEALTH_TIMEOUT');
    process.exit(1);
  }

  // 测试 Embedding
  results.embedding = await testEmbedding();

  // 测试 Rerank
  results.rerank = await testRerank();

  // 总结
  console.log('\n' + '='.repeat(50));
  console.log('📊 测试总结:');
  console.log(`   ✅ 健康检查: ${results.healthCheck ? '通过' : '失败'}`);
  console.log(`   ${results.embedding ? '✅' : '❌'} Embedding API: ${results.embedding ? '通过' : '失败'}`);
  console.log(`   ${results.rerank ? '✅' : '❌'} Rerank API: ${results.rerank ? '通过' : '失败'}`);

  const allPassed = results.healthCheck && results.embedding && results.rerank;
  if (allPassed) {
    console.log('\n🎉 所有测试通过！Python AI Service 运行正常。');
    process.exit(0);
  } else {
    console.log('\n⚠️  部分测试失败，请检查服务状态。');
    process.exit(1);
  }
}

// 运行测试
main().catch((error) => {
  console.error('❌ 测试脚本执行失败:', error);
  process.exit(1);
});
