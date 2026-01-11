#!/usr/bin/env node

/**
 * 检查环境变量的实际值
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// 加载 .env 文件
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

console.log('🔍 检查环境变量的实际值：\n');

const vars = [
  'ENABLE_READINESS_MODULE',
  'ENABLE_PLACES_MODULE',
  'ENABLE_TRIPS_MODULE',
  'ENABLE_DECISION_SKILLS',
  'ENABLE_CONTEXT_ENGINE_MODULE',
  'MCP_MODE',
  'DISABLE_REDIS',
  'ALLOW_NO_DATABASE',
];

for (const varName of vars) {
  const value = process.env[varName];
  const type = typeof value;
  const length = value?.length || 0;
  const isTrue = value === 'true';
  const isTrueWithQuotes = value === '"true"';
  
  console.log(`${varName}:`);
  console.log(`  值: ${JSON.stringify(value)}`);
  console.log(`  类型: ${type}`);
  console.log(`  长度: ${length}`);
  console.log(`  === 'true': ${isTrue}`);
  console.log(`  === '"true"': ${isTrueWithQuotes}`);
  console.log(`  启用状态: ${isTrue ? '✅ 启用' : isTrueWithQuotes ? '⚠️ 带引号（需要修复）' : '❌ 未启用'}`);
  console.log('');
}
