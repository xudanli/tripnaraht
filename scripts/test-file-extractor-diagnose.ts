#!/usr/bin/env node

/**
 * File Extractor MCP 诊断脚本
 * 
 * 诊断 File Extractor MCP 服务的连接问题
 */

import { FileExtractorMcpClient } from '../src/mcp/file-extractor-client.js';

async function diagnose() {
  console.log('🔍 File Extractor MCP 诊断工具\n');
  console.log('='.repeat(60));

  // 1. 检查环境变量
  console.log('\n1️⃣ 检查环境变量:');
  const serverUrl = process.env.FILE_EXTRACTOR_MCP_SERVER_URL || 'https://server.smithery.ai/@dravidsajinraj-iex/file-extractor-mcp';
  console.log(`   服务 URL: ${serverUrl}`);

  // 2. 测试网络连接
  console.log('\n2️⃣ 测试网络连接:');
  try {
    const url = new URL(serverUrl);
    console.log(`   协议: ${url.protocol}`);
    console.log(`   主机: ${url.host}`);
    console.log(`   路径: ${url.pathname}`);
    
    // 尝试简单的 HTTP 请求（如果可能）
    if (url.protocol === 'https:') {
      console.log('   ⚠️  HTTPS 连接需要 MCP 协议，无法直接测试');
    }
  } catch (error: any) {
    console.log(`   ❌ URL 解析失败: ${error.message}`);
  }

  // 3. 测试 MCP 客户端连接
  console.log('\n3️⃣ 测试 MCP 客户端连接:');
  const client = new FileExtractorMcpClient(serverUrl);
  
  try {
    console.log('   正在连接...');
    await Promise.race([
      client.connect(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('连接超时（30秒）')), 30000)
      )
    ]);
    console.log('   ✅ 连接成功！');

    // 4. 列出工具
    console.log('\n4️⃣ 列出可用工具:');
    try {
      const tools = await client.listTools();
      console.log(`   ✅ 找到 ${tools.tools?.length || 0} 个工具:`);
      tools.tools?.forEach((tool: any, index: number) => {
        console.log(`      ${index + 1}. ${tool.name}: ${tool.description || '无描述'}`);
      });
    } catch (error: any) {
      console.log(`   ❌ 获取工具列表失败: ${error.message}`);
    }

    // 5. 测试提取元数据（使用一个简单的测试 URL）
    console.log('\n5️⃣ 测试提取元数据:');
    const testUrl = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
    try {
      console.log(`   测试 URL: ${testUrl}`);
      const metadata = await Promise.race([
        client.extractMetadata(testUrl),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('提取超时（30秒）')), 30000)
        )
      ]);
      console.log('   ✅ 元数据提取成功:');
      console.log(JSON.stringify(metadata, null, 2));
    } catch (error: any) {
      console.log(`   ⚠️  元数据提取失败: ${error.message}`);
      console.log('   （这可能是正常的，取决于 URL 是否可访问）');
    }

    // 断开连接
    await client.disconnect();
    console.log('\n   ✅ 已断开连接');

  } catch (error: any) {
    console.log(`   ❌ 连接失败: ${error.message}`);
    
    if (error.message.includes('timeout') || error.message.includes('超时')) {
      console.log('\n   💡 可能的原因:');
      console.log('      1. 服务 URL 不正确或服务不可用');
      console.log('      2. 网络连接问题');
      console.log('      3. 服务需要认证但未配置');
      console.log('      4. 服务响应时间过长');
    } else if (error.message.includes('ECONNREFUSED')) {
      console.log('\n   💡 可能的原因:');
      console.log('      1. 服务 URL 不正确');
      console.log('      2. 服务未运行');
    } else {
      console.log('\n   💡 错误详情:');
      if (error.stack) {
        console.log(error.stack);
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('诊断完成');
}

diagnose().catch((error) => {
  console.error('未捕获的错误:', error);
  process.exit(1);
});
