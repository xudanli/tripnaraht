#!/usr/bin/env node

/**
 * File Extractor MCP 测试脚本
 * 
 * 测试 File Extractor MCP 服务的连接和功能
 */

import { FileExtractorMcpClient } from '../src/mcp/file-extractor-client.js';

async function testFileExtractorMCP() {
  console.log('🧪 开始测试 File Extractor MCP...\n');

  const client = new FileExtractorMcpClient();

  try {
    // 1. 连接测试
    console.log('1️⃣ 测试连接...');
    await client.connect();
    console.log('✅ 连接成功\n');

    // 2. 列出工具
    console.log('2️⃣ 列出可用工具...');
    const tools = await client.listTools();
    console.log('可用工具:');
    tools.tools?.forEach((tool: any) => {
      console.log(`  - ${tool.name}: ${tool.description || '无描述'}`);
    });
    console.log('');

    // 3. 测试提取元数据（使用一个公开的 PDF URL）
    console.log('3️⃣ 测试提取文件元数据...');
    const testPdfUrl = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
    try {
      const metadata = await client.extractMetadata(testPdfUrl);
      console.log('✅ 元数据提取成功:');
      console.log(JSON.stringify(metadata, null, 2));
    } catch (error: any) {
      console.log(`⚠️  元数据提取失败: ${error.message}`);
      console.log('（这可能是正常的，取决于 URL 是否可访问）\n');
    }

    // 4. 测试提取文件内容
    console.log('\n4️⃣ 测试提取文件内容...');
    try {
      const content = await client.extractFileContent(testPdfUrl, {
        page: 1,
        limit: 10,
      });
      console.log('✅ 内容提取成功:');
      console.log(JSON.stringify(content, null, 2));
    } catch (error: any) {
      console.log(`⚠️  内容提取失败: ${error.message}`);
      console.log('（这可能是正常的，取决于 URL 是否可访问）\n');
    }

    // 5. 断开连接
    console.log('\n5️⃣ 断开连接...');
    await client.disconnect();
    console.log('✅ 断开连接成功');

    console.log('\n✅ 所有测试完成！');
  } catch (error: any) {
    console.error('\n❌ 测试失败:', error.message);
    if (error.stack) {
      console.error('堆栈:', error.stack);
    }
    process.exit(1);
  }
}

// 运行测试
testFileExtractorMCP().catch((error) => {
  console.error('未捕获的错误:', error);
  process.exit(1);
});
