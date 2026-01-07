// 测试脚本：检查 RedisModule 是否在 MCP 模式下被加载
import * as dotenv from 'dotenv';
import * as path from 'path';

// 加载环境变量
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// 设置 MCP 模式
process.env.MCP_MODE = 'true';
process.argv.push('mcp-skills-server');

console.log('🔍 测试 RedisModule 加载...\n');
console.log('MCP_MODE:', process.env.MCP_MODE);
console.log('process.argv:', process.argv.filter(arg => arg.includes('mcp')));

// 检查是否在 MCP 模式下
const isMcpMode = process.argv.some(arg => arg.includes('mcp-skills-server')) ||
                  process.env.MCP_MODE === 'true';
console.log('isMcpMode:', isMcpMode);

// 尝试加载 RedisModule
console.log('\n尝试加载 RedisModule...');
try {
  const { RedisModule } = require('../redis/redis.module');
  console.log('✅ RedisModule 被加载了');
  console.log('RedisModule:', RedisModule);
} catch (error: any) {
  console.error('❌ 加载 RedisModule 失败:', error.message);
}

// 检查 cache-manager-redis-store 是否被加载
console.log('\n检查 cache-manager-redis-store...');
try {
  const redisStore = require('cache-manager-redis-store');
  console.log('⚠️ cache-manager-redis-store 被加载了');
  console.log('redisStore:', redisStore);
} catch (error: any) {
  console.log('✅ cache-manager-redis-store 未被加载（这是好的）');
}

