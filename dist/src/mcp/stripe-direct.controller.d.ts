import { StripeDirectService } from './stripe-direct.service';
export declare class StripeDirectController {
    private readonly stripeService;
    constructor(stripeService: StripeDirectService);
    health(): Promise<{
        success: boolean;
        available: boolean;
    }>;
    getConnectionStatus(user: any): Promise<{
        connected: boolean;
        stripeAccountId?: string;
        stripeCustomerId?: string;
        isActive: boolean;
        success: boolean;
    }>;
    createPaymentIntent(user: any, body: {
        amount: number;
        currency?: string;
        metadata?: Record<string, string>;
        paymentMethodId?: string;
    }): Promise<{
        success: boolean;
        paymentIntent: {
            id: string;
            clientSecret: string;
            status: import("stripe").Stripe.PaymentIntent.Status;
            amount: number;
            currency: string;
        };
    }>;
    confirmPaymentIntent(paymentIntentId: string, body: {
        paymentMethodId?: string;
    }): Promise<{
        success: boolean;
        paymentIntent: {
            id: string;
            status: import("stripe").Stripe.PaymentIntent.Status;
            amount: number;
            currency: string;
        };
    }>;
    getPaymentIntent(paymentIntentId: string): Promise<{
        success: boolean;
        paymentIntent: {
            id: string;
            status: import("stripe").Stripe.PaymentIntent.Status;
            amount: number;
            currency: string;
            metadata: import("stripe").Stripe.Metadata;
        };
    }>;
    refundPayment(body: {
        paymentIntentId: string;
        amount?: number;
        reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer';
    }): Promise<{
        success: boolean;
        refund: {
            id: string;
            amount: number;
            currency: string;
            status: string;
        };
    }>;
    getPaymentHistory(user: any, limit?: string, startingAfter?: string): Promise<{
        success: boolean;
        paymentIntents: {
            id: string;
            status: import("stripe").Stripe.PaymentIntent.Status;
            amount: number;
            currency: string;
            created: number;
            metadata: import("stripe").Stripe.Metadata;
        }[];
    }>;
    initiateConnectOAuth(user: any, redirectUri: string): Promise<{
        success: boolean;
        authUrl: string;
    }>;
    completeConnectOAuth(user: any, body: {
        code: string;
        state: string;
    }): Promise<{
        success: boolean;
        message: string;
    }>;
}
