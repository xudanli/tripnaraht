/**
 * 直接测试 Exa MCP 客户端（不依赖 NestJS 应用上下文）
 */

import * as dotenv from 'dotenv';
import { ExaMcpClient } from '../src/mcp/exa-client';

dotenv.config();

async function testExaDirect() {
  console.log('🧪 直接测试 Exa MCP 客户端\n');
  console.log('============================================================\n');

  const client = new ExaMcpClient();

  try {
    // 1. 检查 API Key
    console.log('1️⃣ 检查 API Key 配置...\n');
    const apiKey = process.env.EXA_API_KEY;
    if (apiKey) {
      console.log(`✅ EXA_API_KEY 已设置: ${apiKey.substring(0, 10)}...`);
    } else {
      console.log('⚠️  警告: 未设置 EXA_API_KEY 环境变量');
      console.log('   获取 API Key: https://dashboard.exa.ai/api-keys');
      console.log('   注意: 没有 API Key 也可以使用，但会有速率限制\n');
    }
    console.log();

    // 2. 连接到服务器
    console.log('2️⃣ 连接到 Exa MCP 服务器...\n');
    await client.connect();
    console.log('✅ 连接成功\n');

    // 3. 列出工具
    console.log('3️⃣ 列出可用工具...\n');
    const tools = await client.listTools();
    console.log(`✅ 找到 ${tools.length} 个工具:`);
    tools.forEach((tool, index) => {
      console.log(`   ${index + 1}. ${tool.name}`);
      if (tool.description) {
        console.log(`      描述: ${tool.description}`);
      }
    });
    console.log();

    // 4. 测试 Web 搜索
    console.log('4️⃣ 测试 Web 搜索...\n');
    try {
      const searchResult = await client.callTool('web_search_exa', {
        query: 'latest AI developments',
        numResults: 3,
      });
      console.log('✅ Web 搜索成功');
      console.log('结果类型:', typeof searchResult);
      if (searchResult.content && searchResult.content[0]) {
        const content = searchResult.content[0];
        if (content.type === 'text') {
          try {
            const data = JSON.parse(content.text);
            console.log('结果摘要:', JSON.stringify(data).substring(0, 300) + '...');
          } catch {
            console.log('结果摘要:', content.text.substring(0, 300) + '...');
          }
        } else {
          console.log('结果:', JSON.stringify(searchResult).substring(0, 300) + '...');
        }
      } else {
        console.log('结果:', JSON.stringify(searchResult).substring(0, 300) + '...');
      }
    } catch (error: any) {
      console.log('❌ Web 搜索失败:', error.message);
      if (error.message?.includes('rate limit') || error.message?.includes('429')) {
        console.log('💡 提示: 遇到速率限制，请设置 EXA_API_KEY 环境变量');
      }
    }
    console.log();

    // 5. 测试代码上下文搜索
    console.log('5️⃣ 测试代码上下文搜索...\n');
    try {
      const codeResult = await client.callTool('get_code_context_exa', {
        query: 'React hooks useState example',
        numResults: 2,
      });
      console.log('✅ 代码上下文搜索成功');
      if (codeResult.content && codeResult.content[0]) {
        const content = codeResult.content[0];
        if (content.type === 'text') {
          try {
            const data = JSON.parse(content.text);
            console.log('结果摘要:', JSON.stringify(data).substring(0, 300) + '...');
          } catch {
            console.log('结果摘要:', content.text.substring(0, 300) + '...');
          }
        }
      }
    } catch (error: any) {
      console.log('❌ 代码上下文搜索失败:', error.message);
    }
    console.log();

    // 6. 测试公司研究
    console.log('6️⃣ 测试公司研究...\n');
    try {
      const companyResult = await client.callTool('company_research_exa', {
        companyName: 'OpenAI',
        numResults: 3,
      });
      console.log('✅ 公司研究成功');
      if (companyResult.content && companyResult.content[0]) {
        const content = companyResult.content[0];
        if (content.type === 'text') {
          try {
            const data = JSON.parse(content.text);
            console.log('结果摘要:', JSON.stringify(data).substring(0, 300) + '...');
          } catch {
            console.log('结果摘要:', content.text.substring(0, 300) + '...');
          }
        }
      }
    } catch (error: any) {
      console.log('❌ 公司研究失败:', error.message);
    }
    console.log();

    // 7. 断开连接
    console.log('7️⃣ 断开连接...\n');
    await client.disconnect();
    console.log('✅ 已断开连接\n');

    console.log('✅ 测试完成');
  } catch (error: any) {
    console.error('❌ 测试失败:', error);
    if (error.message) {
      console.error('错误信息:', error.message);
    }
    if (error.stack) {
      console.error('错误堆栈:', error.stack);
    }
  }
}

testExaDirect().catch(console.error);
