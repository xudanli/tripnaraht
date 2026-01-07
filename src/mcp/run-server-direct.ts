#!/usr/bin/env node

/**
 * 直接运行 MCP Skills Server
 * 
 * 用于诊断服务器启动问题
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// 加载环境变量
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// 确保所有输出都到 stderr（这样我们可以看到所有日志）
const originalStdoutWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = function(chunk: any, encoding?: any, cb?: any) {
  process.stderr.write(chunk, encoding, cb);
  return true;
};

console.error('🔍 直接运行 MCP Skills Server 进行诊断...\n');

// 导入并运行服务器
import('./mcp-skills-server.js').then(() => {
  console.error('✅ 服务器模块加载成功');
}).catch((error) => {
  console.error('❌ 导入服务器失败:', error);
  if (error.message) {
    console.error('错误消息:', error.message);
  }
  if (error.stack) {
    console.error('堆栈:', error.stack);
  }
  process.exit(1);
});

