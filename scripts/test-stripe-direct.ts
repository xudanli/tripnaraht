#!/usr/bin/env tsx

/**
 * Test Stripe Direct Service
 * 
 * 测试 Stripe Direct API 服务
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { StripeDirectService } from '../src/mcp/stripe-direct.service';

async function main() {
  console.log('🧪 Testing Stripe Direct Service...\n');

  let app;
  try {
    // 创建 NestJS 应用
    app = await NestFactory.createApplicationContext(AppModule);

    // 获取 Stripe Direct Service
    const stripeService = app.get(StripeDirectService);

    // 1. 检查服务是否可用
    console.log('1. Checking service availability...');
    const isAvailable = stripeService.isServiceAvailable();
    console.log(`   ✅ Service available: ${isAvailable}\n`);

    if (!isAvailable) {
      console.error('❌ Stripe service is not available. Please check:');
      console.error('   - STRIPE_SECRET_KEY is set in .env');
      console.error('   - Stripe Secret Key is valid');
      process.exit(1);
    }

    // 2. 测试连接（获取余额）
    console.log('2. Testing Stripe API connection...');
    try {
      // 注意：这里我们直接测试 Stripe SDK，因为 getBalance 不是公开方法
      // 我们可以通过创建测试 Customer 来验证连接
      console.log('   ⚠️  Skipping balance check (requires test mode setup)');
      console.log('   ✅ Service initialized successfully\n');
    } catch (error: any) {
      console.error('   ❌ Connection failed:', error.message);
      throw error;
    }

    // 3. 测试获取或创建 Customer
    console.log('3. Testing getOrCreateCustomer...');
    try {
      const testUserId = 'test-user-' + Date.now();
      const customerId = await stripeService.getOrCreateCustomer(
        testUserId,
        'test@example.com',
        'Test User'
      );
      console.log(`   ✅ Customer created/retrieved: ${customerId}\n`);
    } catch (error: any) {
      console.error('   ❌ Failed to get/create customer:', error.message);
      throw error;
    }

    // 4. 测试创建支付意图
    console.log('4. Testing createPaymentIntent...');
    try {
      const testUserId = 'test-user-' + Date.now();
      const paymentIntent = await stripeService.createPaymentIntent({
        userId: testUserId,
        amount: 1000, // $10.00
        currency: 'usd',
        metadata: {
          test: 'true',
          timestamp: Date.now().toString(),
        },
      });
      console.log(`   ✅ Payment Intent created:`);
      console.log(`      ID: ${paymentIntent.id}`);
      console.log(`      Status: ${paymentIntent.status}`);
      console.log(`      Amount: ${paymentIntent.amount} ${paymentIntent.currency}`);
      console.log(`      Client Secret: ${paymentIntent.client_secret?.substring(0, 20)}...\n`);

      // 5. 测试获取支付意图状态
      console.log('5. Testing getPaymentIntent...');
      try {
        const retrieved = await stripeService.getPaymentIntent(paymentIntent.id);
        console.log(`   ✅ Payment Intent retrieved:`);
        console.log(`      ID: ${retrieved.id}`);
        console.log(`      Status: ${retrieved.status}`);
        console.log(`      Amount: ${retrieved.amount} ${retrieved.currency}\n`);
      } catch (error: any) {
        console.error('   ❌ Failed to get payment intent:', error.message);
        throw error;
      }

      // 6. 测试获取连接状态
      console.log('6. Testing getConnectionStatus...');
      try {
        const status = await stripeService.getConnectionStatus(testUserId);
        console.log(`   ✅ Connection status:`);
        console.log(`      Connected: ${status.connected}`);
        console.log(`      Customer ID: ${status.stripeCustomerId || 'N/A'}`);
        console.log(`      Active: ${status.isActive}\n`);
      } catch (error: any) {
        console.error('   ❌ Failed to get connection status:', error.message);
        throw error;
      }

      // 7. 测试获取支付历史
      console.log('7. Testing getPaymentHistory...');
      try {
        const history = await stripeService.getPaymentHistory(testUserId, 5);
        console.log(`   ✅ Payment history retrieved:`);
        console.log(`      Count: ${history.length}`);
        if (history.length > 0) {
          console.log(`      Latest payment: ${history[0].id} (${history[0].status})\n`);
        } else {
          console.log(`      No payment history found\n`);
        }
      } catch (error: any) {
        console.error('   ❌ Failed to get payment history:', error.message);
        throw error;
      }

    } catch (error: any) {
      console.error('   ❌ Failed to create payment intent:', error.message);
      if (error.stack) {
        console.error('   Stack:', error.stack);
      }
      throw error;
    }

    console.log('✅ All tests passed!');
    console.log('\n📝 Next steps:');
    console.log('   1. Test API endpoints: curl http://localhost:3000/api/stripe/health');
    console.log('   2. Check database: PaymentIntent and StripeConnection tables');
    console.log('   3. Test frontend integration with Stripe.js');

  } catch (error: any) {
    console.error('\n❌ Test failed:');
    console.error('Error:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  } finally {
    if (app) {
      await app.close();
    }
  }
}

main();
