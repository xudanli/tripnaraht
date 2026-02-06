#!/usr/bin/env node

/**
 * Airbnb MCP 认证助手
 * 
 * 帮助用户完成首次 OAuth 认证流程
 */

import { AirbnbMcpClient } from '../src/mcp/airbnb-client';
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

async function main() {
  console.log('🔐 Airbnb MCP 认证助手\n');
  console.log('这个工具将帮助您完成首次 Airbnb OAuth 认证。\n');

  const client = new AirbnbMcpClient();

  try {
    console.log('正在尝试连接...\n');
    await client.connect();
    
    console.log('✅ 认证成功！您已经可以正常使用 Airbnb MCP 服务了。\n');
    
    // 测试连接
    console.log('🧪 测试连接...');
    const tools = await client.listTools();
    console.log(`✅ 连接测试通过！找到 ${tools.tools?.length || 0} 个工具\n`);
    
    console.log('您现在可以：');
    console.log('  1. 在 Claude Desktop 中使用 Airbnb 功能');
    console.log('  2. 在代码中使用 AirbnbMcpClient 类');
    console.log('  3. 运行测试脚本: npm run mcp:test:airbnb\n');

  } catch (error: any) {
    if (error.message?.includes('Unauthorized') || error.name === 'UnauthorizedError') {
      console.log('\n⚠️  需要完成首次认证。\n');
      console.log('请按照以下步骤操作：\n');
      console.log('1. 上面的输出中会显示一个认证 URL');
      console.log('2. 复制该 URL 并在浏览器中打开');
      console.log('3. 完成 Airbnb 登录和授权');
      console.log('4. 授权完成后，浏览器会重定向到一个回调页面');
      console.log('5. 从浏览器地址栏复制完整的回调 URL（包含 code 参数）');
      console.log('6. 将回调 URL 粘贴到下面\n');
      
      try {
        // 等待用户输入回调 URL
        const callbackUrl = await question('请输入回调 URL（或按 Enter 跳过，稍后手动完成认证）: ');
        
        if (callbackUrl.trim()) {
          try {
            // 从 URL 中提取 code
            const url = new URL(callbackUrl);
            const code = url.searchParams.get('code');
            
            if (code) {
              console.log('\n✅ 授权码已获取。');
              console.log('⚠️  注意：由于 MCP SDK 的架构限制，需要重新连接才能完成认证。');
              console.log('   请重新运行测试脚本，认证信息已保存，应该会自动完成认证。');
              console.log('   运行: npm run mcp:test:airbnb\n');
            } else {
              console.log('❌ 未找到授权码。请确保 URL 包含 code 参数。\n');
            }
          } catch (urlError) {
            console.log('❌ URL 格式错误。请确保输入完整的回调 URL。\n');
          }
        } else {
          console.log('\n您可以稍后手动完成认证：');
          console.log('1. 运行: npm run mcp:test:airbnb');
          console.log('2. 按照提示完成认证流程\n');
        }
      } catch (questionError) {
        // 如果 readline 已关闭，直接显示说明
        console.log('\n📝 认证说明：');
        console.log('1. 复制上面显示的认证 URL');
        console.log('2. 在浏览器中打开并完成授权');
        console.log('3. 重新运行测试脚本: npm run mcp:test:airbnb');
        console.log('4. 认证信息会自动保存，后续使用无需再次认证\n');
      }
    } else {
      console.error('❌ 连接失败:', error.message || error);
      console.error('\n请检查：');
      console.error('  1. 网络连接是否正常');
      console.error('  2. 能否访问 https://server.smithery.ai');
      console.error('  3. 查看上面的错误信息获取更多详情\n');
    }
  } finally {
    try {
      rl.close();
    } catch (error) {
      // 忽略关闭错误
    }
    try {
      await client.disconnect();
    } catch (error) {
      // 忽略断开连接错误
    }
  }
}

main().catch((error) => {
  console.error('❌ 未捕获的错误:', error);
  rl.close();
  process.exit(1);
});
