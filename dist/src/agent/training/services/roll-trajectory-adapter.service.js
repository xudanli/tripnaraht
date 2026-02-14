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
var RollTrajectoryAdapterService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RollTrajectoryAdapterService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const roll_client_service_1 = require("./roll-client.service");
let RollTrajectoryAdapterService = RollTrajectoryAdapterService_1 = class RollTrajectoryAdapterService {
    constructor(configService, rollClient) {
        this.configService = configService;
        this.rollClient = rollClient;
        this.logger = new common_1.Logger(RollTrajectoryAdapterService_1.name);
        this.enabled =
            this.configService.get('ROLL_TRAJECTORY_ENABLED') !== false &&
                !!this.rollClient;
        this.logger.log(`[RollTrajectoryAdapter] 初始化: enabled=${this.enabled}`);
    }
    async generateTrajectory(data) {
        if (!this.enabled) {
            throw new Error('ROLL Actor-Worker 未启用');
        }
        this.logger.debug(`[RollTrajectoryAdapter] 生成轨迹: requestId=${data.requestId}`);
        try {
            const request = {
                requestId: data.requestId,
                userRequest: this.extractUserRequest(data),
                state: {
                    tripId: data.tripId,
                    plan: data.plan,
                    decisionTrace: data.decisionTrace,
                    researchData: data.researchData,
                    gateResult: data.gateResult,
                    complianceResult: data.complianceResult,
                    modelVersion: data.modelVersion,
                    countryCode: data.countryCode,
                },
                action: 'collect_trajectory',
                params: {
                    validationStatus: 'PENDING',
                },
            };
            const result = await this.rollClient.callActorWorker(request);
            if (!result.success || !result.trajectory) {
                throw new Error(result.error || 'Actor-Worker 调用失败');
            }
            const trajectoryId = result.trajectoryId || `traj_${data.requestId}_${Date.now()}`;
            this.logger.debug(`[RollTrajectoryAdapter] 轨迹生成完成: trajectoryId=${trajectoryId}`);
            return {
                trajectoryId,
                trajectory: result.trajectory,
                success: true,
            };
        }
        catch (error) {
            this.logger.warn(`[RollTrajectoryAdapter] 轨迹生成失败: requestId=${data.requestId}, error=${error === null || error === void 0 ? void 0 : error.message}`);
            throw error;
        }
    }
    extractUserRequest(data) {
        var _a, _b, _c, _d;
        if ((_a = data.researchData) === null || _a === void 0 ? void 0 : _a.userRequest) {
            return data.researchData.userRequest;
        }
        if ((_b = data.researchData) === null || _b === void 0 ? void 0 : _b.user_request) {
            return data.researchData.user_request;
        }
        if ((_c = data.researchData) === null || _c === void 0 ? void 0 : _c.request) {
            return data.researchData.request;
        }
        if (Array.isArray(data.decisionTrace) && data.decisionTrace.length > 0) {
            const firstEntry = data.decisionTrace[0];
            if (firstEntry && typeof firstEntry === 'object' && 'userRequest' in firstEntry) {
                return firstEntry.userRequest;
            }
            if (firstEntry && typeof firstEntry === 'object' && 'user_request' in firstEntry) {
                return firstEntry.user_request;
            }
        }
        if (((_d = data.plan) === null || _d === void 0 ? void 0 : _d.metadata) && typeof data.plan.metadata === 'object') {
            const metadata = data.plan.metadata;
            if (metadata.userRequest) {
                return metadata.userRequest;
            }
            if (metadata.user_request) {
                return metadata.user_request;
            }
        }
        return `Request ${data.requestId}`;
    }
};
exports.RollTrajectoryAdapterService = RollTrajectoryAdapterService;
exports.RollTrajectoryAdapterService = RollTrajectoryAdapterService = RollTrajectoryAdapterService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [config_1.ConfigService,
        roll_client_service_1.RollClientService])
], RollTrajectoryAdapterService);
//# sourceMappingURL=roll-trajectory-adapter.service.js.map