"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StripeDirectController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const stripe_direct_service_1 = require("./stripe-direct.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
let StripeDirectController = class StripeDirectController {
    constructor(stripeService) {
        this.stripeService = stripeService;
    }
    async health() {
        return {
            success: true,
            available: this.stripeService.isServiceAvailable(),
        };
    }
    async getConnectionStatus(user) {
        try {
            const status = await this.stripeService.getConnectionStatus(user.id);
            return {
                success: true,
                ...status,
            };
        }
        catch (error) {
            throw new common_1.HttpException({
                success: false,
                error: {
                    code: 'STRIPE_ERROR',
                    message: error.message || 'Failed to get connection status',
                },
            }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async createPaymentIntent(user, body) {
        try {
            const paymentIntent = await this.stripeService.createPaymentIntent({
                userId: user.id,
                amount: body.amount,
                currency: body.currency,
                metadata: body.metadata,
                paymentMethodId: body.paymentMethodId,
            });
            return {
                success: true,
                paymentIntent: {
                    id: paymentIntent.id,
                    clientSecret: paymentIntent.client_secret,
                    status: paymentIntent.status,
                    amount: paymentIntent.amount,
                    currency: paymentIntent.currency,
                },
            };
        }
        catch (error) {
            throw new common_1.HttpException({
                success: false,
                error: {
                    code: 'STRIPE_ERROR',
                    message: error.message || 'Failed to create payment intent',
                },
            }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async confirmPaymentIntent(paymentIntentId, body) {
        try {
            const paymentIntent = await this.stripeService.confirmPaymentIntent(paymentIntentId, body.paymentMethodId);
            return {
                success: true,
                paymentIntent: {
                    id: paymentIntent.id,
                    status: paymentIntent.status,
                    amount: paymentIntent.amount,
                    currency: paymentIntent.currency,
                },
            };
        }
        catch (error) {
            throw new common_1.HttpException({
                success: false,
                error: {
                    code: 'STRIPE_ERROR',
                    message: error.message || 'Failed to confirm payment intent',
                },
            }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async getPaymentIntent(paymentIntentId) {
        try {
            const paymentIntent = await this.stripeService.getPaymentIntent(paymentIntentId);
            return {
                success: true,
                paymentIntent: {
                    id: paymentIntent.id,
                    status: paymentIntent.status,
                    amount: paymentIntent.amount,
                    currency: paymentIntent.currency,
                    metadata: paymentIntent.metadata,
                },
            };
        }
        catch (error) {
            throw new common_1.HttpException({
                success: false,
                error: {
                    code: 'STRIPE_ERROR',
                    message: error.message || 'Failed to get payment intent',
                },
            }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async refundPayment(body) {
        try {
            const refund = await this.stripeService.refundPayment(body.paymentIntentId, body.amount, body.reason);
            return {
                success: true,
                refund: {
                    id: refund.id,
                    amount: refund.amount,
                    currency: refund.currency,
                    status: refund.status,
                },
            };
        }
        catch (error) {
            throw new common_1.HttpException({
                success: false,
                error: {
                    code: 'STRIPE_ERROR',
                    message: error.message || 'Failed to process refund',
                },
            }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async getPaymentHistory(user, limit, startingAfter) {
        try {
            const paymentIntents = await this.stripeService.getPaymentHistory(user.id, limit ? parseInt(limit, 10) : 10, startingAfter);
            return {
                success: true,
                paymentIntents: paymentIntents.map((pi) => ({
                    id: pi.id,
                    status: pi.status,
                    amount: pi.amount,
                    currency: pi.currency,
                    created: pi.created,
                    metadata: pi.metadata,
                })),
            };
        }
        catch (error) {
            throw new common_1.HttpException({
                success: false,
                error: {
                    code: 'STRIPE_ERROR',
                    message: error.message || 'Failed to get payment history',
                },
            }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async initiateConnectOAuth(user, redirectUri) {
        try {
            const authUrl = await this.stripeService.initiateConnectOAuth(user.id, redirectUri);
            return {
                success: true,
                authUrl,
            };
        }
        catch (error) {
            throw new common_1.HttpException({
                success: false,
                error: {
                    code: 'STRIPE_ERROR',
                    message: error.message || 'Failed to initiate OAuth',
                },
            }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async completeConnectOAuth(user, body) {
        try {
            await this.stripeService.completeConnectOAuth(user.id, body.code, body.state);
            return {
                success: true,
                message: 'Stripe Connect OAuth completed successfully',
            };
        }
        catch (error) {
            throw new common_1.HttpException({
                success: false,
                error: {
                    code: 'STRIPE_ERROR',
                    message: error.message || 'Failed to complete OAuth',
                },
            }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
};
exports.StripeDirectController = StripeDirectController;
__decorate([
    (0, common_1.Get)('health'),
    (0, swagger_1.ApiOperation)({ summary: '检查 Stripe 服务状态' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '服务状态' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], StripeDirectController.prototype, "health", null);
__decorate([
    (0, common_1.Get)('connection-status'),
    (0, swagger_1.ApiOperation)({ summary: '获取用户的 Stripe 连接状态' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '连接状态' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], StripeDirectController.prototype, "getConnectionStatus", null);
__decorate([
    (0, common_1.Post)('payment-intent'),
    (0, swagger_1.ApiOperation)({ summary: '创建支付意图' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '支付意图创建成功' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], StripeDirectController.prototype, "createPaymentIntent", null);
__decorate([
    (0, common_1.Post)('payment-intent/:id/confirm'),
    (0, swagger_1.ApiOperation)({ summary: '确认支付意图' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '支付意图确认成功' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], StripeDirectController.prototype, "confirmPaymentIntent", null);
__decorate([
    (0, common_1.Get)('payment-intent/:id'),
    (0, swagger_1.ApiOperation)({ summary: '获取支付意图状态' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '支付意图信息' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], StripeDirectController.prototype, "getPaymentIntent", null);
__decorate([
    (0, common_1.Post)('refund'),
    (0, swagger_1.ApiOperation)({ summary: '处理退款' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '退款处理成功' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], StripeDirectController.prototype, "refundPayment", null);
__decorate([
    (0, common_1.Get)('payment-history'),
    (0, swagger_1.ApiOperation)({ summary: '获取支付历史' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '支付历史列表' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('startingAfter')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], StripeDirectController.prototype, "getPaymentHistory", null);
__decorate([
    (0, common_1.Get)('connect/oauth/initiate'),
    (0, swagger_1.ApiOperation)({ summary: '初始化 Stripe Connect OAuth 流程' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'OAuth 授权 URL' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('redirectUri')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], StripeDirectController.prototype, "initiateConnectOAuth", null);
__decorate([
    (0, common_1.Post)('connect/oauth/callback'),
    (0, swagger_1.ApiOperation)({ summary: '完成 Stripe Connect OAuth 流程' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'OAuth 完成成功' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], StripeDirectController.prototype, "completeConnectOAuth", null);
exports.StripeDirectController = StripeDirectController = __decorate([
    (0, swagger_1.ApiTags)('stripe'),
    (0, common_1.Controller)('api/stripe'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __metadata("design:paramtypes", [stripe_direct_service_1.StripeDirectService])
], StripeDirectController);
//# sourceMappingURL=stripe-direct.controller.js.map