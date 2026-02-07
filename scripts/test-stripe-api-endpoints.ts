#!/usr/bin/env tsx

/**
 * Test Stripe API Endpoints
 * 
 * 测试 Stripe Direct API 的 HTTP 端点
 * 需要服务器运行在 http://localhost:3000
 */

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const API_PREFIX = `${API_BASE_URL}/api/stripe`;

// Export empty object to make this a module and avoid global scope conflicts
export {};

// 模拟 JWT token（实际使用时需要真实的 token）
const TEST_TOKEN = process.env.TEST_JWT_TOKEN || 'test-token';

async function testEndpoint(method: string, path: string, body?: any) {
  const url = `${API_PREFIX}${path}`;
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TEST_TOKEN}`,
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, options);
    const data = await response.json();
    return { success: response.ok, status: response.status, data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('🧪 Testing Stripe API Endpoints...\n');
  console.log(`📡 API Base URL: ${API_PREFIX}\n`);

  // 1. 健康检查
  console.log('1. Testing GET /health...');
  const health = await testEndpoint('GET', '/health');
  if (health.success) {
    console.log('   ✅ Health check passed');
    console.log(`   Response:`, JSON.stringify(health.data, null, 2));
  } else {
    console.log('   ❌ Health check failed');
    console.log(`   Status: ${health.status}`);
    console.log(`   Error: ${health.error || JSON.stringify(health.data)}`);
  }
  console.log('');

  // 2. 获取连接状态
  console.log('2. Testing GET /connection-status...');
  const status = await testEndpoint('GET', '/connection-status');
  if (status.success) {
    console.log('   ✅ Connection status retrieved');
    console.log(`   Response:`, JSON.stringify(status.data, null, 2));
  } else {
    console.log('   ⚠️  Connection status check failed (may need authentication)');
    console.log(`   Status: ${status.status}`);
    console.log(`   Response:`, JSON.stringify(status.data, null, 2));
  }
  console.log('');

  // 3. 创建支付意图
  console.log('3. Testing POST /payment-intent...');
  const createPI = await testEndpoint('POST', '/payment-intent', {
    amount: 1000,
    currency: 'usd',
    metadata: {
      test: 'true',
      timestamp: Date.now().toString(),
    },
  });
  if (createPI.success) {
    console.log('   ✅ Payment Intent created');
    console.log(`   Response:`, JSON.stringify(createPI.data, null, 2));
    
    // 4. 获取支付意图状态
    if (createPI.data?.paymentIntent?.id) {
      const piId = createPI.data.paymentIntent.id;
      console.log(`\n4. Testing GET /payment-intent/${piId}...`);
      const getPI = await testEndpoint('GET', `/payment-intent/${piId}`);
      if (getPI.success) {
        console.log('   ✅ Payment Intent retrieved');
        console.log(`   Response:`, JSON.stringify(getPI.data, null, 2));
      } else {
        console.log('   ❌ Failed to retrieve Payment Intent');
        console.log(`   Status: ${getPI.status}`);
        console.log(`   Response:`, JSON.stringify(getPI.data, null, 2));
      }
    }
  } else {
    console.log('   ⚠️  Payment Intent creation failed (may need authentication)');
    console.log(`   Status: ${createPI.status}`);
    console.log(`   Response:`, JSON.stringify(createPI.data, null, 2));
  }
  console.log('');

  console.log('📝 Note:');
  console.log('   - Some endpoints require valid JWT authentication');
  console.log('   - Set TEST_JWT_TOKEN environment variable to test authenticated endpoints');
  console.log('   - Make sure the server is running: npm run dev');
}

main().catch((error) => {
  console.error('\n❌ Test failed:');
  console.error('Error:', error.message);
  if (error.stack) {
    console.error('Stack:', error.stack);
  }
  process.exit(1);
});

// Export empty object to make this a module and avoid global scope conflicts
export {};
