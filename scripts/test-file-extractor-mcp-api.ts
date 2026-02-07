#!/usr/bin/env node

/**
 * File Extractor MCP API 测试脚本
 * 
 * 测试 File Extractor MCP 的 HTTP API 端点
 */

import axios from 'axios';

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const API_BASE = `${BASE_URL}/api/file-extractor-mcp`;

// 测试用的文件 URL（使用公开可访问的测试文件）
const TEST_PDF_URL = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
const TEST_DOCX_URL = 'https://file-examples.com/storage/fe68c0b5c5b0c5b5b5b5b5b/2017/10/file_example_DOCX_10.docx';

interface TestResult {
  name: string;
  success: boolean;
  error?: string;
  data?: any;
}

const results: TestResult[] = [];

async function testEndpoint(name: string, testFn: () => Promise<any>) {
  console.log(`\n🧪 测试: ${name}`);
  try {
    const data = await testFn();
    console.log(`✅ 成功`);
    console.log(`响应数据:`, JSON.stringify(data, null, 2));
    results.push({ name, success: true, data });
  } catch (error: any) {
    console.log(`❌ 失败: ${error.message}`);
    if (error.response) {
      console.log(`状态码: ${error.response.status}`);
      console.log(`错误响应:`, JSON.stringify(error.response.data, null, 2));
      results.push({ name, success: false, error: `${error.message} (${error.response.status})` });
    } else if (error.code === 'ECONNREFUSED') {
      console.log(`⚠️  连接被拒绝，请确保服务器运行在 ${BASE_URL}`);
      results.push({ name, success: false, error: '连接被拒绝 - 服务器可能未运行' });
    } else {
      console.log(`错误详情:`, error);
      results.push({ name, success: false, error: error.message || String(error) });
    }
  }
}

async function main() {
  console.log('🚀 开始测试 File Extractor MCP API');
  console.log(`Base URL: ${API_BASE}\n`);

  // 1. 测试健康检查
  await testEndpoint('健康检查', async () => {
    const response = await axios.get(`${API_BASE}/health`);
    if (!response.data.success) {
      throw new Error('健康检查返回失败');
    }
    return response.data.data;
  });

  // 2. 测试列出工具
  await testEndpoint('列出所有工具', async () => {
    const response = await axios.get(`${API_BASE}/tools`);
    if (!response.data.success) {
      throw new Error('获取工具列表失败');
    }
    return response.data.data;
  });

  // 3. 测试提取 PDF 元数据
  await testEndpoint('提取 PDF 元数据', async () => {
    const response = await axios.post(`${API_BASE}/extract-metadata`, {
      url: TEST_PDF_URL,
    });
    if (!response.data.success) {
      throw new Error('提取元数据失败');
    }
    return response.data.data;
  });

  // 4. 测试提取 PDF 内容（第一页）
  await testEndpoint('提取 PDF 内容（第一页）', async () => {
    const response = await axios.post(`${API_BASE}/extract-content`, {
      url: TEST_PDF_URL,
      page: 1,
      limit: 10,
    });
    if (!response.data.success) {
      throw new Error('提取内容失败');
    }
    return response.data.data;
  });

  // 5. 测试提取 DOCX 元数据
  await testEndpoint('提取 DOCX 元数据', async () => {
    const response = await axios.post(`${API_BASE}/extract-metadata`, {
      url: TEST_DOCX_URL,
    });
    if (!response.data.success) {
      throw new Error('提取 DOCX 元数据失败');
    }
    return response.data.data;
  });

  // 6. 测试提取 DOCX 内容
  await testEndpoint('提取 DOCX 内容', async () => {
    const response = await axios.post(`${API_BASE}/extract-content`, {
      url: TEST_DOCX_URL,
      limit: 100,
    });
    if (!response.data.success) {
      throw new Error('提取 DOCX 内容失败');
    }
    return response.data.data;
  });

  // 7. 测试错误处理 - 无效 URL
  await testEndpoint('错误处理 - 无效 URL', async () => {
    try {
      const response = await axios.post(`${API_BASE}/extract-metadata`, {
        url: 'https://invalid-url-that-does-not-exist.com/file.pdf',
      });
      // 如果请求成功但返回错误，也记录
      if (!response.data.success) {
        return { error: response.data.error };
      }
      return response.data;
    } catch (error: any) {
      // 预期会失败，返回错误信息
      if (error.response) {
        return { error: error.response.data };
      }
      throw error;
    }
  });

  // 8. 测试错误处理 - 缺少参数
  await testEndpoint('错误处理 - 缺少 URL 参数', async () => {
    try {
      const response = await axios.post(`${API_BASE}/extract-metadata`, {});
      // 如果请求成功但返回错误，也记录
      if (!response.data.success) {
        return { error: response.data.error };
      }
      return response.data;
    } catch (error: any) {
      // 预期会失败，返回错误信息
      if (error.response) {
        return { error: error.response.data };
      }
      throw error;
    }
  });

  // 打印测试总结
  console.log('\n' + '='.repeat(60));
  console.log('📊 测试总结');
  console.log('='.repeat(60));
  
  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;
  
  console.log(`总测试数: ${results.length}`);
  console.log(`✅ 成功: ${successCount}`);
  console.log(`❌ 失败: ${failCount}`);
  
  console.log('\n详细结果:');
  results.forEach((result, index) => {
    const icon = result.success ? '✅' : '❌';
    console.log(`${index + 1}. ${icon} ${result.name}`);
    if (result.error) {
      console.log(`   错误: ${result.error}`);
    }
  });

  // 如果所有测试都成功，退出码为 0，否则为 1
  process.exit(failCount > 0 ? 1 : 0);
}

// 运行测试
main().catch((error) => {
  console.error('未捕获的错误:', error);
  process.exit(1);
});
