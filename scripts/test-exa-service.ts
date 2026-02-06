/**
 * 测试 Exa MCP 服务
 */

import * as dotenv from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ExaService } from '../src/mcp/exa.service';

dotenv.config();

async function testExaService() {
  console.log('🧪 测试 Exa MCP 服务\n');
  console.log('============================================================\n');

  const app = await NestFactory.createApplicationContext(AppModule);
  const exaService = app.get(ExaService);

  try {
    // 1. 检查连接状态
    console.log('1️⃣ 检查连接状态...\n');
    const status = await exaService.checkConnectionStatus();
    console.log('✅ 连接状态:', status);
    console.log();

    if (!status.hasApiKey) {
      console.log('⚠️  警告: 未设置 EXA_API_KEY 环境变量');
      console.log('   获取 API Key: https://dashboard.exa.ai/api-keys\n');
    }

    // 2. 列出工具
    console.log('2️⃣ 列出可用工具...\n');
    const tools = await exaService.listTools();
    console.log(`✅ 找到 ${tools.length} 个工具:`);
    tools.forEach((tool, index) => {
      console.log(`   ${index + 1}. ${tool.name}: ${tool.description || '无描述'}`);
    });
    console.log();

    // 3. 测试 Web 搜索
    console.log('3️⃣ 测试 Web 搜索...\n');
    try {
      const searchResult = await exaService.webSearch('latest AI developments', {
        numResults: 3,
      });
      console.log('✅ Web 搜索成功');
      console.log('结果:', JSON.stringify(searchResult, null, 2).substring(0, 500) + '...');
    } catch (error: any) {
      console.log('❌ Web 搜索失败:', error.message);
    }
    console.log();

    // 4. 测试代码上下文搜索
    console.log('4️⃣ 测试代码上下文搜索...\n');
    try {
      const codeResult = await exaService.getCodeContext('React hooks useState example', {
        numResults: 2,
      });
      console.log('✅ 代码上下文搜索成功');
      console.log('结果:', JSON.stringify(codeResult, null, 2).substring(0, 500) + '...');
    } catch (error: any) {
      console.log('❌ 代码上下文搜索失败:', error.message);
    }
    console.log();

    // 5. 测试公司研究
    console.log('5️⃣ 测试公司研究...\n');
    try {
      const companyResult = await exaService.companyResearch('OpenAI', {
        numResults: 3,
      });
      console.log('✅ 公司研究成功');
      console.log('结果:', JSON.stringify(companyResult, null, 2).substring(0, 500) + '...');
    } catch (error: any) {
      console.log('❌ 公司研究失败:', error.message);
    }
    console.log();

    console.log('✅ 测试完成');
  } catch (error: any) {
    console.error('❌ 测试失败:', error);
  } finally {
    await app.close();
  }
}

testExaService().catch(console.error);
