// 调试检索问题
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

try {
  require('dotenv').config();
} catch (e) {}

async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY?.replace(/"/g, '');
  const proxyUrl = process.env.HTTPS_PROXY || 'http://127.0.0.1:9090';

  const agent = new HttpsProxyAgent(proxyUrl);
  const client = axios.create({
    baseURL: 'https://api.openai.com/v1',
    timeout: 60000,
    httpsAgent: agent,
    proxy: false,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  });

  const response = await client.post('/embeddings', {
    model: 'text-embedding-3-small',
    input: text
  });

  return response.data.data[0].embedding;
}

async function debugRetrieval() {
  const prisma = new PrismaClient();

  try {
    console.log('🔍 调试 RAG 检索问题...\n');

    const query = '冰岛租车保险';
    console.log(`查询: "${query}"\n`);

    // 1. 生成 embedding
    console.log('1️⃣ 生成查询 embedding...');
    const queryEmbedding = await generateEmbedding(query);
    console.log(`  ✅ 维度: ${queryEmbedding.length}\n`);

    // 2. 检查数据库中的分块数量
    console.log('2️⃣ 检查数据库...');
    const totalChunks = await prisma.chunk.count();
    const chunksWithEmbedding = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*) as count FROM chunks WHERE embedding IS NOT NULL`
    );
    console.log(`  - 总分块数: ${totalChunks}`);
    console.log(`  - 有向量的分块: ${Number(chunksWithEmbedding[0]?.count || 0)}\n`);

    // 3. 执行向量检索（不加相似度过滤）
    console.log('3️⃣ 执行向量检索（前 5 个结果）...');
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

    // 4. 显示结果
    console.log('📊 检索结果:\n');
    results.forEach((r, index) => {
      console.log(`🔹 结果 #${index + 1}:`);
      console.log(`  文件: ${r.filename} (${r.category})`);
      console.log(`  类型: ${r.type}`);
      console.log(`  相似度: ${r.similarity.toFixed(4)} ${r.similarity >= 0.5 ? '✅' : '⚠️  (低于阈值 0.5)'}`);
      console.log(`  可信度: ${r.credibility_score}`);
      console.log(`  关键词: ${r.keywords.join(', ')}`);
      console.log(`  内容预览: ${r.content.substring(0, 150)}...`);
      console.log('');
    });

    // 5. 检查过滤逻辑
    console.log('🔍 分析:');
    const filteredBySimilarity = results.filter(r => parseFloat(String(r.similarity)) >= 0.5);
    console.log(`  - 相似度 >= 0.5 的结果: ${filteredBySimilarity.length}`);

    const filteredByCredibility = results.filter(r => parseFloat(String(r.credibility_score)) >= 0.5);
    console.log(`  - 可信度 >= 0.5 的结果: ${filteredByCredibility.length}`);

    console.log('\n✅ 调试完成！');
  } catch (error: any) {
    console.error('❌ 调试失败:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

debugRetrieval()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
