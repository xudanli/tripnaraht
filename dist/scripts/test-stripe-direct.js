#!/usr/bin/env tsx
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("../src/app.module");
const stripe_direct_service_1 = require("../src/mcp/stripe-direct.service");
async function main() {
    var _a;
    console.log('🧪 Testing Stripe Direct Service...\n');
    let app;
    try {
        app = await core_1.NestFactory.createApplicationContext(app_module_1.AppModule);
        const stripeService = app.get(stripe_direct_service_1.StripeDirectService);
        console.log('1. Checking service availability...');
        const isAvailable = stripeService.isServiceAvailable();
        console.log(`   ✅ Service available: ${isAvailable}\n`);
        if (!isAvailable) {
            console.error('❌ Stripe service is not available. Please check:');
            console.error('   - STRIPE_SECRET_KEY is set in .env');
            console.error('   - Stripe Secret Key is valid');
            process.exit(1);
        }
        console.log('2. Testing Stripe API connection...');
        try {
            console.log('   ⚠️  Skipping balance check (requires test mode setup)');
            console.log('   ✅ Service initialized successfully\n');
        }
        catch (error) {
            console.error('   ❌ Connection failed:', error.message);
            throw error;
        }
        console.log('3. Testing getOrCreateCustomer...');
        try {
            const testUserId = 'test-user-' + Date.now();
            const customerId = await stripeService.getOrCreateCustomer(testUserId, 'test@example.com', 'Test User');
            console.log(`   ✅ Customer created/retrieved: ${customerId}\n`);
        }
        catch (error) {
            console.error('   ❌ Failed to get/create customer:', error.message);
            throw error;
        }
        console.log('4. Testing createPaymentIntent...');
        try {
            const testUserId = 'test-user-' + Date.now();
            const paymentIntent = await stripeService.createPaymentIntent({
                userId: testUserId,
                amount: 1000,
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
            console.log(`      Client Secret: ${(_a = paymentIntent.client_secret) === null || _a === void 0 ? void 0 : _a.substring(0, 20)}...\n`);
            console.log('5. Testing getPaymentIntent...');
            try {
                const retrieved = await stripeService.getPaymentIntent(paymentIntent.id);
                console.log(`   ✅ Payment Intent retrieved:`);
                console.log(`      ID: ${retrieved.id}`);
                console.log(`      Status: ${retrieved.status}`);
                console.log(`      Amount: ${retrieved.amount} ${retrieved.currency}\n`);
            }
            catch (error) {
                console.error('   ❌ Failed to get payment intent:', error.message);
                throw error;
            }
            console.log('6. Testing getConnectionStatus...');
            try {
                const status = await stripeService.getConnectionStatus(testUserId);
                console.log(`   ✅ Connection status:`);
                console.log(`      Connected: ${status.connected}`);
                console.log(`      Customer ID: ${status.stripeCustomerId || 'N/A'}`);
                console.log(`      Active: ${status.isActive}\n`);
            }
            catch (error) {
                console.error('   ❌ Failed to get connection status:', error.message);
                throw error;
            }
            console.log('7. Testing getPaymentHistory...');
            try {
                const history = await stripeService.getPaymentHistory(testUserId, 5);
                console.log(`   ✅ Payment history retrieved:`);
                console.log(`      Count: ${history.length}`);
                if (history.length > 0) {
                    console.log(`      Latest payment: ${history[0].id} (${history[0].status})\n`);
                }
                else {
                    console.log(`      No payment history found\n`);
                }
            }
            catch (error) {
                console.error('   ❌ Failed to get payment history:', error.message);
                throw error;
            }
        }
        catch (error) {
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
    }
    catch (error) {
        console.error('\n❌ Test failed:');
        console.error('Error:', error.message);
        if (error.stack) {
            console.error('Stack:', error.stack);
        }
        process.exit(1);
    }
    finally {
        if (app) {
            await app.close();
        }
    }
}
main();
//# sourceMappingURL=test-stripe-direct.js.map