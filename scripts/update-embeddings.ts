// scripts/update-embeddings.ts
// 更新已索引 chunks 的 embedding 向量

import { PrismaClient } from '@prisma/client';
import axios from 'axios';

try {
  require('dotenv').config();
} catch (e) {}

const prisma = new PrismaClient();

// 创建 OpenAI HTTP 客户端
function createOpenAIClient(useProxy: boolean = true) {
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const proxyUrl = process.env.HTTP_PROXY || 'http://127.0.0.1:9090'; // 默认使用本地代理
  
  const config: any = {
    baseURL: baseUrl,
    timeout: 600000, // 10 分钟超时（因为网络可能很慢）
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    // 增加重试和超时配置
    maxRedirects: 5,
    validateStatus: (status: number) => status < 500, // 不抛出 4xx 错误
  };

  // 如果启用代理，使用代理配置
  if (useProxy) {
    // 解析代理 URL
    const proxyMatch = proxyUrl.match(/^https?:\/\/([^:]+):(\d+)/);
    if (proxyMatch) {
      config.proxy = {
        host: proxyMatch[1],
        port: parseInt(proxyMatch[2]),
        protocol: proxyUrl.startsWith('https') ? 'https' : 'http',
      };
    } else {
      // 默认配置
      config.proxy = {
        host: '127.0.0.1',
        port: 9090,
        protocol: 'http',
      };
    }
  } else {
    // 明确不使用代理
    config.proxy = false;
  }

  return axios.create(config);
}

async function generateEmbedding(
  client: any, 
  text: string, 
  retries: number = 3,
  useProxy: boolean = true
): Promise<number[]> {
  // 截断文本以避免 token 限制
  const truncatedText = text.substring(0, 8000);
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const startTime = Date.now();
      const response = await client.post('/embeddings', {
        model: 'text-embedding-3-small',
        input: truncatedText,
      });

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      
      // 调试：检查响应结构
      if (!response.data) {
        console.log(`    ⚠️  响应无数据:`, JSON.stringify(response).substring(0, 200));
        throw new Error('Response has no data');
      }
      
      if (!response.data.data || !Array.isArray(response.data.data)) {
        console.log(`    ⚠️  响应格式错误:`, JSON.stringify(response.data).substring(0, 300));
        throw new Error('Invalid response structure');
      }
      
      if (response.data.data.length === 0) {
        console.log(`    ⚠️  响应数组为空`);
        throw new Error('Empty embedding array');
      }
      
      const embedding = response.data.data[0]?.embedding;
      if (!embedding || !Array.isArray(embedding)) {
        console.log(`    ⚠️  embedding 格式错误:`, typeof embedding);
        throw new Error('Invalid embedding format');
      }
      
      console.log(`    ⏱️  耗时: ${duration}秒，向量维度: ${embedding.length}`);
      return embedding;
    } catch (error: any) {
      const errorCode = error.code || '';
      const errorMsg = error.message || String(error);
      const isTimeout = errorCode === 'ECONNABORTED' || 
                       errorMsg.includes('timeout') ||
                       errorMsg.includes('exceeded');
      
      if (isTimeout && attempt < retries) {
        const waitTime = attempt * 30; // 递增等待时间
        console.log(`    ⚠️  超时 (尝试 ${attempt}/${retries})，等待 ${waitTime} 秒后重试...`);
        await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
        continue;
      }
      
      // 如果是网络错误且使用了代理，尝试不使用代理
      const isNetworkError = errorCode === 'ECONNRESET' || 
                             errorCode === 'ECONNREFUSED' || 
                             errorCode === 'ETIMEDOUT' ||
                             errorMsg.includes('socket');
      
      if (isNetworkError && useProxy && attempt >= 2) {
        console.log(`    🔄 代理连接失败，尝试直接连接...`);
        const directClient = createOpenAIClient(false);
        try {
          const response = await directClient.post('/embeddings', {
            model: 'text-embedding-3-small',
            input: truncatedText,
          });
          if (response.data?.data?.[0]?.embedding) {
            console.log(`    ✅ 直接连接成功`);
            return response.data.data[0].embedding;
          }
        } catch (directError: any) {
          // 直接连接也失败，继续重试或抛出错误
          if (attempt < retries) {
            console.log(`    ⚠️  直接连接也失败，继续重试...`);
            continue;
          }
        }
      }
      
      throw error;
    }
  }
  
  throw new Error('All retry attempts failed');
}

async function updateEmbeddings() {
  console.log('🔢 开始更新 chunks embedding...\n');
  const proxyUrl = process.env.HTTP_PROXY || 'http://127.0.0.1:9090';
  console.log('📡 使用代理:', proxyUrl);
  console.log('⏱️  超时设置: 10 分钟\n');

  const client = createOpenAIClient();

  // 获取所有需要更新的 chunks（当前为零向量或 null 的）
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

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`[${i + 1}/${chunks.length}] 处理: ${chunk.chunk_id.substring(0, 50)}...`);

    try {
      const useProxy = !!process.env.HTTP_PROXY;
      const embedding = await generateEmbedding(client, chunk.content, 3, useProxy);
      
      await prisma.$executeRaw`
        UPDATE chunks 
        SET embedding = ${JSON.stringify(embedding)}::vector,
            updated_at = NOW()
        WHERE id = ${chunk.id}::uuid
      `;

      console.log(`  ✅ 成功 (${successCount + 1}/${chunks.length})`);
      successCount++;

      // 每 3 个请求休息一下，避免限流
      if ((i + 1) % 3 === 0 && i + 1 < chunks.length) {
        console.log(`  ⏸️  休息 3 秒...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

    } catch (error: any) {
      const errorMsg = error.message || String(error);
      const errorCode = error.code || '';
      console.log(`  ❌ 失败: ${errorMsg.substring(0, 100)}${errorCode ? ` (${errorCode})` : ''}`);
      failCount++;

      // 如果遇到限流，等待更长时间
      if (errorMsg.includes('rate') || errorMsg.includes('429') || errorMsg.includes('quota')) {
        console.log(`  ⏸️  遇到限流，休息 60 秒...`);
        await new Promise(resolve => setTimeout(resolve, 60000));
      } else if (errorMsg.includes('timeout') || errorCode === 'ECONNABORTED') {
        // 超时后等待更长时间
        console.log(`  ⏸️  超时，休息 30 秒...`);
        await new Promise(resolve => setTimeout(resolve, 30000));
      } else if (errorCode === 'ECONNRESET' || errorCode === 'ECONNREFUSED') {
        // 连接重置或拒绝，可能是代理问题，等待后重试
        console.log(`  ⏸️  连接问题，休息 10 秒后重试...`);
        await new Promise(resolve => setTimeout(resolve, 10000));
      } else {
        // 其他错误，短暂等待
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  console.log('\n📊 更新统计:');
  console.log(`  - 成功: ${successCount}`);
  console.log(`  - 失败: ${failCount}`);
  console.log(`  - 总计: ${chunks.length}`);
}

updateEmbeddings()
  .then(() => {
    console.log('\n✅ 向量更新完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 向量更新失败:', error);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
