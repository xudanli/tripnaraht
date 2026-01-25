// scripts/test-openai-api.ts
// 测试 OpenAI API 连接

import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

try {
  require('dotenv').config();
} catch (e) {}

async function testOpenAIAPI() {
  console.log('🧪 测试 OpenAI API 连接...\n');

  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const proxyUrl = process.env.HTTP_PROXY || 'http://127.0.0.1:9090';

  console.log('📋 配置信息:');
  console.log(`  - Base URL: ${baseUrl}`);
  console.log(`  - Proxy: ${proxyUrl}`);
  console.log(`  - API Key: ${apiKey ? apiKey.substring(0, 20) + '...' : '未设置'}\n`);

  if (!apiKey) {
    console.error('❌ OPENAI_API_KEY 未设置');
    return;
  }

  // 创建客户端配置
  const config: any = {
    baseURL: baseUrl,
    timeout: 60000, // 60 秒超时
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  };

  // 配置 HTTPS 代理 - 使用 HttpsProxyAgent
  const proxyMatch = proxyUrl.match(/^https?:\/\/([^:]+):(\d+)/);
  if (proxyMatch) {
    const proxyHost = proxyMatch[1];
    const proxyPort = parseInt(proxyMatch[2]);
    // 创建 HTTPS 代理 agent
    const agent = new HttpsProxyAgent(`http://${proxyHost}:${proxyPort}`);
    config.httpsAgent = agent;
    config.httpAgent = agent;
    console.log(`📡 使用 HTTPS 代理: ${proxyHost}:${proxyPort}\n`);
  } else {
    const agent = new HttpsProxyAgent('http://127.0.0.1:9090');
    config.httpsAgent = agent;
    config.httpAgent = agent;
    console.log(`📡 使用默认 HTTPS 代理: 127.0.0.1:9090\n`);
  }
  
  // 确保使用 HTTPS
  if (!config.baseURL.startsWith('https://')) {
    console.log(`⚠️  警告: Base URL 不是 HTTPS，强制使用 HTTPS`);
    config.baseURL = config.baseURL.replace(/^http:\/\//, 'https://');
  }

  const client = axios.create(config);

  // 测试 1: 简单 embedding 请求
  console.log('🔹 测试 1: 简单 embedding 请求...');
  try {
    const startTime = Date.now();
    const response = await client.post('/embeddings', {
      model: 'text-embedding-3-small',
      input: 'Hello, world!',
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    if (response.data?.data?.[0]?.embedding) {
      const embedding = response.data.data[0].embedding;
      console.log(`  ✅ 成功！`);
      console.log(`  ⏱️  耗时: ${duration} 秒`);
      console.log(`  📊 向量维度: ${embedding.length}`);
      console.log(`  📝 向量前5个值: [${embedding.slice(0, 5).map((v: number) => v.toFixed(4)).join(', ')}...]\n`);
    } else {
      console.log(`  ❌ 响应格式错误:`);
      console.log(`  ${JSON.stringify(response.data, null, 2).substring(0, 500)}\n`);
    }
  } catch (error: any) {
    console.log(`  ❌ 失败: ${error.message}`);
    if (error.response) {
      console.log(`  📄 状态码: ${error.response.status}`);
      console.log(`  📄 响应: ${JSON.stringify(error.response.data).substring(0, 300)}`);
    }
    if (error.code) {
      console.log(`  🔢 错误代码: ${error.code}`);
    }
    console.log('');
  }

  // 测试 2: 不使用代理
  console.log('🔹 测试 2: 不使用代理（直接连接）...');
  try {
    const directConfig = {
      baseURL: baseUrl,
      timeout: 60000,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    };
    const directClient = axios.create(directConfig);
    
    const startTime = Date.now();
    const response = await directClient.post('/embeddings', {
      model: 'text-embedding-3-small',
      input: 'Test direct connection',
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    if (response.data?.data?.[0]?.embedding) {
      console.log(`  ✅ 直接连接成功！`);
      console.log(`  ⏱️  耗时: ${duration} 秒\n`);
    }
  } catch (error: any) {
    console.log(`  ❌ 直接连接失败: ${error.message}`);
    if (error.code) {
      console.log(`  🔢 错误代码: ${error.code}\n`);
    }
  }

  console.log('✅ 测试完成');
}

testOpenAIAPI()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('💥 测试失败:', error);
    process.exit(1);
  });
