// scripts/rebuild-index-final.ts
// 最终版本：使用原始 SQL 插入向量

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

require('dotenv').config();

const prisma = new PrismaClient();
const KB_PATH = './docs/iceland';

// 创建 OpenAI 客户端
function createOpenAIClient() {
  const proxyUrl = process.env.HTTPS_PROXY || '';
  const agent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;

  return axios.create({
    baseURL: 'https://api.openai.com/v1',
    timeout: 60000,
    httpsAgent: agent,
    proxy: false,
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
  await prisma.$executeRaw`DELETE FROM chunks`;
  await prisma.$executeRaw`DELETE FROM knowledge_files`;
  console.log('  ✅ 已清空\n');

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

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < files.length; i++) {
    const filepath = files[i];
    const filename = path.basename(filepath);
    const category = path.basename(path.dirname(filepath));

    console.log(`\n[${i + 1}/${files.length}] 📝 ${filename}`);

    try {
      const content = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
      const textContent = JSON.stringify(content, null, 2);
      const truncatedText = textContent.substring(0, 8000);

      // 1. 保存文件记录（使用原始 SQL）
      const fileId = await prisma.$queryRaw<Array<{ id: string }>>`
        INSERT INTO knowledge_files (
          id, filename, filepath, category, version, language,
          credibility_score, data_sources, last_updated, created_at, updated_at
        ) VALUES (
          gen_random_uuid(),
          ${filename},
          ${filepath},
          ${category},
          '1.0.0',
          'zh-CN',
          0.9,
          ARRAY['manual'],
          NOW(),
          NOW(),
          NOW()
        )
        RETURNING id
      `.then(rows => rows[0].id);

      console.log(`  💾 文件记录已保存: ${fileId}`);

      // 2. 生成向量
      console.log(`  🔢 生成向量 (${truncatedText.length} 字符)...`);
      const startTime = Date.now();
      const embedding = await generateEmbedding(truncatedText);
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`  ✅ 向量生成成功 (${duration}秒, ${embedding.length}维)`);

      // 3. 保存分块（使用原始 SQL，直接插入向量）
      const chunkId = `${filename}_full`;
      const contentTruncated = textContent.substring(0, 10000);

      await prisma.$executeRaw`
        INSERT INTO chunks (
          id, chunk_id, content, embedding, type, credibility_score,
          keywords, file_id, metadata, created_at, updated_at
        ) VALUES (
          gen_random_uuid(),
          ${chunkId},
          ${contentTruncated},
          ${JSON.stringify(embedding)}::vector(1536),
          'full',
          0.9,
          ARRAY[]::text[],
          ${fileId}::uuid,
          '{}'::jsonb,
          NOW(),
          NOW()
        )
      `;

      console.log(`  💾 分块已保存`);
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
