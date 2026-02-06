#!/usr/bin/env node

/**
 * 测试 Airbnb API 接口
 * 
 * 测试所有 Airbnb 相关的 API 端点
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// 加载 .env 文件
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api';

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

interface AuthStatusData {
  isAuthorized: boolean;
  connectionId?: string;
  authorizationUrl?: string;
  message?: string;
}

interface ToolsData {
  tools: Array<{
    name: string;
    description: string;
  }>;
}

interface SearchData {
  results: Array<{
    id: string;
    [key: string]: any;
  }>;
  total: number;
}

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const url = `${API_BASE_URL}${endpoint}`;
  console.log(`\n📡 ${options.method || 'GET'} ${url}`);
  
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.log(`❌ 状态码: ${response.status}`);
      console.log(`响应:`, JSON.stringify(data, null, 2));
      return data;
    }

    console.log(`✅ 状态码: ${response.status}`);
    console.log(`响应:`, JSON.stringify(data, null, 2));
    return data;
  } catch (error: any) {
    console.error(`❌ 请求失败:`, error.message);
    return {
      success: false,
      error: {
        code: 'REQUEST_ERROR',
        message: error.message,
      },
    };
  }
}

async function testAuthStatus() {
  console.log('\n' + '='.repeat(60));
  console.log('测试 1: 检查授权状态');
  console.log('='.repeat(60));
  
  const result = await apiRequest<AuthStatusData>('/airbnb/auth/status');
  
  if (result.success && result.data) {
    if (result.data.isAuthorized) {
      console.log('✅ 已授权');
      console.log(`   Connection ID: ${result.data.connectionId}`);
    } else {
      console.log('❌ 未授权');
      if (result.data.authorizationUrl) {
        console.log(`   授权 URL: ${result.data.authorizationUrl}`);
      }
    }
  }
  
  return result;
}

async function testGetAuthUrl() {
  console.log('\n' + '='.repeat(60));
  console.log('测试 2: 获取授权 URL');
  console.log('='.repeat(60));
  
  const result = await apiRequest<AuthStatusData>('/airbnb/auth/url');
  
  if (result.success && result.data) {
    console.log('✅ 获取授权 URL 成功');
    console.log(`   授权 URL: ${result.data.authorizationUrl}`);
    console.log(`   Connection ID: ${result.data.connectionId}`);
    return result.data;
  } else if (result.error?.message?.includes('已经完成授权')) {
    console.log('ℹ️  已经完成授权，无需再次授权');
  }
  
  return null;
}

async function testVerifyAuth(connectionId: string) {
  console.log('\n' + '='.repeat(60));
  console.log('测试 3: 验证授权');
  console.log('='.repeat(60));
  
  const result = await apiRequest<AuthStatusData>('/airbnb/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ connectionId }),
  });
  
  if (result.success && result.data) {
    if (result.data.isAuthorized) {
      console.log('✅ 授权验证成功');
      console.log(`   消息: ${result.data.message || '已授权'}`);
    } else {
      console.log('❌ 授权尚未完成');
      console.log(`   消息: ${result.data.message || '未授权'}`);
    }
  }
  
  return result;
}

async function testListTools() {
  console.log('\n' + '='.repeat(60));
  console.log('测试 4: 列出所有可用工具');
  console.log('='.repeat(60));
  
  const typedResult = await apiRequest<ToolsData>('/airbnb/tools');
  
  if (typedResult.success && typedResult.data?.tools) {
    console.log(`✅ 找到 ${typedResult.data.tools.length} 个工具:`);
    typedResult.data.tools.forEach((tool, index) => {
      console.log(`   ${index + 1}. ${tool.name}: ${tool.description || '无描述'}`);
    });
  }
  
  return typedResult;
}

async function testSearch() {
  console.log('\n' + '='.repeat(60));
  console.log('测试 5: 搜索房源');
  console.log('='.repeat(60));
  
  const result = await apiRequest<SearchData>('/airbnb/search', {
    method: 'POST',
    body: JSON.stringify({
      location: 'Reykjavik, Iceland',
      adults: 2,
      children: 0,
      infants: 0,
      pets: 0,
      ignoreRobotsText: true, // 仅用于测试
    }),
  });
  
  if (result.success && result.data) {
    const typedResult = result as ApiResponse<SearchData>;
    if (typedResult.data?.results) {
      console.log(`✅ 搜索成功，找到 ${typedResult.data.total || typedResult.data.results.length} 个房源`);
      
      // 显示前 3 个结果
      const displayCount = Math.min(3, typedResult.data.results.length);
      for (let i = 0; i < displayCount; i++) {
        const listing = typedResult.data.results[i];
        const name = listing.demandStayListing?.description?.name?.localizedStringWithTranslationPreference || '未知名称';
        const price = listing.structuredDisplayPrice?.primaryLine?.accessibilityLabel || '价格未知';
        console.log(`\n   ${i + 1}. ${name}`);
        console.log(`      价格: ${price}`);
        console.log(`      URL: ${listing.url}`);
      }
    } else {
      console.log('⚠️  搜索结果为空');
    }
  } else if (result.error?.code === 'UNAUTHORIZED') {
    console.log('❌ 需要完成 OAuth 授权');
    if (result.error.details?.authorizationUrl) {
      console.log(`   授权 URL: ${result.error.details.authorizationUrl}`);
    }
  }
  
  return result;
}

async function testGetListingDetails(listingId: string) {
  console.log('\n' + '='.repeat(60));
  console.log('测试 6: 获取房源详情');
  console.log('='.repeat(60));
  
  const result = await apiRequest(`/airbnb/listing/${listingId}`);
  
  if (result.success && result.data) {
    console.log('✅ 获取房源详情成功');
    console.log('   数据:', JSON.stringify(result.data, null, 2).substring(0, 500) + '...');
  } else if (result.error?.code === 'UNAUTHORIZED') {
    console.log('❌ 需要完成 OAuth 授权');
  }
  
  return result;
}

async function main() {
  console.log('🧪 Airbnb API 接口测试');
  console.log(`📍 API Base URL: ${API_BASE_URL}`);
  console.log('='.repeat(60));

  try {
    // 测试 1: 检查授权状态
    const statusResult = await testAuthStatus();
    const typedStatusResult = statusResult as ApiResponse<AuthStatusData>;
    const isAuthorized = typedStatusResult.success && typedStatusResult.data?.isAuthorized;
    let connectionId = typedStatusResult.data?.connectionId;

    // 测试 2: 如果未授权，获取授权 URL
    if (!isAuthorized) {
      const authUrlData = await testGetAuthUrl();
      if (authUrlData) {
        const typedAuthUrlData = authUrlData as AuthStatusData;
        if (typedAuthUrlData.connectionId) {
          connectionId = typedAuthUrlData.connectionId;
        }
        console.log('\n💡 提示: 请访问上面的授权 URL 完成授权');
        console.log('   授权完成后，可以运行以下命令验证:');
        console.log(`   npm run test:airbnb:api -- --verify ${connectionId}`);
      }
    }

    // 测试 3: 如果提供了 connectionId，验证授权
    const verifyArg = process.argv.find(arg => arg.startsWith('--verify='));
    if (verifyArg) {
      const verifyConnectionId = verifyArg.split('=')[1];
      await testVerifyAuth(verifyConnectionId);
    } else if (connectionId && !isAuthorized) {
      console.log('\n💡 提示: 使用 --verify=<connectionId> 参数验证授权');
    }

    // 测试 4: 列出工具（不需要授权）
    await testListTools();

    // 测试 5: 搜索房源（需要授权）
    if (isAuthorized) {
      const searchResult = await testSearch();
      
      // 测试 6: 如果有搜索结果，获取第一个房源的详情
      const typedSearchResult = searchResult as ApiResponse<SearchData>;
      if (typedSearchResult.success && typedSearchResult.data && typedSearchResult.data.results && typedSearchResult.data.results.length > 0) {
        const firstListingId = typedSearchResult.data.results[0]!.id;
        await testGetListingDetails(firstListingId);
      }
    } else {
      console.log('\n⚠️  跳过搜索和详情测试（需要授权）');
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ 测试完成');
    console.log('='.repeat(60));

  } catch (error: any) {
    console.error('\n❌ 测试失败:', error.message);
    if (error.stack) {
      console.error('堆栈:', error.stack);
    }
    process.exit(1);
  }
}

// 检查命令行参数
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Airbnb API 测试脚本

用法:
  npm run test:airbnb:api                    # 运行所有测试
  npm run test:airbnb:api -- --verify=<id>    # 验证指定 connectionId

环境变量:
  API_BASE_URL                                # API 基础 URL（默认: http://localhost:3000/api）
  `);
  process.exit(0);
}

main().catch((error) => {
  console.error('❌ 未捕获的错误:', error);
  process.exit(1);
});
