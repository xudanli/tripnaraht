#!/usr/bin/env node

/**
 * 诊断 Smithery Connect API 连接问题
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { Smithery } from '@smithery/api';

// 加载 .env 文件
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function diagnose() {
  const apiKey = process.env.SMITHERY_API_KEY;
  
  if (!apiKey) {
    console.error('❌ 未设置 SMITHERY_API_KEY');
    process.exit(1);
  }
  
  console.log('🔍 诊断 Smithery Connect API 连接问题\n');
  console.log(`API Key: ${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 5)}`);
  console.log(`API Key 长度: ${apiKey.length}\n`);
  
  try {
    const smithery = new Smithery({
      apiKey: apiKey,
    });
    
    console.log('✅ Smithery 客户端创建成功\n');
    
    // 检查 experimental API 是否可用
    console.log('📋 检查 API 结构...');
    console.log('  - smithery.experimental:', typeof smithery.experimental);
    console.log('  - smithery.experimental.connect:', typeof smithery.experimental?.connect);
    console.log('  - smithery.experimental.connect.connections:', typeof smithery.experimental?.connect?.connections);
    console.log('');
    
    // 尝试创建 connection（指定 namespace）
    console.log('🧪 尝试创建 connection（namespace: tripnara）...');
    try {
      const conn = await smithery.experimental.connect.connections.set('test-airbnb', {
        namespace: 'tripnara',
        mcpUrl: 'https://server.smithery.ai/iclickfreedownloads/mcp-server-airbnb',
        name: 'Airbnb Test',
      });
      
      console.log('✅ Connection 创建成功！');
      console.log('  - Connection ID:', conn.connectionId);
      console.log('  - Status:', conn.status);
      console.log('  - Name:', conn.name);
      
      if (conn.status && 'state' in conn.status && conn.status.state === 'auth_required') {
        console.log('\n🔐 需要 OAuth 认证:');
        const authStatus = conn.status as { state: 'auth_required'; authorizationUrl?: string };
        console.log('  - Authorization URL:', authStatus.authorizationUrl || 'N/A');
      }
      
    } catch (error: any) {
      console.error('❌ Connection 创建失败:');
      console.error('  - 错误类型:', error.constructor.name);
      console.error('  - 状态码:', error.status);
      console.error('  - 错误消息:', error.message);
      console.error('  - 错误详情:', JSON.stringify(error.error || {}, null, 2));
      
      if (error.status === 404) {
        console.error('\n💡 可能的原因:');
        console.error('  1. API Key 无效或已过期');
        console.error('  2. API Key 没有访问 Connect API 的权限');
        console.error('  3. 需要先创建 namespace');
        console.error('\n建议:');
        console.error('  1. 检查 API Key 是否正确');
        console.error('  2. 访问 https://smithery.ai/account/api-keys 确认 API Key 状态');
        console.error('  3. 尝试创建新的 API Key');
      }
    }
    
  } catch (error: any) {
    console.error('❌ 诊断失败:', error.message);
    if (error.stack) {
      console.error('堆栈:', error.stack);
    }
  }
}

diagnose().catch((error) => {
  console.error('❌ 未捕获的错误:', error);
  process.exit(1);
});
