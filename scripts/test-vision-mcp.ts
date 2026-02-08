#!/usr/bin/env node

/**
 * 测试 Vision Service MCP 集成
 * 
 * 验证 vision.poiRecommend 和 ocr.extractText 工具是否正常工作
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as fs from 'fs';
import * as path from 'path';

interface TestResult {
  tool: string;
  success: boolean;
  error?: string;
  result?: any;
}

async function testVisionMcp() {
  console.log('🧪 Testing Vision Service MCP Integration...\n');

  // 创建 MCP 客户端
  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['tsx', path.join(__dirname, '../src/mcp/mcp-skills-server.ts')],
  });

  const client = new Client(
    {
      name: 'vision-mcp-test',
      version: '1.0.0',
    },
    {
      capabilities: {},
    }
  );

  const results: TestResult[] = [];

  try {
    // 连接到服务器
    console.log('📡 Connecting to MCP server...');
    await client.connect(transport);
    console.log('✅ Connected\n');

    // 1. 测试列出所有工具
    console.log('🔍 Testing: List available tools...');
    try {
      const toolsResult = await client.listTools();
      const visionTools = toolsResult.tools.filter((t: any) => 
        t.name.startsWith('vision.') || t.name.startsWith('ocr.')
      );
      console.log(`✅ Found ${visionTools.length} Vision/OCR tools:`);
      visionTools.forEach((tool: any) => {
        console.log(`   - ${tool.name}: ${tool.description}`);
      });
      console.log('');
      
      results.push({
        tool: 'listTools',
        success: true,
        result: { count: visionTools.length, tools: visionTools.map((t: any) => t.name) },
      });
    } catch (error: any) {
      console.error(`❌ Failed to list tools: ${error.message}\n`);
      results.push({
        tool: 'listTools',
        success: false,
        error: error.message,
      });
    }

    // 2. 测试 ocr.extractText（使用一个简单的测试图片）
    console.log('📝 Testing: ocr.extractText...');
    try {
      // 创建一个简单的测试图片（1x1 像素的 PNG，base64 编码）
      // 注意：实际使用时应该使用真实的图片
      const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      
      const ocrResult = await client.callTool({
        name: 'ocr.extractText',
        arguments: {
          image: testImageBase64,
          locale: 'zh-CN',
        },
      });
      
      console.log('✅ OCR extraction completed');
      console.log(`   Result: ${JSON.stringify(ocrResult, null, 2).substring(0, 200)}...\n`);
      
      results.push({
        tool: 'ocr.extractText',
        success: true,
        result: ocrResult,
      });
    } catch (error: any) {
      console.error(`❌ Failed to extract text: ${error.message}\n`);
      results.push({
        tool: 'ocr.extractText',
        success: false,
        error: error.message,
      });
    }

    // 3. 测试 vision.poiRecommend（需要位置信息）
    console.log('📍 Testing: vision.poiRecommend...');
    try {
      // 使用东京的坐标作为测试
      const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      
      const poiResult = await client.callTool({
        name: 'vision.poiRecommend',
        arguments: {
          image: testImageBase64,
          lat: 35.6762, // 东京
          lng: 139.6503,
          locale: 'zh-CN',
        },
      });
      
      console.log('✅ POI recommendation completed');
      console.log(`   Result: ${JSON.stringify(poiResult, null, 2).substring(0, 200)}...\n`);
      
      results.push({
        tool: 'vision.poiRecommend',
        success: true,
        result: poiResult,
      });
    } catch (error: any) {
      console.error(`❌ Failed to recommend POI: ${error.message}\n`);
      results.push({
        tool: 'vision.poiRecommend',
        success: false,
        error: error.message,
      });
    }

  } catch (error: any) {
    console.error(`❌ Connection error: ${error.message}`);
    results.push({
      tool: 'connection',
      success: false,
      error: error.message,
    });
  } finally {
    // 断开连接
    try {
      await client.close();
      console.log('🔌 Disconnected from MCP server\n');
    } catch (error: any) {
      console.error(`⚠️  Error closing connection: ${error.message}\n`);
    }
  }

  // 打印测试总结
  console.log('📊 Test Summary:');
  console.log('='.repeat(50));
  const successCount = results.filter(r => r.success).length;
  const totalCount = results.length;
  console.log(`Total: ${totalCount} tests`);
  console.log(`Passed: ${successCount}`);
  console.log(`Failed: ${totalCount - successCount}`);
  console.log('='.repeat(50));

  results.forEach((result) => {
    const icon = result.success ? '✅' : '❌';
    console.log(`${icon} ${result.tool}: ${result.success ? 'PASS' : 'FAIL'}`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
  });

  // 返回测试结果
  return {
    success: successCount === totalCount,
    results,
  };
}

// 运行测试
if (require.main === module) {
  testVisionMcp()
    .then((summary) => {
      process.exit(summary.success ? 0 : 1);
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export { testVisionMcp };
