/**
 * 将 RAG 文档的 embedding 从 1024 维迁移到 1536 维（OpenAI）
 * 
 * 解决向量维度不匹配问题：
 * - 旧文档：1024 维
 * - 新文档：1536 维（text-embedding-3-small）
 * 
 * 统一使用 OpenAI 1536 维
 */

import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();
const API_BASE_URL = process.env.API_BASE_URL || 'http://127.0.0.1:3000';

/**
 * 检查文档的向量维度
 */
function getVectorDimension(embeddingStr: string): number {
  // PostgreSQL vector 格式: [0.1,0.2,0.3,...]
  const values = embeddingStr.replace(/[\[\]]/g, '').split(',');
  return values.length;
}

/**
 * 重新生成文档的 embedding
 */
async function regenerateEmbedding(docId: string, title: string, content: string): Promise<void> {
  try {
    console.log(`🔄 重新生成文档 embedding: ${title.substring(0, 50)}...`);
    
    // 调用 embedding API（通过内部服务）
    // 注意：这里需要直接调用 EmbeddingService，但由于是脚本，我们通过 RAG 更新接口
    const textToEmbed = `${title}\n\n${content}`;
    
    // 使用 OpenAI API 生成 embedding（1536维）
    const response = await axios.post(
      `${API_BASE_URL}/api/rag/documents/${docId}`,
      {
        content: content, // 更新内容会触发重新生成 embedding
      },
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );
    
    if (response.data.success) {
      console.log(`✅ 文档 embedding 已更新`);
    } else {
      throw new Error('更新失败');
    }
  } catch (error: any) {
    console.error(`❌ 更新失败: ${error.message}`);
    throw error;
  }
}

/**
 * 通过 RAG API 更新文档（会触发重新生成 embedding）
 */
async function updateDocumentViaAPI(docId: string, title: string, content: string): Promise<void> {
  try {
    // 通过更新内容来触发重新生成 embedding
    // 注意：即使内容相同，也会重新生成 embedding（使用当前配置的模型）
    const response = await axios.put(
      `${API_BASE_URL}/api/rag/documents/${docId}`,
      {
        title: title,
        content: content, // 更新内容会触发重新生成 embedding
      },
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );

    if (response.data.success) {
      console.log(`✅ 文档 embedding 已更新`);
    } else {
      throw new Error(response.data.error?.message || '更新失败');
    }
  } catch (error: any) {
    if (error.response) {
      throw new Error(`API 错误: ${error.response.data.error?.message || error.response.statusText}`);
    }
    throw error;
  }
}

/**
 * 直接更新数据库中的 embedding（使用 OpenAI API）
 */
async function updateEmbeddingDirectly(docId: string, title: string, content: string): Promise<void> {
  try {
    // 调用 OpenAI API 生成 embedding
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY 未设置');
    }

    const textToEmbed = `${title}\n\n${content}`;
    
    // 使用代理配置
    const https = require('https');
    const { HttpsProxyAgent } = require('https-proxy-agent');
    const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy;
    
    const axiosConfig: any = {
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
    };

    if (proxyUrl) {
      axiosConfig.httpsAgent = new HttpsProxyAgent(proxyUrl);
      axiosConfig.proxy = false;
    }
    
    const response = await axios.post(
      'https://api.openai.com/v1/embeddings',
      {
        model: 'text-embedding-3-small',
        input: textToEmbed,
      },
      axiosConfig
    );

    const embedding = response.data.data[0].embedding;
    const embeddingStr = `[${embedding.join(',')}]`;

    // 更新数据库
    await prisma.$executeRaw`
      UPDATE document_index
      SET embedding = ${embeddingStr}::vector,
          updated_at = NOW()
      WHERE id = ${docId}::uuid
    `;

    console.log(`✅ 文档 ${docId.substring(0, 8)}... embedding 已更新为 1536 维`);
  } catch (error: any) {
    console.error(`❌ 更新失败: ${error.message}`);
    throw error;
  }
}

async function migrateEmbeddings() {
  try {
    console.log('🔍 检查需要迁移的文档...\n');

    // 查找所有 1024 维的文档
    const docs1024 = await prisma.$queryRaw<Array<{
      id: string;
      title: string;
      content: string;
      embedding_text: string;
    }>>`
      SELECT 
        id,
        title,
        content,
        embedding::text as embedding_text
      FROM document_index
      WHERE embedding IS NOT NULL
      AND array_length(string_to_array(embedding::text, ','), 1) = 1024
      ORDER BY created_at
    `;

    console.log(`找到 ${docs1024.length} 个需要迁移的文档（1024维）\n`);

    if (docs1024.length === 0) {
      console.log('✅ 没有需要迁移的文档');
      return;
    }

    // 逐个迁移
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < docs1024.length; i++) {
      const doc = docs1024[i];
      console.log(`\n[${i + 1}/${docs1024.length}] 处理: ${doc.title.substring(0, 50)}...`);
      
      try {
        // 使用直接更新方式（更快，不依赖 RAG API）
        await updateEmbeddingDirectly(doc.id, doc.title, doc.content);
        successCount++;
        
        // 添加延迟，避免 API 速率限制
        if (i < docs1024.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500)); // 0.5秒延迟
        }
      } catch (error: any) {
        console.error(`  失败: ${error.message}`);
        failCount++;
        
        // 如果失败，尝试使用 API 方式
        try {
          console.log(`  尝试使用 API 方式更新...`);
          await updateDocumentViaAPI(doc.id, doc.title, doc.content);
          successCount++;
          failCount--;
        } catch (apiError: any) {
          console.error(`  API 方式也失败: ${apiError.message}`);
        }
      }
    }

    console.log(`\n✅ 迁移完成:`);
    console.log(`   成功: ${successCount} 个`);
    console.log(`   失败: ${failCount} 个`);

    // 验证迁移结果
    console.log(`\n🔍 验证迁移结果...`);
    const result = await prisma.$queryRaw<Array<{ dimension: number; count: bigint }>>`
      SELECT 
        array_length(string_to_array(embedding::text, ','), 1) as dimension,
        COUNT(*) as count
      FROM document_index
      WHERE embedding IS NOT NULL
      GROUP BY dimension
      ORDER BY dimension
    `;

    console.log('\n向量维度分布:');
    result.forEach(r => {
      console.log(`  ${r.dimension}维: ${Number(r.count)} 个文档`);
    });

  } catch (error: any) {
    console.error('❌ 迁移失败:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 运行迁移
migrateEmbeddings();
