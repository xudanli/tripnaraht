// scripts/populate-testset-ground-truth.ts
/**
 * 自动填充测试集的 groundTruthChunkIds
 * 
 * 使用方法：
 *   npx ts-node scripts/populate-testset-ground-truth.ts
 * 
 * 功能：
 * 1. 读取测试集文件
 * 2. 对每个查询使用 Chunk 检索 API 找到相关 chunks
 * 3. 自动选择 Top-K 作为 groundTruthChunkIds
 * 4. 更新测试集文件
 */

import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as fs from 'fs/promises';
import * as path from 'path';

try {
  require('dotenv').config();
} catch (e) {}

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const proxyUrl = process.env.HTTPS_PROXY;

// 创建 axios 实例
const createClient = () => {
  const config: any = {
    baseURL: API_BASE_URL,
    timeout: 60000,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (proxyUrl && API_BASE_URL.startsWith('https://')) {
    try {
      const agent = new HttpsProxyAgent(proxyUrl);
      config.httpsAgent = agent;
      config.httpAgent = agent;
    } catch (error) {
      console.warn(`代理配置失败，将不使用代理: ${error}`);
    }
  }

  return axios.create(config);
};

const client = createClient();

interface TestCase {
  id: string;
  query: string;
  groundTruthChunkIds: string[];
  tags?: string[];
  notes?: string;
}

interface Testset {
  version: number;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  testCases: TestCase[];
}

async function populateGroundTruth() {
  try {
    console.log('🔍 开始填充测试集的 groundTruthChunkIds...\n');

    // 1. 读取测试集
    const testsetPath = path.resolve(process.cwd(), 'e2e-cases', 'rag-eval-testset.json');
    console.log(`📖 读取测试集: ${testsetPath}\n`);

    let testset: Testset;
    try {
      const content = await fs.readFile(testsetPath, 'utf-8');
      testset = JSON.parse(content);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        console.error('❌ 测试集文件不存在，请先创建测试集');
        process.exit(1);
      }
      throw error;
    }

    console.log(`找到 ${testset.testCases.length} 个测试用例\n`);

    // 2. 对每个测试用例，使用 Chunk 检索找到相关 chunks
    const updatedTestCases: TestCase[] = [];

    for (const testCase of testset.testCases) {
      console.log(`${'='.repeat(80)}`);
      console.log(`📝 测试用例: ${testCase.id}`);
      console.log(`查询: "${testCase.query}"`);
      console.log(`${'='.repeat(80)}\n`);

      try {
        // 方法1: 使用 Chunk 检索 API（向量检索）
        console.log('🔍 方法1: 使用向量检索...');
        let results: any[] = [];
        
        try {
          const response = await client.post('/api/rag/chunks/retrieve', {
            query: testCase.query,
            limit: 10,
            credibilityMin: 0.0, // 降低阈值，确保能找到所有相关 chunks
            useHybridSearch: true,
            useReranking: false,
            useQueryExpansion: false,
          });

          if (response.data.success && response.data.data) {
            results = response.data.data;
            console.log(`  ✅ 向量检索找到 ${results.length} 个相关 chunks`);
          }
        } catch (error: any) {
          console.log(`  ⚠️  向量检索失败: ${error.message}`);
        }

        // 方法2: 如果向量检索没找到结果，使用关键词匹配（find-chunks API）
        if (results.length === 0) {
          console.log('🔍 方法2: 使用关键词匹配...');
          try {
            const findResponse = await client.get('/api/rag/evaluation/testset/find-chunks', {
              params: {
                query: testCase.query,
                limit: 10,
              },
            });

            if (findResponse.data.success && findResponse.data.data.chunks) {
              // 转换格式以匹配 chunks/retrieve 的返回格式
              results = findResponse.data.data.chunks.map((chunk: any) => ({
                id: chunk.id,
                chunkId: chunk.chunkId,
                content: chunk.content,
                type: chunk.type,
                keywords: chunk.keywords,
                file: {
                  filename: chunk.filename,
                  category: chunk.category,
                },
                similarity: chunk.similarity || 0,
                hybridScore: chunk.similarity || 0,
              }));
              console.log(`  ✅ 关键词匹配找到 ${results.length} 个相关 chunks`);
            }
          } catch (error: any) {
            console.log(`  ⚠️  关键词匹配失败: ${error.message}`);
          }
        }

        if (results.length === 0) {
          console.log('  ⚠️  未找到相关 chunks，跳过此用例\n');
          updatedTestCases.push({
            ...testCase,
            groundTruthChunkIds: testCase.groundTruthChunkIds,
          });
          continue;
        }

        console.log('');

        // 显示 Top-5 结果
        console.log('📊 Top-5 检索结果:\n');
        const topResults = results.slice(0, 5);
        topResults.forEach((result: any, index: number) => {
          console.log(`${index + 1}. [相似度: ${(result.similarity || result.hybridScore || 0).toFixed(3)}] ${result.chunkId || result.id}`);
          console.log(`   ID: ${result.id}`);
          if (result.file) {
            console.log(`   文件: ${result.file.filename} (${result.file.category})`);
          }
          console.log(`   内容预览: ${result.content.substring(0, 100)}...`);
          console.log('');
        });

        // 自动选择 groundTruthChunkIds
        // 策略：
        // - 对于向量检索：选择相似度 >= 0.6 的 chunks
        // - 对于关键词匹配：选择评分 >= 5 的 chunks（关键词匹配的评分是整数）
        // - 如果都没有，至少选择 Top-2
        
        // 判断是向量检索还是关键词匹配（通过 similarity 值范围判断）
        const maxScore = Math.max(...results.map((r: any) => r.similarity || r.hybridScore || 0));
        const isVectorSearch = maxScore <= 1.0; // 向量相似度在 0-1 之间
        
        let selectedChunks: any[];
        if (isVectorSearch) {
          // 向量检索：相似度 >= 0.6
          selectedChunks = results.filter((r: any) => {
            const score = r.similarity || r.hybridScore || 0;
            return score >= 0.6;
          });
        } else {
          // 关键词匹配：评分 >= 5
          selectedChunks = results.filter((r: any) => {
            const score = r.similarity || 0;
            return score >= 5;
          });
        }

        let selectedIds: string[];
        if (selectedChunks.length > 0) {
          selectedIds = selectedChunks.map((r: any) => r.id);
          const threshold = isVectorSearch ? '0.6' : '5';
          console.log(`✅ 自动选择 ${selectedIds.length} 个 chunks（${isVectorSearch ? '相似度' : '评分'} >= ${threshold}）作为 Ground Truth:`);
        } else {
          // 如果没有高分的，至少选择 Top-2
          selectedIds = results.slice(0, 2).map((r: any) => r.id);
          console.log(`⚠️  未找到高分 chunks，选择 Top-2 作为候选:`);
        }

        selectedIds.forEach((id) => {
          const result = results.find((r: any) => r.id === id);
          const score = result ? (result.similarity || result.hybridScore || 0) : 0;
          console.log(`   - ${id} (相似度: ${score.toFixed(3)})`);
        });
        console.log('');

        updatedTestCases.push({
          ...testCase,
          groundTruthChunkIds: selectedIds,
        });
      } catch (error: any) {
        console.error(`❌ 处理测试用例失败: ${error.message}`);
        if (error.response) {
          console.error('响应状态:', error.response.status);
          console.error('响应数据:', JSON.stringify(error.response.data, null, 2));
        }
        updatedTestCases.push({
          ...testCase,
          groundTruthChunkIds: testCase.groundTruthChunkIds,
        });
      }
    }

    // 3. 更新测试集文件
    const updatedTestset: Testset = {
      ...testset,
      updatedAt: new Date().toISOString(),
      testCases: updatedTestCases,
    };

    // 备份原文件
    try {
      const backupPath = testsetPath + '.backup.' + Date.now();
      await fs.copyFile(testsetPath, backupPath);
      console.log(`💾 已备份原文件到: ${backupPath}\n`);
    } catch (error: any) {
      // 文件不存在，跳过备份
    }

    // 确保目录存在
    const dir = path.dirname(testsetPath);
    await fs.mkdir(dir, { recursive: true });

    // 保存更新后的文件
    await fs.writeFile(testsetPath, JSON.stringify(updatedTestset, null, 2), 'utf-8');
    console.log(`✅ 已更新测试集文件: ${testsetPath}`);
    console.log(`\n📊 更新摘要:`);
    updatedTestCases.forEach((tc) => {
      console.log(`   ${tc.id}: ${tc.groundTruthChunkIds.length} 个 Ground Truth chunks`);
      if (tc.groundTruthChunkIds.length > 0) {
        tc.groundTruthChunkIds.forEach((id) => console.log(`      - ${id}`));
      }
    });

    console.log('\n🎉 完成！现在可以运行评估了：');
    console.log('   POST /api/rag/evaluation/testset/run');
  } catch (error: any) {
    console.error(`❌ 错误: ${error.message}`, error.stack);
    process.exit(1);
  }
}

// 运行脚本
populateGroundTruth();
