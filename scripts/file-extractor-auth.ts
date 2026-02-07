#!/usr/bin/env node

/**
 * File Extractor MCP 认证助手
 * 
 * 帮助完成 File Extractor MCP 服务的 OAuth 认证流程
 */

import { FileExtractorMcpClient } from '../src/mcp/file-extractor-client.js';
import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function authenticate() {
  console.log('🔐 File Extractor MCP 认证助手\n');
  console.log('='.repeat(60));

  const client = new FileExtractorMcpClient();

  try {
    console.log('\n正在连接并启动认证流程...\n');
    
    // 尝试连接，如果失败会显示认证 URL
    try {
      await Promise.race([
        client.connect(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('连接超时')), 10000)
        )
      ]);
      console.log('\n✅ 已连接！可能已有有效的认证信息。');
      console.log('认证信息位置: ~/.tripnara-mcp/file-extractor-mcp-*.json');
      
      // 测试列出工具以验证认证
      console.log('\n验证认证状态...');
      const tools = await client.listTools();
      console.log(`✅ 认证有效！找到 ${tools.tools?.length || 0} 个工具`);
      
      await client.disconnect();
    } catch (error: any) {
      if (error.message?.includes('Unauthorized') || error.message?.includes('认证')) {
        console.log('\n📝 需要完成 OAuth 认证');
        console.log('\n请按照以下步骤:');
        console.log('1. 访问上面显示的认证 URL（如果已显示）');
        console.log('2. 在浏览器中完成 OAuth 授权');
        console.log('3. 授权完成后，认证信息会自动保存');
        console.log('4. 然后重新运行此脚本验证认证状态');
        console.log('\n💡 提示: 如果认证 URL 未显示，请检查网络连接');
      } else {
        throw error;
      }
    }
  } catch (error: any) {
    console.error('\n❌ 认证过程出错:', error.message);
    if (error.stack) {
      console.error('堆栈:', error.stack);
    }
    console.log('\n💡 如果问题持续，请检查:');
    console.log('   1. 网络连接是否正常');
    console.log('   2. 服务 URL 是否正确');
    console.log('   3. 是否有防火墙阻止连接');
    process.exit(1);
  } finally {
    rl.close();
  }
}

// 运行认证
authenticate().catch((error) => {
  console.error('未捕获的错误:', error);
  rl.close();
  process.exit(1);
});
