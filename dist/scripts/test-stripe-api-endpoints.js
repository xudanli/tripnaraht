#!/usr/bin/env tsx
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const API_PREFIX = `${API_BASE_URL}/api/stripe`;
const TEST_TOKEN = process.env.TEST_JWT_TOKEN || 'test-token';
async function testEndpoint(method, path, body) {
    const url = `${API_PREFIX}${path}`;
    const options = {
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
    }
    catch (error) {
        return { success: false, error: error.message };
    }
}
async function main() {
    var _a, _b;
    console.log('🧪 Testing Stripe API Endpoints...\n');
    console.log(`📡 API Base URL: ${API_PREFIX}\n`);
    console.log('1. Testing GET /health...');
    const health = await testEndpoint('GET', '/health');
    if (health.success) {
        console.log('   ✅ Health check passed');
        console.log(`   Response:`, JSON.stringify(health.data, null, 2));
    }
    else {
        console.log('   ❌ Health check failed');
        console.log(`   Status: ${health.status}`);
        console.log(`   Error: ${health.error || JSON.stringify(health.data)}`);
    }
    console.log('');
    console.log('2. Testing GET /connection-status...');
    const status = await testEndpoint('GET', '/connection-status');
    if (status.success) {
        console.log('   ✅ Connection status retrieved');
        console.log(`   Response:`, JSON.stringify(status.data, null, 2));
    }
    else {
        console.log('   ⚠️  Connection status check failed (may need authentication)');
        console.log(`   Status: ${status.status}`);
        console.log(`   Response:`, JSON.stringify(status.data, null, 2));
    }
    console.log('');
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
        if ((_b = (_a = createPI.data) === null || _a === void 0 ? void 0 : _a.paymentIntent) === null || _b === void 0 ? void 0 : _b.id) {
            const piId = createPI.data.paymentIntent.id;
            console.log(`\n4. Testing GET /payment-intent/${piId}...`);
            const getPI = await testEndpoint('GET', `/payment-intent/${piId}`);
            if (getPI.success) {
                console.log('   ✅ Payment Intent retrieved');
                console.log(`   Response:`, JSON.stringify(getPI.data, null, 2));
            }
            else {
                console.log('   ❌ Failed to retrieve Payment Intent');
                console.log(`   Status: ${getPI.status}`);
                console.log(`   Response:`, JSON.stringify(getPI.data, null, 2));
            }
        }
    }
    else {
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
//# sourceMappingURL=test-stripe-api-endpoints.js.map