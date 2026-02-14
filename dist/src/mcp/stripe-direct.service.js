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
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
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
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var StripeDirectService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.StripeDirectService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../prisma/prisma.service");
const stripe_1 = __importDefault(require("stripe"));
const crypto = __importStar(require("crypto"));
let StripeDirectService = StripeDirectService_1 = class StripeDirectService {
    constructor(configService, prisma) {
        this.configService = configService;
        this.prisma = prisma;
        this.logger = new common_1.Logger(StripeDirectService_1.name);
        this.stripe = null;
        this.secretKey = null;
        this.isAvailable = false;
        this.secretKey =
            this.configService.get('STRIPE_SECRET_KEY') ||
                process.env.STRIPE_SECRET_KEY ||
                null;
        this.encryptionKey =
            this.configService.get('STRIPE_ENCRYPTION_KEY') ||
                process.env.STRIPE_ENCRYPTION_KEY ||
                'default-encryption-key-change-in-production';
    }
    async onModuleInit() {
        if (this.secretKey) {
            try {
                this.stripe = new stripe_1.default(this.secretKey, {
                    apiVersion: '2026-01-28.clover',
                });
                await this.stripe.balance.retrieve();
                this.isAvailable = true;
                this.logger.log('Stripe Direct Service initialized');
            }
            catch (error) {
                this.logger.error('Failed to initialize Stripe:', error.message);
                this.isAvailable = false;
            }
        }
        else {
            this.logger.warn('Stripe Secret Key not found. Service will not be available.');
            this.isAvailable = false;
        }
    }
    async onModuleDestroy() {
        this.logger.log('Stripe Direct Service destroyed');
    }
    isServiceAvailable() {
        return this.isAvailable && !!this.stripe;
    }
    encrypt(text) {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(this.encryptionKey.substring(0, 32).padEnd(32)), iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
    }
    decrypt(encryptedText) {
        const parts = encryptedText.split(':');
        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = parts[1];
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(this.encryptionKey.substring(0, 32).padEnd(32)), iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
    async getOrCreateCustomer(userId, email, name) {
        if (!this.isServiceAvailable()) {
            throw new Error('Stripe service is not available');
        }
        let connection = await this.prisma.stripeConnection.findUnique({
            where: { userId },
        });
        if (connection === null || connection === void 0 ? void 0 : connection.stripeCustomerId) {
            return connection.stripeCustomerId;
        }
        const customer = await this.stripe.customers.create({
            email,
            name,
            metadata: {
                userId,
            },
        });
        if (connection) {
            connection = await this.prisma.stripeConnection.update({
                where: { userId },
                data: {
                    stripeCustomerId: customer.id,
                },
            });
        }
        else {
            connection = await this.prisma.stripeConnection.create({
                data: {
                    userId,
                    stripeCustomerId: customer.id,
                },
            });
        }
        return customer.id;
    }
    async createPaymentIntent(params) {
        if (!this.isServiceAvailable()) {
            throw new Error('Stripe service is not available');
        }
        const customerId = params.customerId || await this.getOrCreateCustomer(params.userId);
        const paymentIntentParams = {
            amount: params.amount,
            currency: params.currency || 'usd',
            customer: customerId,
            metadata: {
                userId: params.userId,
                ...params.metadata,
            },
            automatic_payment_methods: {
                enabled: true,
            },
        };
        if (params.paymentMethodId) {
            paymentIntentParams.payment_method = params.paymentMethodId;
            paymentIntentParams.confirmation_method = 'manual';
        }
        const paymentIntent = await this.stripe.paymentIntents.create(paymentIntentParams);
        await this.prisma.paymentIntent.create({
            data: {
                userId: params.userId,
                stripePaymentIntentId: paymentIntent.id,
                amount: params.amount,
                currency: params.currency || 'usd',
                status: paymentIntent.status,
                metadata: params.metadata || {},
            },
        });
        return paymentIntent;
    }
    async confirmPaymentIntent(paymentIntentId, paymentMethodId) {
        if (!this.isServiceAvailable()) {
            throw new Error('Stripe service is not available');
        }
        const params = {};
        if (paymentMethodId) {
            params.payment_method = paymentMethodId;
        }
        const paymentIntent = await this.stripe.paymentIntents.confirm(paymentIntentId, params);
        await this.prisma.paymentIntent.update({
            where: { stripePaymentIntentId: paymentIntentId },
            data: {
                status: paymentIntent.status,
                updatedAt: new Date(),
            },
        });
        return paymentIntent;
    }
    async getPaymentIntent(paymentIntentId) {
        if (!this.isServiceAvailable()) {
            throw new Error('Stripe service is not available');
        }
        return await this.stripe.paymentIntents.retrieve(paymentIntentId);
    }
    async refundPayment(paymentIntentId, amount, reason) {
        if (!this.isServiceAvailable()) {
            throw new Error('Stripe service is not available');
        }
        const refundParams = {
            payment_intent: paymentIntentId,
        };
        if (amount) {
            refundParams.amount = amount;
        }
        if (reason) {
            refundParams.reason = reason;
        }
        return await this.stripe.refunds.create(refundParams);
    }
    async getPaymentHistory(userId, limit = 10, startingAfter) {
        if (!this.isServiceAvailable()) {
            throw new Error('Stripe service is not available');
        }
        const dbIntents = await this.prisma.paymentIntent.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: startingAfter ? 1 : 0,
            cursor: startingAfter ? { id: startingAfter } : undefined,
        });
        const paymentIntents = await Promise.all(dbIntents.map((intent) => this.stripe.paymentIntents.retrieve(intent.stripePaymentIntentId)));
        return paymentIntents;
    }
    async initiateConnectOAuth(userId, redirectUri) {
        if (!this.isServiceAvailable()) {
            throw new Error('Stripe service is not available');
        }
        const clientId = this.configService.get('STRIPE_CONNECT_CLIENT_ID') ||
            process.env.STRIPE_CONNECT_CLIENT_ID;
        if (!clientId) {
            throw new Error('Stripe Connect Client ID not configured');
        }
        const state = crypto.randomBytes(32).toString('hex');
        await this.prisma.stripeConnection.upsert({
            where: { userId },
            create: {
                userId,
                metadata: { oauthState: state },
            },
            update: {
                metadata: { oauthState: state },
            },
        });
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: clientId,
            scope: 'read_write',
            redirect_uri: redirectUri,
            state,
        });
        return `https://connect.stripe.com/oauth/authorize?${params.toString()}`;
    }
    async completeConnectOAuth(userId, code, state) {
        if (!this.isServiceAvailable()) {
            throw new Error('Stripe service is not available');
        }
        const connection = await this.prisma.stripeConnection.findUnique({
            where: { userId },
        });
        if (!(connection === null || connection === void 0 ? void 0 : connection.metadata) || connection.metadata.oauthState !== state) {
            throw new Error('Invalid OAuth state');
        }
        const response = await fetch('https://connect.stripe.com/oauth/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: this.configService.get('STRIPE_CONNECT_CLIENT_ID') ||
                    process.env.STRIPE_CONNECT_CLIENT_ID || '',
                code,
                client_secret: this.secretKey || '',
            }),
        });
        if (!response.ok) {
            throw new Error(`Failed to exchange authorization code: ${response.statusText}`);
        }
        const data = await response.json();
        await this.prisma.stripeConnection.update({
            where: { userId },
            data: {
                stripeAccountId: data.stripe_user_id,
                accessToken: this.encrypt(data.access_token),
                refreshToken: data.refresh_token ? this.encrypt(data.refresh_token) : null,
                tokenExpiresAt: data.expires_in
                    ? new Date(Date.now() + data.expires_in * 1000)
                    : null,
                metadata: {
                    ...(connection.metadata || {}),
                    scope: data.scope,
                },
            },
        });
    }
    async getConnectionStatus(userId) {
        const connection = await this.prisma.stripeConnection.findUnique({
            where: { userId },
        });
        if (!connection) {
            return { connected: false, isActive: false };
        }
        return {
            connected: true,
            stripeAccountId: connection.stripeAccountId || undefined,
            stripeCustomerId: connection.stripeCustomerId || undefined,
            isActive: connection.isActive,
        };
    }
};
exports.StripeDirectService = StripeDirectService;
exports.StripeDirectService = StripeDirectService = StripeDirectService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        prisma_service_1.PrismaService])
], StripeDirectService);
//# sourceMappingURL=stripe-direct.service.js.map