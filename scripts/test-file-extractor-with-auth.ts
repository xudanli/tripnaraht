#!/usr/bin/env node

/**
 * File Extractor MCP 认证测试脚本
 * 
 * 先完成 OAuth 认证，然后测试功能
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

async function testWithAuth() {
  console.log('🔐 File Extractor MCP 认证测试\n');
  console.log('='.repeat(60));

  const client = new FileExtractorMcpClient();

  try {
    console.log('\n1️⃣ 尝试连接（可能需要认证）...');
    
    // 设置较短的超时，以便快速显示认证 URL
    const connectPromise = client.connect();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('连接超时')), 5000)
    );

    try {
      await Promise.race([connectPromise, timeoutPromise]);
      console.log('✅ 已连接（可能已有认证信息）');
    } catch (error: any) {
      if (error.message.includes('Unauthorized') || error.message.includes('认证')) {
        console.log('\n⚠️  需要 OAuth 认证');
        console.log('\n请按照以下步骤完成认证:');
        console.log('1. 访问上面显示的认证 URL');
        console.log('2. 完成 OAuth 授权');
        console.log('3. 认证信息会自动保存到 ~/.tripnara-mcp/');
        console.log('\n或者运行: npm run mcp:auth:file-extractor');
        
        const answer = await question('\n是否已完成认证？(y/n): ');
        if (answer.toLowerCase() !== 'y') {
          console.log('\n请先完成认证，然后重新运行此脚本');
          rl.close();
          process.exit(0);
        }

        // 重新尝试连接
        console.log('\n2️⃣ 重新连接...');
        await client.connect();
        console.log('✅ 连接成功！');
      } else {
        throw error;
      }
    }

    // 3. 列出工具
    console.log('\n3️⃣ 列出可用工具:');
    const tools = await client.listTools();
    console.log(`✅ 找到 ${tools.tools?.length || 0} 个工具:`);
    tools.tools?.forEach((tool: any, index: number) => {
      console.log(`   ${index + 1}. ${tool.name}`);
      if (tool.description) {
        console.log(`      描述: ${tool.description}`);
      }
    });

    // 4. 测试提取元数据
    console.log('\n4️⃣ 测试提取文件元数据:');
    const testUrl = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
    console.log(`   测试 URL: ${testUrl}`);
    
    try {
      const metadata = await Promise.race([
        client.extractMetadata(testUrl),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('提取超时（30秒）')), 30000)
        )
      ]);
      console.log('✅ 元数据提取成功:');
      console.log(JSON.stringify(metadata, null, 2));
    } catch (error: any) {
      console.log(`⚠️  元数据提取失败: ${error.message}`);
      console.log('   （这可能是正常的，取决于 URL 是否可访问）');
    }

    // 5. 测试提取内容
    console.log('\n5️⃣ 测试提取文件内容:');
    try {
      const content = await Promise.race([
        client.extractFileContent(testUrl, { page: 1, limit: 10 }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('提取超时（30秒）')), 30000)
        )
      ]);
      console.log('✅ 内容提取成功:');
      console.log(JSON.stringify(content, null, 2));
    } catch (error: any) {
      console.log(`⚠️  内容提取失败: ${error.message}`);
      console.log('   （这可能是正常的，取决于 URL 是否可访问）');
    }

    // 断开连接
    await client.disconnect();
    console.log('\n✅ 测试完成！');

  } catch (error: any) {
    console.error('\n❌ 测试失败:', error.message);
    if (error.stack) {
      console.error('堆栈:', error.stack);
    }
    process.exit(1);
  } finally {
    rl.close();
  }
}

testWithAuth().catch((error) => {
  console.error('未捕获的错误:', error);
  rl.close();
  process.exit(1);
});
