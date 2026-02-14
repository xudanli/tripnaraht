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
var RollPolicyAdapterService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RollPolicyAdapterService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const roll_client_service_1 = require("./roll-client.service");
let RollPolicyAdapterService = RollPolicyAdapterService_1 = class RollPolicyAdapterService {
    constructor(configService, rollClient) {
        this.configService = configService;
        this.rollClient = rollClient;
        this.logger = new common_1.Logger(RollPolicyAdapterService_1.name);
        this.enabled =
            this.configService.get('ROLL_POLICY_ENABLED') !== false &&
                !!this.rollClient;
        this.logger.log(`[RollPolicyAdapter] 初始化: enabled=${this.enabled}`);
    }
    async predict(request, useFallback = true) {
        if (!this.enabled) {
            throw new Error('ROLL Policy-Worker 未启用');
        }
        this.logger.debug(`[RollPolicyAdapter] 策略推理: requestId=${request.request_id}`);
        try {
            const state = {
                userRequest: request.state.user_request || '',
                origin: typeof request.state.origin === 'string'
                    ? request.state.origin
                    : request.state.origin
                        ? `${request.state.origin.lat},${request.state.origin.lng}`
                        : undefined,
                destination: typeof request.state.destination === 'string'
                    ? request.state.destination
                    : request.state.destination
                        ? `${request.state.destination.lat},${request.state.destination.lng}`
                        : undefined,
                constraints: request.state.constraints || {},
                preferences: request.state.preferences || {},
            };
            const result = await this.rollClient.callPolicyWorker(state);
            if (!result.success) {
                throw new Error(result.error || 'Policy-Worker 调用失败');
            }
            const response = {
                action: result.action || 'ALLOW',
                confidence: result.confidence || 0.8,
                reasoning: result.reasoning,
                model_version: request.model_version || 'roll-v1.0',
                latency_ms: 0,
                metadata: {
                    adjusted_params: result.adjustedParams,
                    request_id: request.request_id,
                },
            };
            this.logger.debug(`[RollPolicyAdapter] 推理完成: requestId=${request.request_id}, action=${response.action}`);
            return response;
        }
        catch (error) {
            this.logger.warn(`[RollPolicyAdapter] 推理失败: requestId=${request.request_id}, error=${error === null || error === void 0 ? void 0 : error.message}`);
            if (useFallback) {
                return this.getFallbackResponse(request);
            }
            throw error;
        }
    }
    getFallbackResponse(request) {
        this.logger.log(`[RollPolicyAdapter] 使用回退响应: requestId=${request.request_id}`);
        return {
            action: 'ALLOW',
            confidence: 0.5,
            reasoning: 'ROLL Policy-Worker 不可用，使用默认策略',
            model_version: request.model_version || 'fallback-v1.0',
            latency_ms: 0,
        };
    }
};
exports.RollPolicyAdapterService = RollPolicyAdapterService;
exports.RollPolicyAdapterService = RollPolicyAdapterService = RollPolicyAdapterService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [config_1.ConfigService,
        roll_client_service_1.RollClientService])
], RollPolicyAdapterService);
//# sourceMappingURL=roll-policy-adapter.service.js.map