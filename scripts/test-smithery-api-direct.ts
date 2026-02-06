#!/usr/bin/env node

/**
 * 直接测试 Smithery API（不使用 createConnection）
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { Smithery } from '@smithery/api';
import { createConnection } from '@smithery/api/mcp';

// 加载 .env 文件
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function testDirect() {
  const apiKey = process.env.SMITHERY_API_KEY;
  
  if (!apiKey) {
    console.error('❌ 未设置 SMITHERY_API_KEY');
    process.exit(1);
  }
  
  console.log('🧪 直接测试 Smithery API\n');
  
  const smithery = new Smithery({
    apiKey: apiKey,
  });
  
  // 方法 1: 尝试使用 createConnection（不指定 namespace）
  console.log('方法 1: 使用 createConnection（不指定 namespace）...');
  try {
    const { transport, connectionId } = await createConnection({
      mcpUrl: 'https://server.smithery.ai/iclickfreedownloads/mcp-server-airbnb',
    });
    console.log('✅ 成功！connectionId:', connectionId);
    return;
  } catch (error: any) {
    console.error('❌ 失败:', error.message);
    if (error.status) {
      console.error('   状态码:', error.status);
    }
  }
  
  console.log('\n方法 2: 先创建 connection，再获取 transport...');
  try {
    // 尝试创建 connection（使用 experimental API）
    const conn = await smithery.experimental.connect.connections.create('tripnara', {
      mcpUrl: 'https://server.smithery.ai/iclickfreedownloads/mcp-server-airbnb',
    });
    
    console.log('✅ Connection 创建成功！');
    console.log('  - Connection ID:', conn.connectionId);
    console.log('  - Status:', conn.status);
    
    if (conn.status && 'state' in conn.status && conn.status.state === 'auth_required') {
      const authStatus = conn.status as { state: 'auth_required'; authorizationUrl?: string };
      console.log('\n🔐 需要 OAuth 认证:');
      console.log('  URL:', authStatus.authorizationUrl || 'N/A');
    }
    
  } catch (error: any) {
    console.error('❌ 失败:', error.message);
    if (error.status) {
      console.error('   状态码:', error.status);
      console.error('   错误详情:', JSON.stringify(error.error || {}, null, 2));
    }
    
    if (error.status === 404) {
      console.error('\n💡 可能的原因:');
      console.error('  1. API Key 无效或已过期');
      console.error('  2. Namespace "tripnara" 不存在');
      console.error('  3. API Key 没有访问 Connect API 的权限');
      console.error('\n建议:');
      console.error('  1. 访问 https://smithery.ai/account/api-keys 检查 API Key');
      console.error('  2. 尝试创建新的 API Key');
      console.error('  3. 联系 Smithery 支持: support@smithery.ai');
    }
  }
}

testDirect().catch((error) => {
  console.error('❌ 未捕获的错误:', error);
  process.exit(1);
});
