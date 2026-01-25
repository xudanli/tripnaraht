// scripts/rebuild-index-simple.ts
// 简化的索引重建脚本（使用正确的代理配置）

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

require('dotenv').config();

const prisma = new PrismaClient();
const KB_PATH = './docs/iceland';

// 创建 OpenAI 客户端（正确的代理配置）
function createOpenAIClient() {
  const proxyUrl = process.env.HTTPS_PROXY || '';
  const agent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;

  console.log(`🌐 代理配置: ${proxyUrl || '无代理'}`);

  return axios.create({
    baseURL: 'https://api.openai.com/v1',
    timeout: 60000,
    httpsAgent: agent,
    proxy: false, // 禁用 axios 内置代理，使用 httpsAgent
  });
}

async function generateEmbedding(text: string): Promise<number[]> {
  const client = createOpenAIClient();
  const apiKey = process.env.OPENAI_API_KEY?.replace(/"/g, '');

  const response = await client.post('/embeddings', {
    model: 'text-embedding-3-small',
    input: text,
  }, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
  });

  return response.data.data[0].embedding;
}

async function rebuildIndex() {
  console.log('🚀 开始重建索引\n');

  console.log('🧹 清空现有索引...');
  const deletedChunks = await prisma.chunk.deleteMany({});
  const deletedFiles = await prisma.knowledgeFile.deleteMany({});
  console.log(`  ✅ 删除 ${deletedChunks.count} 个chunks, ${deletedFiles.count} 个文件\n`);

  console.log('📂 扫描知识库文件...');
  const files: string[] = [];

  function walkDir(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.name.endsWith('.json')) {
        files.push(fullPath);
      }
    }
  }

  walkDir(KB_PATH);
  console.log(`  ✅ 找到 ${files.length} 个JSON文件\n`);

  // 索引每个文件
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < files.length; i++) {
    const filepath = files[i];
    const filename = path.basename(filepath);
    const category = path.basename(path.dirname(filepath));

    console.log(`\n[${i + 1}/${files.length}] 📝 ${filename}`);

    try {
      const content = JSON.parse(fs.readFileSync(filepath, 'utf-8'));

      // 保存文件记录
      const fileRecord = await prisma.knowledgeFile.create({
        data: {
          filename,
          filepath,
          category,
          version: '1.0.0',
          language: 'zh-CN',
          credibilityScore: 0.9,
          dataSources: ['manual'],
          lastUpdated: new Date(),
        },
      });

      // 创建分块（简化：整个文件作为一个块）
      const textContent = JSON.stringify(content, null, 2);
      const truncatedText = textContent.substring(0, 8000); // OpenAI 限制

      console.log(`  🔢 生成向量 (${truncatedText.length} 字符)...`);
      const startTime = Date.now();
      const embedding = await generateEmbedding(truncatedText);
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`  ✅ 向量生成成功 (${duration}秒, ${embedding.length}维)`);

      // 保存到数据库（使用 raw SQL 因为 embedding 是 Unsupported 类型）
      await prisma.$executeRaw`
        INSERT INTO chunks (
          id, chunk_id, content, embedding, type, credibility_score,
          keywords, file_id, metadata, created_at, updated_at
        ) VALUES (
          gen_random_uuid(),
          ${`${filename}_full`},
          ${textContent.substring(0, 10000)},
          ${JSON.stringify(embedding)}::vector,
          'full',
          0.9,
          ARRAY[]::text[],
          ${fileRecord.id}::uuid,
          '{}'::jsonb,
          NOW(),
          NOW()
        )
      `;

      console.log(`  💾 已保存到数据库`);
      successCount++;

      // 延迟避免API限流
      await new Promise(r => setTimeout(r, 500));

    } catch (error: any) {
      console.error(`  ❌ 失败: ${error.message}`);
      failCount++;
    }
  }

  console.log('\n\n✅ 索引完成！');
  console.log(`  - 成功: ${successCount}/${files.length}`);
  console.log(`  - 失败: ${failCount}/${files.length}`);
}

rebuildIndex()
  .then(() => {
    console.log('\n🎉 重建成功！');
    process.exit(0);
  })
  .catch((e) => {
    console.error('\n❌ 重建失败:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
