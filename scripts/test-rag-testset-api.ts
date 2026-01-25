// 测试 RAG 测试集相关 API 接口
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

try {
  require('dotenv').config();
} catch (e) {}

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const proxyUrl = process.env.HTTPS_PROXY;

// 创建 axios 实例
const createClient = () => {
  const config: any = {
    baseURL: API_BASE_URL,
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  // 只在需要代理且 URL 是 https 时使用代理
  if (proxyUrl && API_BASE_URL.startsWith('https://')) {
    try {
      const agent = new HttpsProxyAgent(proxyUrl);
      config.httpsAgent = agent;
      config.httpAgent = agent;
    } catch (error) {
      logWarning(`代理配置失败，将不使用代理: ${error}`);
    }
  }

  return axios.create(config);
};

const client = createClient();

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title: string) {
  console.log('\n' + '='.repeat(80));
  log(title, 'cyan');
  console.log('='.repeat(80) + '\n');
}

function logSuccess(message: string) {
  log(`✅ ${message}`, 'green');
}

function logError(message: string) {
  log(`❌ ${message}`, 'red');
}

function logInfo(message: string) {
  log(`ℹ️  ${message}`, 'blue');
}

function logWarning(message: string) {
  log(`⚠️  ${message}`, 'yellow');
}

// 测试结果统计
const testResults = {
  passed: 0,
  failed: 0,
  total: 0,
};

async function runTest(name: string, testFn: () => Promise<void>) {
  testResults.total++;
  try {
    logInfo(`测试: ${name}`);
    await testFn();
    testResults.passed++;
    logSuccess(`${name} - 通过\n`);
  } catch (error: any) {
    testResults.failed++;
    logError(`${name} - 失败: ${error.message}\n`);
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应数据:', JSON.stringify(error.response.data, null, 2));
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      logWarning('无法连接到服务器，请确保服务器正在运行');
      logInfo(`  尝试连接: ${API_BASE_URL}`);
    } else if (error.message.includes('Proxy')) {
      logWarning('代理连接失败，尝试不使用代理或检查代理配置');
    }
  }
}

// 测试 1: 获取测试集
async function testGetTestset() {
  const response = await client.get('/api/rag/evaluation/testset');
  
  if (!response.data.success) {
    throw new Error('响应 success 字段为 false');
  }

  const testset = response.data.data;
  
  if (!testset.version || !testset.name || !Array.isArray(testset.testCases)) {
    throw new Error('测试集格式不正确');
  }

  logSuccess(`获取测试集成功`);
  logInfo(`  名称: ${testset.name}`);
  logInfo(`  版本: ${testset.version}`);
  logInfo(`  测试用例数量: ${testset.testCases.length}`);
  
  if (testset.testCases.length > 0) {
    const firstCase = testset.testCases[0];
    logInfo(`  第一个用例: ${firstCase.id} - "${firstCase.query}"`);
  }

  return testset;
}

// 测试 2: 保存测试集
async function testSaveTestset(originalTestset: any) {
  // 创建一个测试用的测试集
  const testTestset = {
    ...originalTestset,
    name: 'test-save-testset',
    description: '测试保存功能',
    testCases: [
      {
        id: 'test-case-001',
        query: '测试查询',
        groundTruthChunkIds: [],
        tags: ['test'],
        notes: '这是一个测试用例',
      },
    ],
  };

  const response = await client.put('/api/rag/evaluation/testset', testTestset);
  
  if (!response.data.success) {
    throw new Error('响应 success 字段为 false');
  }

  logSuccess('保存测试集成功');

  // 恢复原始测试集
  const restoreResponse = await client.put('/rag/evaluation/testset', originalTestset);
  if (!restoreResponse.data.success) {
    logWarning('恢复原始测试集失败，请手动检查');
  } else {
    logInfo('已恢复原始测试集');
  }
}

// 测试 3: 查找相关 chunks
async function testFindChunks() {
  const query = '冰岛租车保险';
  const limit = 5;

  const response = await client.get('/api/rag/evaluation/testset/find-chunks', {
    params: {
      query,
      limit,
    },
  });

  if (!response.data.success) {
    throw new Error('响应 success 字段为 false');
  }

  const data = response.data.data;
  
  if (data.query !== query) {
    throw new Error('返回的查询文本不匹配');
  }

  if (!Array.isArray(data.chunks)) {
    throw new Error('chunks 不是数组');
  }

  logSuccess(`查找相关 chunks 成功`);
  logInfo(`  查询: "${query}"`);
  logInfo(`  找到 ${data.chunks.length} 个相关 chunks`);

  if (data.chunks.length > 0) {
    const firstChunk = data.chunks[0];
    logInfo(`  第一个 chunk:`);
    logInfo(`    ID: ${firstChunk.id}`);
    logInfo(`    ChunkId: ${firstChunk.chunkId}`);
    logInfo(`    类型: ${firstChunk.type}`);
    logInfo(`    相似度: ${firstChunk.similarity || 'N/A'}`);
    logInfo(`    内容预览: ${firstChunk.content.substring(0, 100)}...`);
  } else {
    logWarning('未找到相关 chunks，可能是数据库中没有数据');
  }

  return data.chunks;
}

// 测试 4: 列出所有 chunks
async function testListChunks() {
  const limit = 10;

  const response = await client.get('/rag/evaluation/testset/list-chunks', {
    params: {
      limit,
    },
  });

  if (!response.data.success) {
    throw new Error('响应 success 字段为 false');
  }

  const data = response.data.data;
  
  if (!Array.isArray(data.chunks)) {
    throw new Error('chunks 不是数组');
  }

  logSuccess(`列出所有 chunks 成功`);
  logInfo(`  返回数量: ${data.chunks.length}`);
  logInfo(`  总数: ${data.count}`);

  if (data.chunks.length > 0) {
    const firstChunk = data.chunks[0];
    logInfo(`  第一个 chunk:`);
    logInfo(`    ID: ${firstChunk.id}`);
    logInfo(`    ChunkId: ${firstChunk.chunkId}`);
    logInfo(`    文件名: ${firstChunk.filename}`);
    logInfo(`    分类: ${firstChunk.category}`);
  } else {
    logWarning('数据库中没有 chunks');
  }

  return data.chunks;
}

// 测试 5: 运行测试集评估
async function testRunTestset() {
  const response = await client.post('/api/rag/evaluation/testset/run', {
    params: {
      useHybridSearch: true,
      useReranking: false,
      useQueryExpansion: false,
    },
    limit: 10,
  });

  if (!response.data.success) {
    throw new Error('响应 success 字段为 false');
  }

  const data = response.data.data;
  
  if (!data.testset || !data.result) {
    throw new Error('响应数据格式不正确');
  }

  logSuccess('运行测试集评估成功');
  logInfo(`  测试集: ${data.testset.name} (v${data.testset.version})`);
  
  const result = data.result;
  if (result.averageRecallAtK) {
    logInfo(`  平均 Recall@K:`);
    logInfo(`    @1: ${result.averageRecallAtK[1]?.toFixed(3) || 'N/A'}`);
    logInfo(`    @5: ${result.averageRecallAtK[5]?.toFixed(3) || 'N/A'}`);
    logInfo(`    @10: ${result.averageRecallAtK[10]?.toFixed(3) || 'N/A'}`);
  }
  if (result.averageMRR !== undefined) {
    logInfo(`  平均 MRR: ${result.averageMRR.toFixed(3)}`);
  }
  if (result.perQueryResults) {
    logInfo(`  查询结果数量: ${result.perQueryResults.length}`);
  }

  return data;
}

// 主测试函数
async function runAllTests() {
  logSection('RAG 测试集 API 接口测试');
  logInfo(`API Base URL: ${API_BASE_URL}`);
  if (proxyUrl) {
    logInfo(`使用代理: ${proxyUrl}`);
  }
  console.log('');

  let originalTestset: any = null;

  // 测试 1: 获取测试集
  await runTest('获取测试集', async () => {
    originalTestset = await testGetTestset();
  });

  // 测试 2: 保存测试集（需要先获取）
  if (originalTestset) {
    await runTest('保存测试集', async () => {
      await testSaveTestset(originalTestset);
    });
  }

  // 测试 3: 查找相关 chunks
  await runTest('查找相关 chunks', async () => {
    await testFindChunks();
  });

  // 测试 4: 列出所有 chunks
  await runTest('列出所有 chunks', async () => {
    await testListChunks();
  });

  // 测试 5: 运行测试集评估（需要测试集中有 groundTruthChunkIds）
  await runTest('运行测试集评估', async () => {
    await testRunTestset();
  });

  // 输出测试结果统计
  logSection('测试结果统计');
  logInfo(`总测试数: ${testResults.total}`);
  logSuccess(`通过: ${testResults.passed}`);
  if (testResults.failed > 0) {
    logError(`失败: ${testResults.failed}`);
  } else {
    logSuccess(`失败: ${testResults.failed}`);
  }
  console.log('');

  if (testResults.failed === 0) {
    logSuccess('🎉 所有测试通过！');
    process.exit(0);
  } else {
    logError('❌ 部分测试失败，请检查上述错误信息');
    process.exit(1);
  }
}

// 运行测试
runAllTests().catch((error) => {
  console.error('测试执行失败:', error);
  process.exit(1);
});
