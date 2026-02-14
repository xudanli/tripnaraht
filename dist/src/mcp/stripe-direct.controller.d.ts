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
            id: any;
            clientSecret: any;
            status: any;
            amount: any;
            currency: any;
        };
    }>;
    confirmPaymentIntent(paymentIntentId: string, body: {
        paymentMethodId?: string;
    }): Promise<{
        success: boolean;
        paymentIntent: {
            id: any;
            status: any;
            amount: any;
            currency: any;
        };
    }>;
    getPaymentIntent(paymentIntentId: string): Promise<{
        success: boolean;
        paymentIntent: {
            id: any;
            status: any;
            amount: any;
            currency: any;
            metadata: any;
        };
    }>;
    refundPayment(body: {
        paymentIntentId: string;
        amount?: number;
        reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer';
    }): Promise<{
        success: boolean;
        refund: {
            id: any;
            amount: any;
            currency: any;
            status: any;
        };
    }>;
    getPaymentHistory(user: any, limit?: string, startingAfter?: string): Promise<{
        success: boolean;
        paymentIntents: {
            id: any;
            status: any;
            amount: any;
            currency: any;
            created: any;
            metadata: any;
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
