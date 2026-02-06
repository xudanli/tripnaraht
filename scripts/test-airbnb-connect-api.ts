#!/usr/bin/env node

/**
 * Airbnb MCP 测试脚本（使用 Connect API）
 * 
 * 使用 Smithery Connect API 测试 Airbnb MCP 客户端
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// 加载 .env 文件
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { AirbnbMcpClientConnectAPI } from '../src/mcp/airbnb-client-connect-api';
import * as fs from 'fs';
import * as os from 'os';

// 检查环境变量
if (!process.env.SMITHERY_API_KEY) {
  console.error('❌ 错误: 未设置 SMITHERY_API_KEY 环境变量');
  console.error('\n请设置环境变量:');
  console.error('  export SMITHERY_API_KEY="your-api-key-here"');
  console.error('\n或创建 .env 文件:');
  console.error('  SMITHERY_API_KEY=your-api-key-here');
  console.error('\n获取 API Key: https://smithery.ai/account/api-keys\n');
  process.exit(1);
}

async function testAirbnbConnectAPI() {
  // 尝试加载保存的 connectionId
  const configDir = path.join(os.homedir(), '.tripnara-mcp');
  const connectionIdFile = path.join(configDir, 'airbnb-connection-id.txt');
  
  let savedConnectionId: string | undefined;
  if (fs.existsSync(connectionIdFile)) {
    savedConnectionId = fs.readFileSync(connectionIdFile, 'utf-8').trim();
    console.log(`📋 加载保存的 connectionId: ${savedConnectionId}\n`);
  }

  // 不指定 namespace，让 SDK 自动创建或使用第一个已存在的
  const client = new AirbnbMcpClientConnectAPI(undefined, savedConnectionId);

  try {
    console.log('🔌 正在连接到 Airbnb MCP 服务器（使用 Connect API）...\n');
    await client.connect();
    
    console.log('✅ 连接成功！\n');
    
    // 保存 connectionId
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    const connectionId = client.getConnectionId();
    if (connectionId) {
      fs.writeFileSync(connectionIdFile, connectionId);
      console.log(`💾 已保存 connectionId: ${connectionId}\n`);
    }

    // 测试 1: 列出所有可用工具
    console.log('🛠️  测试 1: 列出所有可用工具');
    try {
      const tools = await client.listTools();
      console.log(`找到 ${tools.tools?.length || 0} 个工具:`);
      if (tools.tools) {
        tools.tools.forEach((tool: any) => {
          console.log(`  - ${tool.name}: ${tool.description || '无描述'}`);
        });
      }
      console.log('✅ 测试 1 通过\n');
    } catch (error) {
      console.error('❌ 测试 1 失败:', error);
    }

    // 测试 2: 尝试调用一个工具（如果有的话）
    const tools = await client.listTools();
    if (tools?.tools && tools.tools.length > 0) {
      const firstTool = tools.tools[0];
      console.log(`🧪 测试 2: 调用工具 "${firstTool.name}"`);
      try {
        // 根据工具的实际参数调用
        const result = await client.callTool(firstTool.name, {});
        console.log('结果:', JSON.stringify(result, null, 2));
        console.log('✅ 测试 2 通过\n');
      } catch (error: any) {
        if (error.message?.includes('required') || error.message?.includes('参数')) {
          console.log(`⚠️  工具需要参数，跳过测试: ${error.message}`);
        } else {
          console.error('❌ 测试 2 失败:', error);
        }
      }
    }

    console.log('🎉 所有测试完成！');
    console.log('\n💡 提示: connectionId 已保存，下次可以直接使用');

  } catch (error: any) {
    if (error.message?.includes('OAuth authorization required')) {
      console.error('\n🔐 ============================================');
      console.error('需要完成 OAuth 认证');
      console.error('============================================');
      console.error('\n请访问以下 URL 完成 Airbnb 认证:');
      console.error(`\n${error.message.split('Visit: ')[1] || '查看上面的错误信息'}\n`);
      console.error('认证完成后，使用保存的 connectionId 重新运行此脚本。');
      console.error('============================================\n');
      
      // 保存 connectionId（如果有）
      const connectionId = client.getConnectionId();
      if (connectionId) {
        if (!fs.existsSync(configDir)) {
          fs.mkdirSync(configDir, { recursive: true });
        }
        fs.writeFileSync(connectionIdFile, connectionId);
        console.log(`💾 已保存 connectionId: ${connectionId}`);
        console.log('   认证完成后，重新运行此脚本即可自动连接\n');
      }
    } else {
      console.error('❌ 测试失败:', error);
      if (error instanceof Error) {
        console.error('错误信息:', error.message);
        console.error('堆栈:', error.stack);
      }
    }
    process.exit(1);
  } finally {
    try {
      await client.disconnect();
    } catch (error) {
      // 忽略断开连接错误
    }
  }
}

// 运行测试
testAirbnbConnectAPI().catch((error) => {
  console.error('❌ 未捕获的错误:', error);
  process.exit(1);
});
