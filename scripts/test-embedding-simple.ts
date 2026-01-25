// 简单测试 Embedding API
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

try {
  require('dotenv').config();
} catch (e) {}

async function test() {
  const apiKey = process.env.OPENAI_API_KEY?.replace(/"/g, '');
  const proxyUrl = process.env.HTTPS_PROXY || 'http://127.0.0.1:9090';

  console.log('🧪 测试 Embedding API...\n');
  console.log('📋 配置:');
  console.log(`  - Proxy: ${proxyUrl}`);
  console.log(`  - API Key: ${apiKey?.substring(0, 20)}...\n`);

  const agent = new HttpsProxyAgent(proxyUrl);

  const client = axios.create({
    baseURL: 'https://api.openai.com/v1',
    timeout: 60000,
    httpsAgent: agent,
    proxy: false, // 禁用 axios 内置代理逻辑
  });

  try {
    console.log('🔄 发送请求...');
    const startTime = Date.now();

    const response = await client.post('/embeddings', {
      model: 'text-embedding-3-small',
      input: '冰岛租车保险'
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('\n✅ 成功！');
    console.log(`  ⏱️  耗时: ${duration} 秒`);
    console.log(`  📊 向量维度: ${response.data.data[0].embedding.length}`);
    console.log(`  📝 向量前5个值: ${response.data.data[0].embedding.slice(0, 5).map((v: number) => v.toFixed(4)).join(', ')}...`);

    return true;
  } catch (error: any) {
    console.error('\n❌ 失败:', error.message);

    if (error.response) {
      console.log('  📄 状态码:', error.response.status);
      console.log('  📄 响应:', JSON.stringify(error.response.data, null, 2));
    }

    if (error.code) {
      console.log('  🔢 错误代码:', error.code);
    }

    return false;
  }
}

test()
  .then((success) => process.exit(success ? 0 : 1))
  .catch((error) => {
    console.error('💥 未处理的错误:', error);
    process.exit(1);
  });
