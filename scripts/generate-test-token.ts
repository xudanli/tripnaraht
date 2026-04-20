/**
 * 本地开发测试 JWT Token 生成器
 * 
 * 用于生成本地测试用的 JWT token，方便调试需要认证的 API
 * 
 * 使用方法:
 *   npx ts-node scripts/generate-test-token.ts
 * 
 * 环境变量:
 *   JWT_SECRET - JWT 密钥 (默认使用开发环境密钥)
 */

import * as jwt from 'jsonwebtoken';
import * as dotenv from 'dotenv';
import * as path from 'path';

export {};

// 加载 .env 文件
dotenv.config({ path: path.join(__dirname, '..', '.env'), quiet: true });

// 配置 - 优先使用环境变量
const JWT_SECRET = process.env.JWT_SECRET || 'tripnara-dev-secret-key';
const EXPIRES_IN = '24h';

// 测试用户信息
const testPayload = {
  sub: 'test-user-001',
  userId: 'test-user-001',
  email: 'test@tripnara.dev',
  name: 'Test User',
  role: 'user',
  iat: Math.floor(Date.now() / 1000),
};

// 生成 Token
const token = jwt.sign(testPayload, JWT_SECRET, {
  expiresIn: EXPIRES_IN as jwt.SignOptions['expiresIn'],
});

console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║         TripNARA 测试 JWT Token 生成器                       ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

console.log('📋 Token 信息:');
console.log(`   用户ID: ${testPayload.userId}`);
console.log(`   邮箱: ${testPayload.email}`);
console.log(`   角色: ${testPayload.role}`);
console.log(`   有效期: ${EXPIRES_IN}\n`);

console.log('🔑 生成的 JWT Token:\n');
console.log(token);

console.log('\n💡 使用方法:\n');
console.log('   方法 1 - 设置环境变量:');
console.log(`   export TEST_JWT_TOKEN="${token}"`);
console.log('   npx ts-node scripts/test-optimization-api-http.ts\n');

console.log('   方法 2 - 直接使用:');
console.log(`   TEST_JWT_TOKEN="${token}" npx ts-node scripts/test-optimization-api-http.ts\n`);

console.log('   方法 3 - curl 测试:');
console.log(`   curl -H "Authorization: Bearer ${token}" http://localhost:3000/api/v2/user/optimization/preferences/test-user-001\n`);
