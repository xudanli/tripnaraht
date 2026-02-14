#!/usr/bin/env tsx
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const stripe_1 = __importDefault(require("stripe"));
const dotenv = __importStar(require("dotenv"));
const path = __importStar(require("path"));
dotenv.config({ path: path.join(__dirname, '..', '.env') });
async function main() {
    var _a, _b, _c, _d, _e;
    console.log('🧪 Testing Stripe Direct API...\n');
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
    }
    else {
        console.log(`   ⚠️  Publishable Key: Not set (optional for backend)`);
    }
    if (encryptionKey && encryptionKey !== 'your-secure-encryption-key-32-chars') {
        console.log(`   ✅ Encryption Key: Set`);
    }
    else {
        console.log(`   ⚠️  Encryption Key: Using default (should change in production)`);
    }
    console.log('');
    console.log('2. Initializing Stripe SDK...');
    let stripe;
    try {
        stripe = new stripe_1.default(secretKey, {
            apiVersion: '2026-01-28.clover',
        });
        console.log('   ✅ Stripe SDK initialized\n');
    }
    catch (error) {
        console.error('   ❌ Failed to initialize Stripe:', error.message);
        process.exit(1);
    }
    console.log('3. Testing Stripe API connection...');
    try {
        const balance = await stripe.balance.retrieve();
        console.log('   ✅ API connection successful');
        console.log(`   Available: ${((_a = balance.available[0]) === null || _a === void 0 ? void 0 : _a.amount) || 0} ${((_b = balance.available[0]) === null || _b === void 0 ? void 0 : _b.currency) || 'usd'}`);
        console.log(`   Pending: ${((_c = balance.pending[0]) === null || _c === void 0 ? void 0 : _c.amount) || 0} ${((_d = balance.pending[0]) === null || _d === void 0 ? void 0 : _d.currency) || 'usd'}\n`);
    }
    catch (error) {
        console.error('   ❌ API connection failed:', error.message);
        if (error.type === 'StripeAuthenticationError') {
            console.error('   💡 Check if your STRIPE_SECRET_KEY is correct');
        }
        process.exit(1);
    }
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
        console.log('5. Testing create Payment Intent...');
        try {
            const paymentIntent = await stripe.paymentIntents.create({
                amount: 1000,
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
            console.log(`      Client Secret: ${(_e = paymentIntent.client_secret) === null || _e === void 0 ? void 0 : _e.substring(0, 30)}...\n`);
            console.log('6. Testing retrieve Payment Intent...');
            try {
                const retrieved = await stripe.paymentIntents.retrieve(paymentIntent.id);
                console.log(`   ✅ Payment Intent retrieved:`);
                console.log(`      ID: ${retrieved.id}`);
                console.log(`      Status: ${retrieved.status}`);
                console.log(`      Amount: ${retrieved.amount} ${retrieved.currency}\n`);
            }
            catch (error) {
                console.error('   ❌ Failed to retrieve payment intent:', error.message);
                throw error;
            }
            console.log('7. Cleaning up (canceling test Payment Intent)...');
            try {
                await stripe.paymentIntents.cancel(paymentIntent.id);
                console.log(`   ✅ Payment Intent canceled\n`);
            }
            catch (error) {
                console.log(`   ⚠️  Failed to cancel (may already be canceled): ${error.message}\n`);
            }
        }
        catch (error) {
            console.error('   ❌ Failed to create payment intent:', error.message);
            throw error;
        }
        console.log('8. Cleaning up (deleting test Customer)...');
        try {
            await stripe.customers.del(customer.id);
            console.log(`   ✅ Customer deleted\n`);
        }
        catch (error) {
            console.log(`   ⚠️  Failed to delete customer: ${error.message}\n`);
        }
    }
    catch (error) {
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
//# sourceMappingURL=test-stripe-direct-simple.js.map