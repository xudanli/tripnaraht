import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import Stripe from 'stripe';
export declare class StripeDirectService implements OnModuleInit, OnModuleDestroy {
    private readonly configService;
    private readonly prisma;
    private readonly logger;
    private stripe;
    private secretKey;
    private isAvailable;
    private readonly encryptionKey;
    constructor(configService: ConfigService, prisma: PrismaService);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    isServiceAvailable(): boolean;
    private encrypt;
    private decrypt;
    getOrCreateCustomer(userId: string, email?: string, name?: string): Promise<string>;
    createPaymentIntent(params: {
        userId: string;
        amount: number;
        currency?: string;
        metadata?: Record<string, string>;
        paymentMethodId?: string;
        customerId?: string;
    }): Promise<Stripe.PaymentIntent>;
    confirmPaymentIntent(paymentIntentId: string, paymentMethodId?: string): Promise<Stripe.PaymentIntent>;
    getPaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent>;
    refundPayment(paymentIntentId: string, amount?: number, reason?: Stripe.RefundCreateParams.Reason): Promise<Stripe.Refund>;
    getPaymentHistory(userId: string, limit?: number, startingAfter?: string): Promise<Stripe.PaymentIntent[]>;
    initiateConnectOAuth(userId: string, redirectUri: string): Promise<string>;
    completeConnectOAuth(userId: string, code: string, state: string): Promise<void>;
    getConnectionStatus(userId: string): Promise<{
        connected: boolean;
        stripeAccountId?: string;
        stripeCustomerId?: string;
        isActive: boolean;
    }>;
}
