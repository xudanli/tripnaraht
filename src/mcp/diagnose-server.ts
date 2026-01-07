#!/usr/bin/env node

/**
 * 诊断 MCP Skills Server
 * 
 * 直接运行服务器并捕获所有输出，用于诊断问题
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// 加载环境变量
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// 重定向所有输出到 stderr，这样我们可以看到所有日志
process.stdout.write = process.stderr.write.bind(process.stderr);

console.error('🔍 开始诊断 MCP Skills Server...\n');

// 导入并运行服务器
import('./mcp-skills-server.js').catch((error) => {
  console.error('❌ 导入服务器失败:', error);
  if (error.stack) {
    console.error('堆栈:', error.stack);
  }
  process.exit(1);
});

