#!/usr/bin/env node

/**
 * Google Maps MCP 认证助手
 * 
 * 帮助用户完成 Google Maps MCP 服务的 OAuth 认证流程
 */

import { getGoogleMapsClient } from '../src/mcp/google-maps-client';
import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

async function main() {
  console.log('🔐 Google Maps MCP 认证助手\n');
  console.log('此脚本将帮助您完成 Google Maps MCP 服务的 OAuth 认证。\n');

  // 检查是否需要清理旧的认证信息
  const args = process.argv.slice(2);
  if (args.includes('--clear') || args.includes('-c')) {
    console.log('🧹 清理旧的认证信息...\n');
    const client = getGoogleMapsClient();
    (client as any).clearAuth();
    console.log('\n✅ 认证信息已清理，可以开始新的认证流程。\n');
  }

  const client = getGoogleMapsClient();

  try {
    console.log('正在连接到 Google Maps MCP 服务器...\n');
    
    // 尝试连接，这会触发 OAuth 流程
    await client.connect();
    
    console.log('\n✅ 认证成功！Google Maps MCP 客户端已连接。');
    console.log('认证信息已保存，后续使用无需重复认证。\n');
    
    // 测试列出工具
    console.log('测试列出可用工具...');
    const tools = await client.listTools();
    console.log(`✅ 找到 ${tools.tools?.length || 0} 个可用工具\n`);
    
    if (tools.tools && tools.tools.length > 0) {
      console.log('可用工具列表:');
      tools.tools.forEach((tool: any, index: number) => {
        console.log(`  ${index + 1}. ${tool.name}`);
        if (tool.description) {
          console.log(`     ${tool.description}`);
        }
      });
    }
    
  } catch (error: any) {
    if (error.message?.includes('Unauthorized') || 
        error.message?.includes('认证') ||
        error.message?.includes('Session not found') ||
        error.message?.includes('expired')) {
      console.error('\n❌ 认证失败或会话已过期。');
      console.error('\n请按照以下步骤完成认证:');
      console.error('1. 复制上面显示的认证 URL');
      console.error('2. 在浏览器中打开该 URL');
      console.error('3. 完成 Google OAuth 授权');
      console.error('4. 授权完成后，重新运行此脚本\n');
      console.error('💡 提示: 如果持续失败，可以尝试清理旧的认证信息:');
      console.error('   npm run mcp:auth:google-maps -- --clear\n');
    } else {
      console.error('\n❌ 错误:', error.message);
      if (error.stack) {
        console.error('堆栈:', error.stack);
      }
    }
    process.exit(1);
  } finally {
    try {
      await client.disconnect();
    } catch (e) {
      // 忽略断开连接错误
    }
    rl.close();
  }
}

main().catch((error) => {
  console.error('未捕获的错误:', error);
  process.exit(1);
});
