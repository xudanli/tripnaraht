// scripts/update-embeddings-proxy.ts
// 使用代理更新embeddings（正确处理HTTPS）

import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

try {
  require('dotenv').config();
} catch (e) {}

const prisma = new PrismaClient();

// 创建支持HTTPS代理的OpenAI客户端
function createOpenAIClient() {
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const proxyUrl = process.env.HTTP_PROXY || process.env.HTTPS_PROXY || 'http://127.0.0.1:9090';

  console.log('🔗 API Base URL:', baseUrl);
  console.log('🔌 代理地址:', proxyUrl);

  // 创建HTTPS代理agent
  const httpsAgent = new HttpsProxyAgent(proxyUrl);

  const config: any = {
    baseURL: baseUrl,
    timeout: 180000, // 3分钟超时
    httpsAgent: httpsAgent, // 使用HTTPS代理agent
    proxy: false, // 禁用 axios 内置代理逻辑
    maxRedirects: 5,
    validateStatus: (status: number) => status < 500,
  };

  return axios.create(config);
}

async function generateEmbedding(
  client: any,
  text: string,
  retries: number = 3
): Promise<number[]> {
  const truncatedText = text.substring(0, 8000);
  const apiKey = process.env.OPENAI_API_KEY?.replace(/"/g, '');

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const startTime = Date.now();
      const response = await client.post('/embeddings', {
        model: 'text-embedding-3-small',
        input: truncatedText,
      }, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);

      if (!response.data?.data?.[0]?.embedding) {
        console.log('    ⚠️  响应格式错误:', JSON.stringify(response.data).substring(0, 200));
        throw new Error('Invalid response structure');
      }

      const embedding = response.data.data[0].embedding;
      const preview = text.substring(0, 60).replace(/\n/g, ' ');
      console.log(`    ⏱️  ${duration}秒 | 维度: ${embedding.length} | "${preview}..."`);
      return embedding;
    } catch (error: any) {
      const errorMsg = error.message || String(error);
      const shortMsg = errorMsg.length > 100 ? errorMsg.substring(0, 100) + '...' : errorMsg;

      if (error.response?.data) {
        console.log(`    ⚠️  API错误:`, JSON.stringify(error.response.data).substring(0, 200));
      }

      console.log(`    ⚠️  尝试 ${attempt}/${retries} 失败: ${shortMsg}`);

      if (attempt < retries) {
        const waitTime = attempt * 10;
        console.log(`    ⏸️  等待 ${waitTime} 秒后重试...`);
        await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
        continue;
      }
      throw error;
    }
  }

  throw new Error('All retry attempts failed');
}

async function updateEmbeddings() {
  console.log('🔢 开始更新 chunks embedding（使用HTTPS代理）\n');
  console.log('🔑 API Key配置:', process.env.OPENAI_API_KEY ? '✅ 已配置' : '❌ 未配置');

  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY 未配置');
  }

  const client = createOpenAIClient();
  console.log('');

  // 获取需要更新的chunks
  const chunks = await prisma.$queryRaw<Array<{
    id: string;
    chunk_id: string;
    content: string;
  }>>`
    SELECT id, chunk_id, content
    FROM chunks
    WHERE embedding IS NULL
       OR embedding = (SELECT array_fill(0::real, ARRAY[1536]))::vector
    ORDER BY created_at ASC
  `;

  console.log(`📊 找到 ${chunks.length} 个 chunks 需要处理\n`);

  if (chunks.length === 0) {
    console.log('✅ 所有chunks已完成向量化！');
    return;
  }

  let successCount = 0;
  let failCount = 0;
  const startTime = Date.now();

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const shortId = chunk.chunk_id.length > 50
      ? chunk.chunk_id.substring(0, 47) + '...'
      : chunk.chunk_id;

    console.log(`[${i + 1}/${chunks.length}] ${shortId}`);

    try {
      const embedding = await generateEmbedding(client, chunk.content, 3);

      await prisma.$executeRaw`
        UPDATE chunks
        SET embedding = ${JSON.stringify(embedding)}::vector,
            updated_at = NOW()
        WHERE id = ${chunk.id}::uuid
      `;

      successCount++;
      console.log(`  ✅ 成功 (${successCount}/${chunks.length})\n`);

      // 每 5 个请求休息一下，避免限流
      if ((i + 1) % 5 === 0 && i + 1 < chunks.length) {
        console.log(`  ⏸️  休息 3 秒...\n`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

    } catch (error: any) {
      const errorMsg = error.message || String(error);
      const shortMsg = errorMsg.length > 100 ? errorMsg.substring(0, 100) + '...' : errorMsg;
      console.log(`  ❌ 失败: ${shortMsg}\n`);
      failCount++;

      // 遇到限流，等待更长时间
      if (errorMsg.includes('rate') || errorMsg.includes('429') || errorMsg.includes('quota')) {
        console.log(`  ⏸️  遇到限流，休息 60 秒...\n`);
        await new Promise(resolve => setTimeout(resolve, 60000));
      } else {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  const avgTime = chunks.length > 0 ? (parseFloat(totalTime) / chunks.length).toFixed(1) : '0';

  console.log('\n' + '='.repeat(80));
  console.log('📊 更新统计:');
  console.log('='.repeat(80));
  console.log(`  ✅ 成功: ${successCount}`);
  console.log(`  ❌ 失败: ${failCount}`);
  console.log(`  📈 总计: ${chunks.length}`);
  console.log(`  ⏱️  总耗时: ${totalTime}秒`);
  console.log(`  📊 平均耗时: ${avgTime}秒/chunk`);

  const estimatedCost = successCount * 0.00002;
  console.log(`  💰 实际成本: ~$${estimatedCost.toFixed(6)} USD`);
  console.log('='.repeat(80));
}

updateEmbeddings()
  .then(() => {
    console.log('\n✅ 向量更新完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 向量更新失败:', error.message || error);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
