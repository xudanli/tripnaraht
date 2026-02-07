#!/usr/bin/env tsx

/**
 * Simple Stripe Direct API Test
 * 
 * 直接测试 Stripe API 连接，不依赖 NestJS 应用上下文
 */

import Stripe from 'stripe';
import * as dotenv from 'dotenv';
import * as path from 'path';

// 加载 .env 文件
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function main() {
  console.log('🧪 Testing Stripe Direct API...\n');

  // 1. 检查环境变量
  console.log('1. Checking environment variables...');
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
  const encryptionKey = process.env.STRIPE_ENCRYPTION_KEY;

  if (!secretKey) {
    console.error('❌ STRIPE_SECRET_KEY not found in .env');
    process.exit(1);
  }

  if (!secretKey.startsWith('sk_test_') && !secretKey.startsWith('sk_live_')) {
    console.error('❌ Invalid STRIPE_SECRET_KEY format');
    console.error('   Expected: sk_test_... or sk_live_...');
    process.exit(1);
  }

  console.log(`   ✅ Secret Key: ${secretKey.substring(0, 20)}...`);
  if (publishableKey) {
    console.log(`   ✅ Publishable Key: ${publishableKey.substring(0, 20)}...`);
  } else {
    console.log(`   ⚠️  Publishable Key: Not set (optional for backend)`);
  }
  if (encryptionKey && encryptionKey !== 'your-secure-encryption-key-32-chars') {
    console.log(`   ✅ Encryption Key: Set`);
  } else {
    console.log(`   ⚠️  Encryption Key: Using default (should change in production)`);
  }
  console.log('');

  // 2. 初始化 Stripe
  console.log('2. Initializing Stripe SDK...');
  let stripe: Stripe;
  try {
    stripe = new Stripe(secretKey, {
      apiVersion: '2026-01-28.clover',
    });
    console.log('   ✅ Stripe SDK initialized\n');
  } catch (error: any) {
    console.error('   ❌ Failed to initialize Stripe:', error.message);
    process.exit(1);
  }

  // 3. 测试 API 连接（获取余额）
  console.log('3. Testing Stripe API connection...');
  try {
    const balance = await stripe.balance.retrieve();
    console.log('   ✅ API connection successful');
    console.log(`   Available: ${balance.available[0]?.amount || 0} ${balance.available[0]?.currency || 'usd'}`);
    console.log(`   Pending: ${balance.pending[0]?.amount || 0} ${balance.pending[0]?.currency || 'usd'}\n`);
  } catch (error: any) {
    console.error('   ❌ API connection failed:', error.message);
    if (error.type === 'StripeAuthenticationError') {
      console.error('   💡 Check if your STRIPE_SECRET_KEY is correct');
    }
    process.exit(1);
  }

  // 4. 测试创建 Customer
  console.log('4. Testing create Customer...');
  try {
    const customer = await stripe.customers.create({
      email: `test-${Date.now()}@example.com`,
      name: 'Test User',
      metadata: {
        test: 'true',
        timestamp: Date.now().toString(),
      },
    });
    console.log(`   ✅ Customer created:`);
    console.log(`      ID: ${customer.id}`);
    console.log(`      Email: ${customer.email}\n`);

    // 5. 测试创建 Payment Intent
    console.log('5. Testing create Payment Intent...');
    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: 1000, // $10.00
        currency: 'usd',
        customer: customer.id,
        metadata: {
          test: 'true',
          timestamp: Date.now().toString(),
        },
        automatic_payment_methods: {
          enabled: true,
        },
      });
      console.log(`   ✅ Payment Intent created:`);
      console.log(`      ID: ${paymentIntent.id}`);
      console.log(`      Status: ${paymentIntent.status}`);
      console.log(`      Amount: ${paymentIntent.amount} ${paymentIntent.currency}`);
      console.log(`      Client Secret: ${paymentIntent.client_secret?.substring(0, 30)}...\n`);

      // 6. 测试获取 Payment Intent
      console.log('6. Testing retrieve Payment Intent...');
      try {
        const retrieved = await stripe.paymentIntents.retrieve(paymentIntent.id);
        console.log(`   ✅ Payment Intent retrieved:`);
        console.log(`      ID: ${retrieved.id}`);
        console.log(`      Status: ${retrieved.status}`);
        console.log(`      Amount: ${retrieved.amount} ${retrieved.currency}\n`);
      } catch (error: any) {
        console.error('   ❌ Failed to retrieve payment intent:', error.message);
        throw error;
      }

      // 清理：取消 Payment Intent（测试环境）
      console.log('7. Cleaning up (canceling test Payment Intent)...');
      try {
        await stripe.paymentIntents.cancel(paymentIntent.id);
        console.log(`   ✅ Payment Intent canceled\n`);
      } catch (error: any) {
        console.log(`   ⚠️  Failed to cancel (may already be canceled): ${error.message}\n`);
      }

    } catch (error: any) {
      console.error('   ❌ Failed to create payment intent:', error.message);
      throw error;
    }

    // 清理：删除测试 Customer
    console.log('8. Cleaning up (deleting test Customer)...');
    try {
      await stripe.customers.del(customer.id);
      console.log(`   ✅ Customer deleted\n`);
    } catch (error: any) {
      console.log(`   ⚠️  Failed to delete customer: ${error.message}\n`);
    }

  } catch (error: any) {
    console.error('   ❌ Failed to create customer:', error.message);
    throw error;
  }

  console.log('✅ All tests passed!');
  console.log('\n📝 Summary:');
  console.log('   ✅ Stripe SDK initialized');
  console.log('   ✅ API connection successful');
  console.log('   ✅ Customer creation works');
  console.log('   ✅ Payment Intent creation works');
  console.log('   ✅ Payment Intent retrieval works');
  console.log('\n🚀 Next steps:');
  console.log('   1. Test API endpoints: curl http://localhost:3000/api/stripe/health');
  console.log('   2. Run database migration: npx prisma migrate dev');
  console.log('   3. Test full integration with NestJS service');
}

main().catch((error) => {
  console.error('\n❌ Test failed:');
  console.error('Error:', error.message);
  if (error.stack) {
    console.error('Stack:', error.stack);
  }
  process.exit(1);
});
