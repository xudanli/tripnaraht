/**
 * 环境配置测试脚本
 * 用于检查数据库连接和 LLM API 配置
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';

// 加载 .env 文件
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

async function testDatabaseConnection() {
  console.log('\n=== 测试数据库连接 ===');
  
  try {
    const result = await prisma.$queryRaw<Array<{ test: number }>>`
      SELECT 1 as test
    `;
    console.log('✅ 数据库连接成功');
    console.log('   测试查询结果:', result);
    return true;
  } catch (error: any) {
    console.error('❌ 数据库连接失败:', error.message);
    return false;
  }
}

async function testIcelandPlacesQuery() {
  console.log('\n=== 测试冰岛 POI 查询 ===');
  
  try {
    const count = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM "Place" p
      INNER JOIN "City" c ON p."cityId" = c.id
      WHERE c."countryCode" = 'IS'
    `;
    console.log('✅ 查询成功');
    console.log(`   冰岛 POI 总数: ${count[0]?.count || 0}`);
    
    // 查询需要翻译的数量
    const needTranslation = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM "Place" p
      INNER JOIN "City" c ON p."cityId" = c.id
      WHERE c."countryCode" = 'IS'
        AND (p."nameEN" IS NULL OR p."nameEN" = '')
        AND p."nameCN" IS NOT NULL
        AND p."nameCN" != ''
    `;
    console.log(`   需要翻译的 POI: ${needTranslation[0]?.count || 0}`);
    
    return true;
  } catch (error: any) {
    console.error('❌ 查询失败:', error.message);
    return false;
  }
}

function checkEnvVariables() {
  console.log('\n=== 检查环境变量 ===');
  
  const requiredVars = {
    'DATABASE_URL': process.env.DATABASE_URL,
    'OPENAI_API_KEY': process.env.OPENAI_API_KEY,
    'DEEPSEEK_API_KEY': process.env.DEEPSEEK_API_KEY,
    'ANTHROPIC_API_KEY': process.env.ANTHROPIC_API_KEY,
    'GEMINI_API_KEY': process.env.GEMINI_API_KEY,
  };
  
  let allOk = true;
  for (const [key, value] of Object.entries(requiredVars)) {
    if (value) {
      console.log(`✅ ${key}: 已设置 (${value.substring(0, 10)}...)`);
    } else {
      console.log(`⚠️  ${key}: 未设置`);
      if (key === 'DATABASE_URL') {
        allOk = false;
      }
    }
  }
  
  // 检查至少有一个 LLM API Key
  const hasLlmKey = requiredVars.OPENAI_API_KEY || 
                    requiredVars.DEEPSEEK_API_KEY || 
                    requiredVars.ANTHROPIC_API_KEY || 
                    requiredVars.GEMINI_API_KEY;
  
  if (!hasLlmKey) {
    console.log('⚠️  警告: 没有配置任何 LLM API Key，翻译功能将不可用');
  }
  
  return allOk && hasLlmKey;
}

async function main() {
  console.log('🔍 环境配置检查\n');
  
  // 1. 检查环境变量
  const envOk = checkEnvVariables();
  
  // 2. 测试数据库连接
  const dbOk = await testDatabaseConnection();
  
  // 3. 测试查询
  if (dbOk) {
    await testIcelandPlacesQuery();
  }
  
  // 总结
  console.log('\n=== 检查结果 ===');
  if (envOk && dbOk) {
    console.log('✅ 所有检查通过，可以运行翻译脚本');
  } else {
    console.log('❌ 部分检查失败，请修复配置后重试');
    if (!envOk) {
      console.log('   - 环境变量配置不完整');
    }
    if (!dbOk) {
      console.log('   - 数据库连接失败');
    }
  }
  
  await prisma.$disconnect();
}

main().catch(error => {
  console.error('脚本执行失败:', error);
  process.exit(1);
});
