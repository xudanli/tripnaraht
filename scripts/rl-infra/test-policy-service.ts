/**
 * PolicyService TypeScript 版本测试脚本
 */

import fetch from 'node-fetch';

const BASE_URL = process.env.POLICY_SERVICE_URL || 'http://localhost:8002';

async function testHealth() {
  console.log('\n📋 Testing /health endpoint...');
  try {
    const response = await fetch(`${BASE_URL}/health`);
    const data = await response.json();
    console.log('✅ Health check passed:', JSON.stringify(data, null, 2));
    return true;
  } catch (error: any) {
    console.error('❌ Health check failed:', error.message);
    return false;
  }
}

async function testPredict() {
  console.log('\n📋 Testing /predict endpoint...');
  try {
    const request = {
      request_id: 'test_001',
      state: {
        user_request: 'Plan a trip to Iceland',
        origin: 'Beijing',
        destination: 'Reykjavik',
        constraints: {
          budget: 50000,
          duration: 7,
        },
      },
      model_version: 'v1.0.0',
    };

    const response = await fetch(`${BASE_URL}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    const data = await response.json();
    console.log('✅ Predict test passed:', JSON.stringify(data, null, 2));
    return true;
  } catch (error: any) {
    console.error('❌ Predict test failed:', error.message);
    return false;
  }
}

async function testBatchPredict() {
  console.log('\n📋 Testing /batch-predict endpoint...');
  try {
    const request = {
      requests: [
        {
          request_id: 'batch_001',
          state: {
            user_request: 'Plan a trip',
          },
        },
        {
          request_id: 'batch_002',
          state: {
            user_request: 'Plan another trip',
          },
        },
      ],
    };

    const response = await fetch(`${BASE_URL}/batch-predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    const data = await response.json();
    console.log('✅ Batch predict test passed:', JSON.stringify(data, null, 2));
    return true;
  } catch (error: any) {
    console.error('❌ Batch predict test failed:', error.message);
    return false;
  }
}

async function testMetrics() {
  console.log('\n📋 Testing /metrics endpoint...');
  try {
    const response = await fetch(`${BASE_URL}/metrics`);
    const data = await response.json();
    console.log('✅ Metrics test passed:', JSON.stringify(data, null, 2));
    return true;
  } catch (error: any) {
    console.error('❌ Metrics test failed:', error.message);
    return false;
  }
}

async function testDeploy() {
  console.log('\n📋 Testing /deploy endpoint...');
  try {
    const request = {
      model_version: 'v1.1.0',
    };

    const response = await fetch(`${BASE_URL}/deploy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    const data = await response.json();
    console.log('✅ Deploy test passed:', JSON.stringify(data, null, 2));
    return true;
  } catch (error: any) {
    console.error('❌ Deploy test failed:', error.message);
    return false;
  }
}

async function testRollback() {
  console.log('\n📋 Testing /rollback endpoint...');
  try {
    const response = await fetch(`${BASE_URL}/rollback`, {
      method: 'POST',
    });

    const data = await response.json();
    console.log('✅ Rollback test passed:', JSON.stringify(data, null, 2));
    return true;
  } catch (error: any) {
    console.error('❌ Rollback test failed:', error.message);
    return false;
  }
}

async function runAllTests() {
  console.log('🚀 Starting PolicyService TypeScript tests...');
  console.log(`📍 Testing against: ${BASE_URL}\n`);

  const results = {
    health: await testHealth(),
    predict: await testPredict(),
    batchPredict: await testBatchPredict(),
    metrics: await testMetrics(),
    deploy: await testDeploy(),
    rollback: await testRollback(),
  };

  console.log('\n📊 Test Results:');
  console.log('================');
  Object.entries(results).forEach(([test, passed]) => {
    console.log(`${passed ? '✅' : '❌'} ${test}`);
  });

  const allPassed = Object.values(results).every((r) => r);
  console.log(`\n${allPassed ? '✅ All tests passed!' : '❌ Some tests failed'}`);

  process.exit(allPassed ? 0 : 1);
}

// 运行测试
runAllTests().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
