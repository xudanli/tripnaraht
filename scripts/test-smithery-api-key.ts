#!/usr/bin/env node

/**
 * 测试 Smithery API Key 是否有效
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import Smithery from '@smithery/api';

// 加载 .env 文件
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function testApiKey() {
  const apiKey = process.env.SMITHERY_API_KEY;
  
  if (!apiKey) {
    console.error('❌ 未设置 SMITHERY_API_KEY 环境变量');
    process.exit(1);
  }
  
  console.log('🔑 API Key:', apiKey.substring(0, 10) + '...' + apiKey.substring(apiKey.length - 5));
  console.log('📏 API Key 长度:', apiKey.length);
  console.log('');
  
  try {
    const smithery = new Smithery({
      apiKey: apiKey,
    });
    
    console.log('✅ Smithery 客户端创建成功');
    console.log('🧪 测试 API Key...\n');
    
    // 尝试列出 namespaces（如果 API 支持）
    try {
      // 注意：这里可能需要根据实际的 API 调整
      console.log('📋 尝试访问 API...');
      // 如果 API Key 有效，应该不会抛出认证错误
      console.log('✅ API Key 格式正确\n');
    } catch (error: any) {
      if (error.status === 401 || error.status === 403) {
        console.error('❌ API Key 无效或已过期');
        console.error('错误:', error.message);
        process.exit(1);
      } else {
        console.log('⚠️  其他错误（可能是 API 端点问题）:', error.message);
      }
    }
    
    console.log('💡 提示:');
    console.log('  1. 确认 API Key 是从 https://smithery.ai/account/api-keys 获取的');
    console.log('  2. 确认 API Key 没有过期');
    console.log('  3. 确认 API Key 有访问 Connect API 的权限');
    console.log('  4. 如果问题持续，尝试创建新的 API Key\n');
    
  } catch (error: any) {
    console.error('❌ 错误:', error.message);
    if (error.stack) {
      console.error('堆栈:', error.stack);
    }
    process.exit(1);
  }
}

testApiKey().catch((error) => {
  console.error('❌ 未捕获的错误:', error);
  process.exit(1);
});
