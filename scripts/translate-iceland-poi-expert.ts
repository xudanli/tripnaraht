/**
 * 冰岛 POI 专业翻译脚本
 * 
 * 使用「冰岛 POI 翻译专家」角色进行标准化翻译
 * 遵循 prompts/agents/Iceland POI.md 中的翻译规范
 * 
 * 使用方法：
 *   tsx scripts/translate-iceland-poi-expert.ts [--dry-run] [--batch-size=20] [--limit=100]
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import axios from 'axios';
import https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';

// 加载 .env 文件
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

// 配置
const DEFAULT_BATCH_SIZE = 20; // 较小批次，因为需要详细翻译
const DEFAULT_LIMIT = 100;

// 读取专家角色提示词
function getExpertPrompt(): string {
  const promptPath = path.resolve(__dirname, '../prompts/agents/Iceland POI.md');
  return fs.readFileSync(promptPath, 'utf-8');
}

// 获取 LLM 配置
function getLlmConfig() {
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (deepseekKey) {
    return {
      provider: 'deepseek',
      apiKey: deepseekKey,
      baseUrl: 'https://api.deepseek.com/v1',
    };
  }
  
  if (openaiKey) {
    return {
      provider: 'openai',
      apiKey: openaiKey,
      baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    };
  }

  if (anthropicKey) {
    return {
      provider: 'anthropic',
      apiKey: anthropicKey,
      baseUrl: 'https://api.anthropic.com/v1',
    };
  }

  throw new Error('未找到任何 LLM API Key');
}

// 翻译结果接口
interface TranslationResult {
  id: string;
  name_original: string;
  nameEN: string;
  nameCN: string;
  aliasesEN?: string[];
  aliasesCN?: string[];
  translation_method: 'OFFICIAL_TRANSLATION' | 'SEMANTIC_TRANSLATION' | 'PHONETIC_TRANSLATION' | 'HYBRID' | 'KEEP_ORIGINAL';
  explanation?: string;
  translation_confidence: number;
  audit?: {
    assumptions?: string[];
    uncertainties?: string[];
    sources_consulted?: string[];
  };
}

/**
 * 使用专家角色翻译单个 POI
 */
async function translatePOI(
  place: {
    id: number;
    nameCN: string | null;
    nameEN: string | null;
    category: string;
    metadata: any;
  },
  config: ReturnType<typeof getLlmConfig>,
  expertPrompt: string
): Promise<TranslationResult> {
  // 构建输入数据
  const originalName = place.nameCN || place.nameEN || 'Unknown';
  const category = place.category;
  const metadataType = place.metadata?.type || '';
  
  const inputData = {
    nameOriginal: originalName,
    nameEN: place.nameEN || '',
    nameCN: place.nameCN || '',
    category: category,
    metadata_type: metadataType,
    countryCode: 'IS',
    source: place.metadata?.source || 'unknown',
  };

  // 构建完整的提示词
  const fullPrompt = `${expertPrompt}

================
当前 POI 数据
================
${JSON.stringify(inputData, null, 2)}

请按照上述规范，为这个 POI 生成标准化的英文名和中文名。
必须严格按照输出格式返回 JSON，不要包含任何其他解释。`;

  try {
    let response: string;

    if (config.provider === 'deepseek' || config.provider === 'openai') {
      const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.ALL_PROXY;
      const httpsAgent = proxyUrl
        ? new HttpsProxyAgent(proxyUrl)
        : new https.Agent({ keepAlive: true, family: 4 });

      const apiResponse = await axios.post(
        `${config.baseUrl}/chat/completions`,
        {
          model: config.provider === 'deepseek' ? 'deepseek-chat' : 'gpt-4o',
          messages: [
            { role: 'system', content: 'You are a professional Iceland POI translation expert. Always respond with valid JSON only.' },
            { role: 'user', content: fullPrompt }
          ],
          temperature: 0.3,
          max_tokens: 1000,
          response_format: { type: 'json_object' },
        },
        {
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
          },
          httpsAgent,
          timeout: 60000,
        }
      );

      response = apiResponse.data.choices[0]?.message?.content || '';
    } else if (config.provider === 'anthropic') {
      const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.ALL_PROXY;
      const httpsAgent = proxyUrl
        ? new HttpsProxyAgent(proxyUrl)
        : new https.Agent({ keepAlive: true, family: 4 });

      const apiResponse = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 1000,
          messages: [
            { role: 'user', content: fullPrompt }
          ],
        },
        {
          headers: {
            'x-api-key': config.apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          httpsAgent,
          timeout: 60000,
        }
      );

      response = apiResponse.data.content[0]?.text || '';
    } else {
      throw new Error(`不支持的 LLM provider: ${config.provider}`);
    }

    // 解析 JSON 响应
    let result: TranslationResult;
    try {
      // 尝试提取 JSON（可能包含 markdown 代码块）
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) || response.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : response;
      result = JSON.parse(jsonStr);
    } catch (parseError) {
      throw new Error(`JSON 解析失败: ${parseError}. 响应: ${response.substring(0, 200)}`);
    }

    // 验证必需字段
    if (!result.nameEN || !result.nameCN) {
      throw new Error(`翻译结果缺少必需字段: nameEN=${result.nameEN}, nameCN=${result.nameCN}`);
    }

    // 确保 id 正确
    result.id = place.id.toString();

    return result;
  } catch (error: any) {
    throw new Error(`翻译失败: ${error?.message || String(error)}`);
  }
}

/**
 * 批量翻译 Place
 */
async function translateBatch(
  places: Array<{
    id: number;
    nameCN: string | null;
    nameEN: string | null;
    category: string;
    metadata: any;
  }>,
  config: ReturnType<typeof getLlmConfig>,
  expertPrompt: string,
  batchSize: number = 20,
  delayMs: number = 500,
  isDryRun: boolean = false
): Promise<{
  total: number;
  success: number;
  failed: number;
  errors: Array<{ placeId: number; error: string }>;
}> {
  let success = 0;
  let failed = 0;
  const errors: Array<{ placeId: number; error: string }> = [];

  console.log(`\n开始批量翻译，共 ${places.length} 个 Place`);
  console.log(`批量大小: ${batchSize}, 延迟: ${delayMs}ms\n`);

  // 分批处理
  for (let i = 0; i < places.length; i += batchSize) {
    const batch = places.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(places.length / batchSize);

    console.log(`处理批次 ${batchNum}/${totalBatches} (${batch.length} 个 Place)...`);

    // 串行处理当前批次
    for (const place of batch) {
      try {
        const originalName = place.nameCN || place.nameEN || 'Unknown';
        console.log(`  Place ${place.id}: "${originalName}"`);

        // 翻译
        const translation = await translatePOI(place, config, expertPrompt);
        
        console.log(`    -> nameEN: "${translation.nameEN}"`);
        console.log(`    -> nameCN: "${translation.nameCN}"`);
        console.log(`    -> method: ${translation.translation_method}, confidence: ${translation.translation_confidence}`);

        // 更新数据库
        if (isDryRun) {
          console.log(`  [DRY-RUN] 将更新数据`);
        } else {
          // 构建更新数据
          const updateData: any = {
            nameEN: translation.nameEN,
            nameCN: translation.nameCN,
            updatedAt: new Date(),
          };

          // 更新 metadata，添加翻译信息
          const currentMetadata = place.metadata || {};
          const newMetadata = {
            ...currentMetadata,
            translation: {
              method: translation.translation_method,
              confidence: translation.translation_confidence,
              explanation: translation.explanation,
              aliasesEN: translation.aliasesEN || [],
              aliasesCN: translation.aliasesCN || [],
              audit: translation.audit || {},
              translatedAt: new Date().toISOString(),
            },
          };
          updateData.metadata = newMetadata;

          await prisma.place.update({
            where: { id: place.id },
            data: updateData,
          });
        }

        success++;
      } catch (error: any) {
        console.log(`  ✗ Place ${place.id}: 失败 - ${error.message}`);
        failed++;
        errors.push({
          placeId: place.id,
          error: error?.message || String(error),
        });
      }

      // 延迟，避免 API 限流
      if (i + batchSize < places.length || place !== batch[batch.length - 1]) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    // 批次间延迟
    if (i + batchSize < places.length) {
      console.log(`  等待 ${delayMs}ms...\n`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return {
    total: places.length,
    success,
    failed,
    errors,
  };
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const batchSizeArg = args.find(arg => arg.startsWith('--batch-size='));
  const limitArg = args.find(arg => arg.startsWith('--limit='));

  const batchSize = batchSizeArg
    ? parseInt(batchSizeArg.split('=')[1], 10)
    : DEFAULT_BATCH_SIZE;
  const limit = limitArg
    ? parseInt(limitArg.split('=')[1], 10)
    : DEFAULT_LIMIT;

  console.log('=== 冰岛 POI 专业翻译脚本 ===\n');
  console.log(`模式: ${isDryRun ? 'DRY-RUN（仅预览）' : '执行模式'}`);
  console.log(`批次大小: ${batchSize}`);
  console.log(`处理限制: ${limit}\n`);

  try {
    // 1. 读取专家角色提示词
    console.log('加载专家角色提示词...');
    const expertPrompt = getExpertPrompt();
    console.log('✓ 提示词加载完成\n');

    // 2. 获取 LLM 配置
    console.log('检查 LLM 配置...');
    const llmConfig = getLlmConfig();
    console.log(`✓ 使用 ${llmConfig.provider} API\n`);

    // 3. 测试数据库连接
    console.log('测试数据库连接...');
    await prisma.$connect();
    console.log('✓ 数据库连接正常\n');

    // 4. 查询需要翻译的冰岛 Place
    console.log('查询需要翻译的冰岛 Place...');
    
    // 统计所有冰岛Place
    const totalCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM "Place" p
      INNER JOIN "City" c ON p."cityId" = c.id
      WHERE c."countryCode" = 'IS'
    `;
    console.log(`  冰岛 Place 总数: ${totalCount[0]?.count || 0}`);

    // 查询需要翻译的Place：至少有一个名称，但另一个为空或需要更新
    // 优先翻译有nameCN但nameEN为空的，以及有nameEN但nameCN为空的
    const icelandPlaces = await prisma.$queryRaw<Array<{
      id: number;
      nameCN: string | null;
      nameEN: string | null;
      category: string;
      metadata: any;
    }>>`
      SELECT 
        p.id,
        p."nameCN",
        p."nameEN",
        p.category,
        p.metadata
      FROM "Place" p
      INNER JOIN "City" c ON p."cityId" = c.id
      WHERE c."countryCode" = 'IS'
        AND (
          (p."nameCN" IS NOT NULL AND p."nameCN" != '' AND (p."nameEN" IS NULL OR p."nameEN" = ''))
          OR (p."nameEN" IS NOT NULL AND p."nameEN" != '' AND (p."nameCN" IS NULL OR p."nameCN" = ''))
          OR (p."nameCN" IS NOT NULL AND p."nameCN" != '' AND p."nameEN" IS NOT NULL AND p."nameEN" != '')
        )
      ORDER BY 
        CASE 
          WHEN p."nameCN" IS NOT NULL AND p."nameCN" != '' AND (p."nameEN" IS NULL OR p."nameEN" = '') THEN 1
          WHEN p."nameEN" IS NOT NULL AND p."nameEN" != '' AND (p."nameCN" IS NULL OR p."nameCN" = '') THEN 2
          ELSE 3
        END,
        p.id
      LIMIT ${limit}
    `;

    console.log(`✓ 找到 ${icelandPlaces.length} 个需要翻译的 Place\n`);

    if (icelandPlaces.length === 0) {
      console.log('没有需要翻译的 Place。');
      return;
    }

    // 5. 批量翻译
    const delayMs = parseInt(process.env.DELAY_MS || '500', 10);

    const results = await translateBatch(
      icelandPlaces,
      llmConfig,
      expertPrompt,
      batchSize,
      delayMs,
      isDryRun
    );

    // 6. 显示结果统计
    console.log('\n=== 翻译完成 ===');
    console.log(`总计: ${results.total}`);
    console.log(`成功: ${results.success} (${(results.success / results.total * 100).toFixed(1)}%)`);
    console.log(`失败: ${results.failed} (${(results.failed / results.total * 100).toFixed(1)}%)`);

    if (results.errors.length > 0) {
      console.log('\n失败详情（前 10 个）:');
      results.errors.slice(0, 10).forEach(err => {
        console.log(`  - Place ${err.placeId}: ${err.error}`);
      });
      if (results.errors.length > 10) {
        console.log(`  ... 还有 ${results.errors.length - 10} 个错误`);
      }
    }

  } catch (error: any) {
    console.error('\n❌ 脚本执行失败:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 运行脚本
if (require.main === module) {
  main().catch(error => {
    console.error('未处理的错误:', error);
    process.exit(1);
  });
}

export { main };
