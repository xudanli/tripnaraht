// 测试知识库检索
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

try {
  require('dotenv').config();
} catch (e) {}

async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const proxyUrl = process.env.HTTPS_PROXY || 'http://127.0.0.1:9090';

  const agent = new HttpsProxyAgent(proxyUrl);
  const client = axios.create({
    baseURL: baseUrl,
    timeout: 60000,
    httpsAgent: agent,
    httpAgent: agent,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  const response = await client.post('/embeddings', {
    model: 'text-embedding-3-small',
    input: text,
  });

  return response.data.data[0].embedding;
}

async function testRetrieval() {
  const prisma = new PrismaClient();

  try {
    console.log('🔍 测试知识库检索...\n');

    const query = '冰岛租车保险';
    console.log(`查询: "${query}"\n`);

    // 1. 生成 embedding
    console.log('1️⃣ 生成查询 embedding...');
    const queryEmbedding = await generateEmbedding(query);
    console.log(`  ✅ 维度: ${queryEmbedding.length}\n`);

    // 2. 向量检索
    console.log('2️⃣ 执行向量检索...');
    const querySql = `
      SELECT
        c.id,
        c.chunk_id,
        c.content,
        c.type,
        c.credibility_score,
        c.keywords,
        kf.filename,
        kf.category,
        1 - (c.embedding <=> $1::vector) as similarity
      FROM chunks c
      INNER JOIN knowledge_files kf ON c.file_id = kf.id
      WHERE c.embedding IS NOT NULL
      ORDER BY c.embedding <=> $1::vector
      LIMIT 5
    `;

    const results = await prisma.$queryRawUnsafe<Array<{
      id: string;
      chunk_id: string;
      content: string;
      type: string;
      credibility_score: number;
      keywords: string[];
      filename: string;
      category: string;
      similarity: number;
    }>>(querySql, JSON.stringify(queryEmbedding));

    console.log(`  ✅ 找到 ${results.length} 个结果\n`);

    // 3. 显示结果
    results.forEach((r, index) => {
      console.log(`🔹 结果 #${index + 1}:`);
      console.log(`  文件: ${r.filename} (${r.category})`);
      console.log(`  相似度: ${r.similarity.toFixed(4)}`);
      console.log(`  可信度: ${r.credibility_score}`);
      console.log(`  类型: ${r.type}`);
      console.log(`  关键词: ${r.keywords.join(', ')}`);
      console.log(`  内容预览: ${r.content.substring(0, 200)}...`);
      console.log('');
    });

    console.log('✅ 测试完成！');
  } catch (error: any) {
    console.error('❌ 测试失败:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

testRetrieval()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
